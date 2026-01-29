import { Router, Request, Response } from 'express';

/**
 * Create OAuth metadata routes
 * These endpoints are required by the MCP OAuth specification
 */
export function createOAuthMetadataRouter(baseUrl: string): Router {
  const router = Router();

  /**
   * OAuth Protected Resource Metadata (RFC 9728)
   * Tells clients which authorization server to use
   */
  router.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    res.json({
      resource: baseUrl,
      authorization_servers: [baseUrl],
      scopes_supported: ['kimai:read', 'kimai:write'],
      bearer_methods_supported: ['header']
    });
  });

  /**
   * OAuth Authorization Server Metadata (RFC 8414)
   * Tells clients about the authorization server capabilities
   */
  router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      scopes_supported: ['kimai:read', 'kimai:write'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      service_documentation: `${baseUrl}/docs`
    });
  });

  /**
   * OpenID Connect Discovery (alternative endpoint)
   * Some clients may look for this instead
   */
  router.get('/.well-known/openid-configuration', (_req: Request, res: Response) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      scopes_supported: ['kimai:read', 'kimai:write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none']
    });
  });

  return router;
}
