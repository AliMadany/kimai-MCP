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
import { createOAuthRouter } from '../auth/oauth.js';
import { authMiddleware, AuthenticatedRequest } from '../auth/middleware.js';
import { HttpSseTransport, SessionManager } from './sse-transport.js';
import { initDatabase, closeDatabase } from '../auth/database.js';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  await initDatabase(dbPath);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Session-Id');

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

  // MCP SSE connection (requires auth)
  app.get('/mcp', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Create a new MCP session
    const transport = sessionManager.createSession();
    const sessionId = transport.getSessionId();

    console.log(`[HTTP] New MCP session: ${sessionId} for user ${req.auth.userId}`);

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

    // Create Kimai client factory using the user's credentials
    const createKimaiClient = () => {
      return new KimaiClient({
        baseUrl: req.auth!.kimaiUrl,
        token: req.auth!.kimaiToken,
        email: req.auth!.kimaiEmail
      });
    };

    // Context for handlers
    const context = {
      config,
      createKimaiClient
    };

    // Register handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: registerTools() };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return handleToolCall(request.params.name, request.params.arguments || {}, context);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return registerResources();
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return handleResourceRead(request.params.uri, context);
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: registerPrompts() };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return handlePromptGet(request.params.name, request.params.arguments || {}, context);
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle SSE connection
    transport.handleSseConnection(req, res);

    // Clean up on disconnect
    transport.onclose = () => {
      console.log(`[HTTP] MCP session closed: ${sessionId}`);
    };
  });

  // MCP message endpoint (POST)
  app.post('/mcp', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.headers['x-mcp-session-id'] as string;

    if (!sessionId) {
      res.status(400).json({
        error: 'Missing X-MCP-Session-Id header'
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
          <span class="method">GET</span> <code>/mcp</code>
          <p>MCP SSE connection (requires Bearer token)</p>
        </div>

        <div class="endpoint">
          <span class="method">POST</span> <code>/mcp</code>
          <p>Send MCP messages (requires Bearer token)</p>
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
