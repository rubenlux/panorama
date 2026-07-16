import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Adding scoring component columns to story_clusters...');
    await client.query(`
      ALTER TABLE story_clusters 
        ADD COLUMN IF NOT EXISTS context_relevance_score INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS context_depth_score     INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS context_diversity_score INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS context_coverage_score  INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS story_confidence        VARCHAR(10) DEFAULT 'low';
    `);

    await client.query('COMMIT');
    console.log('[migrate] ✓ Scoring columns created.');
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
