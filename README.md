# Kimai-MCP

Connect Claude, ChatGPT, and other AI assistants to your [Kimai](https://www.kimai.org) time tracker using MCP (Model Context Protocol).

Log time, query hours, and manage your timesheet using natural language.

## Usage

### Option 1: Remote Server (Recommended)

Connect to the hosted MCP server — no setup required.

Add this URL in your AI client:
```
https://kimaimcp.urkitchenegypt.com/mcp
```

On first connect, you'll be asked to enter your Kimai URL and API token.

### Option 2: Run Locally

Clone and run the server on your machine.

```bash
git clone https://github.com/AliMadany/kimai-MCP.git
cd kimai-MCP
pnpm install && pnpm build

MCP_HTTP_MODE=true \
HTTP_BASE_URL=http://localhost:3002 \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
node packages/server/dist/server.js
```

Then add `http://localhost:3002/mcp` to your AI client.

## Tools

| Tool | Description |
|------|-------------|
| `kimai_log` | Log time using natural language ("2h on ProjectX yesterday") |
| `kimai_query` | Query projects, activities, entries, or work hours |
| `kimai_manage` | Update or delete existing time entries |

## Docs

- [Deploying your own instance](docs/deploying.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
