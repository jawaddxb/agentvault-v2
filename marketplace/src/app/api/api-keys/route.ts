import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/middleware';
import { generateApiKey } from '@/lib/auth';

/** GET /api/api-keys — list user's API keys */
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const pool = await getDb();
  const { rows } = await pool.query(
    'SELECT id, key_prefix, label, created_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [user.sub]
  );

  return NextResponse.json({
    keys: rows.map(r => ({
      id: r.id,
      prefix: r.key_prefix,
      label: r.label,
      createdAt: r.created_at,
      revoked: !!r.revoked_at,
    })),
  });
}

/** POST /api/api-keys — create a new API key */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => null);
  if (!body?.label?.trim()) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }
  const label = body.label.trim();

  const { fullKey, prefix, hash } = generateApiKey();

  const pool = await getDb();
  const { rows } = await pool.query(
    'INSERT INTO api_keys (user_id, key_prefix, key_hash, label) VALUES ($1, $2, $3, $4) RETURNING id',
    [user.sub, prefix, hash, label]
  );

  return NextResponse.json(
    { id: rows[0].id, key: fullKey, prefix, label },
    { status: 201 }
  );
}

/** DELETE /api/api-keys — revoke an API key by id */
export async function DELETE(request: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const pool = await getDb();
  const { rowCount } = await pool.query(
    "UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    [body.id, user.sub]
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
