import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.MARKETPLACE_JWT_SECRET ?? 'agentvault-marketplace-dev-secret-key'
);
const JWT_EXPIRY = '7d';

export interface JwtPayload {
  sub: number;
  username: string;
  email: string;
}

/** Sign a JWT with user payload */
export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ username: payload.username, email: payload.email, userId: payload.sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

/** Verify and decode a JWT */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload: p } = await jwtVerify(token, JWT_SECRET);
    return { sub: p.userId as number, username: p.username as string, email: p.email as string };
  } catch {
    return null;
  }
}

/** Generate a new API key: av_ + 32 hex chars */
export function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(16).toString('hex');
  const fullKey = `av_${random}`;
  const prefix = fullKey.slice(0, 11);
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  return { fullKey, prefix, hash };
}

/** Hash an API key for lookup */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Hash a password with a random salt using scrypt */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/** Verify a password against a stored hash */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(Uint8Array.from(Buffer.from(hash, 'hex')), Uint8Array.from(derivedKey)));
    });
  });
}
