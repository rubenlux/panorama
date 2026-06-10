/**
 * Sprint 6.4.1 — Story Scoring Integrity Fix
 *
 * Fixes two issues introduced by Sprint 6.4:
 *   1. Double-penalization: article_count=1 cap AND source_count cap were both applied,
 *      causing stories with score>70 and 1 source to land on 'fair' instead of 'good'.
 *   2. Orphan inconsistency: stories with article_count=0 or source_count=0 had non-zero
 *      story_context_score, which is mathematically impossible.
 *
 * New quality logic:
 *   score < 20   → poor
 *   score 20-44  → fair
 *   score 45-69  → good
 *   score >= 70  → excellent
 *   Single cap: source_count = 1 AND quality = 'excellent' → 'good'
 *
 * Orphan fix: article_count=0 → score=0, quality='poor', confidence='low'
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[fix_story_scoring_integrity] Starting…');

  // ── Step 1: Fix orphan stories (article_count=0 must have score=0) ───────────
  const { rowCount: orphanFixed } = await query(`
    UPDATE story_clusters
    SET
      story_context_score     = 0,
      context_relevance_score = 0,
      context_depth_score     = 0,
      context_diversity_score = 0,
      context_coverage_score  = 0,
      avg_relevance           = 0,
      story_quality           = 'poor',
      story_confidence        = 'low',
      updated_at              = now()
    WHERE article_count = 0
      AND is_recurring = false
      AND (story_context_score > 0
           OR story_quality != 'poor'
           OR story_confidence != 'low')
  `);
  console.log(`[fix_story_scoring_integrity] Orphan stories fixed: ${orphanFixed}`);

  // ── Step 2: Recompute story_quality for all non-stale, non-orphan stories ────
  // New logic: pure score thresholds + single cap (source_count=1 → max 'good')
  const { rowCount: qualityFixed } = await query(`
    UPDATE story_clusters
    SET
      story_quality = CASE
        WHEN story_context_score < 20 THEN 'poor'
        WHEN story_context_score < 45 THEN 'fair'
        WHEN story_context_score < 70 THEN 'good'
        WHEN source_count <= 1       THEN 'good'   -- single cap: 1 source → max good
        ELSE 'excellent'
      END,
      updated_at = now()
    WHERE is_recurring = false
      AND status != 'stale'
      AND article_count > 0
  `);
  console.log(`[fix_story_scoring_integrity] story_quality recomputed: ${qualityFixed}`);

  // ── Step 3: Sync source_count=0 stories (shouldn't exist if article_count>0) ─
  const { rowCount: sourceFixed } = await query(`
    UPDATE story_clusters sc
    SET
      source_count            = sub.cnt,
      story_context_score     = 0,
      context_relevance_score = 0,
      context_depth_score     = 0,
      context_diversity_score = 0,
      context_coverage_score  = 0,
      story_quality           = 'poor',
      story_confidence        = 'low',
      updated_at              = now()
    FROM (
      SELECT sca.story_id, COUNT(DISTINCT ma.source_id)::integer AS cnt
      FROM story_cluster_articles sca
      LEFT JOIN monitored_articles ma ON ma.id = sca.article_id
      GROUP BY sca.story_id
    ) sub
    WHERE sc.id = sub.story_id
      AND sc.source_count = 0
      AND sc.article_count > 0
      AND sub.cnt = 0
      AND sc.is_recurring = false
  `);
  console.log(`[fix_story_scoring_integrity] source_count=0 with articles fixed: ${sourceFixed}`);

  // ── Distribution report ───────────────────────────────────────────────────────
  const { rows: [dist] } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE story_quality = 'excellent' AND status != 'stale')::int AS excellent,
      COUNT(*) FILTER (WHERE story_quality = 'good'      AND status != 'stale')::int AS good,
      COUNT(*) FILTER (WHERE story_quality = 'fair'      AND status != 'stale')::int AS fair,
      COUNT(*) FILTER (WHERE story_quality = 'poor'      AND status != 'stale')::int AS poor,
      COUNT(*) FILTER (WHERE story_confidence = 'high'   AND status != 'stale')::int AS conf_high,
      COUNT(*) FILTER (WHERE story_confidence = 'medium' AND status != 'stale')::int AS conf_medium,
      COUNT(*) FILTER (WHERE story_confidence = 'low'    AND status != 'stale')::int AS conf_low,
      COUNT(*) FILTER (WHERE article_count = 0 AND story_context_score > 0 AND status != 'stale')::int AS remaining_orphan_score_mismatch,
      COUNT(*) FILTER (WHERE source_count = 0 AND story_context_score > 0 AND status != 'stale')::int AS remaining_source_score_mismatch,
      ROUND(AVG(story_context_score) FILTER (WHERE status != 'stale'))::int AS avg_score
    FROM story_clusters
    WHERE is_recurring = false
  `);

  console.log('\n[fix_story_scoring_integrity] Final distribution:');
  console.log(`  Quality    — excellent: ${dist.excellent}  good: ${dist.good}  fair: ${dist.fair}  poor: ${dist.poor}`);
  console.log(`  Confidence — high: ${dist.conf_high}  medium: ${dist.conf_medium}  low: ${dist.conf_low}`);
  console.log(`  Avg score  — ${dist.avg_score}/100`);
  console.log(`  Integrity  — orphan score mismatches: ${dist.remaining_orphan_score_mismatch}  source score mismatches: ${dist.remaining_source_score_mismatch}`);

  if (dist.remaining_orphan_score_mismatch > 0 || dist.remaining_source_score_mismatch > 0) {
    console.warn('[fix_story_scoring_integrity] WARNING: integrity issues remain — check manually');
  } else {
    console.log('[fix_story_scoring_integrity] ✓ No integrity issues remaining');
  }

  console.log('[fix_story_scoring_integrity] Done.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
