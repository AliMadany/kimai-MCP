import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { KimaiClient } from '@urtime/shared';
import type { ServerConfig } from '../config.js';
import { registerTools, handleToolCall } from '../tools/index.js';
import { registerResources, handleResourceRead } from '../resources/index.js';
import { registerPrompts, handlePromptGet } from '../prompts/index.js';
import { createOAuthMetadataRouter } from '../auth/oauth-metadata.js';
import { createOAuthRouter, getUserKimaiCredentials } from '../auth/oauth.js';
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

// Map to store transports and auth per session
const transports = new Map<string, StreamableHTTPServerTransport>();
const sessionAuthMap = new Map<string, SessionAuth>();

/**
 * Create and start the HTTP server for remote MCP access
 */
export async function createHttpServer(config: ServerConfig): Promise<void> {
  if (!config.http) {
    throw new Error('HTTP configuration is required for HTTP mode');
  }

  const app = express();

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

  // Body parsing - needed before MCP handler
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Accept');
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
    const now = Date.now();
    res.json({
      status: 'ok',
      server: config.server.name,
      version: config.server.version,
      mode: 'http',
      sessions: transports.size,
      server_time: new Date(now).toISOString(),
      server_time_ms: now
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
   * Create MCP server with handlers
   */
  function createMcpServer(getSessionAuth: () => SessionAuth | undefined) {
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
      const sessionAuth = getSessionAuth();
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
      return handleToolCall(request.params.name, request.params.arguments || {}, context);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return registerResources();
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const sessionAuth = getSessionAuth();
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
      const sessionAuth = getSessionAuth();
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

    return server;
  }

  /**
   * MCP endpoint handler - handles both GET and POST
   * Returns 401 with WWW-Authenticate header to trigger OAuth flow
   */
  const mcpHandler = async (req: Request, res: Response) => {
    // Extract session ID from header
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Extract auth if provided
    const auth = extractAuth(req);

    // Helper to return 401 with OAuth challenge (MCP spec format)
    const return401 = () => {
      res.setHeader('WWW-Authenticate', `Bearer realm="mcp", resource_metadata="${config.http!.baseUrl}/.well-known/oauth-protected-resource"`);
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required. Please complete OAuth authorization.'
      });
    };

    // Handle DELETE for session termination
    if (req.method === 'DELETE') {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.close();
        transports.delete(sessionId);
        sessionAuthMap.delete(sessionId);
        res.status(200).json({ status: 'session terminated' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
      return;
    }

    // For existing sessions
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;

      // Require auth for existing sessions (except for tools/list which is needed for discovery)
      const isListRequest = req.body?.method === 'tools/list' ||
                           req.body?.method === 'resources/list' ||
                           req.body?.method === 'prompts/list';

      if (!auth && !sessionAuthMap.has(sessionId) && !isListRequest) {
        console.log(`[HTTP] Session ${sessionId} requires authentication for ${req.body?.method}`);
        return401();
        return;
      }

      // Update auth if provided
      if (auth) {
        sessionAuthMap.set(sessionId, auth);
        console.log(`[HTTP] Session ${sessionId} authenticated for user ${auth.userId}`);
      }

      // Handle the request with the existing transport
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // For new sessions (initialization) - only on POST with initialize request
    if (req.method === 'POST' && req.body?.method === 'initialize') {
      // Allow initialize without auth - Claude discovers OAuth via /.well-known/oauth-authorization-server
      // Auth will be required for tool calls
      const newSessionId = randomUUID();

      console.log(`[HTTP] New MCP session: ${newSessionId}${auth ? ` for user ${auth.userId}` : ' (unauthenticated)'}`);

      // Store auth if provided
      if (auth) {
        sessionAuthMap.set(newSessionId, auth);
      }

      // Create transport with session ID generator
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId
      });

      // Create MCP server for this session
      const getSessionAuth = () => sessionAuthMap.get(newSessionId);
      const server = createMcpServer(getSessionAuth);

      // Connect server to transport
      await server.connect(transport);

      // Store transport
      transports.set(newSessionId, transport);

      // Handle cleanup on close
      transport.onclose = () => {
        console.log(`[HTTP] MCP session closed: ${newSessionId}`);
        transports.delete(newSessionId);
        sessionAuthMap.delete(newSessionId);
      };

      // Handle the initialize request
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // If no session and not initialize, return error
    if (req.method === 'POST') {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: Session not found. Send initialize request first.'
        },
        id: req.body?.id || null
      });
      return;
    }

    // GET without session - return 400
    res.status(400).json({
      error: 'Session ID required. Initialize a session first with POST.'
    });
  };

  // MCP endpoints - single path handles GET, POST, DELETE
  app.all('/mcp', mcpHandler);
  app.all('/', (req, res, next) => {
    // Only handle MCP requests on root, not other paths
    if (req.method === 'GET' && !req.headers.accept?.includes('text/event-stream') && !req.headers['mcp-session-id']) {
      // Redirect to docs for browser access
      res.redirect('/docs');
      return;
    }
    mcpHandler(req, res);
  });

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
          <span class="method">GET/POST</span> <code>/mcp</code>
          <p>MCP Streamable HTTP endpoint</p>
        </div>

        <h2>Usage</h2>
        <p>Add this server URL to your Claude MCP configuration:</p>
        <pre>${config.http!.baseUrl}/mcp</pre>
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
  const httpServer = app.listen(config.http.port, config.http.host, () => {
    console.log(`[${config.server.name}] HTTP MCP server started`);
    console.log(`  Mode: http`);
    console.log(`  URL: ${config.http!.baseUrl}`);
    console.log(`  MCP: ${config.http!.baseUrl}/mcp`);
    console.log(`  Health: ${config.http!.baseUrl}/health`);
    console.log(`  Docs: ${config.http!.baseUrl}/docs`);
    console.log(`  Rate limit: ${config.http!.rateLimitPerMinute} req/min`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    // Close all transports
    for (const [sessionId, transport] of transports) {
      try {
        await transport.close();
      } catch {
        // Ignore errors during shutdown
      }
      transports.delete(sessionId);
    }
    closeDatabase();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
