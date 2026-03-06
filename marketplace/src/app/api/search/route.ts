import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface DatasetRow {
  id: number;
  name: string;
  description: string;
  category: string;
  tags: string;
  entry_count: number;
  username: string;
  created_at: string;
}

/** GET /api/search — public search endpoint (no auth required) */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const type = searchParams.get('type'); // 'dataset' or 'skill'

  const db = getDb();
  let sql = `SELECT d.id, d.name, d.description, d.category, d.tags, d.entry_count, d.created_at, u.username
             FROM datasets d JOIN users u ON d.user_id = u.id WHERE d.is_public = 1`;
  const params: string[] = [];

  if (type === 'skill') {
    sql += ` AND d.category = 'skills'`;
  } else if (type === 'dataset') {
    sql += ` AND d.category != 'skills'`;
  }

  if (q) {
    sql += ` AND (d.name LIKE ? OR d.description LIKE ? OR d.tags LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    sql += ` AND d.category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY d.created_at DESC LIMIT 50`;

  const rows = db.prepare(sql).all(...params) as DatasetRow[];

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
