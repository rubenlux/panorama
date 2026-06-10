/**
 * Sprint 7.0 — Social Intelligence Monitor
 *
 * Runs every 30 minutes. Only processes social_sources WHERE enabled = true.
 * Never discovers new accounts automatically — all sources are user-managed.
 *
 * Pipeline:
 *   1. fetchNewPosts()          — call platform adapters, store new posts
 *   2. detectSocialClusters()   — Jaccard keyword clustering
 *   3. recalcClusterMetrics()   — aggregate engagement per cluster
 *   4. markStaleClusters()      — expire clusters idle > 48h
 */

import { query } from '../routes/db.js';
import { fetchRecentPosts, extractKeywords, calcEngagementScore } from '../services/SocialFetcher.js';

const SOCIAL_CLUSTER_THRESHOLD   = 0.20;  // Jaccard score to join an existing cluster
const SOCIAL_CLUSTER_WINDOW_HOURS = 48;   // Clusters stale after this many hours without new posts

function jaccardSimilarity(arrA, arrB) {
  const a = new Set(arrA);
  const b = new Set(arrB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Step 1: Fetch new posts from all enabled sources ─────────────────────────

async function fetchNewPosts() {
  const { rows: sources } = await query(`
    SELECT * FROM social_sources
    WHERE enabled = true
    ORDER BY priority DESC, last_checked ASC NULLS FIRST
  `);

  const newPostIds = [];

  for (const source of sources) {
    try {
      const { posts, resolvedPlatformId } = await fetchRecentPosts(source);

      // Cache platform_id if freshly resolved (avoids re-resolving on every run)
      if (resolvedPlatformId && resolvedPlatformId !== source.platform_id) {
        await query(
          `UPDATE social_sources SET platform_id = $1, updated_at = now() WHERE id = $2`,
          [resolvedPlatformId, source.id]
        );
      }

      for (const post of posts) {
        const keywords = extractKeywords(`${post.title || ''} ${post.content || ''}`);
        const engScore = calcEngagementScore(post.views, post.likes, post.comments, post.shares);

        const { rows } = await query(`
          INSERT INTO social_posts
            (source_id, platform, external_id, url, published_at,
             title, content, thumbnail_url, video_url,
             views, likes, comments, shares, engagement_score, keywords)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (platform, external_id) DO UPDATE SET
            views            = GREATEST(social_posts.views,    EXCLUDED.views),
            likes            = GREATEST(social_posts.likes,    EXCLUDED.likes),
            comments         = GREATEST(social_posts.comments, EXCLUDED.comments),
            engagement_score = EXCLUDED.engagement_score
          RETURNING id, (xmax = 0) AS is_new
        `, [
          source.id, source.platform, post.external_id, post.url, post.published_at,
          post.title, post.content, post.thumbnail_url, post.video_url,
          post.views, post.likes, post.comments, post.shares, engScore,
          JSON.stringify(keywords),
        ]);

        if (rows[0]?.is_new) newPostIds.push(rows[0].id);
      }

      // Update source stats regardless of new posts
      await query(`
        UPDATE social_sources SET
          last_checked = now(),
          last_post_at = (SELECT MAX(published_at) FROM social_posts WHERE source_id = $1),
          post_count   = (SELECT COUNT(*)::int       FROM social_posts WHERE source_id = $1),
          updated_at   = now()
        WHERE id = $1
      `, [source.id]);

    } catch (err) {
      console.error(`[SocialMonitor] Error processing source "${source.name}":`, err.message);
    }
  }

  return newPostIds;
}

// ── Step 2: Cluster new posts by keyword similarity (Jaccard) ────────────────

async function detectSocialClusters(newPostIds) {
  if (!newPostIds.length) return [];

  // Load active cluster signatures
  const { rows: clusterSigs } = await query(`
    SELECT id, title, keywords FROM social_clusters WHERE status = 'active'
  `);

  const { rows: posts } = await query(`
    SELECT id, title, keywords FROM social_posts WHERE id = ANY($1)
  `, [newPostIds]);

  const affectedClusterIds = new Set();

  for (const post of posts) {
    const postKw = post.keywords || [];
    if (postKw.length === 0) continue;

    let bestId    = null;
    let bestScore = 0;

    for (const cluster of clusterSigs) {
      const score = jaccardSimilarity(postKw, cluster.keywords || []);
      if (score > bestScore) {
        bestScore = score;
        bestId = cluster.id;
      }
    }

    if (bestId && bestScore >= SOCIAL_CLUSTER_THRESHOLD) {
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [bestId, post.id]);

      // Expand cluster keywords (union, capped at 30)
      const existing = clusterSigs.find(c => c.id === bestId);
      const merged   = [...new Set([...(existing.keywords || []), ...postKw])].slice(0, 30);
      await query(
        `UPDATE social_clusters SET keywords = $2, last_seen = now(), updated_at = now() WHERE id = $1`,
        [bestId, JSON.stringify(merged)]
      );
      existing.keywords = merged;
      affectedClusterIds.add(bestId);
    } else {
      // Create new cluster seeded by this post
      const title = (post.title || 'Sin título').slice(0, 200);
      const { rows: [newCluster] } = await query(`
        INSERT INTO social_clusters (title, keywords, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [title, JSON.stringify(postKw)]);

      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [newCluster.id, post.id]);

      clusterSigs.push({ id: newCluster.id, title, keywords: postKw });
      affectedClusterIds.add(newCluster.id);
    }
  }

  return [...affectedClusterIds];
}

// ── Step 3: Recalculate cluster metrics ──────────────────────────────────────

async function recalcClusterMetrics(affectedIds) {
  if (!affectedIds.length) return;

  await query(`
    UPDATE social_clusters sc
    SET
      post_count       = sub.cnt,
      source_count     = sub.src_cnt,
      total_views      = sub.views,
      total_likes      = sub.likes,
      total_comments   = sub.cmts,
      total_shares     = sub.shrs,
      total_engagement = sub.views + sub.likes * 10 + sub.cmts * 20 + sub.shrs * 30,
      engagement_score = CASE WHEN sub.views > 0
        THEN LEAST(1000,
          (sub.likes::float * 2 + sub.cmts::float * 5 + sub.shrs::float * 10)
          / sub.views::float * 10000
        )
        ELSE LEAST(500, (sub.likes * 2 + sub.cmts * 5 + sub.shrs * 10)::float)
      END,
      updated_at       = now()
    FROM (
      SELECT
        scp.cluster_id,
        COUNT(sp.id)::int                   AS cnt,
        COUNT(DISTINCT sp.source_id)::int   AS src_cnt,
        COALESCE(SUM(sp.views),    0)       AS views,
        COALESCE(SUM(sp.likes),    0)       AS likes,
        COALESCE(SUM(sp.comments), 0)       AS cmts,
        COALESCE(SUM(sp.shares),   0)       AS shrs
      FROM social_cluster_posts scp
      JOIN social_posts sp ON sp.id = scp.post_id
      WHERE scp.cluster_id = ANY($1)
      GROUP BY scp.cluster_id
    ) sub
    WHERE sc.id = sub.cluster_id
  `, [affectedIds]);
}

// ── Step 4: Stale idle clusters ───────────────────────────────────────────────

async function markStaleClusters() {
  await query(`
    UPDATE social_clusters SET status = 'stale', updated_at = now()
    WHERE status = 'active'
      AND last_seen < now() - interval '${SOCIAL_CLUSTER_WINDOW_HOURS} hours'
  `);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runSocialMonitor() {
  console.log('[SocialMonitor] Starting cycle…');
  try {
    const newPostIds = await fetchNewPosts();
    console.log(`[SocialMonitor] New posts: ${newPostIds.length}`);

    const affectedIds = await detectSocialClusters(newPostIds);
    if (affectedIds.length) {
      await recalcClusterMetrics(affectedIds);
      console.log(`[SocialMonitor] Clusters updated: ${affectedIds.length}`);
    }

    await markStaleClusters();
    console.log('[SocialMonitor] Cycle complete');
  } catch (err) {
    console.error('[SocialMonitor] Cycle error:', err.message, err.stack);
  }
}
