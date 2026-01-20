import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  JSONRPCMessage
} from '@modelcontextprotocol/sdk/types.js';
import { KimaiClient } from '@urtime/shared';
import type { ServerConfig } from '../config.js';
import { registerTools, handleToolCall } from '../tools/index.js';
import { registerResources, handleResourceRead } from '../resources/index.js';
import { registerPrompts, handlePromptGet } from '../prompts/index.js';
import { createOAuthMetadataRouter } from '../auth/oauth-metadata.js';
import { createOAuthRouter, getUserKimaiCredentials } from '../auth/oauth.js';
import { HttpSseTransport, SessionManager } from './sse-transport.js';
import { getDatabase, closeDatabase } from '../auth/database-json.js';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store session auth info
interface SessionAuth {
  userId: string;
  scopes: string[];
  kimaiUrl: string;
  kimaiToken: string;
  kimaiEmail?: string;
}

const sessionAuthMap = new Map<string, SessionAuth>();

/**
 * Create and start the HTTP server for remote MCP access
 */
export async function createHttpServer(config: ServerConfig): Promise<void> {
  if (!config.http) {
    throw new Error('HTTP configuration is required for HTTP mode');
  }

  const app = express();
  const sessionManager = new SessionManager();

  // Ensure data directory exists
  const dataDir = path.resolve(__dirname, '../../', config.database.path, '..');
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Initialize database
  const dbPath = path.resolve(__dirname, '../../', config.database.path);
  getDatabase(dbPath);

  // Security middleware - relaxed for MCP cross-origin access
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: config.http.rateLimitPerMinute,
    message: { error: 'Too many requests, please try again later' }
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = config.http!.corsOrigins;
    if (allowedOrigins === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.split(',').includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Request logging
  if (config.logging.requests) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: config.server.name,
      version: config.server.version,
      mode: 'http',
      sessions: sessionManager.getSessionIds().length
    });
  });

  // OAuth metadata endpoints (no auth required)
  app.use(createOAuthMetadataRouter(config.http.baseUrl));

  // OAuth endpoints (no auth required)
  app.use(createOAuthRouter(config.http.baseUrl));

  /**
   * Helper to extract and validate Bearer token
   */
  function extractAuth(req: Request): SessionAuth | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

    const accessToken = parts[1];
    const db = getDatabase();
    const tokenRecord = db.getOAuthToken(accessToken);

    if (!tokenRecord || tokenRecord.expires_at < Date.now()) {
      if (tokenRecord) db.deleteOAuthToken(accessToken);
      return null;
    }

    const kimaiCreds = getUserKimaiCredentials(tokenRecord.user_id);
    if (!kimaiCreds) return null;

    return {
      userId: tokenRecord.user_id,
      scopes: tokenRecord.scopes.split(' '),
      kimaiUrl: kimaiCreds.kimaiUrl,
      kimaiToken: kimaiCreds.kimaiToken,
      kimaiEmail: kimaiCreds.kimaiEmail
    };
  }

  /**
   * Send 401 response with OAuth discovery info
   */
  function sendAuthRequired(res: Response): void {
    const baseUrl = config.http!.baseUrl;
    res.setHeader(
      'WWW-Authenticate',
      `Bearer realm="${baseUrl}", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Bearer token required for this operation'
    });
  }

  // MCP SSE connection (GET) - NO AUTH REQUIRED for initial connection
  const mcpGetHandler = async (req: Request, res: Response) => {
    // Try to extract auth if provided (optional at this stage)
    const auth = extractAuth(req);

    // Create a new MCP session
    const transport = sessionManager.createSession();
    const sessionId = transport.getSessionId();

    console.log(`[HTTP] New MCP session: ${sessionId}${auth ? ` for user ${auth.userId}` : ' (unauthenticated)'}`);

    // If auth provided, store it for this session
    if (auth) {
      sessionAuthMap.set(sessionId, auth);
    }

    // Create MCP server for this session
    const server = new Server(
      {
        name: config.server.name,
        version: config.server.version
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    // Register handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: registerTools() };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Tool calls REQUIRE authentication
      const sessionAuth = sessionAuthMap.get(sessionId);
      if (!sessionAuth) {
        // Return error that triggers OAuth flow
        throw new Error('Authentication required. Please authorize with your Kimai credentials.');
      }

      const createKimaiClient = () => {
        return new KimaiClient({
          baseUrl: sessionAuth.kimaiUrl,
          token: sessionAuth.kimaiToken,
          email: sessionAuth.kimaiEmail
        });
      };

      const context = { config, createKimaiClient };
      return handleToolCall(request.params.name, request.params.arguments || {}, context);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return registerResources();
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const sessionAuth = sessionAuthMap.get(sessionId);
      if (!sessionAuth) {
        throw new Error('Authentication required. Please authorize with your Kimai credentials.');
      }

      const createKimaiClient = () => {
        return new KimaiClient({
          baseUrl: sessionAuth.kimaiUrl,
          token: sessionAuth.kimaiToken,
          email: sessionAuth.kimaiEmail
        });
      };

      const context = { config, createKimaiClient };
      return handleResourceRead(request.params.uri, context);
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: registerPrompts() };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const sessionAuth = sessionAuthMap.get(sessionId);
      if (!sessionAuth) {
        throw new Error('Authentication required. Please authorize with your Kimai credentials.');
      }

      const createKimaiClient = () => {
        return new KimaiClient({
          baseUrl: sessionAuth.kimaiUrl,
          token: sessionAuth.kimaiToken,
          email: sessionAuth.kimaiEmail
        });
      };

      const context = { config, createKimaiClient };
      return handlePromptGet(request.params.name, request.params.arguments || {}, context);
    });

    // Connect server to transport
    await server.connect(transport);

    // Return session ID in header
    res.setHeader('Mcp-Session-Id', sessionId);

    // Handle SSE connection
    transport.handleSseConnection(req, res);

    // Clean up on disconnect
    transport.onclose = () => {
      console.log(`[HTTP] MCP session closed: ${sessionId}`);
      sessionAuthMap.delete(sessionId);
    };
  };

  app.get('/mcp', mcpGetHandler);
  app.get('/', mcpGetHandler);

  // MCP message endpoint (POST) - Auth checked per-message
  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId) {
      res.status(400).json({
        error: 'Missing Mcp-Session-Id header'
      });
      return;
    }

    const transport = sessionManager.getSession(sessionId);

    if (!transport) {
      res.status(404).json({
        error: 'Session not found. Please reconnect.'
      });
      return;
    }

    // Check for auth token and update session auth if provided
    const auth = extractAuth(req);
    if (auth) {
      sessionAuthMap.set(sessionId, auth);
      console.log(`[HTTP] Session ${sessionId} authenticated for user ${auth.userId}`);
    }

    try {
      const message = req.body as JSONRPCMessage;
      await transport.handleMessage(message);
      res.status(202).json({ status: 'accepted' });
    } catch (error) {
      console.error('Error handling MCP message:', error);
      res.status(500).json({
        error: 'Failed to process message'
      });
    }
  };

  app.post('/mcp', mcpPostHandler);
  app.post('/', mcpPostHandler);

  // Documentation page
  app.get('/docs', (_req: Request, res: Response) => {
    res.type('html').send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${config.server.name} - MCP Server</title>
        <style>
          body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
          h1 { color: #333; }
          code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
          pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
          .endpoint { margin: 20px 0; padding: 16px; background: #f9f9f9; border-radius: 8px; border-left: 4px solid #667eea; }
          .method { font-weight: bold; color: #667eea; }
        </style>
      </head>
      <body>
        <h1>${config.server.name}</h1>
        <p>Remote MCP server for Kimai time tracking integration with Claude.</p>
        <p><strong>Version:</strong> ${config.server.version}</p>

        <h2>Endpoints</h2>

        <div class="endpoint">
          <span class="method">GET</span> <code>/.well-known/oauth-protected-resource</code>
          <p>OAuth resource metadata for client discovery</p>
        </div>

        <div class="endpoint">
          <span class="method">GET</span> <code>/.well-known/oauth-authorization-server</code>
          <p>OAuth server metadata</p>
        </div>

        <div class="endpoint">
          <span class="method">GET</span> <code>/authorize</code>
          <p>Authorization page - enter your Kimai credentials here</p>
        </div>

        <div class="endpoint">
          <span class="method">POST</span> <code>/token</code>
          <p>Exchange authorization code for access tokens</p>
        </div>

        <div class="endpoint">
          <span class="method">GET</span> <code>/mcp</code>
          <p>MCP SSE connection (auth optional for connection, required for tools)</p>
        </div>

        <div class="endpoint">
          <span class="method">POST</span> <code>/mcp</code>
          <p>Send MCP messages (include Bearer token for authenticated operations)</p>
        </div>

        <h2>Usage</h2>
        <p>Add this server URL to your Claude MCP configuration:</p>
        <pre>${config.http!.baseUrl}</pre>
        <p>Claude will guide you through the OAuth authorization process.</p>

        <h2>Available Tools</h2>
        <ul>
          <li><strong>kimai_query</strong> - Query projects, activities, and time entries</li>
          <li><strong>kimai_log</strong> - Create time entries</li>
          <li><strong>kimai_manage</strong> - Update or delete time entries</li>
        </ul>
      </body>
      </html>
    `);
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  const server = app.listen(config.http.port, config.http.host, () => {
    console.log(`[${config.server.name}] HTTP MCP server started`);
    console.log(`  Mode: http`);
    console.log(`  URL: ${config.http!.baseUrl}`);
    console.log(`  Health: ${config.http!.baseUrl}/health`);
    console.log(`  Docs: ${config.http!.baseUrl}/docs`);
    console.log(`  Rate limit: ${config.http!.rateLimitPerMinute} req/min`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await sessionManager.closeAll();
    closeDatabase();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
