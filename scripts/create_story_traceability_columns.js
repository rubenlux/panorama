import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Adding traceability columns to story_cluster_articles...');
    await client.query(`
      ALTER TABLE story_cluster_articles 
        ADD COLUMN IF NOT EXISTS matching_reason    TEXT,
        ADD COLUMN IF NOT EXISTS shared_keywords    JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS shared_entities    JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS title_similarity   NUMERIC,
        ADD COLUMN IF NOT EXISTS keyword_similarity NUMERIC,
        ADD COLUMN IF NOT EXISTS entity_similarity  NUMERIC;
    `);

    await client.query('COMMIT');
    console.log('[migrate] ✓ Traceability columns created.');
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
