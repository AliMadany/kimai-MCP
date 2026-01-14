import type {
  AIParserConfig,
  ParsedTimeEntry,
  ParseContext,
  ParseResult
} from './types.js';

/**
 * Parse time string (HH:MM:SS) to seconds since midnight
 */
function parseTimeToSeconds(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * AI Time Entry Parser
 * Parses natural language into structured time entries using GPT-4o
 */
export class AITimeEntryParser {
  private config: Required<AIParserConfig>;

  constructor(config: AIParserConfig) {
    this.config = {
      model: config.model || 'gpt-4o',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      temperature: config.temperature ?? 0.3,
      openaiApiKey: config.openaiApiKey
    };
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(context: ParseContext): string {
    const currentTime = context.currentTime || new Date();

    let prompt = `You are a friendly and helpful AI assistant for time tracking. You help users log their work by understanding natural language and converting it into structured time entries.

Your task:
Parse the user's natural language input into structured JSON format for time entries. Use the provided context (project/activity mapping and history) to better understand the user's intent.

Current Date/Time: ${currentTime.toISOString()}`;

    if (context.chatHistory) {
      prompt += `\n\nPrevious Conversation Context:\n${context.chatHistory}`;
    }

    if (context.projects?.length) {
      const projectList = context.projects.map(p =>
        `- ${p.name}${p.customer ? ` (${p.customer})` : ''} [ID: ${p.id}]`
      ).join('\n');
      prompt += `\n\nAvailable Projects:\n${projectList}`;
    }

    if (context.activities?.length) {
      const activityList = context.activities.map(a =>
        `- ${a.name} [ID: ${a.id}]${a.projectId ? ` (Project ID: ${a.projectId})` : ''}`
      ).join('\n');
      prompt += `\n\nAvailable Activities:\n${activityList}`;
    }

    if (context.recentHistory) {
      prompt += `\n\nRecent Time Entry History:\n${context.recentHistory}`;
    }

    return prompt;
  }

  /**
   * Build user prompt for parsing
   */
  private buildUserPrompt(text: string): string {
    return `Parse this time entry text into structured JSON. The user may mention multiple activities and projects with different times. Extract ALL time entries mentioned.

For each time entry, extract:
- project_hint: project name or identifier (use the project mapping to match). If not mentioned, use null.
- activity_hint: activity name or identifier (use the activity mapping to match).
- dates: array of dates in YYYY-MM-DD format (handle "today", "yesterday", "mon-thu", "last week", etc.)
- start_time: start time in HH:MM:SS format (24-hour). If not specified, use null.
- end_time: end time in HH:MM:SS format (24-hour). If not specified, use null.
- duration: duration in seconds. Calculate from start_time and end_time if both provided.
- description: optional description or note
- tags: array of tags if mentioned

IMPORTANT:
- If start_time AND end_time are both provided, ALWAYS calculate duration from them (ignore any mentioned duration).
- If only duration is mentioned without times, use start_time: "09:00:00" as default.
- If multiple projects/activities mentioned, create separate entries for each.

Text: "${text}"

Return ONLY valid JSON:
{
  "entries": [
    {
      "project_hint": "string or null",
      "activity_hint": "string or null",
      "dates": ["YYYY-MM-DD"],
      "start_time": "HH:MM:SS or null",
      "end_time": "HH:MM:SS or null",
      "duration": number in seconds,
      "description": "string or null",
      "tags": []
    }
  ]
}`;
  }

  /**
   * Normalize a parsed entry
   */
  private normalizeEntry(entry: any): ParsedTimeEntry {
    let duration = entry.duration || 0;

    // Calculate duration from times if both provided (takes priority)
    if (entry.start_time && entry.end_time) {
      const start = parseTimeToSeconds(entry.start_time);
      const end = parseTimeToSeconds(entry.end_time);
      if (start !== null && end !== null && end > start) {
        duration = end - start;
      }
    }

    return {
      project_hint: entry.project_hint || null,
      activity_hint: entry.activity_hint || null,
      dates: Array.isArray(entry.dates) ? entry.dates : [entry.dates].filter(Boolean),
      start_time: entry.start_time || null,
      end_time: entry.end_time || null,
      duration,
      description: entry.description || null,
      tags: Array.isArray(entry.tags) ? entry.tags : []
    };
  }

  /**
   * Parse natural language text into structured time entries
   */
  async parse(text: string, context: ParseContext = {}): Promise<ParseResult> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.buildSystemPrompt(context) },
          { role: 'user', content: this.buildUserPrompt(text) }
        ],
        response_format: { type: 'json_object' },
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as any;
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed = JSON.parse(content);

    // Normalize response
    let entries: ParsedTimeEntry[] = [];

    if (parsed.entries && Array.isArray(parsed.entries)) {
      entries = parsed.entries.map((e: any) => this.normalizeEntry(e));
    } else if (parsed.activity_hint !== undefined) {
      // Backward compatibility with single entry format
      entries = [this.normalizeEntry(parsed)];
    }

    if (entries.length === 0) {
      throw new Error('No valid entries found in AI response');
    }

    return { entries, rawResponse: content };
  }

  /**
   * Generate a friendly response message
   */
  async generateFriendlyResponse(
    userText: string,
    entries: ParsedTimeEntry[]
  ): Promise<string | null> {
    const entriesCount = entries.length;

    let entriesSummary = '';
    if (entriesCount === 1) {
      const entry = entries[0];
      const durationHours = entry.duration ? (entry.duration / 3600).toFixed(1) : '0';
      entriesSummary = `- Activity: ${entry.activity_hint || 'activity'}
- Duration: ${durationHours} hours
- Dates: ${entry.dates.length} day(s)`;
    } else {
      entriesSummary = `${entriesCount} time entries:\n`;
      entries.forEach((entry, idx) => {
        const durationHours = entry.duration ? (entry.duration / 3600).toFixed(1) : '0';
        const projectPart = entry.project_hint ? `${entry.project_hint} - ` : '';
        entriesSummary += `${idx + 1}. ${projectPart}${entry.activity_hint || 'Activity'}: ${durationHours}h\n`;
      });
    }

    const prompt = `The user said: "${userText}"

I've parsed this into:
${entriesSummary}

Generate a friendly, encouraging response (1-2 sentences) confirming what was logged. Use emojis appropriately.`;

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: 'You are a friendly AI assistant. Be warm, encouraging, and use emojis appropriately. Keep responses concise (1-2 sentences).'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 100
        })
      });

      if (!response.ok) return null;

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}

/**
 * Match a project hint to actual project IDs
 * Returns matches sorted by score (highest first)
 */
export function matchProjectByHint(
  hint: string | null,
  projects: Array<{ id: number; name: string; customer?: string }>
): number | null {
  if (!hint || !projects.length) return null;

  const lowerHint = hint.toLowerCase().trim();

  // Exact match
  const exact = projects.find(p => p.name.toLowerCase() === lowerHint);
  if (exact) return exact.id;

  // Partial match (hint contains project name or vice versa)
  const partial = projects.find(p =>
    p.name.toLowerCase().includes(lowerHint) ||
    lowerHint.includes(p.name.toLowerCase())
  );
  if (partial) return partial.id;

  // Customer match
  const byCustomer = projects.find(p =>
    p.customer?.toLowerCase().includes(lowerHint) ||
    lowerHint.includes(p.customer?.toLowerCase() || '')
  );
  if (byCustomer) return byCustomer.id;

  return null;
}

/**
 * Match an activity hint to actual activity IDs
 * Returns the best match or null
 */
export function matchActivityByHint(
  hint: string | null,
  activities: Array<{ id: number; name: string; projectId?: number }>,
  projectId?: number | null
): number | null {
  if (!hint || !activities.length) return null;

  const lowerHint = hint.toLowerCase().trim();

  // Filter by project if provided
  const filteredActivities = projectId
    ? activities.filter(a => !a.projectId || a.projectId === projectId)
    : activities;

  // Exact match
  const exact = filteredActivities.find(a => a.name.toLowerCase() === lowerHint);
  if (exact) return exact.id;

  // Partial match
  const partial = filteredActivities.find(a =>
    a.name.toLowerCase().includes(lowerHint) ||
    lowerHint.includes(a.name.toLowerCase())
  );
  if (partial) return partial.id;

  // Fall back to all activities if no match in filtered
  if (projectId && filteredActivities.length < activities.length) {
    const exactAll = activities.find(a => a.name.toLowerCase() === lowerHint);
    if (exactAll) return exactAll.id;

    const partialAll = activities.find(a =>
      a.name.toLowerCase().includes(lowerHint) ||
      lowerHint.includes(a.name.toLowerCase())
    );
    if (partialAll) return partialAll.id;
  }

  return null;
}

export * from './types.js';
