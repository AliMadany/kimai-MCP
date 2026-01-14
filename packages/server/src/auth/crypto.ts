import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derives a key from a password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

/**
 * Get the encryption key from environment or generate a random one
 * In production, this should always be set via ENCRYPTION_KEY env var
 */
function getEncryptionSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    console.error('WARNING: ENCRYPTION_KEY not set. Using random key - data will not persist across restarts!');
    // Generate a random key for development
    return randomBytes(32).toString('hex');
  }
  return secret;
}

/**
 * Encrypt a string value using AES-256-GCM
 * Returns: base64(salt + iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const secret = getEncryptionSecret();
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * Decrypt a value encrypted with encrypt()
 */
export function decrypt(encryptedData: string): string {
  const secret = getEncryptionSecret();
  const combined = Buffer.from(encryptedData, 'base64');

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(secret, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Generate a secure random token (for access tokens, refresh tokens, auth codes)
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Hash a string using SHA-256 (for PKCE code challenge verification)
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

/**
 * Verify PKCE code challenge
 * code_verifier is the original random string
 * code_challenge is the S256 hash provided in the authorize request
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const computed = sha256(codeVerifier);
  return computed === codeChallenge;
}

/**
 * Generate a PKCE code verifier and challenge pair (for testing)
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = generateSecureToken(32);
  const challenge = sha256(verifier);
  return { verifier, challenge };
}
