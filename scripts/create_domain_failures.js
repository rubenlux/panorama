import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[migrate] Creating table domain_failures...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS domain_failures (
        domain VARCHAR(255) NOT NULL,
        reason TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        percentage NUMERIC(5, 1) DEFAULT 0.0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (domain, reason)
      );
    `);

    await client.query('COMMIT');
    console.log('[migrate] ✓ Table domain_failures created successfully.');
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
