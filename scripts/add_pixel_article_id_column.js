import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Adding article_id column to pixel_events...');
    await client.query(`ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS article_id UUID;`);

    await client.query('COMMIT');
    console.log('[migrate] ✓ article_id column created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Failure:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
