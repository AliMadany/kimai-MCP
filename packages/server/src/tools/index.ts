
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../config.js';
import type { KimaiClient, AITimeEntryParser } from '@urtime/shared';
import { handleKimaiQuery } from './kimaiQuery.js';
import { handleKimaiLog } from './kimaiLog.js';
import { handleKimaiManage } from './kimaiManage.js';
import { handleKimaiTimer } from './kimaiTimer.js';
import { handleKimaiAdmin } from './kimaiAdmin.js';

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
            enum: ['projects', 'activities', 'entries', 'hours', 'customers', 'active', 'me'],
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
            enum: ['update', 'delete', 'duplicate'],
            description: 'Action to perform: update, delete, or duplicate'
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
    },
    {
      name: 'kimai_timer',
      description: 'Start, stop, or check active time tracking timers in Kimai. Use action=start to begin live tracking, action=stop to end a running timer, action=status to see what is currently running.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'status'],
            description: 'Action: start a new timer, stop an active timer, or check status'
          },
          project_id: { type: 'number', description: 'Project ID (required for start)' },
          activity_id: { type: 'number', description: 'Activity ID (required for start)' },
          entry_id: { type: 'number', description: 'Timer entry ID to stop (optional for stop — stops most recent if omitted)' },
          description: { type: 'string', description: 'Description for the timer entry' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply' },
          begin: { type: 'string', description: 'ISO datetime to start from (defaults to now)' },
          kimai_token: { type: 'string', description: 'Kimai API token (optional if KIMAI_TOKEN env var is set)' },
          kimai_email: { type: 'string', description: 'Kimai user email (optional if KIMAI_EMAIL env var is set)' }
        },
        required: ['action']
      }
    },
    {
      name: 'kimai_admin',
      description: 'Admin tool for managing Kimai resources: create/update/delete projects, activities, customers; manage users and teams. Requires admin-level API token.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entity: {
            type: 'string',
            enum: ['project', 'activity', 'customer', 'user', 'team'],
            description: 'The type of resource to manage'
          },
          action: {
            type: 'string',
            enum: ['list', 'create', 'update', 'delete', 'add_member', 'remove_member'],
            description: 'Action to perform'
          },
          project_id: { type: 'number' },
          activity_id: { type: 'number' },
          customer_id: { type: 'number' },
          user_id: { type: 'number' },
          team_id: { type: 'number' },
          teamlead_id: { type: 'number', description: 'User ID of the team lead' },
          member_user_id: { type: 'number', description: 'User ID to add/remove from team' },
          name: { type: 'string' },
          comment: { type: 'string' },
          visible: { type: 'boolean' },
          global_activities: { type: 'boolean', description: 'Allow global activities on project' },
          username: { type: 'string', description: 'Username for new user' },
          email: { type: 'string', description: 'Email for new user' },
          plainPassword: { type: 'string', description: 'Password for new user' },
          alias: { type: 'string', description: 'Display alias for user' },
          enabled: { type: 'boolean', description: 'Whether user account is enabled' },
          roles: { type: 'array', items: { type: 'string' }, description: 'User roles (e.g. ROLE_ADMIN)' },
          search: { type: 'string', description: 'Search/filter term' },
          kimai_token: { type: 'string', description: 'Kimai API token (optional if KIMAI_TOKEN env var is set)' },
          kimai_email: { type: 'string', description: 'Kimai user email (optional if KIMAI_EMAIL env var is set)' }
        },
        required: ['entity', 'action']
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
      case 'kimai_timer':
        return await handleKimaiTimer(args, context);
      case 'kimai_admin':
        return await handleKimaiAdmin(args, context);
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
