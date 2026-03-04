import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../config/paths.js';
import {
  ENCRYPTION_ALGO, SCRYPT_N, SCRYPT_R, SCRYPT_P,
  SCRYPT_KEYLEN, SALT_BYTES, IV_BYTES, PASSPHRASE_ENV,
} from '../config/defaults.js';
import type { EncryptedEnvelope } from '../types/index.js';

/** Derive a 256-bit key from passphrase + random salt using scrypt */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

/** In-memory passphrase cache — avoids re-reading .passphrase file */
let cachedPassphrase: string | null = null;

/** Clear passphrase cache (for testing only) */
export function _clearPassphraseCache(): void {
  cachedPassphrase = null;
}

/** Resolve passphrase: cache > env var > .passphrase file > throw
 *  SECURITY: .passphrase file is read once and cached in memory.
 *  This minimizes the window where the file must exist on disk. */
export function getPassphrase(projectDir?: string): string {
  if (cachedPassphrase) return cachedPassphrase;

  const envVal = process.env[PASSPHRASE_ENV];
  if (envVal) {
    cachedPassphrase = envVal;
    return envVal;
  }

  if (projectDir) {
    const ppFile = resolvePaths(projectDir).passphrase;
    try {
      if (fs.existsSync(ppFile)) {
        const pp = fs.readFileSync(ppFile, 'utf-8').trim();
        cachedPassphrase = pp;
        return pp;
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    'No passphrase found. Set AGENTVAULT_PASSPHRASE env var or create .agentvault/.passphrase file.'
  );
}

/** Encrypt plaintext JSON string to an EncryptedEnvelope */
export function encrypt(plaintext: string, passphrase: string): EncryptedEnvelope {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag,
    data: encrypted,
  };
}

/** Decrypt an EncryptedEnvelope back to plaintext string */
export function decrypt(envelope: EncryptedEnvelope, passphrase: string): string {
  const salt = Buffer.from(envelope.salt, 'hex');
  const key = deriveKey(passphrase, salt);
  const iv = Buffer.from(envelope.iv, 'hex');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  let decrypted = decipher.update(envelope.data, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/** Read an encrypted JSON file, returning parsed data or fallback */
export function readEncryptedFile<T>(filePath: string, passphrase: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const envelope: EncryptedEnvelope = JSON.parse(raw);
  const plaintext = decrypt(envelope, passphrase);
  return JSON.parse(plaintext) as T;
}

/** Write data as encrypted JSON to file */
export function writeEncryptedFile(filePath: string, data: unknown, passphrase: string): void {
  const plaintext = JSON.stringify(data);
  const envelope = encrypt(plaintext, passphrase);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
}
