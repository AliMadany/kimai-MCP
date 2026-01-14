#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, validateConfig, getSafeConfigForLogging } from './config.js';
import { registerTools, handleToolCall } from './tools/index.js';
import { registerResources, handleResourceRead } from './resources/index.js';
import { registerPrompts, handlePromptGet } from './prompts/index.js';
import { KimaiClient } from '@urtime/shared';
import { createHttpServer } from './http/server.js';

/**
 * Main entry point for the MCP server
 *
 * This server provides Kimai time tracking integration for Claude.
 * Claude handles all natural language parsing - tools accept structured data.
 *
 * Modes:
 * - stdio (default): Local MCP server via stdin/stdout for Claude Desktop
 * - http: Remote MCP server via HTTP/SSE with OAuth authentication
 */
async function main() {
  // Load configuration
  const config = loadConfig();
  const validation = validateConfig(config);

  // Log configuration (safe version)
  if (config.logging.level === 'debug') {
    console.error('Configuration:', JSON.stringify(getSafeConfigForLogging(config), null, 2));
  }

  // Handle validation errors
  if (!validation.valid) {
    console.error('Configuration errors:');
    validation.errors.forEach(err => console.error(`  ✘ ${err}`));
    process.exit(1);
  }

  // Log warnings
  if (validation.warnings.length > 0) {
    console.error('Configuration warnings:');
    validation.warnings.forEach(warn => console.error(`  ⚠ ${warn}`));
  }

  // Run in appropriate mode
  if (config.mode === 'http') {
    await runHttpServer(config);
  } else {
    await runStdioServer(config);
  }
}

/**
 * Run the MCP server in HTTP mode (remote)
 */
async function runHttpServer(config: ReturnType<typeof loadConfig>) {
  if (!config.http) {
    console.error('HTTP configuration is missing');
    process.exit(1);
  }

  await createHttpServer(config);
}

/**
 * Run the MCP server in stdio mode (local)
 */
async function runStdioServer(config: ReturnType<typeof loadConfig>) {
  // Create MCP server
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

  // Factory function to create Kimai client (token/email can come from env or per-request)
  const createKimaiClient = (token?: string, email?: string) => {
    const effectiveToken = token || config.kimai.token;
    const effectiveEmail = email || config.kimai.email;
    if (!effectiveToken) {
      throw new Error('Kimai token is required. Set KIMAI_TOKEN environment variable or pass kimai_token parameter.');
    }
    return new KimaiClient({
      baseUrl: config.kimai.baseUrl,
      token: effectiveToken,
      email: effectiveEmail
    });
  };

  // Shared context for all handlers
  const context = {
    config,
    createKimaiClient
  };

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: registerTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleToolCall(request.params.name, request.params.arguments || {}, context);
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return registerResources();
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleResourceRead(request.params.uri, context);
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: registerPrompts() };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return handlePromptGet(request.params.name, request.params.arguments || {}, context);
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup to stderr
  console.error(`[${config.server.name}] MCP server started (stdio mode)`);
  console.error(`  Kimai URL: ${config.kimai.baseUrl}`);
  console.error(`  Auth: ${config.kimai.email ? 'X-AUTH headers' : 'Bearer token'}`);
}

// Run the server
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
