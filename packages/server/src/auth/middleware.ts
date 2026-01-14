import { Request, Response, NextFunction } from 'express';
import { getDatabase } from './database.js';
import { getUserKimaiCredentials } from './oauth.js';

/**
 * Extended Request type with auth context
 */
export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    scopes: string[];
    kimaiUrl: string;
    kimaiToken: string;
    kimaiEmail?: string;
  };
}

/**
 * Authentication middleware that validates OAuth Bearer tokens
 * and injects Kimai credentials into the request
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // No auth header - return 401 with OAuth metadata URL
  if (!authHeader) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Bearer token required'
    });
    return;
  }

  // Parse Bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid authorization header format. Use: Bearer <token>'
    });
    return;
  }

  const accessToken = parts[1];

  // Look up the token
  const db = getDatabase();
  const tokenRecord = db.getOAuthToken(accessToken);

  if (!tokenRecord) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token not found or expired'
    });
    return;
  }

  // Check expiration
  if (tokenRecord.expires_at < Date.now()) {
    // Clean up expired token
    db.deleteOAuthToken(accessToken);
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token has expired'
    });
    return;
  }

  // Get Kimai credentials
  const kimaiCreds = getUserKimaiCredentials(tokenRecord.user_id);

  if (!kimaiCreds) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'User credentials not found'
    });
    return;
  }

  // Attach auth context to request
  req.auth = {
    userId: tokenRecord.user_id,
    scopes: tokenRecord.scopes.split(' '),
    kimaiUrl: kimaiCreds.kimaiUrl,
    kimaiToken: kimaiCreds.kimaiToken,
    kimaiEmail: kimaiCreds.kimaiEmail
  };

  next();
}

/**
 * Middleware to check if specific scopes are present
 */
export function requireScopes(...requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      });
      return;
    }

    const missingScopes = requiredScopes.filter(s => !req.auth!.scopes.includes(s));

    if (missingScopes.length > 0) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.setHeader(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", ` +
        `scope="${requiredScopes.join(' ')}", ` +
        `resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", ` +
        `error_description="Missing scopes: ${missingScopes.join(', ')}"`
      );
      res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Missing scopes: ${missingScopes.join(', ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Optional auth middleware - doesn't require auth but attaches it if present
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  // Try to authenticate but don't fail if it doesn't work
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    next();
    return;
  }

  const accessToken = parts[1];
  const db = getDatabase();
  const tokenRecord = db.getOAuthToken(accessToken);

  if (!tokenRecord || tokenRecord.expires_at < Date.now()) {
    next();
    return;
  }

  const kimaiCreds = getUserKimaiCredentials(tokenRecord.user_id);

  if (kimaiCreds) {
    req.auth = {
      userId: tokenRecord.user_id,
      scopes: tokenRecord.scopes.split(' '),
      kimaiUrl: kimaiCreds.kimaiUrl,
      kimaiToken: kimaiCreds.kimaiToken,
      kimaiEmail: kimaiCreds.kimaiEmail
    };
  }

  next();
}
