import type { ToolContext } from './index.js';
import { formatDuration } from '@urtime/shared';

interface QueryArgs {
  type: 'projects' | 'activities' | 'entries' | 'hours' | 'customers' | 'active' | 'me';
  kimai_token?: string;
  kimai_email?: string;
  project_id?: number;
  customer_id?: number;
  user_id?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
}

/**
 * Handle kimai_query tool
 */
export async function handleKimaiQuery(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    type,
    kimai_token,
    kimai_email,
    project_id,
    customer_id,
    user_id,
    search,
    start_date,
    end_date,
    limit = 10
  } = args as unknown as QueryArgs;

  const client = context.createKimaiClient(kimai_token, kimai_email);

  switch (type) {
    case 'projects': {
      const projects = await client.getProjects(search);
      const formatted = projects.map(p => ({
        id: p.id,
        name: p.name,
        customer: typeof p.customer === 'object' && p.customer
          ? p.customer.name
          : p.customer
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'projects',
            count: formatted.length,
            projects: formatted
          }, null, 2)
        }]
      };
    }

    case 'activities': {
      const activities = await client.getActivities(project_id, search, true);
      const formatted = activities.map(a => ({
        id: a.id,
        name: a.name,
        projectId: typeof a.project === 'object' && a.project
          ? a.project.id
          : a.project
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'activities',
            count: formatted.length,
            project_id: project_id || null,
            activities: formatted
          }, null, 2)
        }]
      };
    }

    case 'entries': {
      // Always use getTimesheets for consistent results (getRecentTimesheets has different behavior)
      const params: Record<string, any> = { size: Math.min(limit, 50) };
      if (start_date) params.begin = `${start_date}T00:00:00`;
      if (end_date) params.end = `${end_date}T23:59:59`;
      if (project_id) params.project = project_id;
      if (customer_id) params.customer = customer_id;
      if (user_id) params.user = user_id;
      const entries = await client.getTimesheets(params);

      const formatted = entries.map(e => ({
        id: e.id,
        project: typeof e.project === 'object' ? e.project.name : e.project,
        activity: typeof e.activity === 'object' ? e.activity.name : e.activity,
        begin: e.begin,
        end: e.end,
        duration: e.duration,
        durationFormatted: formatDuration(e.duration),
        description: e.description
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'entries',
            count: formatted.length,
            filters: { start_date, end_date, project_id },
            entries: formatted
          }, null, 2)
        }]
      };
    }

    case 'hours': {
      if (!start_date) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'start_date is required for hours query',
              isError: true
            })
          }]
        };
      }

      const params: Record<string, any> = {
        begin: `${start_date}T00:00:00`,
        end: `${end_date || start_date}T23:59:59`,
        size: 500
      };
      if (project_id) params.project = project_id;

      const entries = await client.getTimesheets(params);

      // Group by date
      const byDate: Record<string, {
        date: string;
        totalSeconds: number;
        entries: Array<{
          project: string | number;
          activity: string | number;
          duration: number;
          description?: string | null;
        }>;
      }> = {};

      for (const entry of entries) {
        const date = entry.begin.split('T')[0];
        if (!byDate[date]) {
          byDate[date] = { date, totalSeconds: 0, entries: [] };
        }

        const duration = entry.duration || 0;
        byDate[date].totalSeconds += duration;
        byDate[date].entries.push({
          project: typeof entry.project === 'object' ? entry.project.name : entry.project,
          activity: typeof entry.activity === 'object' ? entry.activity.name : entry.activity,
          duration,
          description: entry.description
        });
      }

      // Calculate totals
      const summary = Object.values(byDate).map(day => ({
        ...day,
        totalHours: Math.round(day.totalSeconds / 36) / 100,
        totalFormatted: formatDuration(day.totalSeconds)
      }));

      const grandTotalSeconds = summary.reduce((sum, day) => sum + day.totalSeconds, 0);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'hours',
            period: { start: start_date, end: end_date || start_date },
            totalHours: Math.round(grandTotalSeconds / 36) / 100,
            totalFormatted: formatDuration(grandTotalSeconds),
            byDate: summary
          }, null, 2)
        }]
      };
    }

    case 'customers': {
      const customers = await client.getCustomers(search);
      const formatted = customers.map(c => ({
        id: c.id,
        name: c.name,
        visible: c.visible
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'customers',
            count: formatted.length,
            customers: formatted
          }, null, 2)
        }]
      };
    }

    case 'active': {
      const active = await client.getActiveTimesheets();
      const now = Date.now();
      const formatted = active.map(e => {
        const beginMs = new Date(e.begin).getTime();
        const runningSeconds = Math.floor((now - beginMs) / 1000);
        return {
          id: e.id,
          project: typeof e.project === 'object' ? e.project.name : e.project,
          activity: typeof e.activity === 'object' ? e.activity.name : e.activity,
          begin: e.begin,
          runningFor: formatDuration(runningSeconds),
          description: e.description || null
        };
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'active',
            running: formatted.length > 0,
            count: formatted.length,
            active: formatted
          }, null, 2)
        }]
      };
    }

    case 'me': {
      const me = await client.getMe();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'me',
            user: {
              id: me.id,
              username: me.username,
              email: me.email,
              alias: me.alias || null,
              roles: me.roles || [],
              language: me.language || null
            }
          }, null, 2)
        }]
      };
    }

    default:
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Unknown query type: ${type}. Use: projects, activities, entries, hours, customers, active, or me`,
            isError: true
          })
        }]
      };
  }
}
