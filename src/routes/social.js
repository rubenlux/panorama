import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchRecentPosts, extractKeywords, calcEngagementScore } from '../services/SocialFetcher.js';

const router = Router();

// Jaccard utility (also used in routes for content-gap analysis)
function jaccardSimilarity(arrA, arrB) {
  const a = new Set(arrA);
  const b = new Set(arrB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Social Sources ────────────────────────────────────────────────────────────

// GET /social/sources
router.get('/sources', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT *,
        CASE WHEN last_checked IS NULL THEN NULL
             ELSE extract(epoch FROM (now() - last_checked))::int
        END AS seconds_since_check
      FROM social_sources
      ORDER BY enabled DESC, priority DESC, name
    `);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// POST /social/sources
router.post('/sources', requireAuth, async (req, res, next) => {
  try {
    const { name, platform, profile_url, handle, priority, region, category } = req.body;
    if (!name?.trim())        return res.status(400).json({ error: 'name required' });
    if (!platform?.trim())    return res.status(400).json({ error: 'platform required' });
    if (!profile_url?.trim()) return res.status(400).json({ error: 'profile_url required' });

    const valid = ['youtube','instagram','facebook','x','tiktok'];
    if (!valid.includes(platform)) return res.status(400).json({ error: `platform must be one of: ${valid.join(', ')}` });

    const { rows } = await query(`
      INSERT INTO social_sources (name, platform, profile_url, handle, priority, region, category)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [name.trim(), platform, profile_url.trim(), handle?.trim() || null,
        parseInt(priority || 5), region?.trim() || 'nacional', category?.trim() || 'medio']);

    res.status(201).json({ source: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Source already exists for this platform and URL' });
    next(e);
  }
});

// PUT /social/sources/:id
router.put('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    const { name, profile_url, handle, enabled, priority, region, category } = req.body;
    const { rows } = await query(`
      UPDATE social_sources SET
        name        = COALESCE($2, name),
        profile_url = COALESCE($3, profile_url),
        handle      = COALESCE($4, handle),
        enabled     = COALESCE($5, enabled),
        priority    = COALESCE($6, priority),
        region      = COALESCE($7, region),
        category    = COALESCE($8, category),
        platform_id = CASE WHEN $3 IS NOT NULL AND $3 != profile_url THEN NULL ELSE platform_id END,
        updated_at  = now()
      WHERE id = $1
      RETURNING *
    `, [req.params.id, name, profile_url, handle, enabled, priority, region, category]);

    if (!rows.length) return res.status(404).json({ error: 'Source not found' });
    res.json({ source: rows[0] });
  } catch (e) { next(e); }
});

// DELETE /social/sources/:id
router.delete('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM social_sources WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Source not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /social/sources/:id/toggle — enable/disable
router.patch('/sources/:id/toggle', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      UPDATE social_sources SET enabled = NOT enabled, updated_at = now()
      WHERE id = $1 RETURNING id, name, enabled
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Source not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /social/sources/:id/check — trigger immediate fetch for one source
router.post('/sources/:id/check', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM social_sources WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Source not found' });
    const source = rows[0];

    const { posts, resolvedPlatformId } = await fetchRecentPosts(source);

    if (resolvedPlatformId && resolvedPlatformId !== source.platform_id) {
      await query(`UPDATE social_sources SET platform_id = $1, updated_at = now() WHERE id = $2`,
        [resolvedPlatformId, source.id]);
    }

    let newCount = 0;
    for (const post of posts) {
      const keywords = extractKeywords(`${post.title || ''} ${post.content || ''}`);
      const engScore = calcEngagementScore(post.views, post.likes, post.comments, post.shares);
      const { rows: r } = await query(`
        INSERT INTO social_posts
          (source_id, platform, external_id, url, published_at,
           title, content, thumbnail_url, video_url,
           views, likes, comments, shares, engagement_score, keywords)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (platform, external_id) DO UPDATE SET
          views = GREATEST(social_posts.views, EXCLUDED.views),
          likes = GREATEST(social_posts.likes, EXCLUDED.likes),
          comments = GREATEST(social_posts.comments, EXCLUDED.comments),
          engagement_score = EXCLUDED.engagement_score
        RETURNING (xmax = 0) AS is_new
      `, [source.id, source.platform, post.external_id, post.url, post.published_at,
          post.title, post.content, post.thumbnail_url, post.video_url,
          post.views, post.likes, post.comments, post.shares, engScore,
          JSON.stringify(keywords)]);
      if (r[0]?.is_new) newCount++;
    }

    await query(`
      UPDATE social_sources SET
        last_checked = now(),
        last_post_at = (SELECT MAX(published_at) FROM social_posts WHERE source_id = $1),
        post_count   = (SELECT COUNT(*)::int FROM social_posts WHERE source_id = $1),
        updated_at   = now()
      WHERE id = $1
    `, [source.id]);

    res.json({ ok: true, fetched: posts.length, new_posts: newCount, platform: source.platform });
  } catch (e) { next(e); }
});

// ── Posts ─────────────────────────────────────────────────────────────────────

// GET /social/posts
router.get('/posts', requireAuth, async (req, res, next) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset    = parseInt(req.query.offset || '0');
    const platform  = req.query.platform || null;
    const sourceId  = req.query.source_id || null;
    const region    = req.query.region || null;
    const hours     = Math.min(parseInt(req.query.hours || '48'), 168);

    const { rows } = await query(`
      SELECT
        sp.*,
        ss.name   AS source_name,
        ss.region AS source_region
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE sp.captured_at > now() - ($1 || ' hours')::interval
        AND ($2::text IS NULL OR sp.platform = $2)
        AND ($3::uuid IS NULL OR sp.source_id = $3)
        AND ($4::text IS NULL OR ss.region = $4)
      ORDER BY sp.published_at DESC NULLS LAST
      LIMIT $5 OFFSET $6
    `, [hours, platform, sourceId, region, limit, offset]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

// GET /social/stats — dashboard header metrics
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM social_sources WHERE enabled = true)          AS sources_active,
        (SELECT COUNT(*)::int FROM social_sources)                               AS sources_total,
        (SELECT COUNT(*)::int FROM social_posts
         WHERE captured_at > now() - interval '24 hours')                       AS posts_today,
        (SELECT COUNT(*)::int FROM social_clusters WHERE status = 'active')      AS clusters_active,
        (SELECT COALESCE(SUM(total_engagement), 0)::bigint
         FROM social_clusters WHERE status = 'active')                           AS total_engagement_active,
        (SELECT COUNT(*)::int FROM social_sources
         WHERE enabled = true AND platform = 'youtube')                          AS youtube_sources
    `);

    // Content gap count (active clusters with post_count >= 2 and no story match)
    const { rows: [gapCount] } = await query(`
      SELECT COUNT(*)::int AS count
      FROM social_clusters sc
      WHERE sc.status = 'active' AND sc.post_count >= 2
        AND NOT EXISTS (
          SELECT 1 FROM story_clusters stc
          WHERE stc.status != 'stale'
            AND stc.is_recurring = false
            AND (
              SELECT COUNT(*) FROM (
                SELECT * FROM jsonb_array_elements_text(sc.keywords)
                INTERSECT
                SELECT * FROM jsonb_array_elements_text(stc.keywords)
              ) t
            ) >= 2
        )
    `);

    res.json({ ...stats, content_gaps: gapCount.count });
  } catch (e) { next(e); }
});

// ── Clusters ──────────────────────────────────────────────────────────────────

// GET /social/clusters — viral topics sorted by total_engagement
router.get('/clusters', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '50'), 200);
    const hours  = Math.min(parseInt(req.query.hours || '48'), 168);
    const status = req.query.status || 'active';

    const { rows } = await query(`
      SELECT
        sc.*,
        array_agg(DISTINCT sp.platform) FILTER (WHERE sp.platform IS NOT NULL) AS platforms,
        array_agg(DISTINCT ss.name)     FILTER (WHERE ss.name IS NOT NULL)     AS sources,
        array_agg(DISTINCT ss.region)   FILTER (WHERE ss.region IS NOT NULL)   AS regions
      FROM social_clusters sc
      LEFT JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
      LEFT JOIN social_posts sp          ON sp.id = scp.post_id
      LEFT JOIN social_sources ss        ON ss.id = sp.source_id
      WHERE sc.status = $1
        AND sc.last_seen > now() - ($2 || ' hours')::interval
      GROUP BY sc.id
      ORDER BY sc.total_engagement DESC, sc.post_count DESC
      LIMIT $3
    `, [status, hours, limit]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /social/clusters/:id — cluster detail with posts
router.get('/clusters/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows: [cluster] } = await query(
      `SELECT * FROM social_clusters WHERE id = $1`, [req.params.id]
    );
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

    const { rows: posts } = await query(`
      SELECT sp.*, ss.name AS source_name, ss.platform, ss.region AS source_region
      FROM social_cluster_posts scp
      JOIN social_posts sp    ON sp.id = scp.post_id
      JOIN social_sources ss  ON ss.id = sp.source_id
      WHERE scp.cluster_id = $1
      ORDER BY sp.engagement_score DESC, sp.published_at DESC
    `, [req.params.id]);

    res.json({ cluster, posts });
  } catch (e) { next(e); }
});

// ── Top Sources ───────────────────────────────────────────────────────────────

// GET /social/top-sources — ranked by recent post count + engagement
router.get('/top-sources', requireAuth, async (req, res, next) => {
  try {
    const hours = Math.min(parseInt(req.query.hours || '48'), 168);

    const { rows } = await query(`
      SELECT
        ss.id, ss.name, ss.platform, ss.region, ss.category, ss.enabled,
        COUNT(sp.id)::int                                       AS recent_posts,
        COALESCE(SUM(sp.views), 0)::bigint                     AS total_views,
        COALESCE(SUM(sp.likes), 0)::bigint                     AS total_likes,
        COALESCE(SUM(sp.views + sp.likes*10 + sp.comments*20), 0)::bigint AS total_engagement,
        MAX(sp.published_at)                                    AS last_post_at
      FROM social_sources ss
      LEFT JOIN social_posts sp ON sp.source_id = ss.id
        AND sp.captured_at > now() - ($1 || ' hours')::interval
      GROUP BY ss.id, ss.name, ss.platform, ss.region, ss.category, ss.enabled
      ORDER BY recent_posts DESC, total_engagement DESC
      LIMIT 50
    `, [hours]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// ── Content Gap Analysis ──────────────────────────────────────────────────────

// GET /social/content-gap — social clusters with no matching story cluster
router.get('/content-gap', requireAuth, async (req, res, next) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit || '50'), 100);
    const minPosts  = parseInt(req.query.min_posts || '2');
    const matchThreshold = parseFloat(req.query.threshold || '0.20');

    // Load active social clusters with ≥ minPosts
    const { rows: socialClusters } = await query(`
      SELECT
        sc.*,
        array_agg(DISTINCT ss.name)   FILTER (WHERE ss.name IS NOT NULL) AS sources,
        array_agg(DISTINCT sp.platform) FILTER (WHERE sp.platform IS NOT NULL) AS platforms
      FROM social_clusters sc
      LEFT JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
      LEFT JOIN social_posts sp          ON sp.id = scp.post_id
      LEFT JOIN social_sources ss        ON ss.id = sp.source_id
      WHERE sc.status = 'active' AND sc.post_count >= $1
      GROUP BY sc.id
      ORDER BY sc.total_engagement DESC
      LIMIT 100
    `, [minPosts]);

    // Load active story clusters for cross-reference
    const { rows: storyClusters } = await query(`
      SELECT id, title, keywords, story_quality, story_context_score, article_count, status
      FROM story_clusters
      WHERE status != 'stale' AND is_recurring = false
    `);

    // Compute gap analysis in JS (Jaccard cross-match)
    const results = socialClusters.map(sc => {
      const scKw = sc.keywords || [];
      let bestMatch = null;
      let bestScore = 0;

      for (const story of storyClusters) {
        const stKw = story.keywords || [];
        const score = jaccardSimilarity(scKw, stKw);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = story;
        }
      }

      const covered  = bestScore >= matchThreshold;
      const gapLevel = !covered
        ? 'gap'
        : bestMatch?.story_quality === 'poor' || bestMatch?.article_count <= 1
          ? 'partial'
          : 'covered';

      return {
        id:               sc.id,
        title:            sc.title,
        keywords:         sc.keywords,
        post_count:       sc.post_count,
        source_count:     sc.source_count,
        total_engagement: sc.total_engagement,
        total_views:      sc.total_views,
        last_seen:        sc.last_seen,
        sources:          sc.sources || [],
        platforms:        sc.platforms || [],
        gap_status:       gapLevel,
        story_match:      covered ? {
          id:                  bestMatch.id,
          title:               bestMatch.title,
          story_quality:       bestMatch.story_quality,
          story_context_score: bestMatch.story_context_score,
          article_count:       bestMatch.article_count,
          match_score:         Math.round(bestScore * 100) / 100,
        } : null,
      };
    })
    .sort((a, b) => {
      // Gaps first, then partial, then covered; within each group sort by engagement
      const order = { gap: 0, partial: 1, covered: 2 };
      if (order[a.gap_status] !== order[b.gap_status]) return order[a.gap_status] - order[b.gap_status];
      return (b.total_engagement || 0) - (a.total_engagement || 0);
    })
    .slice(0, limit);

    const summary = {
      total:   results.length,
      gap:     results.filter(r => r.gap_status === 'gap').length,
      partial: results.filter(r => r.gap_status === 'partial').length,
      covered: results.filter(r => r.gap_status === 'covered').length,
    };

    res.json({ summary, items: results });
  } catch (e) { next(e); }
});

export default router;
