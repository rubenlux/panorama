import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Renaming tracked_sources to rss_sources...');
    await client.query(`ALTER TABLE tracked_sources RENAME TO rss_sources`);
    
    // Update foreign keys in monitored_articles
    console.log('Updating foreign keys...');
    // In PostgreSQL, renaming the table usually updates FKs automatically if they were defined correctly.
    // Let's verify and rename indexes if we want to be pedantic.
    await client.query(`ALTER INDEX IF EXISTS idx_tracked_sources_enabled RENAME TO idx_rss_sources_enabled`);

    await client.query('COMMIT');
    console.log('Renamed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Refactor failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
