import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/middleware';
import { generateApiKey } from '@/lib/auth';

interface ApiKeyRow {
  id: number;
  key_prefix: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

/** GET /api/api-keys — list user's API keys */
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const db = getDb();
  const rows = db.prepare(
    'SELECT id, key_prefix, label, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).all(user.sub) as ApiKeyRow[];

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

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO api_keys (user_id, key_prefix, key_hash, label) VALUES (?, ?, ?, ?)'
  ).run(user.sub, prefix, hash, label);

  return NextResponse.json(
    { id: result.lastInsertRowid, key: fullKey, prefix, label },
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

  const db = getDb();
  const result = db.prepare(
    "UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).run(body.id, user.sub);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
