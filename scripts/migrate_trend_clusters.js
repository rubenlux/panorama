/**
 * Sprint 5.3 — Trend Intelligence
 * Creates trend_clusters and trend_cluster_articles tables.
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_trend_clusters] Starting…');

  // trend_clusters — one cluster per entity per news cycle
  await query(`
    CREATE TABLE IF NOT EXISTS trend_clusters (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id       UUID        NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      headline        TEXT,
      summary         TEXT,
      editorial_angles JSONB      DEFAULT '[]',
      source_count    INTEGER     NOT NULL DEFAULT 0,
      article_count   INTEGER     NOT NULL DEFAULT 0,
      first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
      status          VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','summarizing','ready','stale','followed')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_tc_entity     ON trend_clusters (entity_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tc_status     ON trend_clusters (status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tc_last_seen  ON trend_clusters (last_seen DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tc_counts     ON trend_clusters (article_count DESC, source_count DESC)`);
  console.log('[migrate_trend_clusters] trend_clusters ready.');

  // trend_cluster_articles — articles that belong to a cluster
  await query(`
    CREATE TABLE IF NOT EXISTS trend_cluster_articles (
      trend_id    UUID        NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
      article_id  UUID        NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (trend_id, article_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_tca_trend   ON trend_cluster_articles (trend_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tca_article ON trend_cluster_articles (article_id)`);
  console.log('[migrate_trend_clusters] trend_cluster_articles ready.');

  console.log('[migrate_trend_clusters] Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate_trend_clusters] FAILED:', err.message);
  process.exit(1);
});
