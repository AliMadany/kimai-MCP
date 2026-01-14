# @urtime/mcp-server - Kimai Time Tracker MCP Server

An MCP (Model Context Protocol) server that provides AI-powered time tracking integration with Kimai. Use natural language to log time entries, query work hours, and manage your timesheet.

## Features

- **AI-Powered Time Entry**: Log time using natural language ("2h development on ProjectX yesterday")
- **Smart Project/Activity Matching**: AI understands project and activity names from context
- **Multi-Day Support**: "Mon-Fri 8h" creates entries for each day
- **Work Hours Query**: Get summaries by day, week, or custom date ranges
- **Entry Management**: Update or delete existing entries

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "urtime-kimai": {
      "command": "node",
      "args": ["/path/to/urtime-try-ref-to-mcp/packages/mcp-server/dist/server.js"],
      "env": {
        "KIMAI_BASE_URL": "https://your-kimai-instance.com",
        "KIMAI_EMAIL": "your-kimai-login-email@example.com",
        "KIMAI_TOKEN": "your-kimai-api-token",
        "OPENAI_API_KEY": "your-openai-api-key"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for AI parsing |
| `KIMAI_TOKEN` | No* | - | Kimai API token (can also pass per-request) |
| `KIMAI_EMAIL` | No* | - | Kimai user email for X-AUTH-USER header |
| `KIMAI_BASE_URL` | No | `https://demo.kimai.org` | Kimai instance URL |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model to use |

*KIMAI_TOKEN and KIMAI_EMAIL can be set globally or passed as `kimai_token` and `kimai_email` parameters to each tool

**Authentication Note**: Kimai uses `X-AUTH-USER` (email) + `X-AUTH-TOKEN` (API password) headers for authentication. Make sure to set both `KIMAI_EMAIL` and `KIMAI_TOKEN` for proper authentication.

## Available Tools

### `kimai_log`

Log time entries using natural language.

**Parameters:**
- `input` (required): Natural language description (e.g., "2h development on ProjectX yesterday")
- `project_id` (optional): Override AI project matching
- `activity_id` (optional): Override AI activity matching
- `dry_run` (optional): Preview without creating entries

**Examples:**
```
"Log 2 hours of development work on Project Alpha"
"I worked from 9am to 5pm on testing today"
"Mon-Fri 8h on documentation for Project Beta"
```

### `kimai_query`

Query Kimai for projects, activities, entries, or work hours.

**Parameters:**
- `type` (required): `projects`, `activities`, `entries`, or `hours`
- `project_id` (optional): Filter by project
- `search` (optional): Search term
- `start_date` (optional): Start date for entries/hours (YYYY-MM-DD)
- `end_date` (optional): End date for entries/hours (YYYY-MM-DD)
- `limit` (optional): Max results (default 10)

**Examples:**
```
type: "projects" → List all projects
type: "hours", start_date: "2024-01-01", end_date: "2024-01-31" → Monthly summary
type: "entries", limit: 20 → Last 20 entries
```

### `kimai_manage`

Update or delete existing time entries.

**Parameters:**
- `action` (required): `update` or `delete`
- `entry_id` (required): ID of the entry to modify
- `updates` (for update): Object with fields to update

## Available Resources

| URI | Description |
|-----|-------------|
| `kimai://projects` | List of all available projects |
| `kimai://activities` | List of all available activities |
| `kimai://recent/{count}` | Recent timesheet entries |

## Available Prompts

| Name | Description |
|------|-------------|
| `quick_entry` | Optimized prompt for time entry with context |
| `work_summary` | Generate work hours summary |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @urtime/mcp-server build

# Test with MCP Inspector
pnpm --filter @urtime/mcp-server inspect
```

## License

MIT
