import type { ToolContext } from './index.js';

interface AdminArgs {
  entity: 'project' | 'activity' | 'customer' | 'user' | 'team';
  action: 'list' | 'create' | 'update' | 'delete' | 'add_member' | 'remove_member';
  // IDs
  project_id?: number;
  activity_id?: number;
  customer_id?: number;
  user_id?: number;
  team_id?: number;
  teamlead_id?: number;
  member_user_id?: number;
  // Common fields
  name?: string;
  comment?: string;
  visible?: boolean;
  global_activities?: boolean;
  search?: string;
  // User fields
  username?: string;
  email?: string;
  plainPassword?: string;
  alias?: string;
  enabled?: boolean;
  roles?: string[];
  kimai_token?: string;
  kimai_email?: string;
}

function errorResponse(msg: string) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: msg, isError: true }) }]
  };
}

function successResponse(data: object) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }]
  };
}

/**
 * Handle kimai_admin tool — CRUD for projects, activities, customers, users, teams
 */
export async function handleKimaiAdmin(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const a = args as unknown as AdminArgs;
  const client = context.createKimaiClient(a.kimai_token, a.kimai_email);

  try {
    switch (a.entity) {
      // ─── PROJECTS ───────────────────────────────────────────
      case 'project': {
        switch (a.action) {
          case 'list': {
            const projects = await client.getProjects(a.search);
            return successResponse({
              entity: 'project', action: 'list',
              count: projects.length,
              projects: projects.map(p => ({
                id: p.id, name: p.name, visible: p.visible,
                customer: typeof p.customer === 'object' && p.customer ? p.customer.name : p.customer
              }))
            });
          }
          case 'create': {
            if (!a.name) return errorResponse('name is required to create a project');
            if (!a.customer_id) return errorResponse('customer_id is required to create a project');
            const project = await client.createProject({
              name: a.name,
              customer: a.customer_id,
              comment: a.comment,
              visible: a.visible ?? true,
              globalActivities: a.global_activities
            });
            return successResponse({ entity: 'project', action: 'create', project });
          }
          case 'update': {
            if (!a.project_id) return errorResponse('project_id is required to update a project');
            const updates: Record<string, any> = {};
            if (a.name !== undefined) updates.name = a.name;
            if (a.comment !== undefined) updates.comment = a.comment;
            if (a.visible !== undefined) updates.visible = a.visible;
            if (a.customer_id !== undefined) updates.customer = a.customer_id;
            if (a.global_activities !== undefined) updates.globalActivities = a.global_activities;
            if (Object.keys(updates).length === 0) return errorResponse('No fields to update provided');
            const project = await client.updateProject(a.project_id, updates);
            return successResponse({ entity: 'project', action: 'update', project });
          }
          case 'delete': {
            if (!a.project_id) return errorResponse('project_id is required to delete a project');
            await client.deleteProject(a.project_id);
            return successResponse({ entity: 'project', action: 'delete', project_id: a.project_id, message: `Project ${a.project_id} deleted` });
          }
          default:
            return errorResponse(`Action '${a.action}' is not supported for entity 'project'. Use: list, create, update, delete`);
        }
      }

      // ─── ACTIVITIES ──────────────────────────────────────────
      case 'activity': {
        switch (a.action) {
          case 'list': {
            const activities = await client.getActivities(a.project_id, a.search, true);
            return successResponse({
              entity: 'activity', action: 'list',
              count: activities.length,
              activities: activities.map(act => ({
                id: act.id, name: act.name, visible: act.visible,
                project: typeof act.project === 'object' && act.project ? act.project.id : act.project
              }))
            });
          }
          case 'create': {
            if (!a.name) return errorResponse('name is required to create an activity');
            const activity = await client.createActivity({
              name: a.name,
              project: a.project_id ?? null,
              comment: a.comment,
              visible: a.visible ?? true
            });
            return successResponse({ entity: 'activity', action: 'create', activity });
          }
          case 'update': {
            if (!a.activity_id) return errorResponse('activity_id is required to update an activity');
            const updates: Record<string, any> = {};
            if (a.name !== undefined) updates.name = a.name;
            if (a.comment !== undefined) updates.comment = a.comment;
            if (a.visible !== undefined) updates.visible = a.visible;
            if (a.project_id !== undefined) updates.project = a.project_id;
            if (Object.keys(updates).length === 0) return errorResponse('No fields to update provided');
            const activity = await client.updateActivity(a.activity_id, updates);
            return successResponse({ entity: 'activity', action: 'update', activity });
          }
          case 'delete': {
            if (!a.activity_id) return errorResponse('activity_id is required to delete an activity');
            await client.deleteActivity(a.activity_id);
            return successResponse({ entity: 'activity', action: 'delete', activity_id: a.activity_id, message: `Activity ${a.activity_id} deleted` });
          }
          default:
            return errorResponse(`Action '${a.action}' is not supported for entity 'activity'. Use: list, create, update, delete`);
        }
      }

      // ─── CUSTOMERS ───────────────────────────────────────────
      case 'customer': {
        switch (a.action) {
          case 'list': {
            const customers = await client.getCustomers(a.search);
            return successResponse({
              entity: 'customer', action: 'list',
              count: customers.length,
              customers: customers.map(c => ({ id: c.id, name: c.name, visible: c.visible }))
            });
          }
          case 'create': {
            if (!a.name) return errorResponse('name is required to create a customer');
            const customer = await client.createCustomer({ name: a.name, comment: a.comment, visible: a.visible ?? true });
            return successResponse({ entity: 'customer', action: 'create', customer });
          }
          case 'update': {
            if (!a.customer_id) return errorResponse('customer_id is required to update a customer');
            const updates: Record<string, any> = {};
            if (a.name !== undefined) updates.name = a.name;
            if (a.comment !== undefined) updates.comment = a.comment;
            if (a.visible !== undefined) updates.visible = a.visible;
            if (Object.keys(updates).length === 0) return errorResponse('No fields to update provided');
            const customer = await client.updateCustomer(a.customer_id, updates);
            return successResponse({ entity: 'customer', action: 'update', customer });
          }
          default:
            return errorResponse(`Action '${a.action}' is not supported for entity 'customer'. Use: list, create, update`);
        }
      }

      // ─── USERS ───────────────────────────────────────────────
      case 'user': {
        switch (a.action) {
          case 'list': {
            const users = await client.getUsers(a.search);
            return successResponse({
              entity: 'user', action: 'list',
              count: users.length,
              users: users.map(u => ({ id: u.id, username: u.username, email: u.email, alias: u.alias, enabled: u.enabled, roles: u.roles }))
            });
          }
          case 'create': {
            if (!a.username) return errorResponse('username is required to create a user');
            if (!a.email) return errorResponse('email is required to create a user');
            if (!a.plainPassword) return errorResponse('plainPassword is required to create a user');
            const user = await client.createUser({
              username: a.username,
              email: a.email,
              plainPassword: a.plainPassword,
              alias: a.alias,
              enabled: a.enabled ?? true,
              roles: a.roles
            });
            return successResponse({ entity: 'user', action: 'create', user: { id: user.id, username: user.username, email: user.email } });
          }
          case 'update': {
            if (!a.user_id) return errorResponse('user_id is required to update a user');
            const updates: Record<string, any> = {};
            if (a.alias !== undefined) updates.alias = a.alias;
            if (a.enabled !== undefined) updates.enabled = a.enabled;
            if (a.email !== undefined) updates.email = a.email;
            if (a.plainPassword !== undefined) updates.plainPassword = a.plainPassword;
            if (Object.keys(updates).length === 0) return errorResponse('No fields to update provided');
            const user = await client.updateUser(a.user_id, updates);
            return successResponse({ entity: 'user', action: 'update', user: { id: user.id, username: user.username, email: user.email } });
          }
          default:
            return errorResponse(`Action '${a.action}' is not supported for entity 'user'. Use: list, create, update`);
        }
      }

      // ─── TEAMS ───────────────────────────────────────────────
      case 'team': {
        switch (a.action) {
          case 'list': {
            const teams = await client.getTeams();
            return successResponse({
              entity: 'team', action: 'list',
              count: teams.length,
              teams: teams.map(t => ({
                id: t.id, name: t.name,
                teamlead: typeof t.teamlead === 'object' ? t.teamlead.username : t.teamlead,
                memberCount: t.members?.length ?? 0
              }))
            });
          }
          case 'create': {
            if (!a.name) return errorResponse('name is required to create a team');
            if (!a.teamlead_id) return errorResponse('teamlead_id is required to create a team');
            const team = await client.createTeam({ name: a.name, teamlead: a.teamlead_id });
            return successResponse({ entity: 'team', action: 'create', team });
          }
          case 'update': {
            if (!a.team_id) return errorResponse('team_id is required to update a team');
            const updates: Record<string, any> = {};
            if (a.name !== undefined) updates.name = a.name;
            if (a.teamlead_id !== undefined) updates.teamlead = a.teamlead_id;
            if (Object.keys(updates).length === 0) return errorResponse('No fields to update provided');
            const team = await client.updateTeam(a.team_id, updates);
            return successResponse({ entity: 'team', action: 'update', team });
          }
          case 'delete': {
            if (!a.team_id) return errorResponse('team_id is required to delete a team');
            await client.deleteTeam(a.team_id);
            return successResponse({ entity: 'team', action: 'delete', team_id: a.team_id, message: `Team ${a.team_id} deleted` });
          }
          case 'add_member': {
            if (!a.team_id) return errorResponse('team_id is required');
            if (!a.member_user_id) return errorResponse('member_user_id is required');
            await client.addTeamMember(a.team_id, a.member_user_id);
            return successResponse({ entity: 'team', action: 'add_member', team_id: a.team_id, user_id: a.member_user_id, message: `User ${a.member_user_id} added to team ${a.team_id}` });
          }
          case 'remove_member': {
            if (!a.team_id) return errorResponse('team_id is required');
            if (!a.member_user_id) return errorResponse('member_user_id is required');
            await client.removeTeamMember(a.team_id, a.member_user_id);
            return successResponse({ entity: 'team', action: 'remove_member', team_id: a.team_id, user_id: a.member_user_id, message: `User ${a.member_user_id} removed from team ${a.team_id}` });
          }
          default:
            return errorResponse(`Action '${a.action}' is not supported for entity 'team'. Use: list, create, update, delete, add_member, remove_member`);
        }
      }

      default:
        return errorResponse(`Unknown entity: ${a.entity}. Use: project, activity, customer, user, team`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, isError: true }) }]
    };
  }
}
