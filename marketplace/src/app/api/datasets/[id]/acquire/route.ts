import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromApiKey } from '@/lib/middleware';

/** POST /api/datasets/[id]/acquire — acquire a skill (API key auth required) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiKeyUser = await getUserFromApiKey(request);
  if (!apiKeyUser) {
    return NextResponse.json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const datasetId = Number(id);
  const pool = await getDb();

  // Fetch the dataset
  const { rows: datasets } = await pool.query(
    'SELECT d.*, u.username FROM datasets d JOIN users u ON d.user_id = u.id WHERE d.id = $1 AND d.is_public = TRUE',
    [datasetId]
  );

  if (datasets.length === 0) {
    return NextResponse.json({ success: false, error: 'Skill not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const dataset = datasets[0];

  // Check if already purchased
  const { rows: existing } = await pool.query(
    'SELECT id FROM purchases WHERE user_id = $1 AND dataset_id = $2',
    [apiKeyUser.userId, datasetId]
  );

  if (existing.length > 0) {
    // Already acquired — return content
    return NextResponse.json({
      success: true,
      alreadyOwned: true,
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      content: dataset.content,
      tags: JSON.parse(dataset.tags),
      author: dataset.username,
    });
  }

  const priceUsdc = dataset.price_usdc ? parseFloat(dataset.price_usdc) : 0;

  // Paid skill — return 402
  if (priceUsdc > 0) {
    return NextResponse.json({
      success: false,
      error: 'payment_required',
      code: 'PAYMENT_REQUIRED',
      id: dataset.id,
      name: dataset.name,
      priceUsdc,
    }, { status: 402 });
  }

  // Free skill — record purchase and return content
  await pool.query(
    'INSERT INTO purchases (user_id, dataset_id, price_usdc) VALUES ($1, $2, 0) ON CONFLICT (user_id, dataset_id) DO NOTHING',
    [apiKeyUser.userId, datasetId]
  );

  return NextResponse.json({
    success: true,
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    content: dataset.content,
    tags: JSON.parse(dataset.tags),
    author: dataset.username,
  });
}
