/**
 * Coverage V2 — Schema Migration
 *
 * Creates the two new tables that form the independent Coverage system.
 * Does NOT touch: monitored_articles, rss_sources, story_clusters,
 * or any other editorial pipeline table.
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── tracked_articles ─────────────────────────────────────────────────────
    // Permanent catalog of every URL ever seen on a tracked source page.
    console.log('Creating tracked_articles...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_articles (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tracked_source_id uuid NOT NULL REFERENCES tracked_sources(id) ON DELETE CASCADE,
        url               text NOT NULL,
        title             text,
        first_detected_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at      timestamptz NOT NULL DEFAULT now(),
        current_position  integer,
        is_active         boolean DEFAULT true,
        content_text      text,
        UNIQUE(tracked_source_id, url)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tracked_articles_source
        ON tracked_articles(tracked_source_id, first_detected_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tracked_articles_active
        ON tracked_articles(tracked_source_id) WHERE is_active = true
    `);

    // ── coverage_changes ─────────────────────────────────────────────────────
    // Event log — the chronological timeline of every change detected.
    // change_type: link_added | link_removed | title_changed
    console.log('Creating coverage_changes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS coverage_changes (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tracked_source_id  uuid NOT NULL REFERENCES tracked_sources(id) ON DELETE CASCADE,
        tracked_article_id uuid REFERENCES tracked_articles(id) ON DELETE SET NULL,
        change_type        varchar(30) NOT NULL,
        old_value          text,
        new_value          text,
        detected_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coverage_changes_source
        ON coverage_changes(tracked_source_id, detected_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coverage_changes_global
        ON coverage_changes(detected_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coverage_changes_type
        ON coverage_changes(change_type, detected_at DESC)
    `);

    await client.query('COMMIT');

    console.log('\nCoverage V2 migration complete.');
    console.log('  tracked_articles   — created');
    console.log('  coverage_changes   — created');
    console.log('\nUnchanged:');
    console.log('  tracked_sources    — no schema changes');
    console.log('  tracked_source_snapshots — no schema changes');
    console.log('  monitored_articles — NOT TOUCHED');
    console.log('  rss_sources        — NOT TOUCHED');
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
