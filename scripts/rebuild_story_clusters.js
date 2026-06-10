/**
 * Sprint 6.2 — Story Cluster Rebuild
 *
 * Cleans contaminated cluster-article links (relevance < 0.30),
 * recalculates quality metrics for all affected stories,
 * resets ready stories that lost too many articles so they re-summarize.
 *
 * Usage:
 *   node scripts/rebuild_story_clusters.js [--dry-run] [--threshold=0.30]
 *
 * Flags:
 *   --dry-run       Print statistics without modifying data
 *   --threshold=N   Minimum relevance score to keep (default 0.30)
 */

import 'dotenv/config';
import { query, pool } from '../src/routes/db.js';

const DRY_RUN  = process.argv.includes('--dry-run');
const TARG     = process.argv.find(a => a.startsWith('--threshold='));
const THRESHOLD = TARG ? parseFloat(TARG.split('=')[1]) : 0.30;

async function run() {
  console.log(`[rebuild_clusters] Starting — threshold=${THRESHOLD}${DRY_RUN ? ' [DRY RUN]' : ''}`);

  // ── 1. Audit: count links below threshold ─────────────────────────────────
  const { rows: [audit] } = await query(`
    SELECT
      COUNT(*)::int                                               AS total_links,
      COUNT(*) FILTER (WHERE sca.relevance_score < $1)::int      AS weak_links,
      COUNT(DISTINCT sca.story_id)
        FILTER (WHERE sca.relevance_score < $1)::int             AS affected_stories
    FROM story_cluster_articles sca
    JOIN story_clusters sc ON sc.id = sca.story_id
    WHERE sc.is_recurring = false
  `, [THRESHOLD]);

  console.log(`[rebuild_clusters] Audit:`);
  console.log(`  Total links:       ${audit.total_links}`);
  console.log(`  Weak links (<${THRESHOLD}): ${audit.weak_links}`);
  console.log(`  Affected stories:  ${audit.affected_stories}`);

  if (DRY_RUN) {
    // Show worst stories
    const { rows: worst } = await query(`
      SELECT
        sc.id, sc.title, sc.story_quality,
        COUNT(sca.article_id)::int                                    AS total,
        COUNT(sca.article_id) FILTER (WHERE sca.relevance_score < $1)::int AS weak,
        ROUND(AVG(sca.relevance_score)::numeric, 3)                  AS avg_rel
      FROM story_clusters sc
      JOIN story_cluster_articles sca ON sca.story_id = sc.id
      WHERE sc.is_recurring = false
        AND sc.status IN ('active','ready','followed')
      GROUP BY sc.id, sc.title, sc.story_quality
      HAVING COUNT(sca.article_id) FILTER (WHERE sca.relevance_score < $1) > 0
      ORDER BY avg_rel ASC
      LIMIT 20
    `, [THRESHOLD]);

    console.log(`\n[rebuild_clusters] Top 20 contaminated stories:`);
    for (const s of worst) {
      console.log(`  [${s.story_quality}] ${s.title.slice(0, 60)} — avg=${s.avg_rel} weak=${s.weak}/${s.total}`);
    }
    console.log('\n[rebuild_clusters] Dry run complete. Run without --dry-run to apply.');
    process.exit(0);
  }

  // ── 2. Collect affected story IDs before deletion ─────────────────────────
  const { rows: affected } = await query(`
    SELECT DISTINCT sca.story_id
    FROM story_cluster_articles sca
    JOIN story_clusters sc ON sc.id = sca.story_id
    WHERE sca.relevance_score < $1
      AND sc.is_recurring = false
  `, [THRESHOLD]);

  const affectedIds = affected.map(r => r.story_id);
  console.log(`[rebuild_clusters] Will process ${affectedIds.length} stories`);

  // ── 3. Delete weak links ──────────────────────────────────────────────────
  const { rowCount: deleted } = await query(`
    DELETE FROM story_cluster_articles sca
    USING story_clusters sc
    WHERE sca.story_id = sc.id
      AND sca.relevance_score < $1
      AND sc.is_recurring = false
  `, [THRESHOLD]);

  console.log(`[rebuild_clusters] Deleted ${deleted} weak article links`);

  // ── 4. Recalculate metrics + quality for all affected stories ─────────────
  let updated = 0;
  let staled  = 0;
  let requeued = 0;

  for (const storyId of affectedIds) {
    const { rows: [m] } = await query(`
      SELECT
        COUNT(sca.article_id)::int                                                AS article_count,
        COUNT(DISTINCT ma.source_id)::int                                         AS source_count,
        AVG(sca.relevance_score)                                                  AS avg_rel,
        COALESCE(SUM(ma.content_words), 0)::int                                   AS total_words,
        COUNT(ma.id) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::int AS enriched
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      WHERE sca.story_id = $1
    `, [storyId]);

    if (m.article_count === 0) {
      // No articles left — stale the story
      await query(`
        UPDATE story_clusters SET status = 'stale', updated_at = now() WHERE id = $1
      `, [storyId]);
      staled++;
      continue;
    }

    const avgRel = m.avg_rel || 0;
    const quality = avgRel < 0.40 ? 'poor' : avgRel < 0.60 ? 'fair' : avgRel < 0.80 ? 'good' : 'excellent';
    const enrichPct = m.article_count > 0 ? m.enriched / m.article_count : 0;
    const contextScore = Math.min(100, Math.max(0, Math.round(
      avgRel * 35
      + Math.min(m.total_words / 5000, 1) * 25
      + Math.min(m.source_count / 5, 1) * 15
      + enrichPct * 25
    )));

    // Check current status
    const { rows: [cur] } = await query(
      `SELECT status FROM story_clusters WHERE id = $1`, [storyId]
    );

    let newStatus = cur?.status;
    // If it was 'ready' and now has fewer articles, reset to 'active' for re-summarization
    if (cur?.status === 'ready' && m.article_count < 3) {
      newStatus = 'active';
      requeued++;
    }

    await query(`
      UPDATE story_clusters SET
        article_count       = $2,
        source_count        = $3,
        avg_relevance       = $4,
        story_quality       = $5,
        story_context_score = $6,
        status              = $7,
        updated_at          = now()
      WHERE id = $1
    `, [storyId, m.article_count, m.source_count, avgRel, quality, contextScore, newStatus]);

    updated++;
  }

  console.log(`[rebuild_clusters] Recalculated ${updated} stories`);
  if (staled  > 0) console.log(`[rebuild_clusters] Staled ${staled} empty stories`);
  if (requeued > 0) console.log(`[rebuild_clusters] Re-queued ${requeued} stories for re-summarization`);

  // ── 5. Final quality distribution ─────────────────────────────────────────
  const { rows: dist } = await query(`
    SELECT story_quality, COUNT(*)::int AS cnt
    FROM story_clusters
    WHERE is_recurring = false
      AND status IN ('active','ready','followed')
      AND last_seen > now() - interval '24 hours'
    GROUP BY story_quality
    ORDER BY story_quality
  `);

  console.log(`\n[rebuild_clusters] Quality distribution after rebuild:`);
  for (const d of dist) console.log(`  ${d.story_quality || 'null'}: ${d.cnt}`);

  console.log('\n[rebuild_clusters] Done.');
  await pool.end();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
