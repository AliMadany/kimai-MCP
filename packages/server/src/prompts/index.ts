import type { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../config.js';
import type { KimaiClient } from '@urtime/shared';

export interface PromptContext {
  config: ServerConfig;
  createKimaiClient: (token?: string, email?: string) => KimaiClient;
}

/**
 * Register available prompts
 */
export function registerPrompts(): Prompt[] {
  return [
    {
      name: 'quick_entry',
      description: 'Optimized prompt for creating time entries with project context',
      arguments: [
        {
          name: 'text',
          description: 'Natural language description of work (e.g., "2h development on Project X")',
          required: true
        }
      ]
    },
    {
      name: 'work_summary',
      description: 'Generate a summary of work hours for a time period',
      arguments: [
        {
          name: 'period',
          description: 'Time period: today, yesterday, this_week, last_week, this_month',
          required: false
        }
      ]
    }
  ];
}

/**
 * Handle prompt get requests
 */
export async function handlePromptGet(
  name: string,
  args: Record<string, unknown>,
  context: PromptContext
): Promise<{ messages: PromptMessage[] }> {
  switch (name) {
    case 'quick_entry': {
      const text = args.text as string || '';

      // Fetch context for better prompting
      let projectList = '';
      let activityList = '';

      try {
        const client = context.createKimaiClient();
        const [projects, activities] = await Promise.all([
          client.getProjects(),
          client.getActivities()
        ]);

        projectList = projects.slice(0, 20).map(p => `- ${p.name} (ID: ${p.id})`).join('\n');
        activityList = activities.slice(0, 20).map(a => `- ${a.name} (ID: ${a.id})`).join('\n');
      } catch {
        // Continue without context if fetch fails
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Create a time entry based on this description: "${text}"

Available Projects:
${projectList || '(Unable to fetch - please provide project name)'}

Available Activities:
${activityList || '(Unable to fetch - please provide activity name)'}

Use the kimai_log tool to log this work. If the project or activity is ambiguous, ask for clarification.`
            }
          }
        ]
      };
    }

    case 'work_summary': {
      const period = (args.period as string) || 'today';
      const now = new Date();
      let startDate: string;
      let endDate: string;
      let periodDescription: string;

      switch (period) {
        case 'today':
          startDate = endDate = now.toISOString().split('T')[0];
          periodDescription = 'today';
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = endDate = yesterday.toISOString().split('T')[0];
          periodDescription = 'yesterday';
          break;
        case 'this_week':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          startDate = weekStart.toISOString().split('T')[0];
          endDate = now.toISOString().split('T')[0];
          periodDescription = 'this week';
          break;
        case 'last_week':
          const lastWeekEnd = new Date(now);
          lastWeekEnd.setDate(now.getDate() - now.getDay() - 1);
          const lastWeekStart = new Date(lastWeekEnd);
          lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
          startDate = lastWeekStart.toISOString().split('T')[0];
          endDate = lastWeekEnd.toISOString().split('T')[0];
          periodDescription = 'last week';
          break;
        case 'this_month':
          startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          endDate = now.toISOString().split('T')[0];
          periodDescription = 'this month';
          break;
        default:
          startDate = endDate = now.toISOString().split('T')[0];
          periodDescription = 'today';
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a work summary for ${periodDescription}.

Use the kimai_query tool with:
- type: "hours"
- start_date: "${startDate}"
- end_date: "${endDate}"

Then provide a clear summary including:
1. Total hours worked
2. Breakdown by project
3. Breakdown by day (if multi-day period)
4. Any notable patterns or insights`
            }
          }
        ]
      };
    }

    default:
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Unknown prompt: ${name}`
            }
          }
        ]
      };
  }
}
