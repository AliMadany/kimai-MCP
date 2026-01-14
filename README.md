# urTime MCP Server

Remote MCP (Model Context Protocol) server for Kimai time tracking integration.

Allows Claude, ChatGPT, and other AI assistants to manage your Kimai timesheets.

## Features

- OAuth 2.1 authentication (MCP spec compliant)
- Works with any Kimai instance
- Secure credential storage (AES-256-GCM encryption)
- Rate limiting and security headers

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Configure
cd packages/server
cp .env.example .env
# Edit .env with your settings

# Run
pnpm start
```

## Deployment

See [packages/server/DEPLOY.md](packages/server/DEPLOY.md) for production deployment instructions.

## Structure

```
packages/
  server/     # MCP server with OAuth
  shared/     # Kimai client library
```

## License

MIT
