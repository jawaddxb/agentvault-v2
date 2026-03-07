import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/** GET /api/search — public search endpoint (no auth required) */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const type = searchParams.get('type'); // 'dataset' or 'skill'

  const pool = await getDb();
  let sql = `SELECT d.id, d.name, d.description, d.category, d.tags, d.entry_count, d.created_at, u.username
             FROM datasets d JOIN users u ON d.user_id = u.id WHERE d.is_public = TRUE`;
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
  if (category) {
    sql += ` AND d.category = $${++paramIdx}`;
    params.push(category);
  }

  sql += ` ORDER BY d.created_at DESC LIMIT 50`;

  const { rows } = await pool.query(sql, params);

  return NextResponse.json({
    results: rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      tags: JSON.parse(r.tags),
      entryCount: r.entry_count,
      author: r.username,
      createdAt: r.created_at,
    })),
  });
}
