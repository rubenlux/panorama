/**
 * Sprint 6.3 — Story Traceability + Context Score Fix
 * 1. Adds traceability columns to story_cluster_articles
 * 2. Backfills story_context_score for all non-stale stories
 * 3. Stales orphan stories (article_count = 0)
 * 4. Syncs article_count / source_count to match actual associations
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_story_traceability] Starting…');

  // ── Traceability columns on story_cluster_articles ───────────────────────────
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS matching_reason    TEXT`);
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS shared_keywords    JSONB   DEFAULT '[]'`);
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS shared_entities    JSONB   DEFAULT '[]'`);
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS title_similarity   NUMERIC`);
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS keyword_similarity NUMERIC`);
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS entity_similarity  NUMERIC`);

  console.log('[migrate_story_traceability] Added traceability columns to story_cluster_articles');

  // Mark all pre-existing links as 'legacy' — no breakdown available
  const { rowCount: legacyUpdated } = await query(`
    UPDATE story_cluster_articles
    SET matching_reason    = 'legacy',
        keyword_similarity = relevance_score,
        shared_keywords    = '[]'::jsonb
    WHERE matching_reason IS NULL
  `);
  console.log(`[migrate_story_traceability] Marked ${legacyUpdated} existing links as 'legacy'`);

  // ── Fix story_context_score for all non-stale stories that have articles ─────
  // Root cause: migrate_clustering_quality.js backfill only set avg_relevance and
  // story_quality — NOT story_context_score. Worker only recalculates on new articles.
  const { rowCount: scoreUpdated } = await query(`
    UPDATE story_clusters sc
    SET story_context_score = (
      SELECT LEAST(100, GREATEST(0, ROUND(
        (COALESCE(AVG(sca2.relevance_score), 0) * 35)
        + LEAST(COALESCE(SUM(ma2.content_words), 0)::float / 5000, 1.0) * 25
        + LEAST(COUNT(DISTINCT ma2.source_id)::float / 5, 1.0) * 15
        + COALESCE(
            COUNT(ma2.id) FILTER (WHERE ma2.extraction_method IN ('fetch','playwright'))::float
            / NULLIF(COUNT(ma2.id), 0),
            0
          ) * 25
      )::integer))
      FROM story_cluster_articles sca2
      JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
      WHERE sca2.story_id = sc.id
    )
    WHERE sc.is_recurring = false
      AND sc.status != 'stale'
      AND EXISTS (SELECT 1 FROM story_cluster_articles WHERE story_id = sc.id)
  `);
  console.log(`[migrate_story_traceability] Backfilled story_context_score for ${scoreUpdated} stories`);

  // ── Sync article_count / source_count for all non-stale stories ──────────────
  const { rowCount: synced } = await query(`
    UPDATE story_clusters sc
    SET
      article_count = (
        SELECT COUNT(*) FROM story_cluster_articles WHERE story_id = sc.id
      ),
      source_count = (
        SELECT COUNT(DISTINCT ma.source_id)
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        WHERE sca.story_id = sc.id
      )
    WHERE sc.is_recurring = false
      AND sc.status != 'stale'
  `);
  console.log(`[migrate_story_traceability] Synced article_count/source_count for ${synced} stories`);

  // ── Stale orphan stories (article_count = 0) ─────────────────────────────────
  const { rowCount: orphanStaled } = await query(`
    UPDATE story_clusters
    SET status = 'stale', updated_at = now()
    WHERE article_count = 0
      AND status NOT IN ('stale', 'followed')
      AND is_recurring = false
  `);
  console.log(`[migrate_story_traceability] Staled ${orphanStaled} orphan stories (article_count = 0)`);

  // ── Summary report ────────────────────────────────────────────────────────────
  const { rows: [stats] } = await query(`
    SELECT
      COUNT(*)                                                          AS total_stories,
      COUNT(*) FILTER (WHERE status != 'stale')                        AS active_stories,
      COUNT(*) FILTER (WHERE story_context_score = 0 AND status != 'stale' AND article_count > 0) AS score_zero_remaining,
      ROUND(AVG(story_context_score) FILTER (WHERE status != 'stale' AND article_count > 0)) AS avg_score,
      COUNT(*) FILTER (WHERE story_quality = 'poor'  AND status != 'stale') AS poor,
      COUNT(*) FILTER (WHERE story_quality = 'fair'  AND status != 'stale') AS fair,
      COUNT(*) FILTER (WHERE story_quality = 'good'  AND status != 'stale') AS good,
      COUNT(*) FILTER (WHERE story_quality = 'excellent' AND status != 'stale') AS excellent
    FROM story_clusters WHERE is_recurring = false
  `);
  console.log('[migrate_story_traceability] Final stats:');
  console.table(stats);

  if (parseInt(stats.score_zero_remaining) > 0) {
    console.warn(`⚠ ${stats.score_zero_remaining} active stories still have score = 0 — check if article JOINs have data`);
  } else {
    console.log('✓ No active stories with article_count > 0 have context_score = 0');
  }

  console.log('[migrate_story_traceability] Done.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
