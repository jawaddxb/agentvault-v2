import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/middleware';

/** GET /api/users — list all registered users with stats */
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const pool = await getDb();
  const { rows } = await pool.query(`
    SELECT
      u.id, u.username, u.email, u.created_at,
      (SELECT COUNT(*) FROM api_keys WHERE user_id = u.id) as keys_count,
      (SELECT COUNT(*) FROM datasets WHERE user_id = u.id) as datasets_count
    FROM users u
    ORDER BY u.created_at DESC
  `);

  return NextResponse.json({
    users: rows.map(r => ({
      id: r.id,
      username: r.username,
      email: r.email,
      createdAt: r.created_at,
      keysCount: Number(r.keys_count),
      datasetsCount: Number(r.datasets_count),
    })),
  });
}
