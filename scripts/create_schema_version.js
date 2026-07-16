import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Creating table schema_version...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id               SERIAL PRIMARY KEY,
        version          VARCHAR(50) NOT NULL,
        baseline_hash    VARCHAR(64) NOT NULL,
        generated_at     TIMESTAMPTZ NOT NULL,
        git_commit       VARCHAR(40),
        generator_version VARCHAR(50) DEFAULT 'bootstrap.js v1',
        applied_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version_hash
        ON schema_version(baseline_hash);
    `);

    await client.query('COMMIT');
    console.log('[migrate] ✓ Table schema_version created successfully.');
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
