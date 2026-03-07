import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, getUserFromApiKey } from '@/lib/middleware';

/** GET /api/datasets/[id] — get a single dataset (JWT or API key auth) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Try JWT auth first, then API key
  const user = await requireUser();
  const apiKeyUser = user instanceof NextResponse ? await getUserFromApiKey(request) : null;

  if (user instanceof NextResponse && !apiKeyUser) {
    return user; // 401
  }

  const { id } = await params;
  const pool = await getDb();
  const { rows } = await pool.query(
    'SELECT d.*, u.username FROM datasets d JOIN users u ON d.user_id = u.id WHERE d.id = $1',
    [Number(id)]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
  }

  const row = rows[0];
  return NextResponse.json({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    content: row.content,
    tags: JSON.parse(row.tags),
    entryCount: row.entry_count,
    author: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
