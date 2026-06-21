import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating NEW tracked_sources table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_sources (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name                     varchar(255) NOT NULL,
        url                      text NOT NULL,
        type                     varchar(50) NOT NULL, -- topic_hub, section_page, live_event, custom
        refresh_interval_seconds integer DEFAULT 300,
        active                   boolean DEFAULT true,
        last_checked             timestamptz,
        last_hash                varchar(64),
        created_at               timestamptz DEFAULT now(),
        updated_at               timestamptz DEFAULT now()
      )
    `);

    console.log('Creating tracked_source_snapshots table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_source_snapshots (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tracked_source_id uuid NOT NULL REFERENCES tracked_sources(id) ON DELETE CASCADE,
        content_hash       varchar(64) NOT NULL,
        links_detected     jsonb DEFAULT '[]', -- [{url, title}]
        created_at         timestamptz DEFAULT now()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_sources_active ON tracked_sources(active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_source_snapshots_source ON tracked_source_snapshots(tracked_source_id)`);

    await client.query('COMMIT');
    console.log('Coverage Monitor tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
