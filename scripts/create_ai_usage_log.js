import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Creating table ai_usage_log...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_log (
        id SERIAL PRIMARY KEY,
        feature VARCHAR(100) NOT NULL,
        trigger VARCHAR(50) DEFAULT 'auto',
        triggered_by VARCHAR(100),
        story_id INTEGER,
        event_id INTEGER,
        trend_id INTEGER,
        model VARCHAR(100),
        input_words INTEGER,
        input_tokens_est INTEGER,
        output_tokens_est INTEGER,
        cost_usd_est NUMERIC(10, 6),
        cached BOOLEAN DEFAULT FALSE,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('[migrate] ✓ Table ai_usage_log created successfully.');
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
