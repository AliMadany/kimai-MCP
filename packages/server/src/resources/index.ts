import type { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../config.js';
import type { KimaiClient } from '@urtime/shared';

export interface ResourceContext {
  config: ServerConfig;
  createKimaiClient: (token?: string, email?: string) => KimaiClient;
}

/**
 * Register available resources
 */
export function registerResources(): {
  resources: Resource[];
  resourceTemplates?: ResourceTemplate[];
} {
  return {
    resources: [
      {
        uri: 'kimai://projects',
        name: 'Available Projects',
        description: 'List of all projects available in Kimai',
        mimeType: 'application/json'
      },
      {
        uri: 'kimai://activities',
        name: 'Available Activities',
        description: 'List of all activities available in Kimai',
        mimeType: 'application/json'
      }
    ],
    resourceTemplates: [
      {
        uriTemplate: 'kimai://recent/{count}',
        name: 'Recent Time Entries',
        description: 'Recent timesheet entries from Kimai',
        mimeType: 'application/json'
      }
    ]
  };
}

/**
 * Handle resource read requests
 */
export async function handleResourceRead(
  uri: string,
  context: ResourceContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  try {
    const client = context.createKimaiClient();

    // Handle static resources
    if (uri === 'kimai://projects') {
      const projects = await client.getProjects();
      const formatted = projects.map(p => ({
        id: p.id,
        name: p.name,
        customer: typeof p.customer === 'object' && p.customer
          ? p.customer.name
          : p.customer
      }));

      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(formatted, null, 2)
        }]
      };
    }

    if (uri === 'kimai://activities') {
      const activities = await client.getActivities();
      const formatted = activities.map(a => ({
        id: a.id,
        name: a.name,
        projectId: typeof a.project === 'object' && a.project
          ? a.project.id
          : a.project
      }));

      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(formatted, null, 2)
        }]
      };
    }

    // Handle template resources (kimai://recent/{count})
    const recentMatch = uri.match(/^kimai:\/\/recent\/(\d+)$/);
    if (recentMatch) {
      const count = parseInt(recentMatch[1], 10) || 10;
      const entries = await client.getRecentTimesheets(Math.min(count, 50));

      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(entries, null, 2)
        }]
      };
    }

    // Unknown resource
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error: `Unknown resource: ${uri}` })
      }]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error: message })
      }]
    };
  }
}
