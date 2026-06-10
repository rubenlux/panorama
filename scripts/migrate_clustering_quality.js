/**
 * Sprint 6.2 — Story Clustering Quality Fields + AI Generation Logs
 * Adds story_quality, avg_relevance, story_context_score to story_clusters.
 * Creates ai_generation_logs for full AI context traceability.
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_clustering_quality] Starting…');

  // Quality + relevance fields on story_clusters
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS story_quality      VARCHAR(10) DEFAULT 'fair'`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS avg_relevance      FLOAT`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS story_context_score INTEGER DEFAULT 0`);

  console.log('[migrate_clustering_quality] Added quality columns to story_clusters');

  // AI generation log — every Claude call records exactly what context was sent
  await query(`
    CREATE TABLE IF NOT EXISTS ai_generation_logs (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      story_id         UUID        REFERENCES story_clusters(id)  ON DELETE SET NULL,
      event_id         UUID        REFERENCES event_clusters(id)  ON DELETE SET NULL,
      generation_type  VARCHAR(50) NOT NULL,
      article_count    INTEGER     NOT NULL DEFAULT 0,
      article_titles   JSONB       NOT NULL DEFAULT '[]',
      total_words_sent INTEGER     NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS ai_gen_logs_story_idx   ON ai_generation_logs(story_id)`);
  await query(`CREATE INDEX IF NOT EXISTS ai_gen_logs_event_idx   ON ai_generation_logs(event_id)`);
  await query(`CREATE INDEX IF NOT EXISTS ai_gen_logs_created_idx ON ai_generation_logs(created_at DESC)`);

  console.log('[migrate_clustering_quality] Created ai_generation_logs table');

  // Backfill avg_relevance + quality for existing stories
  await query(`
    UPDATE story_clusters sc
    SET
      avg_relevance = sub.avg_rel,
      story_quality = CASE
        WHEN sub.avg_rel < 0.40 THEN 'poor'
        WHEN sub.avg_rel < 0.60 THEN 'fair'
        WHEN sub.avg_rel < 0.80 THEN 'good'
        ELSE 'excellent'
      END
    FROM (
      SELECT story_id, AVG(relevance_score) AS avg_rel
      FROM story_cluster_articles
      GROUP BY story_id
    ) sub
    WHERE sc.id = sub.story_id
  `);

  const { rows: [{ cnt }] } = await query(
    `SELECT COUNT(*) AS cnt FROM story_clusters WHERE avg_relevance IS NOT NULL`
  );
  console.log(`[migrate_clustering_quality] Backfilled quality for ${cnt} stories`);

  console.log('[migrate_clustering_quality] Done.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
