import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_social_observability] Starting…');

  // ── social_fetch_logs ──────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS social_fetch_logs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id    UUID NOT NULL REFERENCES social_sources(id) ON DELETE CASCADE,
      platform     VARCHAR(20) NOT NULL,
      started_at   TIMESTAMPTZ DEFAULT now(),
      finished_at  TIMESTAMPTZ,
      success      BOOLEAN DEFAULT false,
      posts_found  INTEGER DEFAULT 0,
      error_message TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_logs_source ON social_fetch_logs(source_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_logs_date ON social_fetch_logs(started_at DESC)`);
  console.log('[migrate_social_observability] ✓ social_fetch_logs created');

  console.log('[migrate_social_observability] Done. Tables created.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
