
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../config.js';
import type { KimaiClient, AITimeEntryParser } from '@urtime/shared';
import { handleKimaiQuery } from './kimaiQuery.js';
import { handleKimaiLog } from './kimaiLog.js';
import { handleKimaiManage } from './kimaiManage.js';

export interface ToolContext {
  config: ServerConfig;
  createKimaiClient: (token?: string, email?: string) => KimaiClient;
  aiParser?: AITimeEntryParser;
}

/**
 * Register all available tools
 */
export function registerTools(): Tool[] {
  return [
    {
      name: 'kimai_query',
      description: 'Query Kimai for projects, activities, time entries, or work hours. Use type parameter to specify what to query.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['projects', 'activities', 'entries', 'hours'],
            description: 'What to query: projects, activities, entries (recent timesheets), or hours (work hours summary)'
          },
          kimai_token: {
            type: 'string',
            description: 'Kimai API token (optional if KIMAI_TOKEN env var is set)'
          },
          kimai_email: {
            type: 'string',
            description: 'Kimai user email for X-AUTH-USER header (optional if KIMAI_EMAIL env var is set)'
          },
          project_id: {
            type: 'number',
            description: 'Filter by project ID (for activities, entries, hours)'
          },
          search: {
            type: 'string',
            description: 'Search term to filter results'
          },
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format (for entries, hours)'
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format (for entries, hours)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 10, for entries)'
          }
        },
        required: ['type']
      }
    },
    {
      name: 'kimai_log',
      description: 'Log time entries using natural language. AI parses input like "2h development on ProjectX yesterday" into structured entries.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'string',
            description: 'Natural language time entry (e.g., "2h development on ProjectX yesterday", "worked from 9am to 5pm on testing")'
          },
          kimai_token: {
            type: 'string',
            description: 'Kimai API token (optional if KIMAI_TOKEN env var is set)'
          },
          kimai_email: {
            type: 'string',
            description: 'Kimai user email for X-AUTH-USER header (optional if KIMAI_EMAIL env var is set)'
          },
          project_id: {
            type: 'number',
            description: 'Override AI project matching with specific project ID'
          },
          activity_id: {
            type: 'number',
            description: 'Override AI activity matching with specific activity ID'
          },
          dry_run: {
            type: 'boolean',
            description: 'If true, parse and validate but do not create entries'
          }
        },
        required: ['input']
      }
    },
    {
      name: 'kimai_manage',
      description: 'Update or delete existing time entries.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            enum: ['update', 'delete'],
            description: 'Action to perform: update or delete'
          },
          entry_id: {
            type: 'number',
            description: 'ID of the timesheet entry to modify'
          },
          kimai_token: {
            type: 'string',
            description: 'Kimai API token (optional if KIMAI_TOKEN env var is set)'
          },
          kimai_email: {
            type: 'string',
            description: 'Kimai user email for X-AUTH-USER header (optional if KIMAI_EMAIL env var is set)'
          },
          updates: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              project: { type: 'number' },
              activity: { type: 'number' },
              begin: { type: 'string' },
              end: { type: 'string' }
            },
            description: 'Fields to update (for update action)'
          }
        },
        required: ['action', 'entry_id']
      }
    }
  ];
}

/**
 * Handle a tool call
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (name) {
      case 'kimai_query':
        return await handleKimaiQuery(args, context);
      case 'kimai_log':
        return await handleKimaiLog(args, context);
      case 'kimai_manage':
        return await handleKimaiManage(args, context);
      default:
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` })
          }]
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: message, isError: true })
      }]
    };
  }
}
