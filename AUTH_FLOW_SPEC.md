# urTime MCP Server - Authentication Flow Specification

## Overview

- **Server Name:** urtime-kimai
- **Version:** 1.2.2
- **Transport:** Streamable HTTP (MCP SDK `StreamableHTTPServerTransport`)
- **Auth Method:** OAuth 2.1 with PKCE + Dynamic Client Registration

---

## Endpoints

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/health` | GET | No | Health check |
| `/docs` | GET | No | Documentation page |
| `/.well-known/oauth-protected-resource` | GET | No | OAuth Protected Resource Metadata (RFC 9728) |
| `/.well-known/oauth-authorization-server` | GET | No | OAuth Authorization Server Metadata (RFC 8414) |
| `/.well-known/openid-configuration` | GET | No | OpenID Connect Discovery (alternative) |
| `/register` | POST | No | Dynamic Client Registration (RFC 7591) |
| `/authorize` | GET | No | Display authorization form |
| `/authorize` | POST | No | Process authorization (validate Kimai creds) |
| `/token` | POST | No | Exchange auth code for tokens |
| `/test-connection` | POST | No | Test Kimai credentials (used by auth page) |
| `/mcp` | POST | **YES** | MCP endpoint (initialize, tools/list, tools/call, etc.) |

---

## Authentication Flow - Step by Step

### Step 1: Client Connects to MCP Endpoint

**Request:**
```http
POST /mcp HTTP/1.1
Host: server.example.com
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "claude-ai",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

**Response (NO AUTH):**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://server.example.com/.well-known/oauth-protected-resource"
Content-Type: application/json

{
  "error": "unauthorized",
  "error_description": "Authentication required. Please complete OAuth authorization."
}
```

**Key Points:**
- We return `401 Unauthorized` for ALL /mcp requests without valid Bearer token
- `WWW-Authenticate` header MUST use `resource_metadata` (not `resource`)
- `resource_metadata` MUST point to the full URL of `/.well-known/oauth-protected-resource`

---

### Step 2: Client Fetches Protected Resource Metadata

**Request:**
```http
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: server.example.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "resource": "https://server.example.com",
  "authorization_servers": ["https://server.example.com"],
  "scopes_supported": ["kimai:read", "kimai:write"],
  "bearer_methods_supported": ["header"]
}
```

**Key Points:**
- `resource` = the MCP server base URL
- `authorization_servers` = array of OAuth authorization server URLs (usually same as resource)
- `scopes_supported` = available OAuth scopes
- `bearer_methods_supported` = how to pass the token (we use `header` = Authorization: Bearer)

---

### Step 3: Client Fetches Authorization Server Metadata

**Request:**
```http
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: server.example.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "issuer": "https://server.example.com",
  "authorization_endpoint": "https://server.example.com/authorize",
  "token_endpoint": "https://server.example.com/token",
  "registration_endpoint": "https://server.example.com/register",
  "scopes_supported": ["kimai:read", "kimai:write"],
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "service_documentation": "https://server.example.com/docs"
}
```

**Key Points:**
- `registration_endpoint` = REQUIRED for Dynamic Client Registration
- `code_challenge_methods_supported: ["S256"]` = PKCE is required
- `token_endpoint_auth_methods_supported: ["none"]` = public clients (no client_secret)

---

### Step 4: Client Registers Dynamically (RFC 7591)

**Request:**
```http
POST /register HTTP/1.1
Host: server.example.com
Content-Type: application/json

{
  "redirect_uris": ["https://claude.ai/oauth/callback"],
  "client_name": "Claude",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "client_id": "mcp_client_7fb18acf-70fa-45bc-9f0d-d90cd6e77ecf",
  "client_name": "Claude",
  "redirect_uris": ["https://claude.ai/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Key Points:**
- We generate a random `client_id` for each registration
- We don't store/validate clients - actual auth is via Kimai credentials
- Response MUST include `client_id`

---

### Step 5: Client Opens Authorization URL in Browser

**The client constructs this URL and opens it in user's browser:**

```
GET /authorize?
  client_id=mcp_client_7fb18acf-70fa-45bc-9f0d-d90cd6e77ecf&
  redirect_uri=https://claude.ai/oauth/callback&
  response_type=code&
  state=random_state_value&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256&
  scope=kimai:read%20kimai:write
HTTP/1.1
Host: server.example.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/html

<!-- HTML form for user to enter Kimai credentials -->
<form method="POST" action="/authorize">
  <input type="hidden" name="client_id" value="mcp_client_...">
  <input type="hidden" name="redirect_uri" value="https://claude.ai/oauth/callback">
  <input type="hidden" name="state" value="random_state_value">
  <input type="hidden" name="code_challenge" value="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM">
  <input type="hidden" name="scope" value="kimai:read kimai:write">

  <input name="kimai_url" placeholder="https://your-company.kimai.cloud">
  <input name="kimai_token" type="password" placeholder="API Token">
  <input name="kimai_email" placeholder="Email (optional)">

  <button type="submit">Authorize</button>
</form>
```

**Key Points:**
- `code_challenge` = Base64URL(SHA256(code_verifier)) - PKCE
- `code_challenge_method` = "S256" (required)
- `state` = random value for CSRF protection
- We render HTML form for user to enter their Kimai credentials

---

### Step 6: User Submits Kimai Credentials

**Request (form POST):**
```http
POST /authorize HTTP/1.1
Host: server.example.com
Content-Type: application/x-www-form-urlencoded

client_id=mcp_client_7fb18acf-70fa-45bc-9f0d-d90cd6e77ecf&
redirect_uri=https://claude.ai/oauth/callback&
state=random_state_value&
code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
scope=kimai:read%20kimai:write&
kimai_url=https://demo.kimai.org&
kimai_token=user_api_token_here&
kimai_email=user@example.com
```

**What We Do:**
1. Validate Kimai credentials by calling Kimai API
2. If valid: store encrypted credentials, generate auth code
3. Redirect to `redirect_uri` with auth code

**Response (SUCCESS):**
```http
HTTP/1.1 302 Found
Location: https://claude.ai/oauth/callback?code=AUTH_CODE_HERE&state=random_state_value
```

**Response (FAILURE):**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_credentials",
  "error_description": "Could not connect to Kimai: Invalid API token"
}
```

---

### Step 7: Client Exchanges Auth Code for Tokens

**Request:**
```http
POST /token HTTP/1.1
Host: server.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTH_CODE_HERE&
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&
client_id=mcp_client_7fb18acf-70fa-45bc-9f0d-d90cd6e77ecf
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "a1b2c3d4e5f6...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "r1s2t3u4v5w6...",
  "scope": "kimai:read kimai:write"
}
```

**Key Points:**
- `code_verifier` = the original random string used to create `code_challenge`
- We verify: `Base64URL(SHA256(code_verifier)) === code_challenge`
- Access token expires in 1 hour
- Refresh token expires in 30 days

---

### Step 8: Client Makes Authenticated MCP Request

**Request:**
```http
POST /mcp HTTP/1.1
Host: server.example.com
Content-Type: application/json
Authorization: Bearer a1b2c3d4e5f6...

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "claude-ai",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Mcp-Session-Id: 550e8400-e29b-41d4-a716-446655440000

event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{},"resources":{},"prompts":{}},"serverInfo":{"name":"urtime-kimai","version":"1.2.2"}},"jsonrpc":"2.0","id":1}
```

**Key Points:**
- `Authorization: Bearer <access_token>` header required
- Response uses Server-Sent Events (SSE) format
- `Mcp-Session-Id` header returned for session tracking
- Subsequent requests must include `Mcp-Session-Id` header

---

## Complete Flow Diagram

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   Claude    │                    │  MCP Server │                    │    Kimai    │
│  (Client)   │                    │  (urtime)   │                    │   (API)     │
└──────┬──────┘                    └──────┬──────┘                    └──────┬──────┘
       │                                  │                                  │
       │ 1. POST /mcp (no auth)           │                                  │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 401 + WWW-Authenticate           │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 2. GET /.well-known/oauth-protected-resource                        │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 200 + {resource, auth_servers}   │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 3. GET /.well-known/oauth-authorization-server                      │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 200 + {endpoints, registration}  │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 4. POST /register                │                                  │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 201 + {client_id}                │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 5. Open browser: GET /authorize?client_id=...&code_challenge=...    │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 200 + HTML login form            │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 6. User submits: POST /authorize (kimai_url, kimai_token)           │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │                                  │ Validate credentials             │
       │                                  │─────────────────────────────────>│
       │                                  │                                  │
       │                                  │ 200 OK (valid)                   │
       │                                  │<─────────────────────────────────│
       │                                  │                                  │
       │ 302 Redirect to callback?code=...│                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 7. POST /token (code, code_verifier)                                │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 200 + {access_token, refresh_token}                                 │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │ 8. POST /mcp + Authorization: Bearer <token>                        │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 200 + SSE stream (MCP response)  │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
```

---

## File Structure

```
packages/server/src/
├── http/
│   ├── server.ts          # Main HTTP server, MCP handler, 401 logic
│   └── index.ts           # Exports
├── auth/
│   ├── oauth-metadata.ts  # /.well-known/* endpoints
│   ├── oauth.ts           # /register, /authorize, /token endpoints
│   ├── crypto.ts          # Encryption, PKCE verification
│   ├── database-json.ts   # JSON file database for tokens/users
│   └── pages/
│       └── authorize.html # HTML form for Kimai credentials
├── tools/                 # MCP tools (kimai_query, kimai_log, etc.)
├── resources/             # MCP resources
├── prompts/               # MCP prompts
└── config.ts              # Configuration
```

---

## Key Code Locations

### 401 Response (server.ts:258-264)
```typescript
const return401 = () => {
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${config.http!.baseUrl}/.well-known/oauth-protected-resource"`);
  res.status(401).json({
    error: 'unauthorized',
    error_description: 'Authentication required. Please complete OAuth authorization.'
  });
};
```

### OAuth Metadata (oauth-metadata.ts:27-40)
```typescript
router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    // ...
  });
});
```

### Dynamic Client Registration (oauth.ts:32-55)
```typescript
router.post('/register', (req, res) => {
  const { redirect_uris, client_name } = req.body;
  const clientId = `mcp_client_${randomUUID()}`;
  res.status(201).json({
    client_id: clientId,
    // ...
  });
});
```

### Token Extraction (server.ts:133-159)
```typescript
function extractAuth(req: Request): SessionAuth | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts[0].toLowerCase() !== 'bearer') return null;

  const accessToken = parts[1];
  const tokenRecord = db.getOAuthToken(accessToken);
  // ... validate and return user's Kimai credentials
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_HTTP_MODE` | Yes | Must be `true` for HTTP mode |
| `HTTP_BASE_URL` | Yes | Public URL (e.g., `https://mcp.example.com`) |
| `ENCRYPTION_KEY` | Yes | 64-char hex key for encrypting Kimai tokens |
| `HTTP_PORT` | No | Port (default: 3002) |
| `HTTP_HOST` | No | Host (default: 0.0.0.0) |
| `CORS_ALLOWED_ORIGINS` | No | CORS origins (default: *) |
| `RATE_LIMIT_PER_MINUTE` | No | Rate limit (default: 100) |

---

## Testing Commands

```bash
# Health check
curl https://server.example.com/health

# OAuth metadata
curl https://server.example.com/.well-known/oauth-authorization-server

# Protected resource metadata
curl https://server.example.com/.well-known/oauth-protected-resource

# Dynamic client registration
curl -X POST https://server.example.com/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["http://localhost"],"client_name":"Test"}'

# Test 401 response
curl -i -X POST https://server.example.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# Should see:
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer resource_metadata="https://server.example.com/.well-known/oauth-protected-resource"
```
