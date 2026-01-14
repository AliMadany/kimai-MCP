import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KimaiClient } from '@urtime/shared';
import { getDatabase } from './database.js';
import { encrypt, decrypt, generateSecureToken, verifyPKCE } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Token expiry times
const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

/**
 * Create OAuth routes for authorization and token exchange
 */
export function createOAuthRouter(baseUrl: string): Router {
  const router = Router();
  const db = getDatabase();

  // Load the authorize HTML template
  const authorizeHtmlPath = path.join(__dirname, 'pages/authorize.html');
  let authorizeHtml: string;

  try {
    authorizeHtml = readFileSync(authorizeHtmlPath, 'utf-8');
  } catch {
    authorizeHtml = '<html><body><h1>Authorization page not found</h1></body></html>';
  }

  /**
   * GET /authorize - Display the authorization page
   * OAuth clients redirect users here to authorize
   */
  router.get('/authorize', (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      code_challenge,
      code_challenge_method,
      scope
    } = req.query;

    // Validate required OAuth parameters
    if (response_type !== 'code') {
      return res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only "code" response type is supported'
      });
    }

    if (!client_id || !redirect_uri) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id and redirect_uri are required'
      });
    }

    if (!code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'PKCE code_challenge is required'
      });
    }

    if (code_challenge_method && code_challenge_method !== 'S256') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported'
      });
    }

    // Render the authorization page with OAuth params
    const html = authorizeHtml
      .replace('{{CLIENT_ID}}', String(client_id))
      .replace('{{REDIRECT_URI}}', String(redirect_uri))
      .replace('{{STATE}}', String(state || ''))
      .replace('{{CODE_CHALLENGE}}', String(code_challenge))
      .replace('{{SCOPE}}', String(scope || 'kimai:read kimai:write'));

    res.type('html').send(html);
  });

  /**
   * POST /authorize - Process the authorization form
   * Validates Kimai credentials and issues an authorization code
   */
  router.post('/authorize', async (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      scope,
      kimai_url,
      kimai_token,
      kimai_email
    } = req.body;

    // Validate required fields
    if (!kimai_url || !kimai_token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Kimai URL and token are required'
      });
    }

    if (!client_id || !redirect_uri || !code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required OAuth parameters'
      });
    }

    try {
      // Verify Kimai credentials by making a test request
      const kimaiClient = new KimaiClient({
        baseUrl: kimai_url,
        token: kimai_token,
        email: kimai_email
      });

      const connectionTest = await kimaiClient.testConnection();
      if (!connectionTest.success) {
        return res.status(400).json({
          error: 'invalid_credentials',
          error_description: 'Could not connect to Kimai: ' + connectionTest.error
        });
      }

      // Encrypt the Kimai token
      const encryptedToken = encrypt(kimai_token);

      // Check if user already exists with these credentials
      let userId = db.findUserByKimaiCredentials(kimai_url, encryptedToken);

      if (!userId) {
        // Create new user
        const user = db.createUser();
        userId = user.id;
      }

      // Save/update Kimai credentials
      db.saveKimaiCredentials(userId, kimai_url, encryptedToken, kimai_email);

      // Generate authorization code
      const authCode = generateSecureToken(32);

      // Save auth code
      db.saveAuthCode({
        code: authCode,
        user_id: userId,
        client_id: String(client_id),
        redirect_uri: String(redirect_uri),
        scopes: String(scope || 'kimai:read kimai:write'),
        code_challenge: String(code_challenge),
        expires_at: Date.now() + AUTH_CODE_EXPIRY
      });

      // Redirect back to client with auth code
      const redirectUrl = new URL(String(redirect_uri));
      redirectUrl.searchParams.set('code', authCode);
      if (state) {
        redirectUrl.searchParams.set('state', String(state));
      }

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to process authorization'
      });
    }
  });

  /**
   * POST /token - Exchange authorization code for tokens
   * Or refresh tokens using a refresh token
   */
  router.post('/token', async (req: Request, res: Response) => {
    const { grant_type, code, code_verifier, refresh_token, client_id } = req.body;

    try {
      if (grant_type === 'authorization_code') {
        // Exchange auth code for tokens
        if (!code || !code_verifier) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'code and code_verifier are required'
          });
        }

        // Get and validate auth code
        const authCode = db.getAuthCode(String(code));
        if (!authCode) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code'
          });
        }

        // Check expiration
        if (authCode.expires_at < Date.now()) {
          db.deleteAuthCode(String(code));
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code has expired'
          });
        }

        // Verify PKCE
        if (!verifyPKCE(String(code_verifier), authCode.code_challenge)) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid code_verifier'
          });
        }

        // Delete the auth code (single use)
        db.deleteAuthCode(String(code));

        // Generate tokens
        const accessToken = generateSecureToken(32);
        const newRefreshToken = generateSecureToken(32);

        // Save token
        db.saveOAuthToken({
          access_token: accessToken,
          refresh_token: newRefreshToken,
          user_id: authCode.user_id,
          scopes: authCode.scopes,
          expires_at: Date.now() + ACCESS_TOKEN_EXPIRY,
          refresh_expires_at: Date.now() + REFRESH_TOKEN_EXPIRY
        });

        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
          refresh_token: newRefreshToken,
          scope: authCode.scopes
        });

      } else if (grant_type === 'refresh_token') {
        // Refresh token flow
        if (!refresh_token) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'refresh_token is required'
          });
        }

        // Get existing token
        const existingToken = db.getOAuthTokenByRefresh(String(refresh_token));
        if (!existingToken) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid refresh token'
          });
        }

        // Check refresh token expiration
        if (existingToken.refresh_expires_at && existingToken.refresh_expires_at < Date.now()) {
          db.deleteOAuthToken(existingToken.access_token);
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Refresh token has expired'
          });
        }

        // Delete old token
        db.deleteOAuthToken(existingToken.access_token);

        // Generate new tokens (rotate refresh token for security)
        const newAccessToken = generateSecureToken(32);
        const newRefreshToken = generateSecureToken(32);

        // Save new token
        db.saveOAuthToken({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          user_id: existingToken.user_id,
          scopes: existingToken.scopes,
          expires_at: Date.now() + ACCESS_TOKEN_EXPIRY,
          refresh_expires_at: Date.now() + REFRESH_TOKEN_EXPIRY
        });

        res.json({
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
          refresh_token: newRefreshToken,
          scope: existingToken.scopes
        });

      } else {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code and refresh_token grants are supported'
        });
      }
    } catch (error) {
      console.error('Token endpoint error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to process token request'
      });
    }
  });

  /**
   * POST /test-connection - Test Kimai credentials (called from authorize page)
   */
  router.post('/test-connection', async (req: Request, res: Response) => {
    const { kimai_url, kimai_token, kimai_email } = req.body;

    if (!kimai_url || !kimai_token) {
      return res.status(400).json({
        success: false,
        error: 'Kimai URL and token are required'
      });
    }

    try {
      const kimaiClient = new KimaiClient({
        baseUrl: kimai_url,
        token: kimai_token,
        email: kimai_email
      });

      const result = await kimaiClient.testConnection();

      if (result.success) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: result.error });
      }
    } catch (error) {
      res.json({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  });

  return router;
}

/**
 * Get Kimai credentials for a user
 * Used by auth middleware to inject credentials into requests
 */
export function getUserKimaiCredentials(userId: string): {
  kimaiUrl: string;
  kimaiToken: string;
  kimaiEmail?: string;
} | null {
  const db = getDatabase();
  const creds = db.getKimaiCredentials(userId);

  if (!creds) {
    return null;
  }

  return {
    kimaiUrl: creds.kimai_url,
    kimaiToken: decrypt(creds.kimai_token_encrypted),
    kimaiEmail: creds.kimai_email || undefined
  };
}
