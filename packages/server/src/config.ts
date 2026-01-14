import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file from package root
dotenvConfig({ path: resolve(__dirname, '../.env') });

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * Server mode: stdio for local, http for remote
 */
export type ServerMode = 'stdio' | 'http';

/**
 * HTTP server configuration schema
 */
export const HttpConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3002),
  host: z.string().default('0.0.0.0'),
  baseUrl: z.string().url(),
  corsOrigins: z.string().default('*'),
  rateLimitPerMinute: z.number().min(1).default(100)
});

/**
 * Security configuration schema
 */
export const SecurityConfigSchema = z.object({
  encryptionKey: z.string().min(32).optional(),
  accessTokenExpiry: z.number().min(60).default(3600),        // 1 hour
  refreshTokenExpiry: z.number().min(3600).default(2592000),  // 30 days
  authCodeExpiry: z.number().min(60).default(600)             // 10 minutes
});

/**
 * Kimai configuration schema
 */
export const KimaiConfigSchema = z.object({
  baseUrl: z.string().url().default('https://demo.kimai.org'),
  token: z.string().optional(),
  email: z.string().email().optional()
});

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z.object({
  path: z.string().default('./data/auth.db')
});

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  requests: z.boolean().default(true)
});

/**
 * Server identity schema
 */
export const ServerIdentitySchema = z.object({
  name: z.string().default('urtime-kimai'),
  version: z.string().default('1.0.0')
});

/**
 * Complete server configuration schema
 */
export const ServerConfigSchema = z.object({
  mode: z.enum(['stdio', 'http']).default('stdio'),
  server: ServerIdentitySchema,
  http: HttpConfigSchema.optional(),
  security: SecurityConfigSchema,
  database: DatabaseConfigSchema,
  kimai: KimaiConfigSchema,
  logging: LoggingConfigSchema
});

export type HttpConfig = z.infer<typeof HttpConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type KimaiConfig = z.infer<typeof KimaiConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type ServerIdentity = z.infer<typeof ServerIdentitySchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// =============================================================================
// Configuration Loading
// =============================================================================

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Determine server mode from environment
 */
function getServerMode(): ServerMode {
  const mode = process.env.MCP_MODE?.toLowerCase();
  if (mode === 'http') return 'http';

  // Also check legacy environment variable
  if (process.env.MCP_HTTP_MODE === 'true') return 'http';

  // Check command line argument
  if (process.argv.includes('--http')) return 'http';

  return 'stdio';
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  const mode = getServerMode();

  // Build HTTP config only if in HTTP mode
  const httpConfig = mode === 'http' ? {
    port: parseNumber(process.env.HTTP_PORT || process.env.MCP_HTTP_PORT, 3002),
    host: process.env.HTTP_HOST || process.env.MCP_HTTP_HOST || '0.0.0.0',
    baseUrl: process.env.HTTP_BASE_URL || process.env.MCP_BASE_URL || `http://localhost:${process.env.HTTP_PORT || process.env.MCP_HTTP_PORT || 3002}`,
    corsOrigins: process.env.CORS_ALLOWED_ORIGINS || '*',
    rateLimitPerMinute: parseNumber(process.env.RATE_LIMIT_PER_MINUTE, 100)
  } : undefined;

  const config = {
    mode,
    server: {
      name: process.env.MCP_SERVER_NAME || 'urtime-kimai',
      version: process.env.MCP_SERVER_VERSION || '1.0.0'
    },
    http: httpConfig,
    security: {
      encryptionKey: process.env.ENCRYPTION_KEY,
      accessTokenExpiry: parseNumber(process.env.OAUTH_ACCESS_TOKEN_EXPIRY, 3600),
      refreshTokenExpiry: parseNumber(process.env.OAUTH_REFRESH_TOKEN_EXPIRY, 2592000),
      authCodeExpiry: parseNumber(process.env.OAUTH_AUTH_CODE_EXPIRY, 600)
    },
    database: {
      path: process.env.DATABASE_PATH || './data/auth.db'
    },
    kimai: {
      baseUrl: process.env.KIMAI_BASE_URL || 'https://demo.kimai.org',
      token: process.env.KIMAI_TOKEN,
      email: process.env.KIMAI_EMAIL
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
      requests: parseBoolean(process.env.LOG_REQUESTS, true)
    }
  };

  return ServerConfigSchema.parse(config);
}

// =============================================================================
// Configuration Validation
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate configuration for the current mode
 */
export function validateConfig(config: ServerConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // HTTP mode specific validation
  if (config.mode === 'http') {
    // Encryption key is required for HTTP mode
    if (!config.security.encryptionKey) {
      errors.push('ENCRYPTION_KEY is required for HTTP mode. Generate with: openssl rand -hex 32');
    } else if (config.security.encryptionKey.length < 32) {
      errors.push('ENCRYPTION_KEY must be at least 32 characters');
    }

    // Check HTTP config exists
    if (!config.http) {
      errors.push('HTTP configuration is missing');
    } else {
      // Warn about non-HTTPS in production
      if (!config.http.baseUrl.startsWith('https://')) {
        warnings.push('HTTP_BASE_URL is not using HTTPS. This is required for production OAuth.');
      }

      // Warn about wildcard CORS
      if (config.http.corsOrigins === '*') {
        warnings.push('CORS_ALLOWED_ORIGINS is set to *. Consider restricting this in production.');
      }
    }
  }

  // Stdio mode specific validation
  if (config.mode === 'stdio') {
    // Token is optional but warn if missing
    if (!config.kimai.token) {
      warnings.push('KIMAI_TOKEN is not set. Users will need to provide tokens per-request.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// =============================================================================
// Configuration Display
// =============================================================================

/**
 * Get a safe representation of config for logging (masks sensitive values)
 */
export function getSafeConfigForLogging(config: ServerConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    server: config.server,
    http: config.http ? {
      port: config.http.port,
      host: config.http.host,
      baseUrl: config.http.baseUrl,
      corsOrigins: config.http.corsOrigins,
      rateLimitPerMinute: config.http.rateLimitPerMinute
    } : undefined,
    security: {
      encryptionKey: config.security.encryptionKey ? '***SET***' : '***NOT SET***',
      accessTokenExpiry: config.security.accessTokenExpiry,
      refreshTokenExpiry: config.security.refreshTokenExpiry,
      authCodeExpiry: config.security.authCodeExpiry
    },
    database: config.database,
    kimai: {
      baseUrl: config.kimai.baseUrl,
      token: config.kimai.token ? '***SET***' : '***NOT SET***',
      email: config.kimai.email || '***NOT SET***'
    },
    logging: config.logging
  };
}
