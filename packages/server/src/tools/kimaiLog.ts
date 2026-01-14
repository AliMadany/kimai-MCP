import type { ToolContext } from './index.js';
import { formatDuration, calculateEndTime } from '@urtime/shared';

interface LogArgs {
  project_id: number;
  activity_id: number;
  duration?: number;        // Duration in seconds
  start_time?: string;      // HH:MM:SS format
  end_time?: string;        // HH:MM:SS format
  date?: string;            // YYYY-MM-DD format (single date)
  dates?: string[];         // Array of dates for multi-day entries
  description?: string;
  tags?: string[];
  kimai_token?: string;
  kimai_email?: string;
}

/**
 * Handle kimai_log tool - Create time entries with structured parameters
 * Claude handles all natural language parsing, this tool just creates entries
 */
export async function handleKimaiLog(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    project_id,
    activity_id,
    duration,
    start_time,
    end_time,
    date,
    dates,
    description,
    tags,
    kimai_token,
    kimai_email
  } = args as unknown as LogArgs;

  // Validate required fields
  if (!project_id) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'project_id is required',
          isError: true
        })
      }]
    };
  }

  if (!activity_id) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'activity_id is required',
          isError: true
        })
      }]
    };
  }

  // Must have either duration or both start_time and end_time
  if (!duration && !(start_time && end_time)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Either duration (in seconds) or both start_time and end_time are required',
          isError: true
        })
      }]
    };
  }

  const client = context.createKimaiClient(kimai_token, kimai_email);

  // Determine dates to create entries for
  const entryDates: string[] = [];
  if (dates && Array.isArray(dates) && dates.length > 0) {
    entryDates.push(...dates);
  } else if (date) {
    entryDates.push(date);
  } else {
    // Default to today
    const today = new Date().toISOString().split('T')[0];
    entryDates.push(today);
  }

  // Calculate duration from times if not provided
  let effectiveDuration = duration;
  if (!effectiveDuration && start_time && end_time) {
    const startParts = start_time.split(':').map(Number);
    const endParts = end_time.split(':').map(Number);
    const startSeconds = startParts[0] * 3600 + startParts[1] * 60 + (startParts[2] || 0);
    const endSeconds = endParts[0] * 3600 + endParts[1] * 60 + (endParts[2] || 0);
    effectiveDuration = endSeconds - startSeconds;
  }

  // Default start time if only duration provided
  const effectiveStartTime = start_time || '09:00:00';

  // Create entries
  const results: Array<{
    success: boolean;
    entry?: any;
    error?: string;
    date?: string;
  }> = [];

  for (const entryDate of entryDates) {
    const begin = `${entryDate}T${effectiveStartTime}`;

    let end: string;
    if (end_time) {
      end = `${entryDate}T${end_time}`;
    } else if (effectiveDuration && effectiveDuration > 0) {
      end = calculateEndTime(begin, effectiveDuration);
    } else {
      results.push({
        success: false,
        error: 'Could not calculate end time',
        date: entryDate
      });
      continue;
    }

    try {
      const created = await client.createTimesheet({
        project: project_id,
        activity: activity_id,
        begin,
        end,
        description: description || undefined,
        tags: tags && tags.length ? tags.join(',') : undefined
      });

      results.push({
        success: true,
        entry: {
          id: created.id,
          project: project_id,
          activity: activity_id,
          date: entryDate,
          begin,
          end,
          duration: effectiveDuration,
          durationFormatted: formatDuration(effectiveDuration || 0),
          description: description || null
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        success: false,
        error: message,
        date: entryDate
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        summary: `Created ${successCount} time entry${successCount !== 1 ? 'ies' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results
      }, null, 2)
    }]
  };
}
