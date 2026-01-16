import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
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
  private db: SqlJsDatabase;
  private dbPath: string;

  constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kimai_credentials (
        user_id TEXT PRIMARY KEY,
        kimai_url TEXT NOT NULL,
        kimai_token_encrypted TEXT NOT NULL,
        kimai_email TEXT,
        verified_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_tokens (
        access_token TEXT PRIMARY KEY,
        refresh_token TEXT UNIQUE,
        user_id TEXT NOT NULL,
        scopes TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        refresh_expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS auth_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
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
    this.save();
  }

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.dbPath, buffer);
  }

  private queryOne<T>(sql: string, params: any[] = []): T | null {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row as T;
    }
    stmt.free();
    return null;
  }

  // User operations
  createUser(): User {
    const user: User = {
      id: randomUUID(),
      created_at: Date.now()
    };

    this.db.run(
      `INSERT INTO users (id, created_at) VALUES (?, ?)`,
      [user.id, user.created_at]
    );
    this.save();

    return user;
  }

  getUser(id: string): User | null {
    return this.queryOne<User>(
      `SELECT id, created_at FROM users WHERE id = ?`,
      [id]
    );
  }

  // Kimai credentials operations
  saveKimaiCredentials(
    userId: string,
    kimaiUrl: string,
    encryptedToken: string,
    kimaiEmail?: string
  ): void {
    this.db.run(
      `INSERT OR REPLACE INTO kimai_credentials
      (user_id, kimai_url, kimai_token_encrypted, kimai_email, verified_at)
      VALUES (?, ?, ?, ?, ?)`,
      [userId, kimaiUrl, encryptedToken, kimaiEmail || null, Date.now()]
    );
    this.save();
  }

  getKimaiCredentials(userId: string): KimaiCredentials | null {
    return this.queryOne<KimaiCredentials>(
      `SELECT user_id, kimai_url, kimai_token_encrypted, kimai_email, verified_at
      FROM kimai_credentials WHERE user_id = ?`,
      [userId]
    );
  }

  // Find user by Kimai URL and encrypted token (for re-auth)
  findUserByKimaiCredentials(kimaiUrl: string, encryptedToken: string): string | null {
    const result = this.queryOne<{ user_id: string }>(
      `SELECT user_id FROM kimai_credentials
      WHERE kimai_url = ? AND kimai_token_encrypted = ?`,
      [kimaiUrl, encryptedToken]
    );

    return result?.user_id || null;
  }

  // OAuth token operations
  saveOAuthToken(token: OAuthToken): void {
    this.db.run(
      `INSERT INTO oauth_tokens
      (access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        token.access_token,
        token.refresh_token,
        token.user_id,
        token.scopes,
        token.expires_at,
        token.refresh_expires_at
      ]
    );
    this.save();
  }

  getOAuthToken(accessToken: string): OAuthToken | null {
    return this.queryOne<OAuthToken>(
      `SELECT access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at
      FROM oauth_tokens WHERE access_token = ?`,
      [accessToken]
    );
  }

  getOAuthTokenByRefresh(refreshToken: string): OAuthToken | null {
    return this.queryOne<OAuthToken>(
      `SELECT access_token, refresh_token, user_id, scopes, expires_at, refresh_expires_at
      FROM oauth_tokens WHERE refresh_token = ?`,
      [refreshToken]
    );
  }

  deleteOAuthToken(accessToken: string): void {
    this.db.run(
      `DELETE FROM oauth_tokens WHERE access_token = ?`,
      [accessToken]
    );
    this.save();
  }

  deleteExpiredTokens(): number {
    const beforeCount = this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM oauth_tokens WHERE expires_at < ?`,
      [Date.now()]
    )?.count || 0;

    this.db.run(
      `DELETE FROM oauth_tokens WHERE expires_at < ?`,
      [Date.now()]
    );
    this.save();

    return beforeCount;
  }

  // Auth code operations
  saveAuthCode(authCode: AuthCode): void {
    this.db.run(
      `INSERT INTO auth_codes
      (code, user_id, client_id, redirect_uri, scopes, code_challenge, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        authCode.code,
        authCode.user_id,
        authCode.client_id,
        authCode.redirect_uri,
        authCode.scopes,
        authCode.code_challenge,
        authCode.expires_at
      ]
    );
    this.save();
  }

  getAuthCode(code: string): AuthCode | null {
    return this.queryOne<AuthCode>(
      `SELECT code, user_id, client_id, redirect_uri, scopes, code_challenge, expires_at
      FROM auth_codes WHERE code = ?`,
      [code]
    );
  }

  deleteAuthCode(code: string): void {
    this.db.run(
      `DELETE FROM auth_codes WHERE code = ?`,
      [code]
    );
    this.save();
  }

  deleteExpiredAuthCodes(): number {
    const beforeCount = this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auth_codes WHERE expires_at < ?`,
      [Date.now()]
    )?.count || 0;

    this.db.run(
      `DELETE FROM auth_codes WHERE expires_at < ?`,
      [Date.now()]
    );
    this.save();

    return beforeCount;
  }

  // Cleanup
  close(): void {
    this.save();
    this.db.close();
  }
}

// Singleton instance
let dbInstance: AuthDatabase | null = null;
let initPromise: Promise<AuthDatabase> | null = null;

export async function initDatabase(dbPath?: string): Promise<AuthDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const SQL = await initSqlJs();

    const defaultPath = path.join(__dirname, '../../data/auth.db');
    const finalPath = dbPath || defaultPath;

    let db: SqlJsDatabase;

    // Try to load existing database
    if (fs.existsSync(finalPath)) {
      const fileBuffer = fs.readFileSync(finalPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    dbInstance = new AuthDatabase(db, finalPath);
    return dbInstance;
  })();

  return initPromise;
}

export function getDatabase(dbPath?: string): AuthDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
}
