import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, getUserFromApiKey } from '@/lib/middleware';

/** GET /api/datasets — list datasets with optional search, category, and type filter */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q');
  const category = searchParams.get('category');
  const type = searchParams.get('type'); // 'dataset' or 'skill'

  const pool = await getDb();
  let sql = `SELECT d.*, u.username FROM datasets d JOIN users u ON d.user_id = u.id WHERE d.is_public = TRUE`;
  const params: string[] = [];
  let paramIdx = 0;

  if (type === 'skill') {
    sql += ` AND d.category = 'skills'`;
  } else if (type === 'dataset') {
    sql += ` AND d.category != 'skills'`;
  }

  if (q) {
    const like = `%${q}%`;
    sql += ` AND (d.name ILIKE $${++paramIdx} OR d.description ILIKE $${++paramIdx} OR d.tags ILIKE $${++paramIdx})`;
    params.push(like, like, like);
  }
  if (category && type !== 'skill') {
    sql += ` AND d.category = $${++paramIdx}`;
    params.push(category);
  }

  sql += ` ORDER BY d.created_at DESC LIMIT 100`;

  const { rows } = await pool.query(sql, params);
  const datasets = rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    tags: JSON.parse(r.tags),
    entryCount: r.entry_count,
    author: r.username,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ datasets });
}

/** POST /api/datasets — create a new dataset or skill.
 *  Accepts JWT cookie auth (UI) or API key auth (programmatic/MCP). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.category || !body?.content) {
    return NextResponse.json({ error: 'name, category, and content are required' }, { status: 400 });
  }

  const validCategories = ['knowledge', 'skills', 'operational', 'query_cache'];
  if (!validCategories.includes(body.category)) {
    return NextResponse.json({ error: `category must be one of: ${validCategories.join(', ')}` }, { status: 400 });
  }

  // Accept JWT cookie auth (UI) or API key auth (programmatic/MCP)
  let userId: number;
  const apiKeyUser = await getUserFromApiKey(request);
  if (apiKeyUser) {
    userId = apiKeyUser.userId;
  } else {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    userId = user.sub;
  }

  const tags = Array.isArray(body.tags) ? body.tags : [];
  const entryCount = body.content.split('\n').filter((l: string) => l.trim()).length;

  const pool = await getDb();
  const { rows } = await pool.query(
    `INSERT INTO datasets (user_id, name, description, category, content, tags, entry_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, body.name.trim(), body.description?.trim() ?? '', body.category, body.content, JSON.stringify(tags), entryCount]
  );

  return NextResponse.json(
    { id: rows[0].id, name: body.name.trim() },
    { status: 201 }
  );
}
