import { Router } from 'express';
import { query } from './db.js';
import Anthropic from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';
import { fetchYouTubeTranscript, fetchYouTubeTranscriptViaPlaywright, calculateQualityScore, detectEditorialType } from '../connectors/social/transcripts.js';

const router = Router();

// Optional auth — populate req.user if valid Bearer token present; never blocks
router.use((req, _res, next) => {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type === 'Bearer' && token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* invalid */ }
  }
  next();
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = 'claude-haiku-4-5-20251001';

// ── Daily limit helpers ───────────────────────────────────────────────────────

async function getDailyLimits() {
  // TRANSCRIPT_DAILY_LIMIT=0 in env → unlimited (overrides DB setting)
  const envLimit = process.env.TRANSCRIPT_DAILY_LIMIT;
  if (envLimit !== undefined) {
    const n = parseInt(envLimit, 10);
    if (!isNaN(n)) return { transcripts: n, ai_analyses: n };
  }
  const [tRow, aRow] = await Promise.all([
    query(`SELECT value FROM settings WHERE key = 'max_transcripts_per_day'`).catch(() => ({ rows: [] })),
    query(`SELECT value FROM settings WHERE key = 'max_ai_analysis_per_day'`).catch(() => ({ rows: [] })),
  ]);
  return {
    transcripts: parseInt(tRow.rows[0]?.value) || 10,
    ai_analyses: parseInt(aRow.rows[0]?.value) || 10,
  };
}

// Returns true when the request should skip quota enforcement
function isUnlimited(req, limit) {
  if (req.user?.role === 'admin') return true;  // admin bypass
  if (limit === 0) return true;                  // 0 = unlimited
  return false;
}

async function getDailyUsage() {
  const [tCount, aCount] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM social_posts WHERE transcript_fetched_at >= CURRENT_DATE`),
    query(`SELECT COUNT(*)::int AS n FROM transcript_analysis WHERE generated_at >= CURRENT_DATE`),
  ]);
  return {
    transcripts: tCount.rows[0].n,
    ai_analyses: aCount.rows[0].n,
  };
}

// Endpoint de diagnóstico para Fase 4: Social Intelligence
router.get('/diagnostic', async (req, res, next) => {
  try {
    const sourcesCount = await query('SELECT count(*) FROM social_sources');
    const postsCount = await query('SELECT count(*) FROM social_posts');
    const clustersCount = await query('SELECT count(*) FROM social_clusters');

    res.json({
      status: 'ok',
      phase: 4,
      module: 'social_intelligence',
      database: {
        tables_verified: true,
        metrics: {
          social_sources: parseInt(sourcesCount.rows[0].count, 10),
          social_posts: parseInt(postsCount.rows[0].count, 10),
          social_clusters: parseInt(clustersCount.rows[0].count, 10),
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// --- ENPOINTS SPRINT 7.1 ---

// CRUD de Fuentes Sociales
router.get('/sources', async (req, res, next) => {
  try {
    const data = await query(`
      SELECT s.*, COUNT(p.id)::int AS post_count, MAX(p.captured_at) AS last_post_at
      FROM social_sources s
      LEFT JOIN social_posts p ON p.source_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json({ items: data.rows });
  } catch(e) { next(e); }
});

router.post('/sources', async (req, res, next) => {
  try {
    let { name, platform, profile_url, handle, region, category, priority, content_type } = req.body;

    // Self-heal: ensure 'tweets' is a valid content_type (added when X support was implemented)
    await query(`ALTER TABLE social_sources DROP CONSTRAINT IF EXISTS social_sources_content_type_check`).catch(() => {});
    await query(`ALTER TABLE social_sources ADD CONSTRAINT social_sources_content_type_check CHECK (content_type IN ('videos', 'shorts', 'posts', 'tweets'))`).catch(() => {});

    // Insertar con soporte completo y capturar conflictos
    const result = await query(
      `INSERT INTO social_sources (name, platform, profile_url, handle, region, category, priority, content_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       ON CONFLICT (platform, profile_url) DO UPDATE 
       SET name = EXCLUDED.name, region = EXCLUDED.region, category = EXCLUDED.category, priority = EXCLUDED.priority, handle = EXCLUDED.handle, content_type = EXCLUDED.content_type
       RETURNING *`,
      [name, platform, profile_url, handle, region || 'nacional', category || 'medio', priority || 5, content_type || (platform === 'facebook' ? 'posts' : platform === 'x' ? 'tweets' : 'videos')]
    );
    res.json(result.rows[0]);
  } catch(e) { 
    if (e.code === '23505') {
       return res.status(409).json({ error: 'La fuente ya existe en la base de datos.' });
    }
    next(e); 
  }
});

router.delete('/sources/:id', async (req, res, next) => {
  try {
    await query(`DELETE FROM social_sources WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

router.put('/sources/:id', async (req, res, next) => {
  try {
    let { name, platform, profile_url, handle, region, category, priority, enabled, content_type } = req.body;

    const result = await query(
      `UPDATE social_sources 
       SET name=$1, platform=$2, profile_url=$3, handle=$4, region=$5, category=$6, priority=$7, content_type=$8, updated_at=now()
       WHERE id=$9 RETURNING *`,
      [name, platform, profile_url, handle, region || 'nacional', category || 'medio', priority || 5, content_type || (platform === 'facebook' ? 'posts' : platform === 'x' ? 'tweets' : 'videos'), req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Fuente no encontrada' });
    res.json(result.rows[0]);
  } catch(e) { next(e); }
});

router.post('/sources/:id/check', async (req, res, next) => {
  try {
    const sourceRes = await query(`SELECT * FROM social_sources WHERE id = $1`, [req.params.id]);
    if (!sourceRes.rows[0]) return res.status(404).json({ error: 'Fuente no encontrada' });

    const source = sourceRes.rows[0];

    const { SocialFetcherPlaywrightYouTube, SocialFetcherGraphApiFacebook, SocialFetcherPlaywrightInstagram, SocialFetcherX } =
      await import('../connectors/social/fetchers.js');
    const { clusterNewPosts, recalcClusterMetrics, recalcGapScores } =
      await import('../jobs/socialMonitor.js');

    let fetcher;
    if (source.platform === 'youtube')        fetcher = new SocialFetcherPlaywrightYouTube(source);
    else if (source.platform === 'facebook')  fetcher = new SocialFetcherGraphApiFacebook(source);
    else if (source.platform === 'instagram') fetcher = new SocialFetcherPlaywrightInstagram(source);
    else if (source.platform === 'x') {
      if (process.env.ENABLE_X_MONITOR === 'false')
        return res.status(503).json({ error: 'X/Twitter deshabilitado — ENABLE_X_MONITOR=false' });
      fetcher = new SocialFetcherX(source);
    }
    else return res.status(400).json({ error: `Plataforma '${source.platform}' no soportada aún.` });

    const posts = await fetcher.fetchLatest();
    const newPostIds = [];

    for (const p of posts) {
      if (!p.external_id || !p.title?.trim()) continue;
      const resInsert = await query(`
        INSERT INTO social_posts
          (source_id, platform, external_id, url, published_at,
           title, content, thumbnail_url,
           views, likes, comments, shares, engagement_score, keywords)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (platform, external_id) DO UPDATE SET
          views            = GREATEST(social_posts.views, EXCLUDED.views),
          likes            = GREATEST(social_posts.likes, EXCLUDED.likes),
          engagement_score = EXCLUDED.engagement_score,
          title            = EXCLUDED.title,
          thumbnail_url    = CASE WHEN EXCLUDED.thumbnail_url <> '' THEN EXCLUDED.thumbnail_url ELSE social_posts.thumbnail_url END
        RETURNING id, (xmax = 0) AS is_new
      `, [
        source.id, p.platform, p.external_id, p.url || '',
        p.published_at || new Date().toISOString(),
        p.title.slice(0, 500), p.content || '', p.thumbnail_url || '',
        p.views || 0, p.likes || 0, p.comments || 0, p.shares || 0,
        p.engagement_score || 0, JSON.stringify(p.keywords || [])
      ]);
      if (resInsert.rowCount > 0 && resInsert.rows[0].is_new) newPostIds.push(resInsert.rows[0].id);
    }

    await query(`
      UPDATE social_sources
      SET last_checked = now(),
          post_count   = (SELECT COUNT(*) FROM social_posts WHERE source_id = $1)
      WHERE id = $1
    `, [source.id]);

    // Cluster: new posts + any unclustered posts from this source (catches prior on-demand saves)
    const { rows: unclusteredRows } = await query(`
      SELECT sp.id FROM social_posts sp
      WHERE sp.source_id = $1
        AND sp.id NOT IN (SELECT post_id FROM social_cluster_posts)
    `, [source.id]);
    const toCluster = [...new Set([...newPostIds, ...unclusteredRows.map(r => r.id)])];

    let clusters = { created: 0, joined: 0, clusterIds: [] };
    if (toCluster.length) {
      clusters = await clusterNewPosts(toCluster);
      if (clusters.clusterIds.length) {
        await recalcClusterMetrics(clusters.clusterIds);
        await recalcGapScores();
      }
    }

    // Devolver los posts de las últimas 24 horas para esta fuente
    const recientes = await query(`
      SELECT id, platform, external_id, url, title, thumbnail_url,
             likes, views, engagement_score, captured_at
      FROM social_posts
      WHERE source_id = $1
        AND captured_at >= now() - interval '24 hours'
      ORDER BY captured_at DESC
    `, [source.id]);

    const response = {
      fetched: posts.length,
      new_posts: newPostIds.length,
      clusters_created: clusters.created,
      clusters_joined: clusters.joined,
      posts_24h: recientes.rows.length,
      posts: recientes.rows,
    };

    // Diagnostic hints when X returns 0 posts
    if (source.platform === 'x' && posts.length === 0) {
      const username = source.handle?.replace(/^@/, '').trim()
        || source.profile_url?.match(/(?:twitter\.com|x\.com)\/@?([^/?#\s]+)/i)?.[1]
        || '(desconocido)';
      const hasCreds = !!(process.env.X_AUTH_TOKEN && process.env.X_CT0);
      response._debug = {
        username_tried: username,
        handle_in_db: source.handle || null,
        profile_url: source.profile_url,
        auth_configured: hasCreds,
        hint: hasCreds
          ? 'Credenciales configuradas pero 0 tweets obtenidos. Las cookies X_AUTH_TOKEN/X_CT0 pueden haber expirado — renovarlas desde una sesión activa de x.com.'
          : 'Sin credenciales. Añadir X_AUTH_TOKEN y X_CT0 al .env (cookies de una sesión activa de x.com) para scraping confiable.',
      };
    }

    res.json(response);
  } catch(e) { next(e); }
});

// Estadísticas generales
router.get('/stats', async (req, res, next) => {
  try {
    const [p, s, yt, fb, xq, ig, st, cls, today, gaps, gaps2] = await Promise.all([
      query(`SELECT count(*) as total, COALESCE(sum(views), 0) as engagement FROM social_posts WHERE captured_at >= now() - interval '48 hours'`),
      query(`SELECT count(*) as total FROM social_sources WHERE enabled = true`),
      query(`SELECT count(*) as total FROM social_sources WHERE platform = 'youtube'   AND enabled = true`),
      query(`SELECT count(*) as total FROM social_sources WHERE platform = 'facebook'  AND enabled = true`),
      query(`SELECT count(*) as total FROM social_sources WHERE platform = 'x'         AND enabled = true`),
      query(`SELECT count(*) as total FROM social_sources WHERE platform = 'instagram' AND enabled = true`),
      query(`SELECT count(*) as total FROM social_sources`),
      query(`SELECT count(*) as total FROM social_clusters WHERE status = 'active'`),
      query(`SELECT count(*) as total FROM social_posts WHERE captured_at >= now() - interval '24 hours'`),
      query(`SELECT count(*) as total FROM social_clusters WHERE status = 'active' AND gap_score >= 0.7 AND viral_score > 10`).catch(() => ({ rows: [{ total: 0 }] })),
      query(`
        SELECT
          count(*) FILTER (WHERE opportunity_score >= 70) as muy_alta,
          count(*) FILTER (WHERE opportunity_score >= 40 AND opportunity_score < 70) as media,
          count(*) FILTER (WHERE opportunity_score > 0 AND opportunity_score < 40) as baja
        FROM social_clusters WHERE status='active'
      `).catch(() => ({ rows: [{ muy_alta: 0, media: 0, baja: 0 }] })),
    ]);

    const opp = gaps2.rows[0];
    res.json({
      posts_today:              parseInt(today.rows[0].total),
      clusters_active:          parseInt(cls.rows[0].total),
      total_engagement_active:  parseInt(p.rows[0].engagement),
      content_gaps:             parseInt(gaps.rows[0].total),
      opportunities_muy_alta:   parseInt(opp.muy_alta || 0),
      opportunities_media:      parseInt(opp.media || 0),
      opportunities_baja:       parseInt(opp.baja || 0),
      youtube_sources:          parseInt(yt.rows[0].total),
      facebook_sources:         parseInt(fb.rows[0].total),
      x_sources:                parseInt(xq.rows[0].total),
      instagram_sources:        parseInt(ig.rows[0].total),
      sources_total:            parseInt(st.rows[0].total),
      sources_active:           parseInt(s.rows[0].total),
      totalPosts:               parseInt(p.rows[0].total),
      totalEngagement:          parseInt(p.rows[0].engagement),
      activeSources:            parseInt(s.rows[0].total),
    });
  } catch(e) { next(e); }
});

router.get('/youtube-quota', async (req, res, next) => {
  res.json({ usedToday: 0, estimateDaily: 0, percentUsed: 0, channelsCount: 0 });
});

// Clusters virales
router.get('/clusters', async (req, res, next) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit)  || 100, 300);
    const hours    = parseInt(req.query.hours) || 0;
    const platform = req.query.platform || '';
    const sort     = req.query.sort || 'trend';

    const params = [];
    let timeCondition     = '';
    let platformCondition = '';

    if (hours > 0) {
      params.push(hours);
      timeCondition = `AND sc.last_seen >= now() - make_interval(hours => $${params.length})`;
    }
    if (platform) {
      params.push(platform);
      platformCondition = `AND $${params.length} = ANY(COALESCE(agg.platforms, '{}'))`;
    }

    const sortClause = {
      recent:     'sc.last_seen DESC',
      engagement: 'sc.total_engagement DESC, sc.viral_score DESC',
      trend:      'trend_score DESC, sc.total_engagement DESC',
    }[sort] ?? 'trend_score DESC, sc.total_engagement DESC';

    const data = await query(`
      SELECT sc.*,
        COALESCE(sc.opportunity_score, 0) AS opportunity_score,
        CASE WHEN COALESCE(sc.opportunity_score,0) >= 70 THEN 'MUY_ALTA'
             WHEN COALESCE(sc.opportunity_score,0) >= 40 THEN 'MEDIA'
             ELSE 'BAJA' END AS opportunity_tier,
        ROUND(
          COALESCE(sc.total_engagement, 0)::numeric /
          GREATEST(EXTRACT(EPOCH FROM (now() - sc.last_seen)) / 60, 1),
        4) AS trend_score,
        COALESCE(agg.platforms, '{}') AS platforms,
        COALESCE(agg.regions,   '{}') AS regions,
        COALESCE(agg.sources,   '{}') AS sources
      FROM social_clusters sc
      LEFT JOIN (
        SELECT scp.cluster_id,
          ARRAY_AGG(DISTINCT ss.platform) FILTER (WHERE ss.platform IS NOT NULL) AS platforms,
          ARRAY_AGG(DISTINCT ss.region)   FILTER (WHERE ss.region   IS NOT NULL) AS regions,
          ARRAY_AGG(DISTINCT ss.name)     FILTER (WHERE ss.name     IS NOT NULL) AS sources
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        JOIN social_sources ss ON ss.id = sp.source_id
        GROUP BY scp.cluster_id
      ) agg ON agg.cluster_id = sc.id
      WHERE sc.status = 'active'
        ${timeCondition}
        ${platformCondition}
      ORDER BY ${sortClause}
      LIMIT ${limit}
    `, params);
    res.json({ items: data.rows });
  } catch(e) { next(e); }
});

// Top fuentes
router.get('/top-sources', async (req, res, next) => {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const data = await query(`
      SELECT
        s.id, s.name, s.platform, s.profile_url, s.region, s.category,
        COUNT(p.id) as recent_posts,
        COALESCE(SUM(p.views), 0) as total_engagement,
        MAX(p.captured_at) as last_post_at
      FROM social_sources s
      LEFT JOIN social_posts p ON p.source_id = s.id AND p.captured_at >= now() - make_interval(hours => $1)
      WHERE s.enabled = true
      GROUP BY s.id
      ORDER BY total_engagement DESC, recent_posts DESC
      LIMIT 15
    `, [hours]);
    res.json({ items: data.rows });
  } catch(e) { next(e); }
});

// Oportunidades Editoriales — panel principal de decisiones
router.get('/opportunities', async (req, res, next) => {
  try {
    const hours    = parseInt(req.query.hours)    || 0;
    const tier     = req.query.tier     || '';
    const region   = req.query.region   || '';
    const platform = req.query.platform || '';

    const params = [];

    let tierCondition = '';
    if (tier === 'MUY_ALTA') tierCondition = 'AND sc.opportunity_score >= 70';
    else if (tier === 'MEDIA') tierCondition = 'AND sc.opportunity_score >= 40 AND sc.opportunity_score < 70';
    else if (tier === 'BAJA')  tierCondition = 'AND sc.opportunity_score > 0 AND sc.opportunity_score < 40';

    let timeCondition = '';
    if (hours > 0) {
      params.push(hours);
      timeCondition = `AND sc.last_seen >= now() - make_interval(hours => $${params.length})`;
    }

    let regionCondition = '';
    if (region) {
      params.push(region);
      regionCondition = `AND $${params.length} = ANY(regions)`;
    }

    let platformCondition = '';
    if (platform) {
      params.push(platform);
      platformCondition = `AND $${params.length} = ANY(platforms)`;
    }

    const data = await query(`
      SELECT * FROM (
        SELECT
          sc.id, sc.title,
          sc.viral_score,
          round(sc.gap_score::numeric, 2)          AS gap_score,
          round(COALESCE(sc.opportunity_score,0)::numeric, 1) AS opportunity_score,
          CASE WHEN COALESCE(sc.opportunity_score,0) >= 70 THEN 'MUY_ALTA'
               WHEN COALESCE(sc.opportunity_score,0) >= 40 THEN 'MEDIA'
               ELSE 'BAJA' END                     AS opportunity_tier,
          sc.total_engagement, sc.source_count, sc.post_count,
          sc.last_seen, sc.first_seen,
          ARRAY_AGG(DISTINCT ss.region)  FILTER (WHERE ss.region  IS NOT NULL) AS regions,
          ARRAY_AGG(DISTINCT ss.name)    FILTER (WHERE ss.name    IS NOT NULL) AS source_names,
          ARRAY_AGG(DISTINCT ss.platform)FILTER (WHERE ss.platform IS NOT NULL) AS platforms,
          COUNT(sp.id) FILTER (WHERE sp.transcript_available = true)  AS transcripts_available,
          COUNT(sp.id) FILTER (WHERE sp.platform = 'youtube')          AS youtube_posts,
          COUNT(ta.id) FILTER (WHERE ta.id IS NOT NULL)                AS has_analysis_count
        FROM social_clusters sc
        LEFT JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
        LEFT JOIN social_posts         sp  ON sp.id  = scp.post_id
        LEFT JOIN social_sources       ss  ON ss.id  = sp.source_id
        LEFT JOIN transcript_analysis  ta  ON ta.post_id = sp.id
        WHERE sc.status = 'active'
          AND COALESCE(sc.opportunity_score, 0) > 0
          ${tierCondition}
          ${timeCondition}
        GROUP BY sc.id
      ) t
      WHERE 1=1 ${regionCondition} ${platformCondition}
      ORDER BY t.opportunity_score DESC
      LIMIT 100
    `, params);

    const items = data.rows;
    res.json({
      items,
      summary: {
        muy_alta: items.filter(i => i.opportunity_tier === 'MUY_ALTA').length,
        media:    items.filter(i => i.opportunity_tier === 'MEDIA').length,
        baja:     items.filter(i => i.opportunity_tier === 'BAJA').length,
        total:    items.length,
      }
    });
  } catch(e) { next(e); }
});

// Brechas Editoriales — usa gap_score Jaccard calculado por el worker
router.get('/content-gap', async (req, res, next) => {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const limit = parseInt(req.query.limit) || 60;

    const queryStr = `
      SELECT id, title, viral_score, gap_score,
             COALESCE(opportunity_score, 0) as opportunity_score,
             total_engagement, source_count, post_count, last_seen
      FROM social_clusters
      WHERE status = 'active'
        AND viral_score > 10
        AND last_seen >= now() - make_interval(hours => $1)
      ORDER BY opportunity_score DESC, viral_score DESC
      LIMIT $2
    `;

    const data = await query(queryStr, [hours, limit]);

    const opportunities = data.rows.map(row => {
      const g = parseFloat(row.gap_score) || 0;
      const opp = parseFloat(row.opportunity_score) || 0;
      const gap_status = g >= 0.7 ? 'gap' : g >= 0.35 ? 'partial' : 'covered';
      const opportunity_tier = opp >= 70 ? 'MUY_ALTA' : opp >= 40 ? 'MEDIA' : 'BAJA';
      return { ...row, gap_status, opportunity_tier };
    });

    res.json({
      items: opportunities,
      summary: {
        gap:     opportunities.filter(o => o.gap_status === 'gap').length,
        partial: opportunities.filter(o => o.gap_status === 'partial').length,
        covered: opportunities.filter(o => o.gap_status === 'covered').length,
      }
    });
  } catch(e) { next(e); }
});

// -- NUEVOS ENDPOINTS DE DRILL-DOWN Y DEBUG --

router.get('/debug', async (req, res, next) => {
  try {
    const total_sources = await query(`SELECT count(*) FROM social_sources`);
    const total_posts = await query(`SELECT count(*) FROM social_posts`);
    const total_clusters = await query(`SELECT count(*) FROM social_clusters`);
    const posts48h = await query(`SELECT count(*) FROM social_posts WHERE captured_at >= now() - interval '48 hours'`);
    const unclustered = await query(`SELECT count(*) FROM social_posts WHERE id NOT IN (SELECT post_id FROM social_cluster_posts)`);

    res.json({
      total_sources: parseInt(total_sources.rows[0].count),
      total_posts: parseInt(total_posts.rows[0].count),
      total_clusters: parseInt(total_clusters.rows[0].count),
      total_posts_last_48h: parseInt(posts48h.rows[0].count),
      total_unclustered_posts: parseInt(unclustered.rows[0].count),
    });
  } catch(e) { next(e); }
});

router.get('/sources/:id/posts', async (req, res, next) => {
  try {
    const data = await query(`
      SELECT id, title, url, platform, views, likes, comments, published_at, engagement_score, external_id, thumbnail_url
      FROM social_posts 
      WHERE source_id = $1 
      ORDER BY published_at DESC NULLS LAST, captured_at DESC LIMIT 20
    `, [req.params.id]);
    res.json({ items: data.rows });
  } catch(e) { next(e); }
});

router.get('/clusters/:id/posts', async (req, res, next) => {
  try {
    const platform = req.query.platform || '';
    const params = [req.params.id];
    let platformClause = '';
    if (platform) {
      params.push(platform);
      platformClause = `AND p.platform = $${params.length}`;
    }
    const data = await query(`
      SELECT p.id, p.title, p.url, p.platform,
             p.views, p.likes, p.thumbnail_url, p.captured_at,
             p.transcript_available, p.transcript_fetched_at,
             s.name AS source_name,
             -- URL has priority over source content_type (FASE 2 fix)
             CASE
               WHEN p.platform = 'youtube' AND p.url LIKE '%/shorts/%'                          THEN 'shorts'
               WHEN p.platform = 'youtube' AND (p.url LIKE '%watch?v=%' OR p.url LIKE '%youtu.be/%') THEN 'videos'
               WHEN p.platform = 'youtube' AND (p.url LIKE '%/post/%' OR p.url LIKE '%/community%') THEN 'posts'
               ELSE s.content_type
             END AS content_type,
             vt.transcript_language, vt.transcript_source, vt.transcript_length,
             ta.summary IS NOT NULL AS has_analysis
      FROM social_posts p
      JOIN social_cluster_posts scp ON scp.post_id = p.id
      JOIN social_sources s ON s.id = p.source_id
      LEFT JOIN video_transcripts vt ON vt.post_id = p.id
      LEFT JOIN transcript_analysis ta ON ta.post_id = p.id
      WHERE scp.cluster_id = $1 ${platformClause}
      ORDER BY p.captured_at ASC
    `, params);
    res.json({ items: data.rows });
  } catch(e) { next(e); }
});

// ── Health endpoint (FASE 6) ──────────────────────────────────────────────────

router.get('/health', async (req, res, next) => {
  try {
    // Ensure migration columns exist before querying them
    await query(`ALTER TABLE social_fetch_logs ADD COLUMN IF NOT EXISTS posts_saved INTEGER DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE social_clusters   ADD COLUMN IF NOT EXISTS gap_score FLOAT DEFAULT 0`).catch(() => {});

    const [sourcesRes, logsRes, postsRes, clustersRes, lastRunRes, topErrorRes] = await Promise.all([
      query(`SELECT COUNT(*) FILTER (WHERE enabled) AS active, COUNT(*) AS total FROM social_sources`),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE success)     AS ok,
          COUNT(*) FILTER (WHERE NOT success) AS errors,
          COALESCE(SUM(posts_found), 0)       AS posts_found,
          COALESCE(SUM(posts_saved), 0)       AS posts_saved
        FROM social_fetch_logs
        WHERE started_at >= CURRENT_DATE
      `),
      query(`SELECT COUNT(*) FROM social_posts WHERE captured_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*) FROM social_clusters WHERE first_seen >= CURRENT_DATE`),
      query(`SELECT MAX(finished_at) AS last_run_at FROM social_fetch_logs`),
      query(`
        SELECT s.name, l.error_message
        FROM social_fetch_logs l
        JOIN social_sources s ON s.id = l.source_id
        WHERE l.success = false AND l.started_at >= CURRENT_DATE
        ORDER BY l.started_at DESC LIMIT 5
      `),
    ]);

    res.json({
      sources_active:           parseInt(sourcesRes.rows[0].active),
      sources_total:            parseInt(sourcesRes.rows[0].total),
      sources_ok_today:         parseInt(logsRes.rows[0].ok),
      errors_today:             parseInt(logsRes.rows[0].errors),
      posts_found_today:        parseInt(logsRes.rows[0].posts_found),
      posts_saved_today:        parseInt(logsRes.rows[0].posts_saved),
      posts_in_db_today:        parseInt(postsRes.rows[0].count),
      clusters_created_today:   parseInt(clustersRes.rows[0].count),
      last_run_at:              lastRunRes.rows[0].last_run_at,
      recent_errors:            topErrorRes.rows,
    });
  } catch (e) { next(e); }
});

// ── FASE 3: Transcript health dashboard ──────────────────────────────────────

router.get('/transcripts/health', async (req, res, next) => {
  try {
    // Active provider (env takes precedence over DB)
    const envProvider = process.env.TRANSCRIPT_PROVIDER?.toLowerCase();
    let activeProvider = envProvider;
    if (!activeProvider) {
      const { rows: [r] } = await query(
        `SELECT value FROM settings WHERE key = 'transcript_provider'`
      ).catch(() => ({ rows: [] }));
      activeProvider = r?.value || 'playwright';
    }

    const [statsR, lenR, errR, qualR] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                                   AS total_eligible,
          COUNT(*) FILTER (WHERE sp.transcript_available = true)     AS with_transcript,
          COUNT(*) FILTER (WHERE sp.transcript_available = false)    AS without_transcript,
          COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL)   AS pending,
          ROUND(
            COUNT(*) FILTER (WHERE sp.transcript_available = true) * 100.0
            / NULLIF(COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NOT NULL), 0)
          , 1)                                                       AS coverage_pct
        FROM social_posts sp
        JOIN social_sources ss ON ss.id = sp.source_id
        WHERE sp.platform = 'youtube' AND ss.content_type IN ('videos','shorts')
      `),
      query(`
        SELECT
          ROUND(AVG(transcript_length)) AS avg_length,
          ROUND(AVG(word_count))        AS avg_words,
          ROUND(AVG(quality_score))     AS avg_quality
        FROM video_transcripts
      `),
      // "errors" = videos marked false in last 24h (conservative proxy for failures)
      query(`
        SELECT COUNT(*)::int AS errors_24h
        FROM social_posts sp
        JOIN social_sources ss ON ss.id = sp.source_id
        WHERE sp.platform = 'youtube'
          AND ss.content_type IN ('videos','shorts')
          AND sp.transcript_available = false
          AND sp.transcript_fetched_at >= NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*)::int AS ai_analyses_today
        FROM transcript_analysis
        WHERE generated_at >= CURRENT_DATE
      `),
    ]);

    const s = statsR.rows[0];
    const l = lenR.rows[0];
    res.json({
      provider:           activeProvider,
      total_eligible:     parseInt(s.total_eligible),
      with_transcript:    parseInt(s.with_transcript),
      without_transcript: parseInt(s.without_transcript),
      pending:            parseInt(s.pending),
      coverage_pct:       parseFloat(s.coverage_pct ?? 0),
      avg_length:         parseInt(l.avg_length ?? 0),
      avg_words:          parseInt(l.avg_words ?? 0),
      avg_quality:        parseInt(l.avg_quality ?? 0),
      errors_24h:         errR.rows[0].errors_24h,
      ai_analyses_today:  qualR.rows[0].ai_analyses_today,
    });
  } catch (e) { next(e); }
});

// ── FASE 2: Get transcript for a specific post ────────────────────────────────

router.get('/posts/:id/transcript', async (req, res, next) => {
  try {
    const { rows: [vt] } = await query(`
      SELECT vt.*, sp.title, sp.url, sp.thumbnail_url, ss.name AS source_name
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE vt.post_id = $1
    `, [req.params.id]);

    if (!vt) return res.status(404).json({ error: 'No transcript found' });
    res.json(vt);
  } catch (e) { next(e); }
});

// ── FASE 3: Trigger AI analysis of a transcript (on-demand, daily limit) ─────

router.post('/posts/:id/analyze', async (req, res, next) => {
  try {
    // Daily limit check — skip for admins and when limit=0 (unlimited)
    const [limits, usage] = await Promise.all([getDailyLimits(), getDailyUsage()]);
    if (!isUnlimited(req, limits.ai_analyses) && usage.ai_analyses >= limits.ai_analyses) {
      return res.status(429).json({
        error: `Límite diario de análisis IA alcanzado (${limits.ai_analyses}/día). Se reinicia a medianoche.`,
        limit: limits.ai_analyses, used: usage.ai_analyses,
      });
    }

    const { rows: [vt] } = await query(`
      SELECT vt.transcript_text, sp.title, sp.url, ss.name AS source_name
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE vt.post_id = $1
    `, [req.params.id]);

    if (!vt) return res.status(404).json({ error: 'No hay transcript para este post' });

    const editorialType = detectEditorialType(vt.title, vt.transcript_text);

    const prompt = `Eres un analista periodístico. Analiza esta transcripción de video y extrae la información clave.

Video: "${vt.title}"
Canal: ${vt.source_name}

Transcripción:
${vt.transcript_text.slice(0, 12_000)}

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "summary": "resumen ejecutivo en 100-150 palabras",
  "key_points": ["punto clave 1", "punto clave 2", "punto clave 3", "punto clave 4", "punto clave 5"],
  "entities_people": ["persona1", "persona2"],
  "entities_orgs": ["org1", "org2"],
  "entities_places": ["lugar1", "lugar2"],
  "main_topics": ["tema1", "tema2", "tema3"],
  "quotes": ["cita destacada 1", "cita destacada 2"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

    const msg = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1500, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    let analysis;
    try {
      const jsonMatch = msg.content[0].text.match(/\{[\s\S]+\}/);
      analysis = JSON.parse(jsonMatch?.[0] ?? msg.content[0].text);
    } catch {
      return res.status(500).json({ error: 'AI devolvió JSON inválido', raw: msg.content[0].text });
    }

    await query(`
      INSERT INTO transcript_analysis
        (post_id, summary, key_points, entities_people, entities_places, entities_orgs,
         main_topics, quotes, keywords, editorial_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (post_id) DO UPDATE SET
        summary=$2, key_points=$3, entities_people=$4, entities_places=$5,
        entities_orgs=$6, main_topics=$7, quotes=$8, keywords=$9,
        editorial_type=$10, generated_at=NOW()
    `, [
      req.params.id,
      analysis.summary        ?? '',
      JSON.stringify(analysis.key_points      ?? []),
      JSON.stringify(analysis.entities_people ?? []),
      JSON.stringify(analysis.entities_places ?? []),
      JSON.stringify(analysis.entities_orgs   ?? []),
      JSON.stringify(analysis.main_topics     ?? []),
      JSON.stringify(analysis.quotes          ?? []),
      JSON.stringify(analysis.keywords        ?? []),
      editorialType,
    ]);

    res.json({
      ok: true,
      analysis: { ...analysis, editorial_type: editorialType },
      usage: { used: usage.ai_analyses + 1, limit: limits.ai_analyses },
    });
  } catch (e) { next(e); }
});

// ── FASE 3: Get existing analysis ────────────────────────────────────────────

router.get('/posts/:id/analysis', async (req, res, next) => {
  try {
    const { rows: [analysis] } = await query(`
      SELECT ta.*, sp.title, sp.url, ss.name AS source_name
      FROM transcript_analysis ta
      JOIN social_posts sp ON sp.id = ta.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ta.post_id = $1
    `, [req.params.id]);

    if (!analysis) return res.status(404).json({ error: 'No analysis yet' });
    res.json(analysis);
  } catch (e) { next(e); }
});

// ── FASE 5: Generate editorial draft ─────────────────────────────────────────

router.post('/posts/:id/draft', async (req, res, next) => {
  try {
    const { rows: [row] } = await query(`
      SELECT vt.transcript_text, sp.title, sp.url, sp.published_at,
             ss.name AS source_name, ss.platform
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE vt.post_id = $1
    `, [req.params.id]);

    if (!row) return res.status(404).json({ error: 'No transcript — draft cannot be generated' });

    const date = row.published_at
      ? new Date(row.published_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'fecha desconocida';

    const prompt = `Eres un periodista profesional. Escribe un BORRADOR PERIODÍSTICO basado EXCLUSIVAMENTE en la transcripción de video que se proporciona a continuación.

REGLAS OBLIGATORIAS — NO NEGOCIABLES:
1. Usar únicamente información EXPLÍCITAMENTE presente en la transcripción
2. No inventar datos, no inferir hechos no mencionados
3. No agregar contexto externo que no esté en la transcripción
4. Citar la fuente: video de ${row.source_name} (${row.url})
5. Este es un BORRADOR — siempre requiere revisión editorial humana

Datos del video:
- Título: ${row.title}
- Canal: ${row.source_name}
- Fecha: ${date}
- Plataforma: YouTube

Transcripción:
${row.transcript_text.slice(0, 10_000)}

Escribe el borrador en español, con formato periodístico estándar (titular, bajada, cuerpo). Al inicio incluye:

⚠️ BORRADOR PERIODÍSTICO — REQUIERE REVISIÓN EDITORIAL
Fuente: ${row.source_name} — ${row.url}`;

    const draftMsg = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 2000, temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    const draft = draftMsg.content[0].text;

    res.json({ ok: true, draft, source_url: row.url, source_name: row.source_name });
  } catch (e) { next(e); }
});

// ── FASE 1 (Sprint 8.3): Full transcript audit with per-source breakdown ──────

router.get('/transcripts/audit', async (req, res, next) => {
  try {
    const { rows: [global] } = await query(`
      SELECT
        COUNT(sp.id)                                                        AS videos_total,
        COUNT(*) FILTER (WHERE sp.transcript_available = true)             AS videos_con_transcript,
        COUNT(*) FILTER (WHERE sp.transcript_available = false)            AS videos_sin_transcript,
        COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL)           AS pendientes,
        ROUND(
          COUNT(*) FILTER (WHERE sp.transcript_available = true) * 100.0
          / NULLIF(COUNT(*), 0)
        , 1)                                                               AS cobertura_pct,
        ROUND(AVG(vt.quality_score))                                       AS avg_quality_score
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      LEFT JOIN video_transcripts vt ON vt.post_id = sp.id
      WHERE sp.platform = 'youtube'
        AND ss.content_type IN ('videos', 'shorts')
    `);

    const { rows: porFuente } = await query(`
      SELECT
        ss.name AS source,
        COUNT(sp.id)                                                        AS total,
        COUNT(*) FILTER (WHERE sp.transcript_available = true)             AS con_transcript,
        COUNT(*) FILTER (WHERE sp.transcript_available = false)            AS sin_transcript,
        COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL)           AS pendientes,
        ROUND(
          COUNT(*) FILTER (WHERE sp.transcript_available = true) * 100.0
          / NULLIF(COUNT(sp.id), 0)
        , 1)                                                               AS cobertura_pct,
        ROUND(AVG(vt.quality_score))                                       AS avg_quality_score
      FROM social_sources ss
      JOIN social_posts sp ON sp.source_id = ss.id
      LEFT JOIN video_transcripts vt ON vt.post_id = sp.id
      WHERE ss.platform = 'youtube'
        AND ss.content_type IN ('videos', 'shorts')
        AND ss.enabled = true
      GROUP BY ss.id, ss.name
      ORDER BY con_transcript DESC NULLS LAST, total DESC
    `);

    const { rows: langs } = await query(`
      SELECT transcript_language, COUNT(*)::int AS count
      FROM video_transcripts
      WHERE transcript_language IS NOT NULL
      GROUP BY transcript_language
      ORDER BY count DESC
    `).catch(() => ({ rows: [] }));

    res.json({
      videos_total:           parseInt(global.videos_total),
      videos_con_transcript:  parseInt(global.videos_con_transcript),
      videos_sin_transcript:  parseInt(global.videos_sin_transcript),
      pendientes:             parseInt(global.pendientes),
      cobertura_pct:          parseFloat(global.cobertura_pct ?? 0),
      avg_quality_score:      parseInt(global.avg_quality_score ?? 0),
      languages:              langs,
      por_fuente: porFuente.map(r => ({
        source:             r.source,
        total:              parseInt(r.total),
        con_transcript:     parseInt(r.con_transcript),
        sin_transcript:     parseInt(r.sin_transcript),
        pendientes:         parseInt(r.pendientes),
        cobertura_pct:      parseFloat(r.cobertura_pct ?? 0),
        avg_quality_score:  parseInt(r.avg_quality_score ?? 0),
      })),
    });
  } catch (e) { next(e); }
});

// ── FASE 8 (Sprint 8.3): Executive dossier from transcript ────────────────────

router.post('/posts/:id/dossier', async (req, res, next) => {
  try {
    const { rows: [row] } = await query(`
      SELECT vt.transcript_text, vt.quality_score,
             sp.title, sp.url, sp.published_at,
             ss.name AS source_name,
             ta.summary, ta.entities_people, ta.entities_orgs,
             ta.entities_places, ta.main_topics, ta.quotes, ta.keywords
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      LEFT JOIN transcript_analysis ta ON ta.post_id = sp.id
      WHERE vt.post_id = $1
    `, [req.params.id]);

    if (!row) return res.status(404).json({ error: 'No hay transcript — el dossier no puede generarse' });

    const date = row.published_at
      ? new Date(row.published_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'fecha desconocida';

    const analysisCtx = row.summary
      ? `\nAnálisis previo:\n- Resumen: ${row.summary}\n- Personas: ${JSON.stringify(row.entities_people)}\n- Orgs: ${JSON.stringify(row.entities_orgs)}\n- Lugares: ${JSON.stringify(row.entities_places)}\n- Temas: ${JSON.stringify(row.main_topics)}\n`
      : '';

    const prompt = `Eres un analista periodístico. Genera un DOSSIER EJECUTIVO basado EXCLUSIVAMENTE en la siguiente transcripción de video.

REGLAS OBLIGATORIAS:
1. Usar SOLO información explícitamente presente en la transcripción
2. No inventar datos, no inferir hechos no mencionados
3. No agregar contexto externo
4. Siempre indicar fuente: ${row.source_name} — ${row.url}

Video: "${row.title}"
Canal: ${row.source_name}
Fecha: ${date}
${analysisCtx}
Transcripción:
${row.transcript_text.slice(0, 12_000)}

Responde ÚNICAMENTE con JSON válido:
{
  "titulo": "título ejecutivo del dossier",
  "resumen_ejecutivo": "qué pasó en 2-3 oraciones",
  "que_paso": "descripción detallada 150-250 palabras",
  "participantes": [{"nombre": "...", "rol": "..."}],
  "cronologia": [{"momento": "...", "hecho": "..."}],
  "datos_relevantes": ["dato clave 1", "dato clave 2"],
  "citas_textuales": ["cita literal 1", "cita literal 2"],
  "keywords": ["kw1", "kw2", "kw3"],
  "fuentes": ["${row.source_name} — ${row.url}"]
}`;

    const msg = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 2000, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const jsonMatch = msg.content[0].text.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI devolvió JSON inválido', raw: msg.content[0].text });

    const dossier = JSON.parse(jsonMatch[0]);
    res.json({ ok: true, dossier, source_url: row.url, source_name: row.source_name });
  } catch (e) { next(e); }
});

// ── Sprint 8.4 FASE 1: On-demand transcript fetch for a single post ───────────

router.post('/posts/:id/transcript', async (req, res, next) => {
  try {
    const { rows: [post] } = await query(`
      SELECT sp.id, sp.url, sp.title, sp.platform, sp.transcript_available,
             ss.name AS source_name,
             CASE
               WHEN sp.platform = 'youtube' AND sp.url LIKE '%/shorts/%'                                THEN 'shorts'
               WHEN sp.platform = 'youtube' AND (sp.url LIKE '%watch?v=%' OR sp.url LIKE '%youtu.be/%') THEN 'videos'
               WHEN sp.platform = 'youtube' AND (sp.url LIKE '%/post/%' OR sp.url LIKE '%/community%')  THEN 'posts'
               ELSE ss.content_type
             END AS content_type
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE sp.id = $1
    `, [req.params.id]);

    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.platform !== 'youtube') return res.status(400).json({ error: 'Solo YouTube admite transcripts' });
    if (!['videos', 'shorts'].includes(post.content_type)) {
      return res.status(400).json({ error: 'Los posts de comunidad no tienen captions' });
    }

    // Check daily limit — skip for admins and when limit=0 (unlimited)
    const [limits, usage] = await Promise.all([getDailyLimits(), getDailyUsage()]);
    if (!isUnlimited(req, limits.transcripts) && usage.transcripts >= limits.transcripts) {
      return res.status(429).json({
        error: `Límite diario alcanzado (${limits.transcripts} transcripts/día). Se reinicia a medianoche.`,
        limit: limits.transcripts, used: usage.transcripts,
      });
    }

    // Determine active provider: env var takes precedence over DB setting
    const envProvider = process.env.TRANSCRIPT_PROVIDER?.toLowerCase();
    let provider = envProvider;
    if (!provider) {
      const { rows: [providerRow] } = await query(
        `SELECT value FROM settings WHERE key = 'transcript_provider'`
      ).catch(() => ({ rows: [] }));
      provider = providerRow?.value || 'playwright';
    }

    if (provider === 'disabled') {
      return res.status(503).json({ error: 'Transcripts desactivados (TRANSCRIPT_PROVIDER=disabled)' });
    }

    // playwright = Playwright UI scraping (recommended — bypasses timedtext 429)
    // legacy     = direct timedtext HTTP (may hit 429 under load)
    const fetchFn = provider === 'legacy' ? fetchYouTubeTranscript : fetchYouTubeTranscriptViaPlaywright;
    const result = await fetchFn(post.url);

    if (result === null) {
      console.error(`[TRANSCRIPT/${provider}] transient error for post`, post.id, post.url);
      return res.status(503).json({
        error: 'Error transitorio al obtener transcript. Intentá de nuevo en unos minutos.',
        retry: true,
      });
    }

    if (!result.available) {
      // Do NOT set transcript_fetched_at — failed attempts don't consume daily quota
      await query(`UPDATE social_posts SET transcript_available=false WHERE id=$1`, [post.id]);
      return res.status(404).json({
        error: `El video no tiene captions disponibles (${result.reason})`,
        reason: result.reason,
        available: false,
      });
    }

    const wordCount    = result.text.trim().split(/\s+/).filter(Boolean).length;
    const qualityScore = calculateQualityScore(result.text, result.source);

    await query(`
      INSERT INTO video_transcripts
        (post_id, transcript_text, transcript_language, transcript_source,
         transcript_length, word_count, quality_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (post_id) DO UPDATE SET
        transcript_text=$2, transcript_language=$3, transcript_source=$4,
        transcript_length=$5, word_count=$6, quality_score=$7, fetched_at=NOW()
    `, [post.id, result.text, result.language, result.source, result.text.length, wordCount, qualityScore]);

    await query(`UPDATE social_posts SET transcript_available=true, transcript_fetched_at=NOW() WHERE id=$1`, [post.id]);

    res.json({
      ok: true,
      transcript: {
        language: result.language,
        source: result.source,
        word_count: wordCount,
        quality_score: qualityScore,
        length: result.text.length,
        preview: result.text.slice(0, 200),
      },
      usage: { used: usage.transcripts + 1, limit: limits.transcripts },
    });
  } catch (e) { next(e); }
});

// ── Sprint 8.4 FASE 6: Daily usage counters ───────────────────────────────────

router.get('/transcripts/daily-usage', async (req, res, next) => {
  try {
    const [limits, usage] = await Promise.all([getDailyLimits(), getDailyUsage()]);
    res.json({
      transcripts: { used: usage.transcripts, limit: limits.transcripts },
      ai_analyses: { used: usage.ai_analyses, limit: limits.ai_analyses },
    });
  } catch (e) { next(e); }
});

// ── FASE 6: Transcript stats for opportunities endpoint ───────────────────────
// (opportunities endpoint already exists — update it to include transcript info)

router.get('/transcripts/by-cluster/:clusterId', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT sp.id AS post_id, sp.title, sp.url, sp.thumbnail_url,
             sp.transcript_available, sp.transcript_fetched_at,
             vt.transcript_language, vt.transcript_source, vt.transcript_length,
             ta.summary IS NOT NULL AS has_analysis,
             ss.name AS source_name
      FROM social_cluster_posts scp
      JOIN social_posts sp ON sp.id = scp.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      LEFT JOIN video_transcripts vt ON vt.post_id = sp.id
      LEFT JOIN transcript_analysis ta ON ta.post_id = sp.id
      WHERE scp.cluster_id = $1
        AND sp.platform = 'youtube'
        AND ss.content_type IN ('videos', 'shorts')
      ORDER BY sp.captured_at ASC
    `, [req.params.clusterId]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

export default router;
