import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

interface DatabaseData {
  users: User[];
  kimai_credentials: KimaiCredentials[];
  oauth_tokens: OAuthToken[];
  auth_codes: AuthCode[];
}

export class AuthDatabase {
  private dbPath: string;
  private data: DatabaseData;

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, '../../data/auth.json');
    this.dbPath = dbPath?.replace('.db', '.json') || defaultPath;

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.data = this.load();
  }

  private load(): DatabaseData {
    if (existsSync(this.dbPath)) {
      try {
        const content = readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // Corrupted file, start fresh
      }
    }
    return {
      users: [],
      kimai_credentials: [],
      oauth_tokens: [],
      auth_codes: []
    };
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // User operations
  createUser(): User {
    const user: User = {
      id: randomUUID(),
      created_at: Date.now()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  getUser(id: string): User | null {
    return this.data.users.find(u => u.id === id) || null;
  }

  // Kimai credentials operations
  saveKimaiCredentials(
    userId: string,
    kimaiUrl: string,
    encryptedToken: string,
    kimaiEmail?: string
  ): void {
    const existing = this.data.kimai_credentials.findIndex(c => c.user_id === userId);
    const creds: KimaiCredentials = {
      user_id: userId,
      kimai_url: kimaiUrl,
      kimai_token_encrypted: encryptedToken,
      kimai_email: kimaiEmail || null,
      verified_at: Date.now()
    };

    if (existing >= 0) {
      this.data.kimai_credentials[existing] = creds;
    } else {
      this.data.kimai_credentials.push(creds);
    }
    this.save();
  }

  getKimaiCredentials(userId: string): KimaiCredentials | null {
    return this.data.kimai_credentials.find(c => c.user_id === userId) || null;
  }

  findUserByKimaiCredentials(kimaiUrl: string, encryptedToken: string): string | null {
    const creds = this.data.kimai_credentials.find(
      c => c.kimai_url === kimaiUrl && c.kimai_token_encrypted === encryptedToken
    );
    return creds?.user_id || null;
  }

  // OAuth token operations
  saveOAuthToken(token: OAuthToken): void {
    this.data.oauth_tokens.push(token);
    this.save();
  }

  getOAuthToken(accessToken: string): OAuthToken | null {
    return this.data.oauth_tokens.find(t => t.access_token === accessToken) || null;
  }

  getOAuthTokenByRefresh(refreshToken: string): OAuthToken | null {
    return this.data.oauth_tokens.find(t => t.refresh_token === refreshToken) || null;
  }

  deleteOAuthToken(accessToken: string): void {
    this.data.oauth_tokens = this.data.oauth_tokens.filter(t => t.access_token !== accessToken);
    this.save();
  }

  deleteExpiredTokens(): number {
    const now = Date.now();
    const before = this.data.oauth_tokens.length;
    this.data.oauth_tokens = this.data.oauth_tokens.filter(t => t.expires_at >= now);
    const deleted = before - this.data.oauth_tokens.length;
    if (deleted > 0) this.save();
    return deleted;
  }

  // Auth code operations
  saveAuthCode(authCode: AuthCode): void {
    this.data.auth_codes.push(authCode);
    this.save();
  }

  getAuthCode(code: string): AuthCode | null {
    return this.data.auth_codes.find(c => c.code === code) || null;
  }

  deleteAuthCode(code: string): void {
    this.data.auth_codes = this.data.auth_codes.filter(c => c.code !== code);
    this.save();
  }

  deleteExpiredAuthCodes(): number {
    const now = Date.now();
    const before = this.data.auth_codes.length;
    this.data.auth_codes = this.data.auth_codes.filter(c => c.expires_at >= now);
    const deleted = before - this.data.auth_codes.length;
    if (deleted > 0) this.save();
    return deleted;
  }

  // Cleanup
  close(): void {
    // No-op for JSON storage
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
