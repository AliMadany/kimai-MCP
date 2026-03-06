import type { ToolContext } from './index.js';
import { formatDuration } from '@urtime/shared';

interface TimerArgs {
  action: 'start' | 'stop' | 'status';
  project_id?: number;
  activity_id?: number;
  entry_id?: number;
  description?: string;
  tags?: string[];
  begin?: string;
  kimai_token?: string;
  kimai_email?: string;
}

/**
 * Handle kimai_timer tool — start/stop/status live timers
 */
export async function handleKimaiTimer(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    action,
    project_id,
    activity_id,
    entry_id,
    description,
    tags,
    begin,
    kimai_token,
    kimai_email
  } = args as unknown as TimerArgs;

  const client = context.createKimaiClient(kimai_token, kimai_email);

  switch (action) {
    case 'start': {
      if (!project_id) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'project_id is required to start a timer', isError: true }) }]
        };
      }
      if (!activity_id) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'activity_id is required to start a timer', isError: true }) }]
        };
      }

      try {
        const entry = await client.startTimerEntry({
          project: project_id,
          activity: activity_id,
          description: description || undefined,
          tags: tags && tags.length ? tags.join(',') : undefined,
          begin: begin || undefined
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'start',
              message: 'Timer started',
              timer: {
                id: entry.id,
                project: typeof entry.project === 'object' ? entry.project.name : entry.project,
                activity: typeof entry.activity === 'object' ? entry.activity.name : entry.activity,
                begin: entry.begin,
                description: description || null
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message, isError: true }) }]
        };
      }
    }

    case 'stop': {
      try {
        // If no entry_id, find and stop the most recent active timer
        let idToStop = entry_id;
        if (!idToStop) {
          const active = await client.getActiveTimesheets();
          if (active.length === 0) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'No active timers running', isError: true }) }]
            };
          }
          idToStop = active[0].id;
        }

        const entry = await client.stopTimesheetEntry(idToStop);
        const duration = entry.duration || 0;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'stop',
              message: 'Timer stopped',
              timer: {
                id: entry.id,
                project: typeof entry.project === 'object' ? entry.project.name : entry.project,
                activity: typeof entry.activity === 'object' ? entry.activity.name : entry.activity,
                begin: entry.begin,
                end: entry.end,
                duration,
                durationFormatted: formatDuration(duration)
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message, isError: true }) }]
        };
      }
    }

    case 'status': {
      try {
        const active = await client.getActiveTimesheets();

        if (active.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'status',
                running: false,
                message: 'No timers currently running',
                active: []
              }, null, 2)
            }]
          };
        }

        const now = Date.now();
        const formatted = active.map(entry => {
          const beginMs = new Date(entry.begin).getTime();
          const runningSeconds = Math.floor((now - beginMs) / 1000);
          return {
            id: entry.id,
            project: typeof entry.project === 'object' ? entry.project.name : entry.project,
            activity: typeof entry.activity === 'object' ? entry.activity.name : entry.activity,
            begin: entry.begin,
            runningFor: formatDuration(runningSeconds),
            runningSeconds,
            description: entry.description || null
          };
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: 'status',
              running: true,
              count: formatted.length,
              active: formatted
            }, null, 2)
          }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message, isError: true }) }]
        };
      }
    }

    default:
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Unknown action: ${action}. Use: start, stop, or status`, isError: true })
        }]
      };
  }
}
