/**
 * Sprint 6.4 — Editorial Scoring Audit
 * 1. Adds 4 component score columns + story_confidence to story_clusters
 * 2. Backfills all values with new formula:
 *    story_quality  ← story_context_score (with hard caps)
 *    story_confidence ← source_count corroboration
 *
 * Hard caps:
 *   article_count = 1 → max quality = 'fair'
 *   source_count  < 2 → max quality = 'good'
 *
 * Thresholds (story_context_score):
 *   > 70 → excellent  (requires ≥2 sources and ≥2 articles)
 *   > 45 → good
 *   > 20 → fair
 *   ≤ 20 → poor
 *
 * story_confidence (source_count):
 *   1     → low
 *   2–3   → medium
 *   4+    → high
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_editorial_scoring] Starting…');

  // ── New columns ──────────────────────────────────────────────────────────────
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS context_relevance_score INTEGER DEFAULT 0`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS context_depth_score     INTEGER DEFAULT 0`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS context_diversity_score INTEGER DEFAULT 0`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS context_coverage_score  INTEGER DEFAULT 0`);
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS story_confidence        VARCHAR(10) DEFAULT 'low'`);

  console.log('[migrate_editorial_scoring] Added 5 columns to story_clusters');

  // ── Backfill all non-stale, non-recurring stories in one CTE UPDATE ──────────
  const { rowCount } = await query(`
    WITH m AS (
      SELECT
        base.story_id,
        base.rel_score,
        base.depth_score,
        base.div_score,
        base.cov_score,
        base.cnt_articles,
        base.cnt_sources,
        LEAST(100, base.rel_score + base.depth_score + base.div_score + base.cov_score) AS total_score
      FROM (
        SELECT
          sca.story_id,
          ROUND(COALESCE(AVG(sca.relevance_score), 0) * 35)::integer                        AS rel_score,
          ROUND(LEAST(COALESCE(SUM(ma.content_words), 0)::float / 5000, 1.0) * 25)::integer AS depth_score,
          ROUND(LEAST(COUNT(DISTINCT ma.source_id)::float / 5, 1.0) * 15)::integer           AS div_score,
          ROUND(COALESCE(
            COUNT(ma.id) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::float
            / NULLIF(COUNT(ma.id), 0), 0
          ) * 25)::integer                                                                   AS cov_score,
          COUNT(sca.article_id)::integer                                                     AS cnt_articles,
          COUNT(DISTINCT ma.source_id)::integer                                               AS cnt_sources
        FROM story_cluster_articles sca
        LEFT JOIN monitored_articles ma ON ma.id = sca.article_id
        GROUP BY sca.story_id
      ) base
    )
    UPDATE story_clusters sc
    SET
      context_relevance_score = m.rel_score,
      context_depth_score     = m.depth_score,
      context_diversity_score = m.div_score,
      context_coverage_score  = m.cov_score,
      story_context_score     = m.total_score,
      story_quality           = CASE
        WHEN m.cnt_articles <= 1 THEN
          CASE WHEN m.total_score < 20 THEN 'poor' ELSE 'fair' END
        WHEN m.cnt_sources < 2 THEN
          CASE
            WHEN m.total_score > 45 THEN 'good'
            WHEN m.total_score > 20 THEN 'fair'
            ELSE 'poor'
          END
        ELSE
          CASE
            WHEN m.total_score > 70 THEN 'excellent'
            WHEN m.total_score > 45 THEN 'good'
            WHEN m.total_score > 20 THEN 'fair'
            ELSE 'poor'
          END
      END,
      story_confidence        = CASE
        WHEN m.cnt_sources >= 4 THEN 'high'
        WHEN m.cnt_sources >= 2 THEN 'medium'
        ELSE 'low'
      END
    FROM m
    WHERE sc.id = m.story_id
      AND sc.is_recurring = false
      AND sc.status != 'stale'
  `);
  console.log(`[migrate_editorial_scoring] Backfilled ${rowCount} non-stale stories`);

  // ── Distribution report ──────────────────────────────────────────────────────
  const { rows: [dist] } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE story_quality = 'excellent' AND status != 'stale')::int AS excellent,
      COUNT(*) FILTER (WHERE story_quality = 'good'      AND status != 'stale')::int AS good,
      COUNT(*) FILTER (WHERE story_quality = 'fair'      AND status != 'stale')::int AS fair,
      COUNT(*) FILTER (WHERE story_quality = 'poor'      AND status != 'stale')::int AS poor,
      COUNT(*) FILTER (WHERE story_confidence = 'high'   AND status != 'stale')::int AS conf_high,
      COUNT(*) FILTER (WHERE story_confidence = 'medium' AND status != 'stale')::int AS conf_medium,
      COUNT(*) FILTER (WHERE story_confidence = 'low'    AND status != 'stale')::int AS conf_low,
      ROUND(AVG(story_context_score) FILTER (WHERE status != 'stale'))::int          AS avg_score,
      ROUND(AVG(article_count::float) FILTER (WHERE status != 'stale'), 1)           AS avg_articles,
      ROUND(AVG(source_count::float)  FILTER (WHERE status != 'stale'), 1)           AS avg_sources
    FROM story_clusters
    WHERE is_recurring = false
  `);

  console.log('[migrate_editorial_scoring] Quality distribution:');
  console.log(`  Quality  — excellent: ${dist.excellent}  good: ${dist.good}  fair: ${dist.fair}  poor: ${dist.poor}`);
  console.log(`  Confidence — high: ${dist.conf_high}  medium: ${dist.conf_medium}  low: ${dist.conf_low}`);
  console.log(`  Averages — score: ${dist.avg_score}/100  articles: ${dist.avg_articles}  sources: ${dist.avg_sources}`);

  console.log('[migrate_editorial_scoring] Done.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
