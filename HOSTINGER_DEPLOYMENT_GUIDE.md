# urTime MCP Server - Hostinger Shared Hosting Deployment Guide

This guide documents how to deploy the urTime MCP server on Hostinger shared hosting.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Hostinger Shared Hosting                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Internet (Claude Desktop / ChatGPT)                         │
│       ↓                                                      │
│  LiteSpeed Web Server (:443 SSL)                            │
│  └─ kimaimcp.urkitchenegypt.com                             │
│       ↓                                                      │
│  public_html/index.php (PHP Proxy)                          │
│       ↓                                                      │
│  Node.js Server (:3002)                                      │
│  └─ packages/server/dist/server.js                          │
│       ↓                                                      │
│  JSON File Database (data/auth.json)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

| Component | Technology |
|-----------|------------|
| Web Server | LiteSpeed (Hostinger managed) |
| SSL | Let's Encrypt (Hostinger managed) |
| Proxy | PHP cURL (index.php) |
| Application | Node.js + Express |
| MCP SDK | @modelcontextprotocol/sdk |
| Database | JSON file (replaced SQLite) |
| Auth | OAuth 2.1 with PKCE |

## Why This Setup?

### Challenge: Shared Hosting Limitations

1. **No root access** - Can't install system packages
2. **No nginx configuration** - Can't set up reverse proxy directly
3. **Native modules fail** - `better-sqlite3` requires compilation with specific GLIBC version
4. **No direct port access** - Only ports 80/443 via LiteSpeed

### Solution: PHP Proxy + JSON Database

1. **PHP Proxy** - Routes requests from public_html to Node.js running on localhost:3002
2. **JSON Database** - Replaced SQLite with a simple JSON file storage
3. **Background Node.js** - Run Node.js server as background process via SSH

## Files Structure

```
~/domains/kimaimcp.urkitchenegypt.com/
├── public_html/
│   ├── index.php          # PHP proxy (routes all requests to Node.js)
│   └── .htaccess          # URL rewriting
└── urtime-mcp/
    └── packages/
        └── server/
            ├── dist/              # Compiled JavaScript
            ├── node_modules/      # Dependencies
            ├── data/              # JSON database storage
            │   └── auth.json
            └── package.json
```

## Deployment Steps

### 1. Prepare Local Build

```bash
# Build the server
cd /path/to/urtime-mcp/packages/server
npm run build

# Create deployment tarball
cd /path/to/urtime-mcp
tar -czvf deploy.tar.gz \
  packages/server/dist \
  packages/server/package.json \
  packages/server/node_modules \
  packages/shared
```

### 2. Upload to Server

```bash
# Upload via SCP
scp -P 65002 deploy.tar.gz u838631855@91.108.101.53:~/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/
```

### 3. Extract on Server

```bash
# SSH into server
ssh -p 65002 u838631855@91.108.101.53

# Extract
cd ~/domains/kimaimcp.urkitchenegypt.com/urtime-mcp
tar -xzf deploy.tar.gz
```

### 4. Set Up PHP Proxy

Create `~/domains/kimaimcp.urkitchenegypt.com/public_html/index.php`:

```php
<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id");
header("Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$nodeUrl = 'http://127.0.0.1:3002' . $_SERVER['REQUEST_URI'];

$forwardHeaders = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (in_array($lower, ['authorization', 'content-type', 'mcp-session-id', 'accept'])) {
        $forwardHeaders[] = "$name: $value";
    }
}

$acceptHeader = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
$isSSE = ($_SERVER['REQUEST_METHOD'] === 'GET' &&
          strpos($acceptHeader, 'text/event-stream') !== false);

if ($isSSE) {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    while (ob_get_level()) ob_end_clean();

    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 0);
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 128);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);

    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        flush();
        return strlen($data);
    });

    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) {
        $len = strlen($header);
        $parts = explode(':', $header, 2);
        if (count($parts) == 2) {
            $name = trim($parts[0]);
            $value = trim($parts[1]);
            $lower = strtolower($name);
            if (in_array($lower, ['mcp-session-id', 'www-authenticate'])) {
                header("$name: $value");
            }
        }
        return $len;
    });

    curl_exec($ch);
    curl_close($ch);

} else {
    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $responseHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);

    foreach (explode("\r\n", $responseHeaders) as $line) {
        if (empty($line)) continue;
        $parts = explode(':', $line, 2);
        if (count($parts) == 2) {
            $name = trim($parts[0]);
            $value = trim($parts[1]);
            $lower = strtolower($name);
            if (in_array($lower, ['content-type', 'mcp-session-id', 'www-authenticate'])) {
                header("$name: $value");
            }
        }
    }

    http_response_code($httpCode);
    echo $body;
}
?>
```

### 5. Set Up .htaccess

Create `~/domains/kimaimcp.urkitchenegypt.com/public_html/.htaccess`:

```apache
DirectoryIndex index.php
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php [L,QSA]
```

### 6. Start Node.js Server

```bash
cd ~/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server

# Start with environment variables
MCP_HTTP_MODE=true \
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com \
nohup node dist/server.js > ~/mcp.log 2>&1 &

# Verify it's running
curl http://127.0.0.1:3002/health
```

## Key Issues & Solutions

### Issue 1: better-sqlite3 Compilation Failure

**Error:**
```
Error: /lib64/libc.so.6: version `GLIBC_2.29' not found
```

**Solution:** Created `database-json.ts` - a JSON file-based database with the same interface as the SQLite version.

### Issue 2: CORS Errors

**Error:** Claude Desktop getting CORS errors

**Solution:** Added comprehensive CORS headers in PHP proxy:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id`
- `Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate`

### Issue 3: WWW-Authenticate Header Missing

**Error:** OAuth flow not triggering

**Solution:** PHP proxy now forwards `WWW-Authenticate` header from Node.js responses.

### Issue 4: SSE Streaming Through PHP

**Error:** SSE events not reaching client in real-time

**Solution:**
- Detect SSE requests via `Accept: text/event-stream` header
- Use streaming curl with `CURLOPT_WRITEFUNCTION`
- Disable output buffering with `ob_end_clean()`
- Set `CURLOPT_TIMEOUT: 0` for long-lived connections

### Issue 5: Authentication Too Early

**Error:** Claude Desktop can't initialize session

**Solution:** Changed server to:
- Allow unauthenticated initial GET/POST for session creation
- Only require auth for actual tool calls
- Store auth per-session after OAuth completes

## Useful Commands

### Start Server
```bash
cd ~/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
MCP_HTTP_MODE=true HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com nohup node dist/server.js > ~/mcp.log 2>&1 &
```

### Stop Server
```bash
pkill -f "node dist/server.js"
```

### Check Server Status
```bash
ps aux | grep node
curl https://kimaimcp.urkitchenegypt.com/health
```

### View Logs
```bash
tail -f ~/mcp.log
```

### Test Endpoints
```bash
# Health check
curl https://kimaimcp.urkitchenegypt.com/health

# OAuth metadata
curl https://kimaimcp.urkitchenegypt.com/.well-known/oauth-authorization-server

# Test CORS
curl -i -X OPTIONS https://kimaimcp.urkitchenegypt.com/ -H "Origin: https://claude.ai"
```

## Connecting Claude Desktop

1. Open Claude Desktop settings
2. Add MCP server with URL: `https://kimaimcp.urkitchenegypt.com`
3. Claude will redirect to authorization page
4. Enter your Kimai credentials:
   - Kimai URL: `https://yourdomain.kimai.cloud`
   - API Token: Your Kimai API token
   - Email: Your Kimai email (optional)
5. Click Authorize
6. Claude Desktop will receive OAuth token and connect

## Troubleshooting

### Server Not Starting
```bash
# Check if port is in use
netstat -tlnp | grep 3002

# Kill existing process
pkill -f "node dist/server.js"

# Check logs
cat ~/mcp.log
```

### CORS Issues
```bash
# Test CORS headers
curl -i -X OPTIONS https://kimaimcp.urkitchenegypt.com/ -H "Origin: https://claude.ai" | grep -i access-control
```

### OAuth Not Working
```bash
# Test OAuth metadata
curl https://kimaimcp.urkitchenegypt.com/.well-known/oauth-protected-resource
curl https://kimaimcp.urkitchenegypt.com/.well-known/oauth-authorization-server

# Test authorize page
open https://kimaimcp.urkitchenegypt.com/authorize?client_id=test&redirect_uri=http://localhost&response_type=code&code_challenge=test
```

### SSE Not Streaming
```bash
# Test SSE connection (should hang and show events)
curl -N https://kimaimcp.urkitchenegypt.com/ -H "Accept: text/event-stream"
```

## Security Notes

1. **API Tokens are encrypted** - Kimai tokens stored encrypted in JSON database
2. **OAuth tokens expire** - Access tokens: 1 hour, Refresh tokens: 30 days
3. **PKCE required** - All OAuth flows require PKCE (S256)
4. **Rate limiting** - 100 requests per minute per IP

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_HTTP_MODE` | `false` | Enable HTTP mode (required for remote access) |
| `HTTP_BASE_URL` | - | Public URL of the server |
| `HTTP_PORT` | `3002` | Port for Node.js server |
| `HTTP_HOST` | `127.0.0.1` | Host to bind to |
