import type { ToolContext } from './index.js';

interface ManageArgs {
  action: 'update' | 'delete';
  entry_id: number;
  kimai_token?: string;
  kimai_email?: string;
  updates?: {
    description?: string;
    project?: number;
    activity?: number;
    begin?: string;
    end?: string;
  };
}

/**
 * Handle kimai_manage tool - update or delete entries
 */
export async function handleKimaiManage(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    action,
    entry_id,
    kimai_token,
    kimai_email,
    updates
  } = args as unknown as ManageArgs;

  const client = context.createKimaiClient(kimai_token, kimai_email);

  switch (action) {
    case 'update': {
      if (!updates || Object.keys(updates).length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'No updates provided. Specify at least one field to update.',
              isError: true
            })
          }]
        };
      }

      try {
        const updated = await client.updateTimesheet(entry_id, updates);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'update',
              entry_id,
              updated: updated,
              message: `Entry ${entry_id} updated successfully`
            }, null, 2)
          }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              action: 'update',
              entry_id,
              error: message,
              isError: true
            })
          }]
        };
      }
    }

    case 'delete': {
      try {
        await client.deleteTimesheet(entry_id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'delete',
              entry_id,
              message: `Entry ${entry_id} deleted successfully`
            }, null, 2)
          }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              action: 'delete',
              entry_id,
              error: message,
              isError: true
            })
          }]
        };
      }
    }

    default:
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Unknown action: ${action}. Use: update or delete`,
            isError: true
          })
        }]
      };
  }
}
