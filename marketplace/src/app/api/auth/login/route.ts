import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { signJwt, verifyPassword } from '@/lib/auth';

const MASTER_PASSWORD = process.env.MASTER_PASSWORD ?? '';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const pool = await getDb();
  const { rows } = await pool.query(
    'SELECT id, username, email, password_hash FROM users WHERE email = $1',
    [body.email.trim().toLowerCase()]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Email not found. Please register first.' }, { status: 401 });
  }

  const user = rows[0];

  // Check master password (from env) or user's actual password
  const isMaster = MASTER_PASSWORD && body.password === MASTER_PASSWORD;
  if (!isMaster) {
    if (!user.password_hash) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  }

  const token = await signJwt({ sub: user.id, username: user.username, email: user.email });

  const cookieStore = await cookies();
  cookieStore.set('av_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return NextResponse.json({ id: user.id, username: user.username, email: user.email });
}
