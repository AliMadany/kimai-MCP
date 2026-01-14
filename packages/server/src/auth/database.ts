import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface User {
  id: string;
  created_at: number;
}

export interface KimaiCredentials {
  user_id: string;
  kimai_url: string;
  kimai_token_encrypted: string;
  kimai_email: string | null;
  verified_at: number;
}

export interface OAuthToken {
  access_token: string;
  refresh_token: string | null;
  user_id: string;
  scopes: string;
  expires_at: number;
  refresh_expires_at: number | null;
}

export interface AuthCode {
  code: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  scopes: string;
  code_challenge: string;
  expires_at: number;
}

export class AuthDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, '../../data/auth.db');
    this.db = new Database(dbPath || defaultPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kimai_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        kimai_url TEXT NOT NULL,
        kimai_token_encrypted TEXT NOT NULL,
        kimai_email TEXT,
        verified_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_tokens (
        access_token TEXT PRIMARY KEY,
        refresh_token TEXT UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scopes TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        refresh_expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS auth_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        scopes TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_refresh ON oauth_tokens(refresh_token);
      CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes(expires_at);
    `);
  }

  // User operations
  createUser(): User {
    const user: User = {
      id: randomUUID(),
      created_at: Date.now()
    };

    this.db.prepare(`
      INSERT INTO users (id, created_at) VALUES (?, ?)
    `).run(user.id, user.created_at);

    return user;
  }

  getUser(id: string): User | null {
    return this.db.prepare(`
      SELECT id, created_at FROM users WHERE id = ?
    `).get(id) as User | null;
  }

  // Kimai credentials operations
  saveKimaiCredentials(
    userId: string,
    kimaiUrl: string,
    encryptedToken: string,
    kimaiEmail?: string
  ): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO kimai_credentials
      (user_id, kimai_url, kimai_token_encrypted, kimai_email, verified_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, kimaiUrl, encryptedToken, kimaiEmail || null, Date.now());
  }

  getKimaiCredentials(userId: string): KimaiCredentials | null {
    return this.db.prepare(`
      SELECT user_id, kimai_url, kimai_token_encrypted, kimai_email, verified_at
      FROM kimai_credentials WHERE user_id = ?
    `).get(userId) as KimaiCredentials | null;
  }

  // Find user by Kimai URL and encrypted token (for re-auth)
  findUserByKimaiCredentials(kimaiUrl: string, encryptedToken: string): string | null {
    const result = this.db.prepare(`
      SELECT user_id FROM kimai_credentials
      WHERE kimai_url = ? AND kimai_token_encrypted = ?
    `).get(kimaiUrl, encryptedToken) as { user_id: string } | undefined;

    return result?.user_id || null;
  }

  // OAuth token operations
  saveOAuthToken(token: OAuthToken): void {
    this.db.prepare(`
      INSERT INTO oauth_tokens
      (access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      token.access_token,
      token.refresh_token,
      token.user_id,
      token.scopes,
      token.expires_at,
      token.refresh_expires_at
    );
  }

  getOAuthToken(accessToken: string): OAuthToken | null {
    return this.db.prepare(`
      SELECT access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at
      FROM oauth_tokens WHERE access_token = ?
    `).get(accessToken) as OAuthToken | null;
  }

  getOAuthTokenByRefresh(refreshToken: string): OAuthToken | null {
    return this.db.prepare(`
      SELECT access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at
      FROM oauth_tokens WHERE refresh_token = ?
    `).get(refreshToken) as OAuthToken | null;
  }

  deleteOAuthToken(accessToken: string): void {
    this.db.prepare(`
      DELETE FROM oauth_tokens WHERE access_token = ?
    `).run(accessToken);
  }

  deleteExpiredTokens(): number {
    const result = this.db.prepare(`
      DELETE FROM oauth_tokens WHERE expires_at < ?
    `).run(Date.now());
    return result.changes;
  }

  // Auth code operations
  saveAuthCode(authCode: AuthCode): void {
    this.db.prepare(`
      INSERT INTO auth_codes
      (code, user_id, client_id, redirect_uri, scopes, code_challenge, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      authCode.code,
      authCode.user_id,
      authCode.client_id,
      authCode.redirect_uri,
      authCode.scopes,
      authCode.code_challenge,
      authCode.expires_at
    );
  }

  getAuthCode(code: string): AuthCode | null {
    return this.db.prepare(`
      SELECT code, user_id, client_id, redirect_uri, scopes, code_challenge, expires_at
      FROM auth_codes WHERE code = ?
    `).get(code) as AuthCode | null;
  }

  deleteAuthCode(code: string): void {
    this.db.prepare(`
      DELETE FROM auth_codes WHERE code = ?
    `).run(code);
  }

  deleteExpiredAuthCodes(): number {
    const result = this.db.prepare(`
      DELETE FROM auth_codes WHERE expires_at < ?
    `).run(Date.now());
    return result.changes;
  }

  // Cleanup
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: AuthDatabase | null = null;

export function getDatabase(dbPath?: string): AuthDatabase {
  if (!dbInstance) {
    dbInstance = new AuthDatabase(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
