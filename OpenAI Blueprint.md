# OpenAI + MCP Integration Blueprint: Complete Guide

> **Version**: 1.0.0
> **Last Updated**: January 2025
> **Purpose**: Production guide for integrating any MCP server with OpenAI's Responses API

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [OpenAI Responses API Configuration](#3-openai-responses-api-configuration)
4. [MCP Token Generation](#4-mcp-token-generation)
5. [Tool Registration & Categories](#5-tool-registration--categories)
6. [Streaming Implementation](#6-streaming-implementation)
7. [Tool Approval Flow](#7-tool-approval-flow)
8. [Error Handling & Retries](#8-error-handling--retries)
9. [Real-Time Tool Status](#9-real-time-tool-status)
10. [Complete Code Examples](#10-complete-code-examples)
11. [Configuration Reference](#11-configuration-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

### What is OpenAI Responses API + MCP?

OpenAI's **Responses API** provides native support for **MCP (Model Context Protocol)** servers. This allows you to:

- Connect your MCP tools directly to OpenAI models
- Stream responses in real-time
- Implement approval workflows for sensitive operations
- Maintain conversation continuity across tool calls

### Integration Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     OPENAI + MCP INTEGRATION FLOW                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   YOUR BACKEND                    OPENAI                     MCP SERVER      │
│       │                            │                            │            │
│       │ 1. Create Request          │                            │            │
│       │    + MCP Config            │                            │            │
│       │ ──────────────────────────>│                            │            │
│       │                            │                            │            │
│       │                            │ 2. Load Tools              │            │
│       │                            │ ──────────────────────────>│            │
│       │                            │    Authorization: Bearer   │            │
│       │                            │                            │            │
│       │                            │ 3. Return Tool Schemas     │            │
│       │                            │ <──────────────────────────│            │
│       │                            │                            │            │
│       │                            │ 4. Process User Message    │            │
│       │                            │    (Decide Tool Calls)     │            │
│       │                            │                            │            │
│       │                            │ 5. Call MCP Tool           │            │
│       │                            │ ──────────────────────────>│            │
│       │                            │    POST /sse               │            │
│       │                            │    {"method":"tools/call"} │            │
│       │                            │                            │            │
│       │                            │ 6. Execute & Return        │            │
│       │                            │ <──────────────────────────│            │
│       │                            │                            │            │
│       │ 7. Stream Events           │                            │            │
│       │ <──────────────────────────│                            │            │
│       │    (text, tool results,    │                            │            │
│       │     approval requests)     │                            │            │
│       │                            │                            │            │
│   FRONTEND                         │                            │            │
│       │                            │                            │            │
│       │ 8. Display Results         │                            │            │
│       │    + Handle Approvals      │                            │            │
│       ▼                            │                            │            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### Component Overview

```
your-app/
├── orchestrator.py              # OpenAI Responses API client
├── mcp_token_generator.py       # JWT token generation for MCP
├── server.py                    # Your backend API (FastAPI/Flask)
├── config.py                    # Configuration management
└── utils/
    ├── streaming.py             # SSE streaming helpers
    └── approval_handler.py      # Tool approval logic
```

### Key Components

| Component | Responsibility |
|-----------|----------------|
| **Orchestrator** | Manages OpenAI API calls, streaming, and tool handling |
| **Token Generator** | Creates enriched JWT tokens for MCP authentication |
| **Approval Handler** | Manages user approval flow for sensitive tools |
| **Stream Handler** | Processes and forwards SSE events to frontend |

---

## 3. OpenAI Responses API Configuration

### 3.1 Basic MCP Tool Configuration

```python
# orchestrator.py

from openai import AsyncOpenAI
import os

class OpenAIOrchestrator:
    """
    Orchestrates OpenAI Responses API with MCP tool integration.
    """

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=90.0  # Increased timeout for long-running tools
        )
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        self.mcp_server_url = os.getenv("MCP_SERVER_URL", "https://mcp.yourdomain.com")

    def build_mcp_tool_config(
        self,
        mcp_access_token: str,
        non_approval_tools: list[str] = None
    ) -> dict:
        """
        Build MCP tool configuration for OpenAI Responses API.

        CRITICAL: The authorization token must be a PLAIN JWT token.
        OpenAI automatically adds "Bearer " prefix when calling MCP server.

        Args:
            mcp_access_token: JWT token for MCP authentication (NO "Bearer " prefix!)
            non_approval_tools: List of tool names that don't require user approval

        Returns:
            MCP tool configuration dict for OpenAI API
        """
        # IMPORTANT: Strip "Bearer " if accidentally included
        clean_token = mcp_access_token
        if clean_token.startswith("Bearer "):
            clean_token = clean_token.replace("Bearer ", "")

        config = {
            "type": "mcp",
            "server_label": "your_mcp_server",  # Unique label for your MCP server
            "server_url": self.mcp_server_url,
            "authorization": clean_token,  # Plain JWT, no "Bearer " prefix!
        }

        # Configure which tools skip user approval
        if non_approval_tools:
            config["require_approval"] = {
                "never": {
                    "tool_names": non_approval_tools
                }
            }

        return config
```

### 3.2 Making a Request with MCP Tools

```python
# orchestrator.py (continued)

async def process_message(
    self,
    user_message: str,
    mcp_access_token: str,
    conversation_history: list[dict] = None,
    system_prompt: str = None
) -> AsyncGenerator[dict, None]:
    """
    Process a user message with MCP tools via OpenAI Responses API.

    Args:
        user_message: The user's input message
        mcp_access_token: JWT token for MCP authentication
        conversation_history: Previous messages in the conversation
        system_prompt: System instructions for the model

    Yields:
        Event dictionaries with different types:
        - {"type": "content", "content": "..."}
        - {"type": "tool_call", "tool_name": "...", "arguments": {...}}
        - {"type": "tool_result", "tool_name": "...", "result": {...}}
        - {"type": "approval_request", ...}
        - {"type": "done"}
    """

    # ─────────────────────────────────────────────────────────────────────
    # Step 1: Build input array
    # ─────────────────────────────────────────────────────────────────────
    input_array = []

    # Add system prompt (use "developer" role for Responses API)
    if system_prompt:
        input_array.append({
            "role": "developer",
            "content": system_prompt
        })

    # Add conversation history
    if conversation_history:
        for msg in conversation_history:
            role = msg.get("role", "user")

            # Convert "system" to "developer" for Responses API
            if role == "system":
                role = "developer"

            # Convert tool messages to developer role with prefix
            if role == "tool":
                input_array.append({
                    "role": "developer",
                    "content": f"[Tool Result] {msg.get('name', 'unknown')}: {msg.get('content', '')}"
                })
            else:
                input_array.append({
                    "role": role,
                    "content": msg.get("content", "")
                })

    # Add current user message
    input_array.append({
        "role": "user",
        "content": user_message
    })

    # ─────────────────────────────────────────────────────────────────────
    # Step 2: Build MCP tool configuration
    # ─────────────────────────────────────────────────────────────────────
    mcp_tool_config = self.build_mcp_tool_config(
        mcp_access_token=mcp_access_token,
        non_approval_tools=NON_APPROVAL_TOOLS  # Tools that skip approval
    )

    # Optional: Add other tools (e.g., web search)
    tools = [mcp_tool_config]

    # ─────────────────────────────────────────────────────────────────────
    # Step 3: Call OpenAI Responses API with streaming
    # ─────────────────────────────────────────────────────────────────────
    try:
        stream = await self.client.responses.create(
            model=self.model,
            input=input_array,
            tools=tools,
            tool_choice="auto",        # Let OpenAI decide when to use tools
            max_output_tokens=8192,
            store=True,                # Store for continuation (approvals)
            stream=True                # Enable streaming
        )

        # Process streaming events
        async for event in self._process_stream(stream):
            yield event

    except Exception as e:
        yield {
            "type": "error",
            "error": str(e)
        }
```

### 3.3 Responses API Parameters Reference

```python
# Complete parameter reference for responses.create()

await client.responses.create(
    # ─────────────────────────────────────────────────────────────────────
    # Required Parameters
    # ─────────────────────────────────────────────────────────────────────
    model="gpt-4o",                    # Model to use
    input=[...],                       # Array of messages

    # ─────────────────────────────────────────────────────────────────────
    # Tool Configuration
    # ─────────────────────────────────────────────────────────────────────
    tools=[
        {
            "type": "mcp",
            "server_label": "your_label",
            "server_url": "https://mcp.yourdomain.com",
            "authorization": "jwt_token_here",  # NO "Bearer " prefix!
            "require_approval": {
                "never": {"tool_names": ["safe_tool_1", "safe_tool_2"]},
                # "always": {"tool_names": ["dangerous_tool"]},  # Always require
            }
        },
        {
            "type": "web_search_preview",  # Built-in web search
            "search_context_size": "medium"
        }
    ],
    tool_choice="auto",                # "auto", "required", "none", or specific tool

    # ─────────────────────────────────────────────────────────────────────
    # Output Configuration
    # ─────────────────────────────────────────────────────────────────────
    max_output_tokens=8192,            # Max tokens in response
    temperature=0.7,                   # Randomness (0-2)
    top_p=1.0,                         # Nucleus sampling

    # ─────────────────────────────────────────────────────────────────────
    # Streaming & Storage
    # ─────────────────────────────────────────────────────────────────────
    stream=True,                       # Enable streaming
    store=True,                        # Store for continuation/approvals

    # ─────────────────────────────────────────────────────────────────────
    # Continuation (for approval flow)
    # ─────────────────────────────────────────────────────────────────────
    previous_response_id="resp_xxx",   # Continue from previous response

    # ─────────────────────────────────────────────────────────────────────
    # Advanced Options
    # ─────────────────────────────────────────────────────────────────────
    text={"verbosity": "medium"},      # Text generation settings
    reasoning={"effort": "medium"},    # Extended thinking (if supported)
)
```

---

## 4. MCP Token Generation

### 4.1 Why Enriched Tokens?

MCP tools need context about the authenticated user to:
- Execute operations on their behalf
- Connect to user-specific services
- Apply user-specific permissions
- Track requests for auditing

### 4.2 Token Generator Implementation

```python
# mcp_token_generator.py

import jwt
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

class MCPTokenGenerator:
    """
    Generates enriched JWT tokens for MCP authentication.

    These tokens carry additional context beyond basic authentication,
    allowing MCP tools to make informed decisions about user capabilities.
    """

    def __init__(
        self,
        jwt_secret: str,
        jwt_algorithm: str = "HS256",
        token_expiry_minutes: int = 15
    ):
        self.jwt_secret = jwt_secret
        self.jwt_algorithm = jwt_algorithm
        self.token_expiry_minutes = token_expiry_minutes

    def generate_mcp_token(
        self,
        user_id: str,
        # ─────────────────────────────────────────────────────────────────
        # Connection State (Required)
        # ─────────────────────────────────────────────────────────────────
        service_connected: bool = False,    # Is user's service active?
        service_type: Optional[str] = None, # Type of service (e.g., "IBKR", "AWS")

        # ─────────────────────────────────────────────────────────────────
        # Service-Specific Credentials (Optional)
        # ─────────────────────────────────────────────────────────────────
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        api_passphrase: Optional[str] = None,  # For services requiring passphrase
        endpoint_url: Optional[str] = None,    # Custom endpoint (e.g., gateway port)
        account_id: Optional[str] = None,

        # ─────────────────────────────────────────────────────────────────
        # Environment & Mode
        # ─────────────────────────────────────────────────────────────────
        is_sandbox: bool = False,           # Sandbox/test mode?
        environment: str = "production",    # "production", "staging", "development"

        # ─────────────────────────────────────────────────────────────────
        # Request Context
        # ─────────────────────────────────────────────────────────────────
        execution_id: Optional[str] = None, # Correlation ID for tracking
        request_source: str = "api",        # "api", "web", "mobile"

        # ─────────────────────────────────────────────────────────────────
        # Custom Claims
        # ─────────────────────────────────────────────────────────────────
        custom_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate an enriched JWT token for MCP authentication.

        Args:
            user_id: Unique identifier for the user
            service_connected: Whether user has an active service connection
            service_type: Type of connected service
            api_key: API key for the service (if applicable)
            api_secret: API secret for the service (if applicable)
            api_passphrase: API passphrase (for services like OKX)
            endpoint_url: Custom endpoint URL (e.g., gateway address)
            account_id: User's account ID with the service
            is_sandbox: Whether to use sandbox/test mode
            environment: Deployment environment
            execution_id: Correlation ID for request tracking
            request_source: Source of the request
            custom_claims: Additional custom claims to include

        Returns:
            JWT token string (without "Bearer " prefix)
        """
        now = datetime.utcnow()
        expiry = now + timedelta(minutes=self.token_expiry_minutes)

        # ─────────────────────────────────────────────────────────────────
        # Build JWT Payload
        # ─────────────────────────────────────────────────────────────────
        payload = {
            # Standard JWT Claims
            "sub": str(user_id),
            "iat": int(now.timestamp()),
            "exp": int(expiry.timestamp()),
            "jti": secrets.token_urlsafe(16),  # Unique token ID

            # Token Metadata
            "type": "mcp_access",
            "token_purpose": "mcp_tool_execution",
            "generated_at": now.isoformat() + "Z",

            # Connection State
            "service_connected": service_connected,
            "service_type": service_type,
            "is_sandbox": is_sandbox,
            "environment": environment,

            # Request Context
            "execution_id": execution_id or secrets.token_urlsafe(8),
            "request_source": request_source,
        }

        # ─────────────────────────────────────────────────────────────────
        # Add Service-Specific Claims (only if connected)
        # ─────────────────────────────────────────────────────────────────
        if service_connected and service_type:
            if endpoint_url:
                payload["endpoint_url"] = endpoint_url
            if account_id:
                payload["account_id"] = account_id

            # Sensitive credentials (consider encrypting in production)
            if api_key:
                payload["api_key"] = api_key
            if api_secret:
                payload["api_secret"] = api_secret
            if api_passphrase:
                payload["api_passphrase"] = api_passphrase

        # ─────────────────────────────────────────────────────────────────
        # Add Custom Claims
        # ─────────────────────────────────────────────────────────────────
        if custom_claims:
            payload.update(custom_claims)

        # ─────────────────────────────────────────────────────────────────
        # Sign and Return Token
        # ─────────────────────────────────────────────────────────────────
        token = jwt.encode(
            payload,
            self.jwt_secret,
            algorithm=self.jwt_algorithm
        )

        return token


# ─────────────────────────────────────────────────────────────────────────────
# Factory Function for Easy Use
# ─────────────────────────────────────────────────────────────────────────────

_token_generator: Optional[MCPTokenGenerator] = None


def get_token_generator() -> MCPTokenGenerator:
    """Get or create the token generator singleton."""
    global _token_generator
    if _token_generator is None:
        _token_generator = MCPTokenGenerator(
            jwt_secret=os.getenv("JWT_SECRET_KEY"),
            token_expiry_minutes=int(os.getenv("MCP_TOKEN_EXPIRY_MINUTES", "15"))
        )
    return _token_generator


def generate_mcp_token(user_id: str, **kwargs) -> str:
    """Convenience function to generate MCP token."""
    return get_token_generator().generate_mcp_token(user_id, **kwargs)
```

### 4.3 Token Claims Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP TOKEN CLAIMS REFERENCE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ STANDARD CLAIMS (Always Present)                                            │
│ ────────────────────────────────                                            │
│ sub           │ User identifier                 │ "user_123"                │
│ iat           │ Issued at timestamp             │ 1706000000                │
│ exp           │ Expiration timestamp            │ 1706000900                │
│ jti           │ Unique token ID                 │ "abc123xyz..."            │
│                                                                             │
│ TOKEN METADATA                                                              │
│ ────────────────────────────────                                            │
│ type          │ Token type                      │ "mcp_access"              │
│ token_purpose │ Purpose description             │ "mcp_tool_execution"      │
│ generated_at  │ Human-readable timestamp        │ "2025-01-25T12:00:00Z"    │
│                                                                             │
│ CONNECTION STATE                                                            │
│ ────────────────────────────────                                            │
│ service_connected │ Is service active?          │ true/false                │
│ service_type      │ Type of service             │ "IBKR", "AWS", "CUSTOM"   │
│ is_sandbox        │ Sandbox mode?               │ true/false                │
│ environment       │ Deployment env              │ "production"              │
│                                                                             │
│ SERVICE-SPECIFIC (Only when service_connected=true)                         │
│ ────────────────────────────────                                            │
│ endpoint_url    │ Custom endpoint               │ "localhost:4001"          │
│ account_id      │ Account identifier            │ "DU123456"                │
│ api_key         │ API key                       │ "pk_live_..."             │
│ api_secret      │ API secret                    │ "sk_live_..."             │
│ api_passphrase  │ API passphrase (OKX)          │ "my_passphrase"           │
│                                                                             │
│ REQUEST CONTEXT                                                             │
│ ────────────────────────────────                                            │
│ execution_id    │ Correlation ID                │ "exec_abc123"             │
│ request_source  │ Request origin                │ "api", "web", "mobile"    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Tool Registration & Categories

### 5.1 Tool Categorization Strategy

```python
# tool_categories.py

"""
Tool categorization determines which tools require user approval.

Categories:
- NON_APPROVAL_TOOLS: Safe, read-only operations (skip approval)
- APPROVAL_REQUIRED_TOOLS: Operations that modify state (require approval)
"""

# ─────────────────────────────────────────────────────────────────────────────
# Tools that NEVER require approval (safe, read-only operations)
# ─────────────────────────────────────────────────────────────────────────────
NON_APPROVAL_TOOLS = [
    # Data Retrieval
    "get_data",
    "list_items",
    "search",
    "get_status",

    # Analysis (read-only)
    "analyze",
    "calculate",
    "summarize",
    "compare",

    # Information
    "get_help",
    "get_documentation",
    "explain",
]

# ─────────────────────────────────────────────────────────────────────────────
# Tools that ALWAYS require approval (state-modifying operations)
# ─────────────────────────────────────────────────────────────────────────────
APPROVAL_REQUIRED_TOOLS = [
    # Create/Modify/Delete
    "create_item",
    "update_item",
    "delete_item",

    # Sensitive Operations
    "execute_action",
    "send_message",
    "transfer",
    "submit",
]


def requires_approval(tool_name: str) -> bool:
    """Check if a tool requires user approval."""
    # If explicitly in non-approval list, no approval needed
    if tool_name in NON_APPROVAL_TOOLS:
        return False

    # If explicitly in approval list, approval required
    if tool_name in APPROVAL_REQUIRED_TOOLS:
        return True

    # Default: require approval for unknown tools (safe default)
    return True
```

### 5.2 Registering Tools with OpenAI

```python
# In your orchestrator

def build_mcp_tool_config(self, mcp_access_token: str) -> dict:
    """Build MCP config with proper approval settings."""

    return {
        "type": "mcp",
        "server_label": "your_mcp_server",
        "server_url": self.mcp_server_url,
        "authorization": mcp_access_token,  # Plain JWT, no "Bearer "!
        "require_approval": {
            # Tools that never need approval
            "never": {
                "tool_names": NON_APPROVAL_TOOLS
            }
            # Note: Tools not in "never" list will require approval by default
        }
    }
```

---

## 6. Streaming Implementation

### 6.1 Event Types Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPENAI RESPONSES API STREAMING EVENTS                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ RESPONSE LIFECYCLE                                                          │
│ ─────────────────────────────────                                           │
│ response.created        │ Stream started, contains response_id              │
│ response.done           │ Stream completed successfully                     │
│ response.completed      │ Alternative completion event                      │
│ response.failed         │ Stream failed with error                          │
│                                                                             │
│ TEXT CONTENT (Stream to user immediately)                                   │
│ ─────────────────────────────────                                           │
│ response.content_part.added   │ New content part starting                   │
│ response.content_part.delta   │ Text chunk received (main streaming)        │
│ response.output_text.delta    │ Alternative text streaming event            │
│                                                                             │
│ MCP TOOL EVENTS                                                             │
│ ─────────────────────────────────                                           │
│ response.output_item.added    │ Output item starting                        │
│   └─ type: "mcp_list_tools"   │   MCP server tools loaded                   │
│   └─ type: "mcp_call"         │   Tool invocation starting                  │
│   └─ type: "mcp_approval_request" │ Tool needs user approval                │
│   └─ type: "message"          │   Assistant message starting                │
│                                                                             │
│ response.output_item.done     │ Output item completed                       │
│   └─ type: "mcp_call"         │   Tool finished (has output/error)          │
│   └─ type: "message"          │   Message complete                          │
│                                                                             │
│ EXTENDED THINKING (if enabled)                                              │
│ ─────────────────────────────────                                           │
│ response.reasoning.delta      │ Reasoning/thinking chunk                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Stream Processing Implementation

```python
# orchestrator.py (continued)

from typing import AsyncGenerator, Dict, Any, Optional
import json

class OpenAIOrchestrator:
    # ... (previous code)

    async def _process_stream(
        self,
        stream
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process OpenAI Responses API stream events.

        Yields normalized event dictionaries for consistent frontend handling.
        """
        response_id: Optional[str] = None
        current_tool_call: Optional[Dict] = None
        accumulated_text: str = ""

        try:
            async for event in stream:
                event_type = getattr(event, 'type', None)

                # ─────────────────────────────────────────────────────────────
                # Response Lifecycle Events
                # ─────────────────────────────────────────────────────────────
                if event_type == "response.created":
                    response_id = event.response.id
                    yield {
                        "type": "response_started",
                        "response_id": response_id
                    }

                elif event_type in ["response.done", "response.completed"]:
                    yield {
                        "type": "done",
                        "response_id": response_id,
                        "full_text": accumulated_text
                    }

                elif event_type == "response.failed":
                    error_msg = getattr(event, 'error', {})
                    yield {
                        "type": "error",
                        "error": str(error_msg),
                        "response_id": response_id
                    }

                # ─────────────────────────────────────────────────────────────
                # Text Content Events (Stream immediately to user)
                # ─────────────────────────────────────────────────────────────
                elif event_type == "response.content_part.delta":
                    delta = getattr(event, 'delta', None)
                    if delta:
                        text = getattr(delta, 'text', '') or ''
                        if text:
                            accumulated_text += text
                            yield {
                                "type": "content",
                                "content": text,
                                "response_id": response_id
                            }

                elif event_type == "response.output_text.delta":
                    text = getattr(event, 'delta', '')
                    if text:
                        accumulated_text += text
                        yield {
                            "type": "content",
                            "content": text,
                            "response_id": response_id
                        }

                # ─────────────────────────────────────────────────────────────
                # MCP Tool Events
                # ─────────────────────────────────────────────────────────────
                elif event_type == "response.output_item.added":
                    item = getattr(event, 'item', None)
                    if not item:
                        continue

                    item_type = getattr(item, 'type', None)

                    # MCP server tools loaded
                    if item_type == "mcp_list_tools":
                        tools = getattr(item, 'tools', [])
                        yield {
                            "type": "tools_loaded",
                            "tool_count": len(tools),
                            "tools": [t.name for t in tools] if tools else []
                        }

                    # Tool call starting
                    elif item_type == "mcp_call":
                        tool_name = getattr(item, 'name', 'unknown')
                        arguments = getattr(item, 'arguments', {})

                        # Parse arguments if string
                        if isinstance(arguments, str):
                            try:
                                arguments = json.loads(arguments)
                            except json.JSONDecodeError:
                                arguments = {"raw": arguments}

                        current_tool_call = {
                            "tool_name": tool_name,
                            "arguments": arguments
                        }

                        yield {
                            "type": "tool_call_started",
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "response_id": response_id
                        }

                    # Approval request
                    elif item_type == "mcp_approval_request":
                        approval_id = getattr(item, 'id', None)
                        tool_name = getattr(item, 'name', 'unknown')
                        arguments = getattr(item, 'arguments', {})

                        yield {
                            "type": "approval_request",
                            "approval_request_id": approval_id,
                            "response_id": response_id,
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "server_label": "your_mcp_server"
                        }

                elif event_type == "response.output_item.done":
                    item = getattr(event, 'item', None)
                    if not item:
                        continue

                    item_type = getattr(item, 'type', None)

                    # Tool call completed
                    if item_type == "mcp_call":
                        tool_name = getattr(item, 'name', 'unknown')

                        # Extract result
                        output = getattr(item, 'output', None)
                        error = getattr(item, 'error', None)

                        result = self._extract_tool_result(output)

                        yield {
                            "type": "tool_call_completed",
                            "tool_name": tool_name,
                            "result": result,
                            "error": str(error) if error else None,
                            "response_id": response_id
                        }

                        current_tool_call = None

                # ─────────────────────────────────────────────────────────────
                # Extended Thinking (if enabled)
                # ─────────────────────────────────────────────────────────────
                elif event_type == "response.reasoning.delta":
                    thinking = getattr(event, 'delta', '')
                    if thinking:
                        yield {
                            "type": "thinking",
                            "content": thinking,
                            "response_id": response_id
                        }

        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "response_id": response_id
            }

    def _extract_tool_result(self, output: Any) -> Any:
        """
        Extract readable result from tool output.

        Tool output can be various formats:
        - List of TextContent objects
        - Single object with .text attribute
        - Raw string
        - Dict/list
        """
        if output is None:
            return None

        # List of content objects
        if isinstance(output, list):
            results = []
            for item in output:
                if hasattr(item, 'text'):
                    results.append(item.text)
                elif isinstance(item, str):
                    results.append(item)
                else:
                    results.append(str(item))

            # Return single item if only one, else list
            if len(results) == 1:
                try:
                    return json.loads(results[0])
                except (json.JSONDecodeError, TypeError):
                    return results[0]
            return results

        # Single content object
        if hasattr(output, 'text'):
            try:
                return json.loads(output.text)
            except (json.JSONDecodeError, TypeError):
                return output.text

        # String
        if isinstance(output, str):
            try:
                return json.loads(output)
            except json.JSONDecodeError:
                return output

        # Dict or other
        return output
```

### 6.3 SSE Response to Frontend

```python
# server.py

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import json

app = FastAPI()


@app.post("/chat/stream")
async def chat_stream(request: Request):
    """
    Stream chat responses to frontend via SSE.
    """
    data = await request.json()
    user_message = data.get("message")
    user_id = data.get("user_id")

    # Generate MCP token with user context
    mcp_token = generate_mcp_token(
        user_id=user_id,
        service_connected=data.get("service_connected", False),
        service_type=data.get("service_type"),
        # ... other context
    )

    async def event_generator():
        """Generate SSE events from orchestrator stream."""
        orchestrator = OpenAIOrchestrator()

        async for event in orchestrator.process_message(
            user_message=user_message,
            mcp_access_token=mcp_token,
            conversation_history=data.get("history", []),
            system_prompt=data.get("system_prompt")
        ):
            # Format as SSE event
            event_data = json.dumps(event)
            yield f"data: {event_data}\n\n"

        # Signal stream end
        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
```

---

## 7. Tool Approval Flow

### 7.1 Approval Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TOOL APPROVAL FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FRONTEND           YOUR BACKEND           OPENAI           MCP SERVER     │
│      │                    │                   │                  │          │
│      │ 1. User message    │                   │                  │          │
│      │ ──────────────────>│                   │                  │          │
│      │                    │                   │                  │          │
│      │                    │ 2. Stream request │                  │          │
│      │                    │ ─────────────────>│                  │          │
│      │                    │                   │                  │          │
│      │                    │                   │ 3. Check tool    │          │
│      │                    │                   │    approval      │          │
│      │                    │                   │                  │          │
│      │                    │ 4. approval_request                  │          │
│      │                    │ <─────────────────│                  │          │
│      │                    │   (tool needs     │                  │          │
│      │                    │    user approval) │                  │          │
│      │                    │                   │                  │          │
│      │ 5. Show approval   │                   │                  │          │
│      │    dialog          │                   │                  │          │
│      │ <──────────────────│                   │                  │          │
│      │                    │                   │                  │          │
│   USER REVIEWS AND DECIDES                    │                  │          │
│      │                    │                   │                  │          │
│      │ 6. User approves   │                   │                  │          │
│      │ ──────────────────>│                   │                  │          │
│      │   POST /approve    │                   │                  │          │
│      │   {approved: true} │                   │                  │          │
│      │                    │                   │                  │          │
│      │                    │ 7. Continue with  │                  │          │
│      │                    │    approval       │                  │          │
│      │                    │ ─────────────────>│                  │          │
│      │                    │   previous_       │                  │          │
│      │                    │   response_id +   │                  │          │
│      │                    │   approval_       │                  │          │
│      │                    │   response        │                  │          │
│      │                    │                   │                  │          │
│      │                    │                   │ 8. Execute tool  │          │
│      │                    │                   │ ────────────────>│          │
│      │                    │                   │                  │          │
│      │                    │                   │ 9. Tool result   │          │
│      │                    │                   │ <────────────────│          │
│      │                    │                   │                  │          │
│      │                    │ 10. Stream result │                  │          │
│      │                    │ <─────────────────│                  │          │
│      │                    │                   │                  │          │
│      │ 11. Display result │                   │                  │          │
│      │ <──────────────────│                   │                  │          │
│      │                    │                   │                  │          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Approval Handler Implementation

```python
# approval_handler.py

from pydantic import BaseModel
from typing import Optional


class ApprovalRequest(BaseModel):
    """Request body for tool approval endpoint."""
    approval_request_id: str
    response_id: str
    approved: bool
    reason: Optional[str] = None  # Reason if denied


class ApprovalHandler:
    """
    Handles tool approval flow for sensitive operations.
    """

    def __init__(self, orchestrator: OpenAIOrchestrator):
        self.orchestrator = orchestrator

    async def process_approval(
        self,
        approval: ApprovalRequest,
        mcp_access_token: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process user approval and continue the response.

        Args:
            approval: User's approval decision
            mcp_access_token: Fresh MCP token for continuation

        Yields:
            Streaming events from continued response
        """
        # Build approval response for OpenAI
        approval_response = {
            "type": "mcp_approval_response",
            "approval_request_id": approval.approval_request_id,
            "approve": approval.approved,
        }

        # Add reason if denied
        if not approval.approved and approval.reason:
            approval_response["reason"] = approval.reason

        # Build MCP config with fresh token
        mcp_tool_config = self.orchestrator.build_mcp_tool_config(
            mcp_access_token=mcp_access_token,
            non_approval_tools=NON_APPROVAL_TOOLS
        )

        try:
            # Continue from previous response
            stream = await self.orchestrator.client.responses.create(
                model=self.orchestrator.model,
                previous_response_id=approval.response_id,  # KEY: Continue!
                input=[approval_response],
                tools=[mcp_tool_config],
                stream=True
            )

            # Process continuation stream
            async for event in self.orchestrator._process_stream(stream):
                yield event

        except Exception as e:
            yield {
                "type": "error",
                "error": str(e)
            }
```

### 7.3 Approval Endpoint

```python
# server.py (continued)

@app.post("/chat/approve")
async def approve_tool(request: Request):
    """
    Handle user approval for tool execution.
    """
    data = await request.json()

    approval = ApprovalRequest(
        approval_request_id=data["approval_request_id"],
        response_id=data["response_id"],
        approved=data["approved"],
        reason=data.get("reason")
    )

    user_id = data.get("user_id")

    # Generate fresh MCP token
    mcp_token = generate_mcp_token(
        user_id=user_id,
        service_connected=data.get("service_connected", False),
        service_type=data.get("service_type"),
    )

    async def event_generator():
        """Stream approval continuation."""
        orchestrator = OpenAIOrchestrator()
        handler = ApprovalHandler(orchestrator)

        async for event in handler.process_approval(
            approval=approval,
            mcp_access_token=mcp_token
        ):
            yield f"data: {json.dumps(event)}\n\n"

        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )
```

---

## 8. Error Handling & Retries

### 8.1 Retry Strategy

```python
# orchestrator.py (continued)

import httpx
import asyncio
from typing import Set

# Errors that should trigger retry
RETRYABLE_ERRORS: Set[type] = {
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ReadTimeout,
    ConnectionResetError,
    asyncio.TimeoutError,
}

# HTTP status codes that should trigger retry
RETRYABLE_STATUS_CODES = {502, 503, 504, 429}

# Errors that should NOT retry (fail immediately)
NON_RETRYABLE_PATTERNS = [
    "401",           # Authentication failed
    "403",           # Forbidden
    "invalid_api_key",
    "token expired",
    "authentication",
    "authorization",
]


class OpenAIOrchestrator:
    # ... (previous code)

    async def process_message_with_retry(
        self,
        user_message: str,
        mcp_access_token: str,
        max_retries: int = 3,
        **kwargs
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process message with automatic retry for transient errors.

        Args:
            user_message: User's message
            mcp_access_token: MCP authentication token
            max_retries: Maximum retry attempts
            **kwargs: Additional arguments for process_message

        Yields:
            Streaming events with retry handling
        """
        retry_count = 0
        last_error = None

        while retry_count <= max_retries:
            try:
                async for event in self.process_message(
                    user_message=user_message,
                    mcp_access_token=mcp_access_token,
                    **kwargs
                ):
                    # Check for error events
                    if event.get("type") == "error":
                        error_msg = event.get("error", "")

                        # Check if non-retryable
                        if self._is_non_retryable_error(error_msg):
                            yield event
                            return

                        # Retryable error
                        last_error = error_msg
                        break
                    else:
                        yield event

                # If we completed without error, return
                return

            except Exception as e:
                error_type = type(e)
                error_msg = str(e)

                # Check if non-retryable
                if self._is_non_retryable_error(error_msg):
                    yield {"type": "error", "error": error_msg}
                    return

                # Check if retryable error type
                if error_type in RETRYABLE_ERRORS or self._is_retryable_status(e):
                    retry_count += 1
                    last_error = error_msg

                    if retry_count <= max_retries:
                        # Exponential backoff
                        wait_time = retry_count * 2
                        yield {
                            "type": "retry",
                            "attempt": retry_count,
                            "max_retries": max_retries,
                            "wait_seconds": wait_time,
                            "error": error_msg
                        }
                        await asyncio.sleep(wait_time)
                        continue

                # Non-retryable or max retries exceeded
                yield {"type": "error", "error": error_msg}
                return

        # Max retries exceeded
        yield {
            "type": "error",
            "error": f"Max retries ({max_retries}) exceeded. Last error: {last_error}"
        }

    def _is_non_retryable_error(self, error_msg: str) -> bool:
        """Check if error should not be retried."""
        error_lower = error_msg.lower()
        return any(pattern in error_lower for pattern in NON_RETRYABLE_PATTERNS)

    def _is_retryable_status(self, error: Exception) -> bool:
        """Check if HTTP error has retryable status code."""
        if hasattr(error, 'status_code'):
            return error.status_code in RETRYABLE_STATUS_CODES
        if hasattr(error, 'response') and hasattr(error.response, 'status_code'):
            return error.response.status_code in RETRYABLE_STATUS_CODES
        return False
```

### 8.2 Error Types Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING REFERENCE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ RETRYABLE ERRORS (Automatic retry with backoff)                             │
│ ─────────────────────────────────────────────────                           │
│ • Connection errors (network issues)                                        │
│ • Read timeouts                                                             │
│ • 502/503/504 gateway errors                                                │
│ • 429 rate limit (with longer backoff)                                      │
│ • Remote protocol errors                                                    │
│                                                                             │
│ NON-RETRYABLE ERRORS (Fail immediately)                                     │
│ ─────────────────────────────────────────────────                           │
│ • 401 Unauthorized (invalid/expired token)                                  │
│ • 403 Forbidden (insufficient permissions)                                  │
│ • 400 Bad Request (invalid input)                                           │
│ • 424 Failed Dependency (MCP server can't load tools)                       │
│ • Invalid API key                                                           │
│ • Token validation failures                                                 │
│                                                                             │
│ RETRY STRATEGY                                                              │
│ ─────────────────────────────────────────────────                           │
│ • Max retries: 3 (configurable)                                             │
│ • Backoff: Exponential (2s, 4s, 6s)                                         │
│ • Emit retry events so frontend can show status                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Real-Time Tool Status

### 9.1 Tool Status Publisher (MCP Server Side)

```python
# In your MCP server: tool_status_publisher.py

import redis.asyncio as redis
import json
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

class ToolStage(Enum):
    """Stages of tool execution for status updates."""
    START = "start"
    PROGRESS = "progress"
    END = "end"
    ERROR = "error"


class ToolStatusPublisher:
    """
    Publishes real-time tool status updates via Redis Pub/Sub.

    This allows the backend to forward status updates to the frontend
    in parallel with the main OpenAI stream.
    """

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None

    async def get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = await redis.from_url(self.redis_url)
        return self._redis

    async def emit_status(
        self,
        stage: ToolStage,
        message: str,
        tool_name: str,
        user_id: str,
        execution_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Emit tool status update to Redis Pub/Sub.

        Args:
            stage: Current execution stage
            message: Human-readable status message
            tool_name: Name of the tool
            user_id: User identifier for routing
            execution_id: Correlation ID for request tracking
            metadata: Additional data (e.g., progress percentage)

        Returns:
            True if published successfully
        """
        try:
            client = await self.get_redis()

            status_message = {
                "type": "tool_status",
                "tool_name": tool_name,
                "stage": stage.value,
                "message": message,
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }

            if metadata:
                status_message["metadata"] = metadata

            # Publish to user-specific channel
            channel = f"user:{user_id}:events"
            await client.publish(channel, json.dumps(status_message))

            return True

        except Exception as e:
            print(f"Failed to publish status: {e}")
            return False


# Global publisher instance
_publisher: Optional[ToolStatusPublisher] = None


async def get_publisher() -> ToolStatusPublisher:
    """Get or create publisher singleton."""
    global _publisher
    if _publisher is None:
        _publisher = ToolStatusPublisher(
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379")
        )
    return _publisher


async def emit_status(
    stage: ToolStage,
    message: str,
    tool_name: str,
    user_id: Optional[str] = None,
    **kwargs
) -> bool:
    """
    Convenience function to emit tool status.

    If user_id not provided, attempts to get from current context.
    """
    if user_id is None:
        # Try to get from context (set by auth middleware)
        from your_auth_module import get_current_user_id
        user_id = get_current_user_id()

    if not user_id:
        return False

    publisher = await get_publisher()
    return await publisher.emit_status(
        stage=stage,
        message=message,
        tool_name=tool_name,
        user_id=user_id,
        **kwargs
    )
```

### 9.2 Using Status in Tools

```python
# In your MCP tool implementation

@mcp.tool()
async def your_tool(param1: str, param2: int) -> str:
    """
    Your tool description.

    Args:
        param1: First parameter
        param2: Second parameter

    Returns:
        Result string
    """
    from tool_status_publisher import emit_status, ToolStage

    # Emit start status
    await emit_status(
        ToolStage.START,
        f"Starting operation with {param1}",
        "your_tool"
    )

    try:
        # Step 1
        await emit_status(
            ToolStage.PROGRESS,
            "Processing step 1...",
            "your_tool",
            metadata={"progress": 25}
        )
        result1 = await do_step_1(param1)

        # Step 2
        await emit_status(
            ToolStage.PROGRESS,
            "Processing step 2...",
            "your_tool",
            metadata={"progress": 50}
        )
        result2 = await do_step_2(result1, param2)

        # Step 3
        await emit_status(
            ToolStage.PROGRESS,
            "Finalizing...",
            "your_tool",
            metadata={"progress": 75}
        )
        final_result = await do_step_3(result2)

        # Emit completion
        await emit_status(
            ToolStage.END,
            f"Completed successfully",
            "your_tool",
            metadata={"result_summary": "..."}
        )

        return json.dumps({"success": True, "data": final_result})

    except Exception as e:
        # Emit error status
        await emit_status(
            ToolStage.ERROR,
            f"Error: {str(e)}",
            "your_tool"
        )
        return json.dumps({"success": False, "error": str(e)})
```

### 9.3 Subscribing to Status (Backend)

```python
# server.py (add Redis subscription)

import redis.asyncio as redis
import asyncio


async def subscribe_to_tool_status(
    user_id: str,
    status_queue: asyncio.Queue
):
    """
    Subscribe to tool status updates and forward to queue.

    This runs as a background task during streaming.
    """
    redis_client = await redis.from_url(os.getenv("REDIS_URL"))

    try:
        pubsub = redis_client.pubsub()
        channel = f"user:{user_id}:events"
        await pubsub.subscribe(channel)

        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await status_queue.put(data)

    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await redis_client.close()


@app.post("/chat/stream")
async def chat_stream_with_status(request: Request):
    """Enhanced streaming with real-time tool status."""
    data = await request.json()
    user_id = data.get("user_id")

    # Create queue for status updates
    status_queue = asyncio.Queue()

    # Start status subscription as background task
    status_task = asyncio.create_task(
        subscribe_to_tool_status(user_id, status_queue)
    )

    async def event_generator():
        orchestrator = OpenAIOrchestrator()
        mcp_token = generate_mcp_token(user_id=user_id, ...)

        try:
            async for event in orchestrator.process_message(...):
                # Check for tool status updates (non-blocking)
                while not status_queue.empty():
                    status = await status_queue.get()
                    yield f"data: {json.dumps(status)}\n\n"

                # Yield main stream event
                yield f"data: {json.dumps(event)}\n\n"

            # Drain remaining status events
            while not status_queue.empty():
                status = await status_queue.get()
                yield f"data: {json.dumps(status)}\n\n"

        finally:
            status_task.cancel()

        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

---

## 10. Complete Code Examples

### 10.1 Full Orchestrator Example

```python
# orchestrator.py - Complete Implementation

import os
import json
import asyncio
import secrets
from datetime import datetime, timedelta
from typing import AsyncGenerator, Dict, Any, Optional, List, Set
from openai import AsyncOpenAI
import httpx
import jwt

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

class Config:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
    MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://mcp.yourdomain.com")
    JWT_SECRET = os.getenv("JWT_SECRET_KEY")
    TIMEOUT = int(os.getenv("OPENAI_TIMEOUT", "90"))


# Tools that don't require approval
NON_APPROVAL_TOOLS = [
    "get_data",
    "search",
    "analyze",
    "get_status",
]

# Retryable errors
RETRYABLE_ERRORS: Set[type] = {
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    ConnectionResetError,
}


# ─────────────────────────────────────────────────────────────────────────────
# Token Generator
# ─────────────────────────────────────────────────────────────────────────────

def generate_mcp_token(
    user_id: str,
    service_connected: bool = False,
    service_type: Optional[str] = None,
    execution_id: Optional[str] = None,
    **extra_claims
) -> str:
    """Generate enriched JWT token for MCP authentication."""
    now = datetime.utcnow()

    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=15)).timestamp()),
        "jti": secrets.token_urlsafe(16),
        "type": "mcp_access",
        "service_connected": service_connected,
        "service_type": service_type,
        "execution_id": execution_id or secrets.token_urlsafe(8),
        **extra_claims
    }

    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class OpenAIOrchestrator:
    """
    Orchestrates OpenAI Responses API with MCP tool integration.
    """

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=Config.OPENAI_API_KEY,
            timeout=Config.TIMEOUT
        )
        self.model = Config.OPENAI_MODEL
        self.mcp_server_url = Config.MCP_SERVER_URL

    def build_mcp_tool_config(self, mcp_access_token: str) -> dict:
        """Build MCP tool configuration."""
        # Strip Bearer prefix if present
        clean_token = mcp_access_token
        if clean_token.startswith("Bearer "):
            clean_token = clean_token.replace("Bearer ", "")

        return {
            "type": "mcp",
            "server_label": "your_mcp_server",
            "server_url": self.mcp_server_url,
            "authorization": clean_token,
            "require_approval": {
                "never": {"tool_names": NON_APPROVAL_TOOLS}
            }
        }

    async def process_message(
        self,
        user_message: str,
        mcp_access_token: str,
        conversation_history: Optional[List[Dict]] = None,
        system_prompt: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process message with MCP tools."""

        # Build input array
        input_array = []

        if system_prompt:
            input_array.append({"role": "developer", "content": system_prompt})

        if conversation_history:
            for msg in conversation_history:
                role = msg.get("role", "user")
                if role == "system":
                    role = "developer"
                elif role == "tool":
                    input_array.append({
                        "role": "developer",
                        "content": f"[Tool Result] {msg.get('name')}: {msg.get('content')}"
                    })
                    continue
                input_array.append({"role": role, "content": msg.get("content", "")})

        input_array.append({"role": "user", "content": user_message})

        # Build tool config
        mcp_config = self.build_mcp_tool_config(mcp_access_token)

        # Make API call
        retry_count = 0
        max_retries = 3

        while retry_count <= max_retries:
            try:
                stream = await self.client.responses.create(
                    model=self.model,
                    input=input_array,
                    tools=[mcp_config],
                    tool_choice="auto",
                    max_output_tokens=8192,
                    store=True,
                    stream=True
                )

                async for event in self._process_stream(stream):
                    yield event

                return  # Success

            except Exception as e:
                if type(e) in RETRYABLE_ERRORS and retry_count < max_retries:
                    retry_count += 1
                    await asyncio.sleep(retry_count * 2)
                    continue
                yield {"type": "error", "error": str(e)}
                return

    async def _process_stream(self, stream) -> AsyncGenerator[Dict[str, Any], None]:
        """Process streaming events."""
        response_id = None
        accumulated_text = ""

        async for event in stream:
            event_type = getattr(event, 'type', None)

            if event_type == "response.created":
                response_id = event.response.id
                yield {"type": "response_started", "response_id": response_id}

            elif event_type in ["response.done", "response.completed"]:
                yield {"type": "done", "response_id": response_id}

            elif event_type == "response.content_part.delta":
                delta = getattr(event, 'delta', None)
                if delta and hasattr(delta, 'text') and delta.text:
                    accumulated_text += delta.text
                    yield {"type": "content", "content": delta.text}

            elif event_type == "response.output_item.added":
                item = getattr(event, 'item', None)
                if item:
                    item_type = getattr(item, 'type', None)

                    if item_type == "mcp_call":
                        yield {
                            "type": "tool_call_started",
                            "tool_name": getattr(item, 'name', 'unknown'),
                            "arguments": getattr(item, 'arguments', {})
                        }

                    elif item_type == "mcp_approval_request":
                        yield {
                            "type": "approval_request",
                            "approval_request_id": getattr(item, 'id', None),
                            "response_id": response_id,
                            "tool_name": getattr(item, 'name', 'unknown'),
                            "arguments": getattr(item, 'arguments', {})
                        }

            elif event_type == "response.output_item.done":
                item = getattr(event, 'item', None)
                if item and getattr(item, 'type', None) == "mcp_call":
                    output = getattr(item, 'output', None)
                    yield {
                        "type": "tool_call_completed",
                        "tool_name": getattr(item, 'name', 'unknown'),
                        "result": self._extract_result(output)
                    }

    def _extract_result(self, output: Any) -> Any:
        """Extract result from tool output."""
        if output is None:
            return None
        if isinstance(output, list):
            texts = [getattr(o, 'text', str(o)) for o in output]
            return texts[0] if len(texts) == 1 else texts
        if hasattr(output, 'text'):
            return output.text
        return str(output)

    async def continue_with_approval(
        self,
        response_id: str,
        approval_request_id: str,
        approved: bool,
        mcp_access_token: str,
        reason: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Continue response after user approval."""

        approval_response = {
            "type": "mcp_approval_response",
            "approval_request_id": approval_request_id,
            "approve": approved
        }
        if not approved and reason:
            approval_response["reason"] = reason

        mcp_config = self.build_mcp_tool_config(mcp_access_token)

        stream = await self.client.responses.create(
            model=self.model,
            previous_response_id=response_id,
            input=[approval_response],
            tools=[mcp_config],
            stream=True
        )

        async for event in self._process_stream(stream):
            yield event
```

### 10.2 FastAPI Server Example

```python
# server.py - Complete FastAPI Server

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import json

from orchestrator import OpenAIOrchestrator, generate_mcp_token

app = FastAPI(title="OpenAI + MCP Integration")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    user_id: str
    service_connected: bool = False
    service_type: Optional[str] = None
    history: Optional[List[Dict]] = None
    system_prompt: Optional[str] = None


class ApprovalRequest(BaseModel):
    approval_request_id: str
    response_id: str
    approved: bool
    user_id: str
    service_connected: bool = False
    service_type: Optional[str] = None
    reason: Optional[str] = None


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat responses with MCP tools."""

    mcp_token = generate_mcp_token(
        user_id=request.user_id,
        service_connected=request.service_connected,
        service_type=request.service_type
    )

    async def event_generator():
        orchestrator = OpenAIOrchestrator()

        async for event in orchestrator.process_message(
            user_message=request.message,
            mcp_access_token=mcp_token,
            conversation_history=request.history,
            system_prompt=request.system_prompt
        ):
            yield f"data: {json.dumps(event)}\n\n"

        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"}
    )


@app.post("/chat/approve")
async def approve_tool(request: ApprovalRequest):
    """Handle tool approval."""

    mcp_token = generate_mcp_token(
        user_id=request.user_id,
        service_connected=request.service_connected,
        service_type=request.service_type
    )

    async def event_generator():
        orchestrator = OpenAIOrchestrator()

        async for event in orchestrator.continue_with_approval(
            response_id=request.response_id,
            approval_request_id=request.approval_request_id,
            approved=request.approved,
            mcp_access_token=mcp_token,
            reason=request.reason
        ):
            yield f"data: {json.dumps(event)}\n\n"

        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 11. Configuration Reference

```bash
# .env - Complete Configuration

# ─────────────────────────────────────────────────────────────────────────────
# OpenAI Configuration
# ─────────────────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...                          # Your OpenAI API key
OPENAI_MODEL=gpt-4o                            # Model to use
OPENAI_TIMEOUT=90                              # Request timeout (seconds)

# ─────────────────────────────────────────────────────────────────────────────
# MCP Server Configuration
# ─────────────────────────────────────────────────────────────────────────────
MCP_SERVER_URL=https://mcp.yourdomain.com      # Your MCP server URL
MCP_TOKEN_EXPIRY_MINUTES=15                    # Token expiry time

# ─────────────────────────────────────────────────────────────────────────────
# JWT Configuration (must match MCP server)
# ─────────────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY=your-32-char-minimum-secret     # Shared with MCP server!
JWT_ALGORITHM=HS256                            # JWT signing algorithm

# ─────────────────────────────────────────────────────────────────────────────
# Redis (for tool status pub/sub)
# ─────────────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379               # Redis connection URL

# ─────────────────────────────────────────────────────────────────────────────
# Server Configuration
# ─────────────────────────────────────────────────────────────────────────────
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
LOG_LEVEL=INFO
```

---

## 12. Troubleshooting

### Common Issues & Solutions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TROUBLESHOOTING GUIDE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ISSUE: "424 Failed Dependency" from OpenAI                                  │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: OpenAI couldn't load tools from your MCP server                      │
│                                                                             │
│ Fixes:                                                                      │
│   1. Check MCP server is running and accessible                             │
│   2. Verify MCP_SERVER_URL is correct                                       │
│   3. Ensure JWT token is valid (not expired)                                │
│   4. Check MCP server logs for auth errors                                  │
│   5. Test: curl -X POST https://mcp.yourdomain.com/sse \                    │
│            -H "Authorization: Bearer <token>" \                             │
│            -d '{"method":"tools/list"}'                                     │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ ISSUE: "Bearer Bearer" in authorization header                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: Token includes "Bearer " prefix when passed to OpenAI                │
│                                                                             │
│ Fix: Strip "Bearer " before passing to mcp_tool_config:                     │
│   clean_token = token.replace("Bearer ", "")                                │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ ISSUE: Tools not appearing / "No tools available"                           │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: MCP server returning empty tool list                                 │
│                                                                             │
│ Fixes:                                                                      │
│   1. Check MCP server tools/list endpoint                                   │
│   2. Verify FastMCP tools are registered                                    │
│   3. Check for import errors in tool files                                  │
│   4. Ensure auth middleware sets user context correctly                     │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ ISSUE: Approval continuation fails                                          │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: response_id not captured or token expired                            │
│                                                                             │
│ Fixes:                                                                      │
│   1. Verify response_id from response.created event                         │
│   2. Generate fresh MCP token for continuation                              │
│   3. Ensure store=True in original request                                  │
│   4. Check previous_response_id is correct                                  │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ ISSUE: Stream cuts off mid-response                                         │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: Timeout, proxy buffering, or connection drop                         │
│                                                                             │
│ Fixes:                                                                      │
│   1. Increase OPENAI_TIMEOUT (90s recommended)                              │
│   2. Add X-Accel-Buffering: no header                                       │
│   3. Set proxy_buffering off in nginx                                       │
│   4. Implement retry logic for transient errors                             │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ ISSUE: JWT_SECRET_KEY mismatch                                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Cause: Backend and MCP server have different secrets                        │
│                                                                             │
│ Fix: Ensure IDENTICAL JWT_SECRET_KEY in both services                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Debug Commands

```bash
# Test MCP server directly
curl -X POST https://mcp.yourdomain.com/sse \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list", "jsonrpc": "2.0", "id": 1}'

# Test OpenAI with MCP
curl -X POST https://api.openai.com/v1/responses \
  -H "Authorization: Bearer YOUR_OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": [{"role": "user", "content": "test"}],
    "tools": [{
      "type": "mcp",
      "server_url": "https://mcp.yourdomain.com",
      "authorization": "YOUR_JWT_TOKEN"
    }]
  }'

# Decode JWT to verify claims
echo "YOUR_JWT_TOKEN" | cut -d. -f2 | base64 -d | jq

# Check Redis pub/sub
redis-cli SUBSCRIBE "user:USER_ID:events"
```

---

## Summary

This blueprint provides everything needed to integrate any MCP server with OpenAI's Responses API:

1. **OpenAI Configuration**: How to configure MCP tools with the Responses API
2. **Token Generation**: Creating enriched JWT tokens with service context
3. **Tool Categories**: Separating tools that require approval from safe tools
4. **Streaming**: Processing real-time events from OpenAI
5. **Approval Flow**: Implementing user confirmation for sensitive operations
6. **Error Handling**: Retry strategies and graceful degradation
7. **Status Updates**: Real-time tool execution feedback via Redis

**Key Points to Remember**:
- MCP token must be **plain JWT** (no "Bearer " prefix)
- **JWT_SECRET_KEY** must match between your backend and MCP server
- Use **store=True** to enable approval continuations
- Always handle **retry** for transient errors
- Emit **tool status** for better user experience
