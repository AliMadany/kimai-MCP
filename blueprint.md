# MCP Server Blueprint: A-Z Guide for Building Production MCP Tools

> **Version**: 1.0.0
> **Last Updated**: January 2025
> **Purpose**: Complete reference for creating, deploying, and authenticating MCP (Model Context Protocol) servers

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Authentication Flow (OAuth2)](#3-authentication-flow-oauth2) ⭐ **Most Important**
4. [Tool Definition & Registration](#4-tool-definition--registration)
5. [SSE Transport Implementation](#5-sse-transport-implementation)
6. [Multi-User & Multi-Tenant Support](#6-multi-user--multi-tenant-support)
7. [Deployment (Docker + Nginx)](#7-deployment-docker--nginx)
8. [Security Considerations](#8-security-considerations)
9. [Complete Code Examples](#9-complete-code-examples)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist](#11-checklist)

---

## 1. Overview

### What is MCP?

MCP (Model Context Protocol) is a standardized protocol that allows AI assistants (like Claude) to interact with external tools and services. It enables:

- **Tool Discovery**: AI clients discover available tools via `tools/list`
- **Tool Execution**: AI clients call tools via `tools/call`
- **Real-Time Communication**: SSE (Server-Sent Events) for streaming responses
- **Secure Authentication**: OAuth2 flow for user authorization

### MCP Communication Flow

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   AI Client     │         │   MCP Server    │         │  Your Backend   │
│  (Claude.ai)    │         │  (OAuth + SSE)  │         │   (Services)    │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         │  1. OAuth Authorization   │                           │
         │ ─────────────────────────>│                           │
         │                           │  2. Validate User         │
         │                           │ ─────────────────────────>│
         │                           │<───────────────────────── │
         │  3. Access Token          │                           │
         │ <─────────────────────────│                           │
         │                           │                           │
         │  4. SSE Connect + JWT     │                           │
         │ ─────────────────────────>│                           │
         │                           │                           │
         │  5. tools/list            │                           │
         │ ─────────────────────────>│                           │
         │  6. Tool definitions      │                           │
         │ <─────────────────────────│                           │
         │                           │                           │
         │  7. tools/call            │                           │
         │ ─────────────────────────>│  8. Execute               │
         │                           │ ─────────────────────────>│
         │                           │<───────────────────────── │
         │  9. Tool result           │                           │
         │ <─────────────────────────│                           │
         └───────────────────────────┴───────────────────────────┘
```

---

## 2. Architecture

### Directory Structure

```
your-mcp-server/
├── server.py                      # FastMCP tool definitions
├── oauth_server.py                # OAuth2 + SSE endpoint server
├── oauth2_auth.py                 # OAuth2 token management
├── oauth_middleware.py            # Request authentication middleware
├── requirements.txt               # Python dependencies
├── Dockerfile                     # Container build config
├── docker-compose.yml             # Service orchestration
├── nginx/
│   └── mcp.yourdomain.conf        # Reverse proxy configuration
└── tools/
    ├── __init__.py
    ├── core/
    │   ├── base.py                # Base tool class
    │   ├── user_context.py        # User context management
    │   └── auth_middleware.py     # Auth helpers
    └── your_tools/
        ├── tool_one.py            # Your tool implementation
        └── tool_two.py            # Another tool
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **FastMCP Server** | `server.py` | Tool definitions with input schemas |
| **OAuth Server** | `oauth_server.py` | OAuth2 endpoints + SSE transport |
| **OAuth Store** | `oauth2_auth.py` | Token generation, validation, storage |
| **Middleware** | `oauth_middleware.py` | JWT validation, user context injection |
| **Tools** | `tools/*.py` | Business logic implementation |

---

## 3. Authentication Flow (OAuth2)

> ⭐ **This is the most critical section** - proper OAuth2 implementation ensures secure user authentication and enables any user to connect to your MCP server.

### 3.1 OAuth2 Overview

MCP uses **OAuth2 Authorization Code Flow with PKCE** for security:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OAUTH2 AUTHORIZATION CODE FLOW                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER CLICKS "CONNECT" IN CLAUDE                                          │
│     └─> Claude generates code_verifier + code_challenge (PKCE)               │
│                                                                              │
│  2. REDIRECT TO YOUR AUTHORIZATION ENDPOINT                                  │
│     GET /oauth/authorize?                                                    │
│         client_id=claude_client_id                                           │
│         &redirect_uri=https://claude.ai/oauth/callback                       │
│         &response_type=code                                                  │
│         &scope=your_scopes                                                   │
│         &state=random_state_value                                            │
│         &code_challenge=BASE64URL(SHA256(code_verifier))                     │
│         &code_challenge_method=S256                                          │
│                                                                              │
│  3. YOUR SERVER SHOWS LOGIN FORM                                             │
│     └─> User enters username + password                                      │
│     └─> Your server validates against your auth backend                      │
│                                                                              │
│  4. REDIRECT BACK WITH AUTHORIZATION CODE                                    │
│     Location: https://claude.ai/oauth/callback?                              │
│         code=AUTHORIZATION_CODE                                              │
│         &state=same_state_value                                              │
│                                                                              │
│  5. CLAUDE EXCHANGES CODE FOR TOKENS                                         │
│     POST /oauth/token                                                        │
│     {                                                                        │
│         "grant_type": "authorization_code",                                  │
│         "code": "AUTHORIZATION_CODE",                                        │
│         "redirect_uri": "https://claude.ai/oauth/callback",                  │
│         "client_id": "claude_client_id",                                     │
│         "code_verifier": "original_verifier"  // PKCE verification           │
│     }                                                                        │
│                                                                              │
│  6. YOUR SERVER RETURNS TOKENS                                               │
│     {                                                                        │
│         "access_token": "eyJhbGc...",                                        │
│         "token_type": "Bearer",                                              │
│         "expires_in": 3600,                                                  │
│         "refresh_token": "refresh_token_here",                               │
│         "scope": "your_scopes"                                               │
│     }                                                                        │
│                                                                              │
│  7. CLAUDE USES ACCESS TOKEN FOR ALL MCP REQUESTS                            │
│     Authorization: Bearer eyJhbGc...                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Required OAuth2 Endpoints

Your MCP server **MUST** implement these endpoints:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ENDPOINT                                    │ METHOD │ PURPOSE              │
├─────────────────────────────────────────────┼────────┼──────────────────────┤
│ /.well-known/oauth-authorization-server     │ GET    │ OAuth metadata       │
│ /oauth/authorize                            │ GET    │ Show login form      │
│ /oauth/authorize                            │ POST   │ Process login        │
│ /oauth/token                                │ POST   │ Exchange code/token  │
│ /oauth/register (optional)                  │ POST   │ Dynamic registration │
│ /oauth/client-metadata.json (optional)      │ GET    │ Client metadata      │
└─────────────────────────────────────────────┴────────┴──────────────────────┘
```

### 3.3 OAuth2 Server Implementation

#### 3.3.1 OAuth Metadata Endpoint

```python
# oauth_server.py

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
import secrets
import hashlib
import base64
import jwt
from datetime import datetime, timedelta

app = FastAPI()

# Configuration - Use environment variables in production!
OAUTH_CONFIG = {
    "issuer": "https://mcp.yourdomain.com",
    "authorization_endpoint": "https://mcp.yourdomain.com/oauth/authorize",
    "token_endpoint": "https://mcp.yourdomain.com/oauth/token",
    "registration_endpoint": "https://mcp.yourdomain.com/oauth/register",
    "scopes_supported": ["your_scope", "read", "write"],
    "response_types_supported": ["code"],
    "grant_types_supported": ["authorization_code", "refresh_token"],
    "code_challenge_methods_supported": ["S256"],
    "token_endpoint_auth_methods_supported": ["client_secret_post", "none"]
}

JWT_SECRET = "your-secret-key-min-32-chars"  # Use env var!
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 30


@app.get("/.well-known/oauth-authorization-server")
async def oauth_metadata():
    """
    OAuth2 Authorization Server Metadata (RFC 8414)

    This endpoint is REQUIRED for clients to discover your OAuth configuration.
    Claude.ai will fetch this to understand how to authenticate.
    """
    return JSONResponse(content=OAUTH_CONFIG)
```

#### 3.3.2 OAuth Storage Class

```python
# oauth2_auth.py

import secrets
import hashlib
import base64
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import asyncio

class OAuth2Store:
    """
    Manages OAuth2 tokens, authorization codes, and client registrations.

    In production, replace in-memory storage with Redis or PostgreSQL.
    """

    def __init__(self, jwt_secret: str, auth_service_url: str):
        self.jwt_secret = jwt_secret
        self.auth_service_url = auth_service_url

        # In-memory storage (use Redis/PostgreSQL in production!)
        self.authorization_codes: Dict[str, Dict] = {}  # code -> metadata
        self.refresh_tokens: Dict[str, Dict] = {}       # token -> metadata
        self.registered_clients: Dict[str, Dict] = {}   # client_id -> config

        # Lock for thread-safe operations
        self._lock = asyncio.Lock()

    # ─────────────────────────────────────────────────────────────────────────
    # CLIENT REGISTRATION
    # ─────────────────────────────────────────────────────────────────────────

    async def register_client(
        self,
        client_name: str,
        redirect_uris: list[str],
        grant_types: list[str] = ["authorization_code", "refresh_token"],
        scope: str = "your_scope"
    ) -> Dict[str, str]:
        """
        Register a new OAuth2 client (Dynamic Client Registration - RFC 7591)

        Returns:
            {
                "client_id": "generated_client_id",
                "client_secret": "generated_secret",  # Optional for public clients
                "client_name": "...",
                "redirect_uris": [...]
            }
        """
        async with self._lock:
            client_id = f"client_{secrets.token_urlsafe(16)}"
            client_secret = secrets.token_urlsafe(32)

            self.registered_clients[client_id] = {
                "client_id": client_id,
                "client_secret": client_secret,
                "client_name": client_name,
                "redirect_uris": redirect_uris,
                "grant_types": grant_types,
                "scope": scope,
                "created_at": datetime.utcnow().isoformat()
            }

            return {
                "client_id": client_id,
                "client_secret": client_secret,
                "client_name": client_name,
                "redirect_uris": redirect_uris
            }

    def verify_client(self, client_id: str, redirect_uri: str) -> bool:
        """Verify client_id and redirect_uri are valid"""
        if client_id not in self.registered_clients:
            # Allow any client_id for public clients (Claude.ai)
            # In production, you may want stricter validation
            return True

        client = self.registered_clients[client_id]
        return redirect_uri in client.get("redirect_uris", [])

    # ─────────────────────────────────────────────────────────────────────────
    # AUTHORIZATION CODE
    # ─────────────────────────────────────────────────────────────────────────

    async def create_authorization_code(
        self,
        user_id: str,
        client_id: str,
        redirect_uri: str,
        scope: str,
        code_challenge: Optional[str] = None,
        code_challenge_method: Optional[str] = None,
        extra_data: Optional[Dict] = None
    ) -> str:
        """
        Create an authorization code after successful user authentication.

        PKCE (code_challenge) is REQUIRED for security with public clients.

        Args:
            user_id: Authenticated user's identifier
            client_id: OAuth client identifier
            redirect_uri: Where to redirect after authorization
            scope: Requested scopes
            code_challenge: PKCE challenge (base64url-encoded SHA256)
            code_challenge_method: "S256" (required if challenge provided)
            extra_data: Additional data to include in token (e.g., broker_type)

        Returns:
            Authorization code string (valid for 10 minutes)
        """
        async with self._lock:
            code = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(minutes=10)

            self.authorization_codes[code] = {
                "user_id": user_id,
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "scope": scope,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "extra_data": extra_data or {},
                "expires_at": expires_at.isoformat(),
                "used": False
            }

            return code

    async def exchange_authorization_code(
        self,
        code: str,
        client_id: str,
        redirect_uri: str,
        code_verifier: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Exchange authorization code for access + refresh tokens.

        PKCE Verification:
            1. Hash the code_verifier: SHA256(code_verifier)
            2. Base64url encode the hash
            3. Compare with stored code_challenge

        Returns:
            {
                "access_token": "eyJhbGc...",
                "token_type": "Bearer",
                "expires_in": 3600,
                "refresh_token": "...",
                "scope": "..."
            }

        Returns None if code is invalid, expired, or PKCE fails.
        """
        async with self._lock:
            if code not in self.authorization_codes:
                return None

            auth_data = self.authorization_codes[code]

            # Check if already used (prevent replay attacks)
            if auth_data.get("used"):
                return None

            # Check expiration
            expires_at = datetime.fromisoformat(auth_data["expires_at"])
            if datetime.utcnow() > expires_at:
                del self.authorization_codes[code]
                return None

            # Verify client_id and redirect_uri match
            if auth_data["client_id"] != client_id:
                return None
            if auth_data["redirect_uri"] != redirect_uri:
                return None

            # PKCE Verification (CRITICAL for security!)
            if auth_data.get("code_challenge"):
                if not code_verifier:
                    return None  # PKCE required but verifier not provided

                # Calculate expected challenge
                verifier_hash = hashlib.sha256(code_verifier.encode()).digest()
                expected_challenge = base64.urlsafe_b64encode(verifier_hash).rstrip(b'=').decode()

                if expected_challenge != auth_data["code_challenge"]:
                    return None  # PKCE verification failed

            # Mark code as used
            auth_data["used"] = True

            # Generate tokens
            user_id = auth_data["user_id"]
            scope = auth_data["scope"]
            extra_data = auth_data.get("extra_data", {})

            access_token = self._create_access_token(user_id, scope, extra_data)
            refresh_token = await self._create_refresh_token(user_id, client_id, scope, extra_data)

            return {
                "access_token": access_token,
                "token_type": "Bearer",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                "refresh_token": refresh_token,
                "scope": scope
            }

    # ─────────────────────────────────────────────────────────────────────────
    # ACCESS TOKENS (JWT)
    # ─────────────────────────────────────────────────────────────────────────

    def _create_access_token(
        self,
        user_id: str,
        scope: str,
        extra_data: Optional[Dict] = None
    ) -> str:
        """
        Create a JWT access token.

        Token payload:
            - sub: User identifier
            - scope: Granted scopes
            - exp: Expiration timestamp
            - iat: Issued at timestamp
            - jti: Unique token ID
            - ...extra_data: Additional claims (e.g., broker_type)
        """
        now = datetime.utcnow()
        expires = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        payload = {
            "sub": user_id,
            "scope": scope,
            "exp": expires,
            "iat": now,
            "jti": secrets.token_urlsafe(16),
            **(extra_data or {})
        }

        return jwt.encode(payload, self.jwt_secret, algorithm="HS256")

    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decode a JWT access token.

        Returns decoded payload if valid, None otherwise.
        """
        try:
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                options={"require": ["exp", "sub"]}
            )
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    # ─────────────────────────────────────────────────────────────────────────
    # REFRESH TOKENS
    # ─────────────────────────────────────────────────────────────────────────

    async def _create_refresh_token(
        self,
        user_id: str,
        client_id: str,
        scope: str,
        extra_data: Optional[Dict] = None
    ) -> str:
        """Create an opaque refresh token (stored server-side)"""
        async with self._lock:
            token = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

            self.refresh_tokens[token] = {
                "user_id": user_id,
                "client_id": client_id,
                "scope": scope,
                "extra_data": extra_data or {},
                "expires_at": expires_at.isoformat()
            }

            return token

    async def refresh_access_token(
        self,
        refresh_token: str,
        client_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Exchange refresh token for new access token.

        Note: Consider implementing refresh token rotation for better security
        (issue new refresh token and invalidate old one on each refresh).
        """
        async with self._lock:
            if refresh_token not in self.refresh_tokens:
                return None

            token_data = self.refresh_tokens[refresh_token]

            # Check expiration
            expires_at = datetime.fromisoformat(token_data["expires_at"])
            if datetime.utcnow() > expires_at:
                del self.refresh_tokens[refresh_token]
                return None

            # Verify client_id
            if token_data["client_id"] != client_id:
                return None

            # Generate new access token
            access_token = self._create_access_token(
                token_data["user_id"],
                token_data["scope"],
                token_data.get("extra_data")
            )

            return {
                "access_token": access_token,
                "token_type": "Bearer",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                "scope": token_data["scope"]
            }

    # ─────────────────────────────────────────────────────────────────────────
    # USER AUTHENTICATION (Integrate with your auth backend)
    # ─────────────────────────────────────────────────────────────────────────

    async def authenticate_user(
        self,
        username: str,
        password: str
    ) -> Optional[Dict[str, Any]]:
        """
        Authenticate user against your backend auth service.

        CUSTOMIZE THIS METHOD to integrate with your authentication system:
        - Call your auth API
        - Validate against database
        - Check LDAP/SSO
        - etc.

        Returns:
            {
                "user_id": "123",
                "username": "user@example.com",
                ...additional user data
            }

        Returns None if authentication fails.
        """
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.auth_service_url}/api/login",
                    json={"email": username, "password": password},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "user_id": str(data.get("user_id")),
                            "username": username,
                            # Add any additional data you need in tokens
                            "broker_type": data.get("broker_type", "DEFAULT"),
                        }
                    return None
        except Exception as e:
            print(f"Auth error: {e}")
            return None


# Global instance (initialize in your app startup)
oauth2_store: Optional[OAuth2Store] = None


def init_oauth_store(jwt_secret: str, auth_service_url: str):
    """Initialize the OAuth store on app startup"""
    global oauth2_store
    oauth2_store = OAuth2Store(jwt_secret, auth_service_url)
```

#### 3.3.3 Authorization Endpoint (Login Form)

```python
# oauth_server.py (continued)

from oauth2_auth import oauth2_store, init_oauth_store

# Initialize OAuth store on startup
@app.on_event("startup")
async def startup():
    init_oauth_store(
        jwt_secret=os.getenv("JWT_SECRET_KEY"),
        auth_service_url=os.getenv("AUTH_SERVICE_URL", "http://localhost:8004")
    )


# HTML Login Form Template
LOGIN_FORM_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in to {APP_NAME}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .login-container {{
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
        }}
        .logo {{ text-align: center; margin-bottom: 30px; }}
        .logo h1 {{ color: #1a1a2e; font-size: 28px; }}
        .form-group {{ margin-bottom: 20px; }}
        label {{ display: block; margin-bottom: 8px; font-weight: 500; color: #333; }}
        input {{
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }}
        input:focus {{ outline: none; border-color: #4f46e5; }}
        button {{
            width: 100%;
            padding: 14px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }}
        button:hover {{ background: #4338ca; }}
        .error {{ color: #dc2626; margin-bottom: 15px; text-align: center; }}
        .info {{ color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>{APP_NAME}</h1>
            <p style="color: #6b7280;">Sign in to connect with Claude</p>
        </div>

        {ERROR_MESSAGE}

        <form method="POST" action="/oauth/authorize">
            <!-- Preserve OAuth parameters -->
            <input type="hidden" name="client_id" value="{client_id}">
            <input type="hidden" name="redirect_uri" value="{redirect_uri}">
            <input type="hidden" name="response_type" value="{response_type}">
            <input type="hidden" name="scope" value="{scope}">
            <input type="hidden" name="state" value="{state}">
            <input type="hidden" name="code_challenge" value="{code_challenge}">
            <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">

            <div class="form-group">
                <label for="username">Email</label>
                <input type="email" id="username" name="username" required
                       placeholder="Enter your email" autocomplete="email">
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required
                       placeholder="Enter your password" autocomplete="current-password">
            </div>

            <button type="submit">Sign In</button>
        </form>

        <p class="info">
            By signing in, you authorize this application to access your account.
        </p>
    </div>
</body>
</html>
"""


@app.get("/oauth/authorize")
async def authorize_get(
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    scope: str = "your_scope",
    state: str = "",
    code_challenge: str = "",
    code_challenge_method: str = ""
):
    """
    GET /oauth/authorize - Display login form

    This endpoint is called when Claude.ai redirects the user for authentication.
    It displays your branded login form where users enter their credentials.
    """
    # Validate response_type
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Only 'code' response_type is supported")

    # Build login form with preserved parameters
    html = LOGIN_FORM_HTML.format(
        APP_NAME="Your App Name",
        ERROR_MESSAGE="",
        client_id=client_id,
        redirect_uri=redirect_uri,
        response_type=response_type,
        scope=scope,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method
    )

    return HTMLResponse(content=html)


@app.post("/oauth/authorize")
async def authorize_post(
    username: str = Form(...),
    password: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    response_type: str = Form("code"),
    scope: str = Form("your_scope"),
    state: str = Form(""),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form("")
):
    """
    POST /oauth/authorize - Process login form submission

    1. Validate user credentials against your auth backend
    2. Generate authorization code
    3. Redirect back to Claude with the code
    """
    # Authenticate user against your backend
    user_data = await oauth2_store.authenticate_user(username, password)

    if not user_data:
        # Show error on login form
        html = LOGIN_FORM_HTML.format(
            APP_NAME="Your App Name",
            ERROR_MESSAGE='<p class="error">Invalid email or password</p>',
            client_id=client_id,
            redirect_uri=redirect_uri,
            response_type=response_type,
            scope=scope,
            state=state,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method
        )
        return HTMLResponse(content=html, status_code=401)

    # Generate authorization code
    auth_code = await oauth2_store.create_authorization_code(
        user_id=user_data["user_id"],
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        code_challenge=code_challenge if code_challenge else None,
        code_challenge_method=code_challenge_method if code_challenge_method else None,
        extra_data={
            "broker_type": user_data.get("broker_type"),
            # Add any other data you want in the token
        }
    )

    # Build redirect URL with authorization code
    redirect_url = f"{redirect_uri}?code={auth_code}"
    if state:
        redirect_url += f"&state={state}"

    return RedirectResponse(url=redirect_url, status_code=302)
```

#### 3.3.4 Token Endpoint

```python
# oauth_server.py (continued)

@app.post("/oauth/token")
async def token_endpoint(request: Request):
    """
    POST /oauth/token - Exchange authorization code or refresh token for access token

    Supports two grant types:
    1. authorization_code - Exchange auth code for tokens (initial login)
    2. refresh_token - Get new access token using refresh token
    """
    # Parse form data
    form = await request.form()
    grant_type = form.get("grant_type")
    client_id = form.get("client_id", "")

    if grant_type == "authorization_code":
        # Exchange authorization code for tokens
        code = form.get("code")
        redirect_uri = form.get("redirect_uri")
        code_verifier = form.get("code_verifier")  # PKCE

        if not code or not redirect_uri:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_request", "error_description": "Missing required parameters"}
            )

        tokens = await oauth2_store.exchange_authorization_code(
            code=code,
            client_id=client_id,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier
        )

        if not tokens:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Invalid authorization code"}
            )

        return JSONResponse(content=tokens)

    elif grant_type == "refresh_token":
        # Refresh access token
        refresh_token = form.get("refresh_token")

        if not refresh_token:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_request", "error_description": "Missing refresh_token"}
            )

        tokens = await oauth2_store.refresh_access_token(
            refresh_token=refresh_token,
            client_id=client_id
        )

        if not tokens:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Invalid refresh token"}
            )

        return JSONResponse(content=tokens)

    else:
        return JSONResponse(
            status_code=400,
            content={"error": "unsupported_grant_type"}
        )
```

#### 3.3.5 Client Registration Endpoint (Optional)

```python
# oauth_server.py (continued)

@app.post("/oauth/register")
async def register_client(request: Request):
    """
    POST /oauth/register - Dynamic Client Registration (RFC 7591)

    Optional but useful for allowing third-party integrations.
    Claude.ai may use this to register as a client.
    """
    data = await request.json()

    client_name = data.get("client_name", "Unknown Client")
    redirect_uris = data.get("redirect_uris", [])

    if not redirect_uris:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "error_description": "redirect_uris required"}
        )

    client_info = await oauth2_store.register_client(
        client_name=client_name,
        redirect_uris=redirect_uris
    )

    return JSONResponse(content=client_info, status_code=201)


@app.get("/oauth/client-metadata.json")
async def client_metadata():
    """
    Client metadata for MCP manifest

    This helps clients understand your OAuth configuration.
    """
    return JSONResponse(content={
        "client_name": "Your App Name",
        "client_uri": "https://yourdomain.com",
        "logo_uri": "https://yourdomain.com/logo.png",
        "tos_uri": "https://yourdomain.com/terms",
        "policy_uri": "https://yourdomain.com/privacy",
        "redirect_uris": ["https://claude.ai/oauth/callback"],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "scope": "your_scope"
    })
```

### 3.4 OAuth Middleware (JWT Validation)

```python
# oauth_middleware.py

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from contextvars import ContextVar
from typing import Optional, Dict, Any

# Context variable for user data (thread-safe)
user_context: ContextVar[Dict[str, Any]] = ContextVar("user_context", default={})


def get_user_context() -> Dict[str, Any]:
    """Get current user context from context variable"""
    return user_context.get()


def set_user_context(data: Dict[str, Any]):
    """Set user context for current request"""
    user_context.set(data)


class OAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate JWT tokens on protected endpoints.

    Extracts and validates the Bearer token from Authorization header,
    then sets user context for downstream handlers.
    """

    def __init__(self, app, oauth_store, protected_paths: list[str] = None):
        super().__init__(app)
        self.oauth_store = oauth_store
        self.protected_paths = protected_paths or ["/sse", "/mcp", "/api"]

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Check if path requires authentication
        requires_auth = any(path.startswith(p) for p in self.protected_paths)

        if requires_auth:
            # Extract token from Authorization header
            auth_header = request.headers.get("authorization", "")

            if not auth_header.startswith("Bearer "):
                raise HTTPException(
                    status_code=401,
                    detail="Missing or invalid Authorization header",
                    headers={"WWW-Authenticate": "Bearer"}
                )

            token = auth_header.replace("Bearer ", "")

            # Validate token
            payload = self.oauth_store.verify_access_token(token)

            if not payload:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired token",
                    headers={"WWW-Authenticate": "Bearer"}
                )

            # Set user context for this request
            set_user_context({
                "user_id": payload.get("sub"),
                "scope": payload.get("scope"),
                "broker_type": payload.get("broker_type"),
                # Add any other claims you need
            })

        response = await call_next(request)
        return response


# Add middleware to app
def add_oauth_middleware(app, oauth_store):
    """Helper to add OAuth middleware to FastAPI app"""
    app.add_middleware(
        OAuthMiddleware,
        oauth_store=oauth_store,
        protected_paths=["/sse", "/mcp"]
    )
```

### 3.5 Complete Authentication Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE OAUTH2 AUTHENTICATION FLOW                          │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   CLAUDE.AI                     YOUR MCP SERVER                YOUR AUTH BACKEND│
│      │                               │                              │          │
│      │ 1. User clicks "Connect"      │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   GET /oauth/authorize        │                              │          │
│      │   ?client_id=...              │                              │          │
│      │   &redirect_uri=claude.ai     │                              │          │
│      │   &code_challenge=...         │                              │          │
│      │                               │                              │          │
│      │ 2. Return login form HTML     │                              │          │
│      │<──────────────────────────────│                              │          │
│      │                               │                              │          │
│   USER SEES LOGIN FORM IN BROWSER    │                              │          │
│      │                               │                              │          │
│      │ 3. User submits credentials   │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   POST /oauth/authorize       │                              │          │
│      │   username=...&password=...   │                              │          │
│      │                               │                              │          │
│      │                               │ 4. Validate credentials      │          │
│      │                               │─────────────────────────────>│          │
│      │                               │   POST /api/login            │          │
│      │                               │                              │          │
│      │                               │ 5. Return user data          │          │
│      │                               │<─────────────────────────────│          │
│      │                               │   {user_id, broker_type}     │          │
│      │                               │                              │          │
│      │ 6. Redirect with auth code    │                              │          │
│      │<──────────────────────────────│                              │          │
│      │   302 Redirect to claude.ai   │                              │          │
│      │   ?code=AUTH_CODE             │                              │          │
│      │                               │                              │          │
│      │ 7. Exchange code for tokens   │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   POST /oauth/token           │                              │          │
│      │   code=...&code_verifier=...  │                              │          │
│      │                               │                              │          │
│      │ 8. Return JWT tokens          │                              │          │
│      │<──────────────────────────────│                              │          │
│      │   {access_token, refresh}     │                              │          │
│      │                               │                              │          │
│   ════════════ AUTHENTICATION COMPLETE ════════════                            │
│                                                                                 │
│      │ 9. Connect to SSE with JWT    │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   GET /sse                    │                              │          │
│      │   Authorization: Bearer JWT   │                              │          │
│      │                               │                              │          │
│      │ 10. Validate JWT, open stream │                              │          │
│      │<══════════════════════════════│                              │          │
│      │   SSE Connection Established  │                              │          │
│      │                               │                              │          │
│      │ 11. List available tools      │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   {"method": "tools/list"}    │                              │          │
│      │                               │                              │          │
│      │ 12. Return tool definitions   │                              │          │
│      │<──────────────────────────────│                              │          │
│      │   [{name, description, ...}]  │                              │          │
│      │                               │                              │          │
│      │ 13. Call a tool               │                              │          │
│      │──────────────────────────────>│                              │          │
│      │   {"method": "tools/call",    │                              │          │
│      │    "name": "your_tool"}       │                              │          │
│      │                               │                              │          │
│      │ 14. Execute tool, return      │                              │          │
│      │<──────────────────────────────│                              │          │
│      │   {"result": {...}}           │                              │          │
│      │                               │                              │          │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tool Definition & Registration

### 4.1 Tool Structure

Each MCP tool must have:
1. **Name**: Unique identifier (snake_case recommended)
2. **Description**: What the tool does (shown to AI)
3. **Input Schema**: JSON Schema defining parameters
4. **Handler**: Async function that executes the tool

### 4.2 Using FastMCP for Tool Definitions

```python
# server.py - FastMCP Tool Definitions

from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("Your MCP Server")


@mcp.tool()
async def get_data(
    query: str,
    limit: int = 10
) -> dict:
    """
    Retrieve data based on a query string.

    This description is shown to the AI to help it understand
    when and how to use this tool.

    Args:
        query: The search query to execute
        limit: Maximum number of results to return (default: 10)

    Returns:
        Dictionary containing query results with 'items' and 'total' fields
    """
    # Your implementation here
    from tools.your_tools.data_tool import fetch_data
    return await fetch_data(query, limit)


@mcp.tool()
async def execute_action(
    action_type: str,
    parameters: dict,
    confirm: bool = False
) -> dict:
    """
    Execute a specific action with given parameters.

    Use this tool when the user wants to perform an action
    that modifies state. Always set confirm=True when the
    user explicitly confirms the action.

    Args:
        action_type: Type of action (e.g., "create", "update", "delete")
        parameters: Action-specific parameters
        confirm: Whether the user has confirmed this action

    Returns:
        Dictionary with 'success' boolean and 'message' string
    """
    if not confirm:
        return {
            "success": False,
            "message": "Please confirm this action before executing.",
            "requires_confirmation": True
        }

    from tools.your_tools.action_tool import perform_action
    return await perform_action(action_type, parameters)
```

### 4.3 Tool Base Class Pattern

```python
# tools/core/base.py

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, Optional
from datetime import datetime


class ToolStage(Enum):
    """Stages of tool execution for status updates"""
    START = "start"
    PROGRESS = "progress"
    END = "end"
    ERROR = "error"


class BaseTool(ABC):
    """
    Abstract base class for MCP tools.

    Provides common functionality like status emission,
    response building, and error handling.
    """

    name: str = "base_tool"
    description: str = "Base tool description"

    def __init__(self):
        self.start_time: Optional[datetime] = None

    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute the tool logic. Must be implemented by subclasses."""
        pass

    async def run(self, **kwargs) -> Dict[str, Any]:
        """
        Run the tool with standard lifecycle management.

        Handles:
        - Status emission (start/end/error)
        - Timing
        - Error handling
        """
        self.start_time = datetime.utcnow()

        try:
            await self.emit(ToolStage.START, f"Starting {self.name}")

            result = await self.execute(**kwargs)

            await self.emit(ToolStage.END, f"Completed {self.name}")
            return result

        except Exception as e:
            await self.emit(ToolStage.ERROR, f"Error in {self.name}: {str(e)}")
            return self.error_response(str(e))

    async def emit(self, stage: ToolStage, message: str):
        """
        Emit status update for real-time feedback.

        Override this to publish to Redis, WebSocket, etc.
        """
        print(f"[{stage.value}] {self.name}: {message}")

    def success_response(self, data: Any, message: str = "Success") -> Dict[str, Any]:
        """Build a standardized success response"""
        return {
            "success": True,
            "message": message,
            "data": data,
            "execution_time_ms": self._get_execution_time()
        }

    def error_response(self, error: str) -> Dict[str, Any]:
        """Build a standardized error response"""
        return {
            "success": False,
            "error": error,
            "execution_time_ms": self._get_execution_time()
        }

    def _get_execution_time(self) -> int:
        """Calculate execution time in milliseconds"""
        if not self.start_time:
            return 0
        return int((datetime.utcnow() - self.start_time).total_seconds() * 1000)
```

### 4.4 Tool Implementation Example

```python
# tools/your_tools/data_tool.py

from tools.core.base import BaseTool, ToolStage
from typing import Any, Dict


class DataFetchTool(BaseTool):
    """Tool for fetching data from your service"""

    name = "get_data"
    description = "Retrieve data based on a query string"

    async def execute(
        self,
        query: str,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Fetch data from your backend service.

        Args:
            query: Search query
            limit: Max results

        Returns:
            Data results
        """
        await self.emit(ToolStage.PROGRESS, f"Searching for: {query}")

        # Your implementation
        # Example: Call your API, database, etc.
        results = await self._fetch_from_backend(query, limit)

        return self.success_response(
            data={"items": results, "total": len(results)},
            message=f"Found {len(results)} results"
        )

    async def _fetch_from_backend(self, query: str, limit: int) -> list:
        """Internal method to fetch data"""
        # Implement your data fetching logic
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"http://your-backend/api/search",
                params={"q": query, "limit": limit}
            ) as response:
                data = await response.json()
                return data.get("results", [])


# Export function for FastMCP
async def fetch_data(query: str, limit: int = 10) -> dict:
    """Wrapper function for FastMCP tool registration"""
    tool = DataFetchTool()
    return await tool.run(query=query, limit=limit)
```

### 4.5 Tool Schema Registry

For maximum compatibility with different AI clients, maintain explicit schemas:

```python
# tool_schemas.py

TOOL_SCHEMAS = {
    "get_data": {
        "name": "get_data",
        "description": "Retrieve data based on a query string",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to execute"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 10)",
                    "default": 10
                }
            },
            "required": ["query"]
        }
    },
    "execute_action": {
        "name": "execute_action",
        "description": "Execute a specific action with given parameters",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": ["create", "update", "delete"],
                    "description": "Type of action to perform"
                },
                "parameters": {
                    "type": "object",
                    "description": "Action-specific parameters"
                },
                "confirm": {
                    "type": "boolean",
                    "description": "Whether user has confirmed the action",
                    "default": False
                }
            },
            "required": ["action_type", "parameters"]
        }
    }
}


def get_tool_list() -> list:
    """Get list of all tool definitions for tools/list response"""
    return list(TOOL_SCHEMAS.values())
```

---

## 5. SSE Transport Implementation

### 5.1 SSE Endpoint

```python
# oauth_server.py (continued)

from fastapi import Request
from fastapi.responses import StreamingResponse
import asyncio
import json
from typing import AsyncGenerator

# Active SSE connections per user
active_connections: dict[str, asyncio.Queue] = {}


async def sse_event_generator(
    user_id: str,
    queue: asyncio.Queue
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for a connected client.

    SSE Format:
        event: event_type\n
        data: json_data\n
        \n
    """
    ping_count = 0

    try:
        # Send initial connection event
        yield f"event: connected\ndata: {json.dumps({'user_id': user_id})}\n\n"

        while True:
            try:
                # Wait for message with timeout for keepalive
                message = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"event: message\ndata: {json.dumps(message)}\n\n"

            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                ping_count += 1
                yield f"event: ping\ndata: {ping_count}\n\n"

    except asyncio.CancelledError:
        # Connection closed
        pass
    finally:
        # Cleanup
        if user_id in active_connections:
            del active_connections[user_id]


@app.get("/sse")
async def sse_stream(request: Request):
    """
    GET /sse - Establish SSE streaming connection

    Requires: Authorization: Bearer {access_token}

    This endpoint maintains a persistent connection for real-time
    communication between Claude and your MCP server.
    """
    # Get user from context (set by middleware)
    user_data = get_user_context()
    user_id = user_data.get("user_id")

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Create queue for this connection
    queue = asyncio.Queue()
    active_connections[user_id] = queue

    return StreamingResponse(
        sse_event_generator(user_id, queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Access-Control-Allow-Origin": "https://claude.ai",
            "Access-Control-Allow-Credentials": "true"
        }
    )
```

### 5.2 MCP Protocol Handler (POST /sse)

```python
# oauth_server.py (continued)

from server import mcp  # Import FastMCP instance
from tool_schemas import get_tool_list


@app.post("/sse")
async def mcp_handler(request: Request):
    """
    POST /sse - Handle MCP JSON-RPC requests

    Supports methods:
    - initialize: Protocol handshake
    - tools/list: Return available tools
    - tools/call: Execute a tool
    """
    # Get user context
    user_data = get_user_context()
    user_id = user_data.get("user_id")

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Parse JSON-RPC request
    body = await request.json()
    method = body.get("method")
    params = body.get("params", {})
    request_id = body.get("id", 1)

    try:
        if method == "initialize":
            # Protocol initialization
            result = {
                "protocolVersion": "2025-06-18",
                "serverInfo": {
                    "name": "Your MCP Server",
                    "version": "1.0.0"
                },
                "capabilities": {
                    "tools": {"listChanged": False},
                    "prompts": {"listChanged": False},
                    "resources": {"listChanged": False}
                }
            }

        elif method == "tools/list":
            # Return available tools
            result = {"tools": get_tool_list()}

        elif method == "tools/call":
            # Execute tool
            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            # Execute via FastMCP
            tool_result = await mcp.call_tool(tool_name, arguments)

            result = {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(tool_result, indent=2)
                    }
                ]
            }

        elif method == "notifications/initialized":
            # Client acknowledges initialization
            return JSONResponse(content={})

        else:
            return JSONResponse(
                status_code=400,
                content={
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32601,
                        "message": f"Method not found: {method}"
                    }
                }
            )

        return JSONResponse(content={
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32000,
                    "message": str(e)
                }
            }
        )
```

---

## 6. Multi-User & Multi-Tenant Support

### 6.1 User Context Management

```python
# tools/core/user_context.py

from contextvars import ContextVar
from typing import Dict, Any, Optional

# Thread-safe context variable for user data
_user_config: ContextVar[Dict[str, Any]] = ContextVar("user_config", default={})


def set_user_config(config: Dict[str, Any]):
    """
    Set user configuration for the current request context.

    Call this in your middleware after validating the JWT token.

    Args:
        config: User configuration including:
            - user_id: Unique user identifier
            - scope: OAuth scopes
            - broker_type: (optional) User's service type
            - api_key: (optional) User's API credentials
    """
    _user_config.set(config)


def get_user_config() -> Dict[str, Any]:
    """
    Get user configuration for the current request context.

    Returns empty dict if not set (unauthenticated request).
    """
    return _user_config.get()


def get_user_id() -> Optional[str]:
    """Get current user ID"""
    return get_user_config().get("user_id")


def get_user_scope() -> str:
    """Get current user's OAuth scope"""
    return get_user_config().get("scope", "")


def require_user() -> Dict[str, Any]:
    """
    Get user config, raising error if not authenticated.

    Use this in tools that require authentication.

    Raises:
        ValueError: If no user is authenticated
    """
    config = get_user_config()
    if not config.get("user_id"):
        raise ValueError("Authentication required")
    return config
```

### 6.2 Per-User Service Connections

```python
# tools/core/service_pool.py

from typing import Dict, Any, Optional
import asyncio


class ServicePool:
    """
    Manages per-user service connections.

    Use this pattern when each user needs their own connection
    to external services (e.g., broker APIs, databases).
    """

    def __init__(self):
        self._pool: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    def _get_key(self, user_id: str, service_type: str = "default") -> str:
        """Generate unique pool key for user + service type"""
        return f"{user_id}:{service_type}"

    async def get_connection(
        self,
        user_id: str,
        service_type: str,
        credentials: Dict[str, Any]
    ) -> Any:
        """
        Get or create a connection for a user.

        Connections are cached and reused within the same user session.

        Args:
            user_id: User identifier
            service_type: Type of service (e.g., "broker_api")
            credentials: Credentials for establishing connection

        Returns:
            Active connection instance
        """
        key = self._get_key(user_id, service_type)

        async with self._lock:
            if key in self._pool:
                connection = self._pool[key]
                # Verify connection is still valid
                if await self._is_healthy(connection):
                    return connection
                # Connection unhealthy, remove and recreate
                del self._pool[key]

            # Create new connection
            connection = await self._create_connection(service_type, credentials)
            self._pool[key] = connection
            return connection

    async def _create_connection(
        self,
        service_type: str,
        credentials: Dict[str, Any]
    ) -> Any:
        """
        Create a new service connection.

        Override this method to implement your connection logic.
        """
        # Example: Create API client based on service type
        if service_type == "broker_api":
            from your_client import BrokerClient
            return BrokerClient(
                api_key=credentials.get("api_key"),
                api_secret=credentials.get("api_secret")
            )

        raise ValueError(f"Unknown service type: {service_type}")

    async def _is_healthy(self, connection: Any) -> bool:
        """Check if connection is still healthy"""
        try:
            # Implement health check for your connection type
            return hasattr(connection, 'connected') and connection.connected
        except Exception:
            return False

    async def close_user_connections(self, user_id: str):
        """Close all connections for a user (on logout)"""
        async with self._lock:
            keys_to_remove = [k for k in self._pool if k.startswith(f"{user_id}:")]
            for key in keys_to_remove:
                connection = self._pool.pop(key)
                await self._close_connection(connection)

    async def _close_connection(self, connection: Any):
        """Close a connection gracefully"""
        try:
            if hasattr(connection, 'close'):
                await connection.close()
        except Exception:
            pass


# Global service pool instance
service_pool = ServicePool()


async def get_user_service(service_type: str = "default") -> Any:
    """
    Helper to get service connection for current user.

    Uses user context from current request.
    """
    from tools.core.user_context import require_user

    user_config = require_user()

    return await service_pool.get_connection(
        user_id=user_config["user_id"],
        service_type=service_type,
        credentials=user_config.get("credentials", {})
    )
```

---

## 7. Deployment (Docker + Nginx)

### 7.1 Dockerfile

```dockerfile
# Dockerfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Start server
CMD ["uvicorn", "oauth_server:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 7.2 Docker Compose

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ─────────────────────────────────────────────────────────────────────────
  # MCP OAuth Server
  # ─────────────────────────────────────────────────────────────────────────
  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: your-mcp-server
    ports:
      - "${MCP_PORT:-8010}:8000"
    environment:
      # OAuth Configuration
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - OAUTH2_SECRET_KEY=${OAUTH2_SECRET_KEY}
      - AUTH_SERVICE_URL=http://auth-service:8004

      # Database
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379

      # Server
      - SERVER_HOST=0.0.0.0
      - SERVER_PORT=8000
      - CORS_ORIGINS=https://claude.ai

      # Your app-specific config
      - YOUR_API_KEY=${YOUR_API_KEY}
    volumes:
      - ./logs:/app/logs
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - mcp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # ─────────────────────────────────────────────────────────────────────────
  # PostgreSQL Database
  # ─────────────────────────────────────────────────────────────────────────
  postgres:
    image: postgres:15-alpine
    container_name: mcp-postgres
    environment:
      - POSTGRES_USER=${DB_USER:-mcp}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME:-mcp_db}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - mcp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-mcp}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────────────────────────────────────
  # Redis Cache
  # ─────────────────────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: mcp-redis
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - mcp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────────────────────────────────────
  # Auth Service (Your existing auth backend)
  # ─────────────────────────────────────────────────────────────────────────
  auth-service:
    build: ./auth
    container_name: mcp-auth
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    depends_on:
      - postgres
    networks:
      - mcp-network
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  mcp-network:
    driver: bridge
```

### 7.3 Nginx Configuration

```nginx
# nginx/mcp.yourdomain.conf

# Upstream to MCP server
upstream mcp_backend {
    server localhost:8010;
    keepalive 32;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mcp.yourdomain.com;

    # ─────────────────────────────────────────────────────────────────────────
    # SSL Configuration
    # ─────────────────────────────────────────────────────────────────────────
    ssl_certificate /etc/letsencrypt/live/mcp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.yourdomain.com/privkey.pem;

    # Modern SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ─────────────────────────────────────────────────────────────────────────
    # Security Headers
    # ─────────────────────────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ─────────────────────────────────────────────────────────────────────────
    # CORS Configuration for Claude.ai
    # ─────────────────────────────────────────────────────────────────────────

    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' 'https://claude.ai' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Content-Length' 0;
        return 204;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # OAuth Endpoints
    # ─────────────────────────────────────────────────────────────────────────
    location /oauth/ {
        proxy_pass http://mcp_backend/oauth/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' 'https://claude.ai' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # SSE Endpoint (CRITICAL: Special configuration for streaming)
    # ─────────────────────────────────────────────────────────────────────────
    location /sse {
        proxy_pass http://mcp_backend/sse;
        proxy_http_version 1.1;

        # CRITICAL for SSE: Disable all buffering
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;

        # SSE-specific headers
        proxy_set_header Connection '';
        proxy_set_header Cache-Control 'no-cache';
        proxy_set_header X-Accel-Buffering 'no';

        # Standard headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS for SSE
        add_header 'Access-Control-Allow-Origin' 'https://claude.ai' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        # Long timeout for persistent connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # Keep connection alive
        keepalive_timeout 86400s;
    }

    # Alternative MCP SSE endpoint
    location /mcp/sse {
        proxy_pass http://mcp_backend/mcp/sse;
        # Same configuration as /sse above
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_set_header Connection '';
        proxy_set_header Cache-Control 'no-cache';
        proxy_set_header X-Accel-Buffering 'no';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header 'Access-Control-Allow-Origin' 'https://claude.ai' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # Well-Known Endpoints
    # ─────────────────────────────────────────────────────────────────────────
    location /.well-known/ {
        proxy_pass http://mcp_backend/.well-known/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        add_header 'Access-Control-Allow-Origin' '*' always;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # Health Check
    # ─────────────────────────────────────────────────────────────────────────
    location /health {
        proxy_pass http://mcp_backend/health;
        proxy_http_version 1.1;

        access_log off;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # Root & Default
    # ─────────────────────────────────────────────────────────────────────────
    location / {
        proxy_pass http://mcp_backend/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        add_header 'Access-Control-Allow-Origin' 'https://claude.ai' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name mcp.yourdomain.com;

    return 301 https://$server_name$request_uri;
}
```

### 7.4 Environment Variables

```bash
# .env

# ─────────────────────────────────────────────────────────────────────────────
# OAuth & Security
# ─────────────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY=your-jwt-secret-minimum-32-characters-long
OAUTH2_SECRET_KEY=your-oauth-secret-minimum-32-characters-long

# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────
DB_USER=mcp_user
DB_PASSWORD=your-strong-database-password
DB_NAME=mcp_database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}

# ─────────────────────────────────────────────────────────────────────────────
# Redis
# ─────────────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─────────────────────────────────────────────────────────────────────────────
# Server
# ─────────────────────────────────────────────────────────────────────────────
MCP_PORT=8010
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
CORS_ORIGINS=https://claude.ai

# ─────────────────────────────────────────────────────────────────────────────
# Auth Service
# ─────────────────────────────────────────────────────────────────────────────
AUTH_SERVICE_URL=http://auth-service:8004

# ─────────────────────────────────────────────────────────────────────────────
# Your App-Specific Config
# ─────────────────────────────────────────────────────────────────────────────
YOUR_API_KEY=your-api-key
YOUR_API_SECRET=your-api-secret
```

---

## 8. Security Considerations

### 8.1 Security Checklist

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY CHECKLIST                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ AUTHENTICATION                                                             │
│ ☐ Use PKCE (S256) for all OAuth flows                                     │
│ ☐ JWT tokens signed with strong secret (min 256 bits)                     │
│ ☐ Access tokens expire in ≤60 minutes                                     │
│ ☐ Refresh tokens expire in ≤30 days                                       │
│ ☐ Authorization codes expire in ≤10 minutes                               │
│ ☐ Authorization codes are single-use                                      │
│                                                                            │
│ TRANSPORT                                                                  │
│ ☐ HTTPS required (TLS 1.2+)                                               │
│ ☐ HSTS header enabled                                                     │
│ ☐ Secure cookies (if used)                                                │
│                                                                            │
│ CORS                                                                       │
│ ☐ Whitelist specific origins (not *)                                      │
│ ☐ Allow credentials only for trusted origins                              │
│ ☐ Validate Origin header on requests                                      │
│                                                                            │
│ INPUT VALIDATION                                                           │
│ ☐ Validate all tool inputs                                                │
│ ☐ Sanitize strings to prevent injection                                   │
│ ☐ Limit request body sizes                                                │
│ ☐ Rate limit all endpoints                                                │
│                                                                            │
│ SECRETS MANAGEMENT                                                         │
│ ☐ Never log secrets or tokens                                             │
│ ☐ Use environment variables for secrets                                   │
│ ☐ Rotate secrets periodically                                             │
│ ☐ Encrypt sensitive data at rest                                          │
│                                                                            │
│ INFRASTRUCTURE                                                             │
│ ☐ Run containers as non-root                                              │
│ ☐ Limit container capabilities                                            │
│ ☐ Use read-only file systems where possible                               │
│ ☐ Enable container health checks                                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Rate Limiting

```python
# rate_limiter.py

from fastapi import Request, HTTPException
from collections import defaultdict
import time
import asyncio


class RateLimiter:
    """
    Simple in-memory rate limiter.

    For production, use Redis-based rate limiting.
    """

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def is_allowed(self, key: str) -> bool:
        """Check if request is allowed"""
        async with self._lock:
            now = time.time()
            minute_ago = now - 60

            # Remove old requests
            self.requests[key] = [
                t for t in self.requests[key] if t > minute_ago
            ]

            # Check limit
            if len(self.requests[key]) >= self.requests_per_minute:
                return False

            # Record this request
            self.requests[key].append(now)
            return True


rate_limiter = RateLimiter(requests_per_minute=100)


async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware"""
    # Use user_id if authenticated, else IP
    user_data = get_user_context()
    key = user_data.get("user_id") or request.client.host

    if not await rate_limiter.is_allowed(key):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down."
        )

    return await call_next(request)
```

### 8.3 Input Validation

```python
# validation.py

from pydantic import BaseModel, validator, Field
from typing import Optional, Any
import re


class ToolInputValidator:
    """Validate and sanitize tool inputs"""

    @staticmethod
    def sanitize_string(value: str, max_length: int = 1000) -> str:
        """Sanitize string input"""
        if not isinstance(value, str):
            value = str(value)

        # Limit length
        value = value[:max_length]

        # Remove potentially dangerous characters
        # Adjust based on your requirements
        value = re.sub(r'[<>]', '', value)

        return value.strip()

    @staticmethod
    def validate_symbol(symbol: str) -> str:
        """Validate stock/crypto symbol"""
        symbol = symbol.upper().strip()

        # Only allow alphanumeric and common separators
        if not re.match(r'^[A-Z0-9\-\.\/]+$', symbol):
            raise ValueError(f"Invalid symbol: {symbol}")

        if len(symbol) > 20:
            raise ValueError("Symbol too long")

        return symbol

    @staticmethod
    def validate_quantity(value: Any) -> float:
        """Validate numeric quantity"""
        try:
            qty = float(value)
        except (TypeError, ValueError):
            raise ValueError("Quantity must be a number")

        if qty <= 0:
            raise ValueError("Quantity must be positive")

        if qty > 1_000_000_000:
            raise ValueError("Quantity too large")

        return qty
```

---

## 9. Complete Code Examples

### 9.1 Full OAuth Server Example

```python
# oauth_server.py - Complete Example

import os
import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from oauth2_auth import OAuth2Store, init_oauth_store, oauth2_store
from oauth_middleware import OAuthMiddleware, get_user_context, set_user_context
from tool_schemas import get_tool_list

# ─────────────────────────────────────────────────────────────────────────────
# App Initialization
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Your MCP Server",
    description="MCP Server with OAuth2 Authentication",
    version="1.0.0"
)

# CORS for Claude.ai
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://claude.ai"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Active SSE connections
active_connections: Dict[str, asyncio.Queue] = {}


@app.on_event("startup")
async def startup():
    """Initialize services on startup"""
    init_oauth_store(
        jwt_secret=os.getenv("JWT_SECRET_KEY", "your-default-secret-for-dev"),
        auth_service_url=os.getenv("AUTH_SERVICE_URL", "http://localhost:8004")
    )
    print("MCP OAuth Server started")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    # Close all SSE connections
    for queue in active_connections.values():
        await queue.put(None)  # Signal to close
    print("MCP OAuth Server stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# OAuth Endpoints (See Section 3 for full implementation)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/.well-known/oauth-authorization-server")
async def oauth_metadata():
    """OAuth2 Authorization Server Metadata"""
    return JSONResponse(content={
        "issuer": os.getenv("OAUTH_ISSUER", "https://mcp.yourdomain.com"),
        "authorization_endpoint": f"{os.getenv('OAUTH_ISSUER', 'https://mcp.yourdomain.com')}/oauth/authorize",
        "token_endpoint": f"{os.getenv('OAUTH_ISSUER', 'https://mcp.yourdomain.com')}/oauth/token",
        "registration_endpoint": f"{os.getenv('OAUTH_ISSUER', 'https://mcp.yourdomain.com')}/oauth/register",
        "scopes_supported": ["your_scope"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "none"]
    })


# ... (Include all OAuth endpoints from Section 3)


# ─────────────────────────────────────────────────────────────────────────────
# SSE Endpoints (See Section 5 for full implementation)
# ─────────────────────────────────────────────────────────────────────────────

# ... (Include all SSE endpoints from Section 5)


# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "oauth_server:app",
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true"
    )
```

### 9.2 MCP Manifest File

```json
{
  "name": "Your MCP Server",
  "version": "1.0.0",
  "description": "Description of your MCP server and its capabilities",
  "oauth2": {
    "authorization_url": "https://mcp.yourdomain.com/oauth/authorize",
    "token_url": "https://mcp.yourdomain.com/oauth/token",
    "client_registration_url": "https://mcp.yourdomain.com/oauth/register",
    "client_metadata_url": "https://mcp.yourdomain.com/oauth/client-metadata.json",
    "scopes": ["your_scope"],
    "grant_types": ["authorization_code", "refresh_token"],
    "pkce_required": true
  },
  "capabilities": {
    "tools": true,
    "prompts": false,
    "resources": false
  },
  "endpoints": {
    "sse": "https://mcp.yourdomain.com/sse",
    "health": "https://mcp.yourdomain.com/health"
  }
}
```

---

## 10. Troubleshooting

### 10.1 Common Issues

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        TROUBLESHOOTING GUIDE                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ ISSUE: "Authorization failed" in Claude                                    │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Causes:                                                                    │
│   • Invalid client_id or redirect_uri                                      │
│   • PKCE code_verifier doesn't match code_challenge                        │
│   • Authorization code expired (>10 minutes)                               │
│   • Authorization code already used                                        │
│                                                                            │
│ Debug:                                                                     │
│   1. Check server logs for auth error details                              │
│   2. Verify redirect_uri matches exactly (including trailing slash)        │
│   3. Ensure code_challenge_method is "S256"                                │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│ ISSUE: "Token expired" errors                                              │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Causes:                                                                    │
│   • Access token expired and refresh failed                                │
│   • Clock skew between client and server                                   │
│   • JWT_SECRET_KEY mismatch between services                               │
│                                                                            │
│ Debug:                                                                     │
│   1. Decode JWT at jwt.io to check expiration                              │
│   2. Verify JWT_SECRET_KEY is same across all services                     │
│   3. Check server time is synchronized (NTP)                               │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│ ISSUE: SSE connection drops                                                │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Causes:                                                                    │
│   • Nginx buffering enabled                                                │
│   • Proxy timeout too short                                                │
│   • Missing keepalive pings                                                │
│                                                                            │
│ Debug:                                                                     │
│   1. Add proxy_buffering off; to nginx                                     │
│   2. Set proxy_read_timeout 86400s;                                        │
│   3. Ensure server sends ping events every 30s                             │
│   4. Check X-Accel-Buffering: no header is set                             │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│ ISSUE: CORS errors in browser                                              │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Causes:                                                                    │
│   • Missing Access-Control-Allow-Origin header                             │
│   • Credentials not allowed                                                │
│   • Preflight OPTIONS not handled                                          │
│                                                                            │
│ Debug:                                                                     │
│   1. Check browser Network tab for actual CORS error                       │
│   2. Verify nginx adds CORS headers for OPTIONS                            │
│   3. Ensure allow_credentials=true in FastAPI CORS                         │
│   4. Check origin matches exactly (https://claude.ai)                      │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│ ISSUE: Tools not appearing in Claude                                       │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Causes:                                                                    │
│   • tools/list returning empty array                                       │
│   • Invalid tool schema format                                             │
│   • Authentication failing silently                                        │
│                                                                            │
│ Debug:                                                                     │
│   1. Test /sse POST with tools/list method directly                        │
│   2. Validate tool schemas against JSON Schema spec                        │
│   3. Check server logs for tool registration errors                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Debug Commands

```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# View container logs
docker logs -f your-mcp-server --tail 100

# Test OAuth metadata endpoint
curl -s https://mcp.yourdomain.com/.well-known/oauth-authorization-server | jq

# Test token endpoint (replace with your auth code)
curl -X POST https://mcp.yourdomain.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=https://claude.ai/oauth/callback" \
  -d "client_id=your_client_id" \
  -d "code_verifier=YOUR_VERIFIER"

# Test SSE connection
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  https://mcp.yourdomain.com/sse

# Test tools/list
curl -X POST https://mcp.yourdomain.com/sse \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list", "jsonrpc": "2.0", "id": 1}'

# Check nginx config
sudo nginx -t
sudo nginx -s reload
```

---

## 11. Checklist

### Before Deployment

```
☐ OAuth2 Endpoints
  ☐ /.well-known/oauth-authorization-server returns valid metadata
  ☐ /oauth/authorize shows login form
  ☐ /oauth/authorize processes credentials correctly
  ☐ /oauth/token exchanges codes for tokens
  ☐ /oauth/token refreshes access tokens
  ☐ PKCE (S256) validation works

☐ Authentication
  ☐ JWT tokens contain correct claims (sub, scope, exp)
  ☐ JWT_SECRET_KEY matches between all services
  ☐ Token expiration is reasonable (60min access, 30day refresh)
  ☐ Middleware validates tokens on protected routes

☐ SSE Transport
  ☐ GET /sse establishes streaming connection
  ☐ POST /sse handles JSON-RPC methods
  ☐ Ping events sent every 30 seconds
  ☐ Connection cleanup on disconnect

☐ Tools
  ☐ tools/list returns all tool definitions
  ☐ tools/call executes tools correctly
  ☐ Tool schemas are valid JSON Schema
  ☐ Error responses follow JSON-RPC format

☐ Infrastructure
  ☐ Docker containers start in correct order
  ☐ Health checks pass
  ☐ Nginx configured for SSE (buffering off)
  ☐ SSL certificates valid
  ☐ CORS allows https://claude.ai

☐ Security
  ☐ PKCE required for auth code flow
  ☐ Secrets in environment variables (not code)
  ☐ Rate limiting enabled
  ☐ Input validation on all tools
  ☐ No sensitive data in logs
```

---

## Summary

This blueprint covers everything needed to create a production MCP server:

1. **Architecture**: Modular structure with clear separation of concerns
2. **OAuth2**: Complete implementation with PKCE for secure authentication
3. **Tools**: FastMCP-based tool definitions with proper schemas
4. **SSE**: Real-time streaming with connection management
5. **Multi-User**: Per-request context and connection pooling
6. **Deployment**: Docker + Nginx configuration for production
7. **Security**: Comprehensive security checklist and best practices

When creating a new MCP tool:
1. Start with the OAuth2 implementation (Section 3)
2. Add your tools using the base class pattern (Section 4)
3. Configure SSE transport (Section 5)
4. Deploy with Docker + Nginx (Section 7)
5. Verify against the checklist (Section 11)

For questions or updates, refer to the official MCP documentation and your team's implementation notes.
