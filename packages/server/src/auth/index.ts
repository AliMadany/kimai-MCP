// Auth module exports
export { AuthDatabase, getDatabase, initDatabase, closeDatabase } from './database.js';
export type { User, KimaiCredentials, OAuthToken, AuthCode } from './database.js';

export { encrypt, decrypt, generateSecureToken, sha256, verifyPKCE, generatePKCE } from './crypto.js';

export { createOAuthMetadataRouter } from './oauth-metadata.js';
export { createOAuthRouter, getUserKimaiCredentials } from './oauth.js';

export { authMiddleware, requireScopes, optionalAuthMiddleware } from './middleware.js';
export type { AuthenticatedRequest } from './middleware.js';
