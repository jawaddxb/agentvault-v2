import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export function getPool(): Pool {
  return pool;
}

/** Run schema migrations on first connect */
export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL,
      content     TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      entry_count INTEGER NOT NULL DEFAULT 0,
      is_public   BOOLEAN NOT NULL DEFAULT TRUE,
      price_usdc  DECIMAL(10,2) DEFAULT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      key_prefix TEXT NOT NULL,
      key_hash   TEXT NOT NULL UNIQUE,
      key_full   TEXT NOT NULL DEFAULT '',
      label      TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS access_log (
      id         SERIAL PRIMARY KEY,
      api_key_id INTEGER REFERENCES api_keys(id),
      endpoint   TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      dataset_id  INTEGER NOT NULL REFERENCES datasets(id),
      price_usdc  DECIMAL(10,2) NOT NULL DEFAULT 0,
      tx_hash     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, dataset_id)
    );
  `);

  // Migration: add key_full column if missing (for existing databases)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_full TEXT NOT NULL DEFAULT '';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  // Migration: add price_usdc column if missing
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE datasets ADD COLUMN IF NOT EXISTS price_usdc DECIMAL(10,2) DEFAULT NULL;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}

let initialized = false;

/** Get pool, ensuring schema is initialized */
export async function getDb(): Promise<Pool> {
  if (!initialized) {
    await initSchema();
    initialized = true;
  }
  return pool;
}
