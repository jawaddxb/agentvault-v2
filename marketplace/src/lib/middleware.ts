import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyJwt, hashApiKey } from './auth';
import { getDb } from './db';
import type { JwtPayload } from './auth';

const COOKIE_NAME = 'av_session';

/** Extract and verify the JWT from the session cookie. Returns user payload or null. */
export async function getUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

/** Require authentication — returns user or a 401 response */
export async function requireUser(): Promise<JwtPayload | NextResponse> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

/** Resolve user from API key in Authorization header */
export async function getUserFromApiKey(request: Request): Promise<{ userId: number; keyId: number } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer av_')) return null;

  const key = authHeader.slice(7); // Remove "Bearer "
  const keyHash = hashApiKey(key);

  const pool = await getDb();
  const { rows } = await pool.query(
    'SELECT id, user_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
    [keyHash]
  );

  if (rows.length === 0) return null;

  // Log access
  await pool.query('INSERT INTO access_log (api_key_id, endpoint) VALUES ($1, $2)', [
    rows[0].id, request.url,
  ]);

  return { userId: rows[0].user_id, keyId: rows[0].id };
}
