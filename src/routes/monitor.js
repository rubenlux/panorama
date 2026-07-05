import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /monitor/stats
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows: [r] } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM rss_sources   WHERE enabled = true)                                  AS sources_active,
        (SELECT COUNT(*)::int FROM rss_sources)                                                         AS sources_total,
        (SELECT COUNT(*)::int FROM monitored_articles WHERE detected_at > now() - interval '24 hours')      AS articles_today,
        (SELECT COUNT(*)::int FROM trending_topics    WHERE last_seen_at > now() - interval '30 minutes')   AS trending_now,
        (SELECT COUNT(*)::int FROM story_opportunities so
         JOIN story_clusters sc ON sc.id = so.story_cluster_id
         WHERE so.status = 'pending'
           AND sc.last_seen > now() - interval '7 days'
           AND sc.is_recurring = false)                                                                     AS opportunities,
        (SELECT MAX(last_checked) FROM rss_sources WHERE enabled = true)                                AS last_worker_run,
        extract(epoch FROM (now() - (SELECT MAX(last_checked) FROM rss_sources WHERE enabled = true)))::int
                                                                                                            AS worker_idle_seconds
    `);
    res.json(r);
  } catch (e) { next(e); }
});

// GET /monitor/content-stats — article content extraction coverage metrics
router.get('/content-stats', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '7'), 30);

    const { rows: [counts] } = await query(`
      SELECT
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE extraction_method = 'fetch')::int                  AS fetch,
        COUNT(*) FILTER (WHERE extraction_method = 'playwright')::int             AS playwright,
        COUNT(*) FILTER (WHERE extraction_method = 'paywall')::int                AS paywall,
        COUNT(*) FILTER (WHERE extraction_method = 'rss_only')::int               AS rss_only,
        COUNT(*) FILTER (WHERE extraction_method IS NULL)::int                    AS pending,
        ROUND(AVG(content_words) FILTER (WHERE extraction_method = 'fetch'))      AS avg_words_fetch,
        ROUND(AVG(content_words) FILTER (WHERE extraction_method = 'playwright'))  AS avg_words_playwright
      FROM monitored_articles
      WHERE detected_at > now() - ($1 || ' days')::interval
    `, [days]);

    const { rows: sources } = await query(`
      SELECT
        ts.id,
        ts.name,
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE ma.extraction_method = 'fetch')::int           AS fetch,
        COUNT(*) FILTER (WHERE ma.extraction_method = 'playwright')::int      AS playwright,
        COUNT(*) FILTER (WHERE ma.extraction_method = 'paywall')::int         AS paywall,
        COUNT(*) FILTER (WHERE ma.extraction_method = 'rss_only')::int        AS rss_only,
        ROUND(AVG(ma.content_words) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))) AS avg_words
      FROM monitored_articles ma
      JOIN rss_sources ts ON ts.id = ma.source_id
      WHERE ma.detected_at > now() - ($1 || ' days')::interval
      GROUP BY ts.id, ts.name
      HAVING COUNT(*) > 3
      ORDER BY COUNT(*) FILTER (WHERE ma.extraction_method = 'rss_only') DESC, ts.name
      LIMIT 20
    `, [days]);

    res.json({ days, ...counts, sources });
  } catch (e) { next(e); }
});

// GET /monitor/sources
router.get('/sources', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT *,
        CASE WHEN last_checked IS NULL THEN NULL
             ELSE extract(epoch FROM (now() - last_checked))::int
        END AS seconds_since_check
       FROM rss_sources ORDER BY enabled DESC, name`
    );
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// POST /monitor/sources
router.post('/sources', requireAuth, async (req, res, next) => {
  try {
    const { name, type = 'news', rss_url, homepage, check_interval = 60 } = req.body;
    if (!name?.trim() || !rss_url?.trim()) {
      return res.status(400).json({ error: 'name and rss_url are required' });
    }
    const { rows } = await query(
      `INSERT INTO rss_sources (name, type, rss_url, homepage, check_interval)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), type, rss_url.trim(), homepage || null, check_interval]
    );
    res.status(201).json({ source: rows[0] });
  } catch (e) { next(e); }
});

// PUT /monitor/sources/:id
router.put('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, rss_url, homepage, enabled, check_interval } = req.body;
    const { rows } = await query(
      `UPDATE rss_sources SET
         name           = COALESCE($1, name),
         type           = COALESCE($2, type),
         rss_url        = COALESCE($3, rss_url),
         homepage       = COALESCE($4, homepage),
         enabled        = COALESCE($5, enabled),
         check_interval = COALESCE($6, check_interval)
       WHERE id = $7 RETURNING *`,
      [name, type, rss_url, homepage, enabled, check_interval, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ source: rows[0] });
  } catch (e) { next(e); }
});

// DELETE /monitor/sources/:id
router.delete('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM rss_sources WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── XML format detector ──────────────────────────────────────────────────────
// Returns: 'rss' | 'atom' | 'sitemap-index' | 'news-sitemap' | 'urlset' | 'xml-generic' | null
function detectXmlFormat(text) {
  const t = text.trimStart().slice(0, 1000);
  if (!t.startsWith('<') && !t.startsWith('﻿<')) return null; // not XML (BOM-safe)
  if (t.includes('<sitemapindex'))                    return 'sitemap-index';
  if (t.includes('<urlset')) {
    if (t.includes('xmlns:news') || t.includes('news.google.com')) return 'news-sitemap';
    return 'urlset';
  }
  if (t.includes('<rss') || t.includes('<channel'))  return 'rss';
  if (t.includes('<feed') && t.includes('xmlns'))    return 'atom';
  // Generic XML that starts with <? or any element
  if (t.match(/^[﻿\s]*<(\?xml|[a-zA-Z])/))     return 'xml-generic';
  return null;
}

const XML_FORMAT_LABELS = {
  'rss':          'RSS Feed',
  'atom':         'Atom Feed',
  'sitemap-index':'Sitemap Index',
  'news-sitemap': 'Google News Sitemap',
  'urlset':       'XML Sitemap (urlset)',
  'xml-generic':  'XML genérico',
};

// POST /monitor/sources/:id/verify
router.post('/sources/:id/verify', requireAuth, async (req, res, next) => {
  try {
    const { rows: [source] } = await query('SELECT * FROM rss_sources WHERE id = $1', [req.params.id]);
    if (!source) return res.status(404).json({ error: 'Source not found' });

    const userId = parseInt(req.user?.sub) || null;
    const start  = Date.now();
    let http_status = null, response_ms = null;
    let newStatus = 'failed', notes = null, formatDetected = null;
    let trustScore = parseFloat(source.trust_score || 5);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);

      // Use a realistic browser User-Agent to avoid bot-blocking
      const resp = await fetch(source.rss_url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':      'Mozilla/5.0 (compatible; NewsBot/2.0; +https://panorama.com/bot)',
          'Accept':          'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'Cache-Control':   'no-cache',
        },
      });
      clearTimeout(timer);
      response_ms = Date.now() - start;
      http_status = resp.status;

      if (resp.ok) {
        const ct   = resp.headers.get('content-type') || '';
        const text = await resp.text();
        formatDetected = detectXmlFormat(text);
        const isValidFeed = formatDetected !== null
          || ct.includes('xml') || ct.includes('rss') || ct.includes('atom');

        if (isValidFeed) {
          newStatus  = 'verified';
          trustScore = Math.min(10, 5 + (response_ms < 800 ? 2 : 1) + (response_ms < 300 ? 1 : 0) + 1);
          const label = XML_FORMAT_LABELS[formatDetected] || formatDetected || ct;
          notes = `✓ ${label} · HTTP ${http_status} · ${response_ms}ms`;
        } else {
          // Responded 200 but looks like HTML, not a feed
          const preview = text.trimStart().slice(0, 80).replace(/\n/g, ' ');
          notes = `HTTP ${http_status} pero la respuesta no es un feed XML válido. Content-Type: "${ct}". Inicio: "${preview}…"`;
          trustScore = Math.max(0, trustScore - 0.5);
        }
      } else if (http_status === 403) {
        notes = `HTTP 403 Acceso denegado — el servidor bloquea el acceso al feed. Verificar manualmente si la URL es correcta.`;
        trustScore = Math.max(0, trustScore - 1);
      } else if (http_status === 404) {
        notes = `HTTP 404 No encontrado — la URL del feed no existe. Revisar si cambió de ubicación.`;
        trustScore = Math.max(0, trustScore - 2);
      } else if (http_status >= 500) {
        notes = `HTTP ${http_status} Error del servidor — el sitio está caído o con problemas temporales.`;
        trustScore = Math.max(0, trustScore - 1);
      } else {
        notes = `HTTP ${http_status} — respuesta inesperada.`;
        trustScore = Math.max(0, trustScore - 1.5);
      }
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        notes = 'Timeout (>12s) — el servidor no respondió a tiempo.';
      } else if (fetchErr.cause?.code === 'CERT_HAS_EXPIRED' || fetchErr.message?.includes('certificate')) {
        notes = `Error SSL/TLS: certificado inválido o expirado. (${fetchErr.message})`;
      } else if (fetchErr.cause?.code === 'ENOTFOUND' || fetchErr.message?.includes('ENOTFOUND')) {
        notes = `DNS no resuelto — el dominio no existe o no está accesible desde el servidor.`;
      } else if (fetchErr.cause?.code === 'ECONNREFUSED') {
        notes = `Conexión rechazada — el servidor no acepta la conexión.`;
      } else {
        notes = `Error de red: ${fetchErr.message}`;
      }
      trustScore = Math.max(0, trustScore - 2);
    }

    const { rows: [updated] } = await query(
      `UPDATE rss_sources
         SET verification_status       = $1,
             verified_at               = NOW(),
             verified_by               = $2,
             trust_score               = $3,
             last_verification_notes   = $4,
             last_format_detected      = $5
       WHERE id = $6 RETURNING *`,
      [newStatus, userId, trustScore, notes, formatDetected, req.params.id]
    );

    await query(
      `INSERT INTO source_verifications (source_id, status, checked_by, notes, http_status, response_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, newStatus, userId, notes, http_status, response_ms]
    );

    res.json({ source: updated, result: { status: newStatus, notes, http_status, response_ms, format: formatDetected } });
  } catch (e) { next(e); }
});

// POST /monitor/sources/:id/approve — editorial approval
router.post('/sources/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const { notes } = req.body;
    const userId = parseInt(req.user?.sub) || null;

    const { rows: [updated] } = await query(
      `UPDATE rss_sources
         SET verification_status = 'approved', verified_at = NOW(), verified_by = $1
       WHERE id = $2 RETURNING *`,
      [userId, req.params.id]
    );
    if (!updated) return res.status(404).json({ error: 'Source not found' });

    await query(
      `INSERT INTO source_verifications (source_id, status, checked_by, notes)
       VALUES ($1, 'approved', $2, $3)`,
      [req.params.id, userId, notes || 'Aprobada editorialmente']
    );

    res.json({ source: updated });
  } catch (e) { next(e); }
});

// GET /monitor/sources/:id/verifications — history log
router.get('/sources/:id/verifications', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sv.* FROM source_verifications sv
       WHERE sv.source_id = $1
       ORDER BY sv.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /monitor/articles?hours=24&source_id=&entity_id=&limit=60&offset=0
router.get('/articles', requireAuth, async (req, res, next) => {
  try {
    const hours      = Math.min(parseInt(req.query.hours  || '24'), 168);
    const limit      = Math.min(parseInt(req.query.limit  || '60'), 1000);
    const offset     = parseInt(req.query.offset || '0');
    const source_id  = req.query.source_id  || null;
    const entity_id  = req.query.entity_id  || null;

    let conditions = [`ma.detected_at > now() - interval '${hours} hours'`];
    const params   = [];

    if (source_id) {
      params.push(source_id);
      conditions.push(`ma.source_id = $${params.length}`);
    }
    if (entity_id) {
      params.push(entity_id);
      conditions.push(`EXISTS (
        SELECT 1 FROM article_entity_matches aem2
        WHERE aem2.article_id = ma.id AND aem2.entity_id = $${params.length}
      )`);
    }

    const where = conditions.join(' AND ');
    params.push(limit);
    params.push(offset);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        ma.id, ma.title, ma.url, ma.summary, ma.published_at, ma.detected_at,
        ts.name  AS source_name,
        ts.type  AS source_type,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', ke.id, 'name', ke.name, 'entity_type', ke.entity_type))
          FILTER (WHERE ke.id IS NOT NULL),
          '[]'
        ) AS entities
      FROM monitored_articles ma
      JOIN rss_sources ts ON ts.id = ma.source_id
      LEFT JOIN article_entity_matches aem ON aem.article_id = ma.id
      LEFT JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE ${where}
      GROUP BY ma.id, ts.name, ts.type
      ORDER BY ma.detected_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = parseInt(rows[0]?.total_count || '0');
    res.json({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit });
  } catch (e) { next(e); }
});

// GET /monitor/trending?min_mentions=1&min_sources=1
router.get('/trending', requireAuth, async (req, res, next) => {
  try {
    const min_mentions = parseInt(req.query.min_mentions || '1');
    const min_sources  = parseInt(req.query.min_sources  || '1');

    const { rows } = await query(`
      SELECT
        tt.*,
        ke.name        AS entity_name,
        ke.entity_type AS entity_type,
        ke.description AS entity_description
      FROM trending_topics tt
      JOIN knowledge_entities ke ON ke.id = tt.entity_id
      WHERE tt.last_seen_at    > now() - interval '6 hours'
        AND tt.mention_count  >= $1
        AND tt.source_count   >= $2
      ORDER BY tt.mention_count DESC, tt.source_count DESC
      LIMIT 50
    `, [min_mentions, min_sources]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /monitor/clustering-audit — cluster quality report + threshold simulation
router.get('/clustering-audit', requireAuth, async (req, res, next) => {
  try {
    const hours = Math.min(parseInt(req.query.hours || '24'), 168);

    // Global summary
    const { rows: [global] } = await query(`
      SELECT
        COUNT(DISTINCT sc.id)::int                                                     AS total_stories,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.story_quality = 'poor')::int           AS poor_stories,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.story_quality = 'fair')::int           AS fair_stories,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.story_quality = 'good')::int           AS good_stories,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.story_quality = 'excellent')::int      AS excellent_stories,
        ROUND(AVG(sc.article_count))::int                                              AS avg_story_size,
        ROUND(AVG(sc.avg_relevance)::numeric, 3)                                      AS avg_relevance_global,
        ROUND(MIN(sc.avg_relevance)::numeric, 3)                                      AS min_relevance_global
      FROM story_clusters sc
      WHERE sc.is_recurring = false
        AND sc.status IN ('active','ready','followed')
        AND sc.last_seen > now() - ($1 || ' hours')::interval
    `, [hours]);

    // Per-story breakdown (sorted worst first)
    const { rows: stories } = await query(`
      SELECT
        sc.id                                                                     AS story_id,
        sc.title,
        sc.article_count,
        sc.story_quality,
        sc.story_context_score,
        ROUND(sc.avg_relevance::numeric, 3)                                      AS avg_relevance_score,
        ROUND(MIN(sca.relevance_score)::numeric, 3)                              AS min_relevance_score,
        ROUND(MAX(sca.relevance_score)::numeric, 3)                              AS max_relevance_score,
        COALESCE(SUM(ma.content_words), 0)::int                                  AS total_content_words,
        COUNT(sca.article_id) FILTER (WHERE sca.relevance_score >= 0.30)::int   AS valid_articles,
        COUNT(sca.article_id) FILTER (WHERE sca.relevance_score  < 0.30)::int   AS discarded_articles
      FROM story_clusters sc
      JOIN story_cluster_articles sca ON sca.story_id = sc.id
      JOIN monitored_articles ma      ON ma.id        = sca.article_id
      WHERE sc.is_recurring = false
        AND sc.status IN ('active','ready','followed')
        AND sc.last_seen > now() - ($1 || ' hours')::interval
      GROUP BY sc.id, sc.title, sc.article_count, sc.story_quality, sc.story_context_score, sc.avg_relevance
      ORDER BY sc.avg_relevance ASC NULLS LAST
      LIMIT 150
    `, [hours]);

    // Threshold simulation — what each cutoff means for existing links
    const { rows: simulation } = await query(`
      WITH base AS (
        SELECT sca.story_id, sca.relevance_score
        FROM story_cluster_articles sca
        JOIN story_clusters sc ON sc.id = sca.story_id
        WHERE sc.is_recurring = false
          AND sc.status IN ('active','ready','followed')
          AND sc.last_seen > now() - ($1 || ' hours')::interval
      )
      SELECT
        t.threshold::float                                                       AS threshold,
        COUNT(*)::int                                                            AS total_links,
        COUNT(*) FILTER (WHERE b.relevance_score >= t.threshold)::int           AS valid_links,
        COUNT(*) FILTER (WHERE b.relevance_score  < t.threshold)::int           AS discarded_links,
        COUNT(DISTINCT b.story_id) FILTER (
          WHERE b.story_id IN (
            SELECT story_id FROM base WHERE relevance_score < t.threshold
          )
        )::int                                                                   AS affected_stories,
        ROUND(COUNT(*) FILTER (WHERE b.relevance_score >= t.threshold)::numeric
              / NULLIF(COUNT(*), 0) * 100, 1)::float                            AS pct_valid
      FROM base b
      CROSS JOIN (VALUES (0.20),(0.25),(0.30),(0.35),(0.40)) AS t(threshold)
      GROUP BY t.threshold
      ORDER BY t.threshold
    `, [hours]);

    const contaminated = stories.filter(s => (s.story_quality === 'poor')).length;
    const clean        = stories.filter(s => ['good','excellent'].includes(s.story_quality)).length;

    res.json({
      global: { ...global, contaminated_stories: contaminated, clean_stories: clean, hours },
      stories,
      simulation,
    });
  } catch (e) { next(e); }
});

// GET /monitor/story/:id/explain — full traceability for a single story
router.get('/story/:id/explain', requireAuth, async (req, res, next) => {
  try {
    const { rows: [story] } = await query(`
      SELECT id, title, story_quality, story_context_score, avg_relevance,
             article_count, source_count, status, coverage_status, last_seen
      FROM story_clusters WHERE id = $1
    `, [req.params.id]);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    const { rows: articles } = await query(`
      SELECT
        ma.id,
        ma.title,
        ma.url,
        ma.detected_at,
        ma.content_words,
        ma.extraction_method,
        ts.name               AS source_name,
        sca.relevance_score,
        sca.matching_reason,
        sca.shared_keywords,
        sca.shared_entities,
        sca.keyword_similarity,
        sca.entity_similarity,
        sca.title_similarity,
        sca.linked_at
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN rss_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
      ORDER BY sca.relevance_score DESC, sca.linked_at ASC
    `, [req.params.id]);

    res.json({ story, articles });
  } catch (e) { next(e); }
});

// GET /monitor/scoring-audit — editorial quality + confidence distribution
router.get('/scoring-audit', requireAuth, async (req, res, next) => {
  try {
    const { rows: [dist] } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE story_quality = 'excellent' AND status != 'stale')::int AS excellent,
        COUNT(*) FILTER (WHERE story_quality = 'good'      AND status != 'stale')::int AS good,
        COUNT(*) FILTER (WHERE story_quality = 'fair'      AND status != 'stale')::int AS fair,
        COUNT(*) FILTER (WHERE story_quality = 'poor'      AND status != 'stale')::int AS poor,
        COUNT(*) FILTER (WHERE story_confidence = 'high'   AND status != 'stale')::int AS conf_high,
        COUNT(*) FILTER (WHERE story_confidence = 'medium' AND status != 'stale')::int AS conf_medium,
        COUNT(*) FILTER (WHERE story_confidence = 'low'    AND status != 'stale')::int AS conf_low,
        ROUND(AVG(story_context_score) FILTER (WHERE status != 'stale'))::int                        AS avg_score,
        ROUND((AVG(article_count::float) FILTER (WHERE status != 'stale'))::numeric, 1)              AS avg_articles,
        ROUND((AVG(source_count::float)  FILTER (WHERE status != 'stale'))::numeric, 1)              AS avg_sources,
        ROUND((AVG(context_relevance_score::float) FILTER (WHERE status != 'stale'))::numeric, 1)    AS avg_relevance_pts,
        ROUND((AVG(context_depth_score::float)     FILTER (WHERE status != 'stale'))::numeric, 1)    AS avg_depth_pts,
        ROUND((AVG(context_diversity_score::float) FILTER (WHERE status != 'stale'))::numeric, 1)    AS avg_diversity_pts,
        ROUND((AVG(context_coverage_score::float)  FILTER (WHERE status != 'stale'))::numeric, 1)    AS avg_coverage_pts,
        COUNT(*) FILTER (WHERE source_count = 1 AND story_quality = 'excellent' AND status != 'stale')::int AS capped_excellent,
        COUNT(*) FILTER (WHERE article_count = 1 AND status != 'stale')::int                               AS single_article
      FROM story_clusters
      WHERE is_recurring = false
    `);

    // Sample stories per quality tier for illustration
    const { rows: samples } = await query(`
      SELECT id, title, story_quality, story_confidence, story_context_score,
             context_relevance_score, context_depth_score, context_diversity_score, context_coverage_score,
             article_count, source_count
      FROM story_clusters
      WHERE is_recurring = false AND status != 'stale' AND story_context_score > 0
      ORDER BY story_context_score DESC
      LIMIT 20
    `);

    res.json({
      quality:    { excellent: dist.excellent, good: dist.good, fair: dist.fair, poor: dist.poor },
      confidence: { high: dist.conf_high, medium: dist.conf_medium, low: dist.conf_low },
      avg_score:     dist.avg_score,
      avg_articles:  parseFloat(dist.avg_articles),
      avg_sources:   parseFloat(dist.avg_sources),
      avg_component: {
        relevance:  parseFloat(dist.avg_relevance_pts),
        depth:      parseFloat(dist.avg_depth_pts),
        diversity:  parseFloat(dist.avg_diversity_pts),
        coverage:   parseFloat(dist.avg_coverage_pts),
      },
      capped_excellent: dist.capped_excellent,
      single_article:   dist.single_article,
      top_stories:      samples,
    });
  } catch (e) { next(e); }
});

// GET /monitor/clustering-outliers — audit of problematic stories + global SQL report
router.get('/clustering-outliers', requireAuth, async (req, res, next) => {
  try {
    // Global audit summary (Fase 5 — SQL audit report)
    const { rows: [summary] } = await query(`
      SELECT
        COUNT(*)::int                                                                       AS total_stories,
        COUNT(*) FILTER (WHERE article_count = 0 AND status != 'stale')::int               AS orphan_stories,
        COUNT(*) FILTER (
          WHERE story_context_score = 0 AND article_count > 0 AND status != 'stale'
        )::int                                                                             AS context_score_zero,
        ROUND(AVG(story_context_score) FILTER (
          WHERE article_count > 0 AND status != 'stale'
        ))::int                                                                            AS avg_context_score,
        ROUND(AVG(avg_relevance) FILTER (WHERE status != 'stale')::numeric, 3)            AS avg_relevance,
        COUNT(*) FILTER (
          WHERE story_quality = 'poor' AND status != 'stale'
        )::int                                                                             AS contaminated_stories
      FROM story_clusters
      WHERE is_recurring = false
    `);

    // Orphan stories (article_count = 0, not yet stale)
    const { rows: orphans } = await query(`
      SELECT id, title, status, created_at, updated_at
      FROM story_clusters
      WHERE article_count = 0
        AND is_recurring = false
        AND status NOT IN ('stale','followed')
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Contaminated stories (avg_relevance < 0.40)
    const { rows: contaminated } = await query(`
      SELECT id, title, avg_relevance, story_quality, article_count, story_context_score, status
      FROM story_clusters
      WHERE avg_relevance < 0.40
        AND is_recurring = false
        AND status != 'stale'
        AND article_count > 0
      ORDER BY avg_relevance ASC NULLS LAST
      LIMIT 50
    `);

    // High weak-link ratio (>30% links below 0.30)
    const { rows: high_weak_link } = await query(`
      SELECT
        sc.id,
        sc.title,
        sc.article_count,
        sc.avg_relevance,
        sc.story_quality,
        COUNT(*) FILTER (WHERE sca.relevance_score < 0.30)::int                           AS weak_links,
        ROUND(
          COUNT(*) FILTER (WHERE sca.relevance_score < 0.30)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
        )::float                                                                           AS weak_pct
      FROM story_clusters sc
      JOIN story_cluster_articles sca ON sca.story_id = sc.id
      WHERE sc.is_recurring = false
        AND sc.status != 'stale'
      GROUP BY sc.id, sc.title, sc.article_count, sc.avg_relevance, sc.story_quality
      HAVING COUNT(*) FILTER (WHERE sca.relevance_score < 0.30)::float
             / NULLIF(COUNT(*), 0) > 0.30
      ORDER BY weak_pct DESC
      LIMIT 50
    `);

    // Active stories with context_score = 0 despite having articles
    const { rows: context_score_zero } = await query(`
      SELECT id, title, article_count, avg_relevance, story_quality, story_context_score, status
      FROM story_clusters
      WHERE story_context_score = 0
        AND article_count > 0
        AND is_recurring = false
        AND status != 'stale'
      ORDER BY article_count DESC
      LIMIT 50
    `);

    res.json({ summary, orphans, contaminated, high_weak_link, context_score_zero });
  } catch (e) { next(e); }
});

// GET /monitor/scoring-integrity — detect inconsistencies in story scoring data
router.get('/scoring-integrity', requireAuth, async (req, res, next) => {
  try {
    const { rows: [summary] } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_recurring = false)::int                                                      AS total_stories,
        COUNT(*) FILTER (WHERE is_recurring = false AND status != 'stale')::int                                AS active_stories,
        COUNT(*) FILTER (WHERE is_recurring = false AND article_count = 0 AND status != 'stale')::int         AS orphan_stories,
        COUNT(*) FILTER (WHERE is_recurring = false AND article_count = 0 AND story_context_score > 0)::int   AS score_with_no_articles,
        COUNT(*) FILTER (WHERE is_recurring = false AND source_count = 0 AND story_context_score > 0)::int    AS score_with_no_sources,
        COUNT(*) FILTER (WHERE is_recurring = false AND status != 'stale'
          AND (
            (story_context_score >= 70 AND source_count > 1 AND story_quality != 'excellent') OR
            (story_context_score >= 45 AND story_context_score < 70 AND story_quality != 'good') OR
            (story_context_score >= 20 AND story_context_score < 45 AND story_quality != 'fair') OR
            (story_context_score < 20 AND story_quality != 'poor')
          )
        )::int                                                                                                  AS quality_mismatch
      FROM story_clusters
    `);

    const { rows: scoreNoArticles } = await query(`
      SELECT id, title, article_count, source_count, story_context_score, story_quality, story_confidence, status
      FROM story_clusters
      WHERE article_count = 0
        AND story_context_score > 0
        AND is_recurring = false
      ORDER BY story_context_score DESC
      LIMIT 50
    `);

    const { rows: scoreNoSources } = await query(`
      SELECT id, title, article_count, source_count, story_context_score, story_quality, story_confidence, status
      FROM story_clusters
      WHERE source_count = 0
        AND story_context_score > 0
        AND article_count > 0
        AND is_recurring = false
      LIMIT 50
    `);

    const { rows: qualityMismatch } = await query(`
      SELECT id, title, article_count, source_count, story_context_score, story_quality, story_confidence, status
      FROM story_clusters
      WHERE is_recurring = false
        AND status != 'stale'
        AND (
          (story_context_score >= 70 AND source_count > 1 AND story_quality != 'excellent') OR
          (story_context_score >= 45 AND story_context_score < 70 AND story_quality != 'good') OR
          (story_context_score >= 20 AND story_context_score < 45 AND story_quality != 'fair') OR
          (story_context_score < 20 AND story_quality != 'poor')
        )
      ORDER BY story_context_score DESC
      LIMIT 50
    `);

    const is_clean = (
      summary.score_with_no_articles === 0 &&
      summary.score_with_no_sources === 0 &&
      summary.quality_mismatch === 0
    );

    res.json({
      is_clean,
      summary,
      issues: {
        score_with_no_articles: scoreNoArticles,
        score_with_no_sources:  scoreNoSources,
        quality_mismatch:       qualityMismatch,
      },
    });
  } catch (e) { next(e); }
});

// POST /monitor/research — trigger research from a trending topic
router.post('/research', requireAuth, async (req, res, next) => {
  try {
    const { entity_name, entity_id } = req.body;
    if (!entity_name?.trim()) return res.status(400).json({ error: 'entity_name required' });

    const userId = req.user?.sub || null;
    const title  = `${entity_name.trim()} — detectado en monitoreo`;

    const { rows } = await query(
      `INSERT INTO research_topics (title, status, created_by, category, tags)
       VALUES ($1, 'pending', $2, 'trending', ARRAY['news-intelligence'])
       RETURNING *`,
      [title, userId]
    );

    // Mark as already auto-researched to avoid duplicate triggers
    if (entity_id) {
      await query(
        `UPDATE trending_topics SET auto_researched = true WHERE entity_id = $1`,
        [entity_id]
      );
    }

    res.json({ topic: rows[0] });
  } catch (e) { next(e); }
});

// GET /monitor/worker-pause — returns pause status + metadata
router.get('/worker-pause', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT key, value FROM settings
      WHERE key IN ('news_monitor_paused', 'news_monitor_paused_at', 'news_monitor_paused_by', 'news_monitor_pause_reason')
    `);
    const info = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      paused:       info['news_monitor_paused'] === 'true',
      paused_since: info['news_monitor_paused_at']     || null,
      paused_by:    info['news_monitor_paused_by']     || null,
      pause_reason: info['news_monitor_pause_reason']  || null,
    });
  } catch (e) { next(e); }
});

// POST /monitor/worker-pause — toggle pause with optional reason + audit log
router.post('/worker-pause', requireAuth, async (req, res, next) => {
  try {
    const paused = req.body.paused === true;
    const reason = req.body.reason?.trim() || null;
    const actor  = req.user?.email || req.user?.sub || 'admin';

    await query(`
      INSERT INTO settings (key, value, type, group_name)
      VALUES ('news_monitor_paused', $1, 'boolean', 'system')
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [paused ? 'true' : 'false']);

    if (paused) {
      for (const [k, v] of [
        ['news_monitor_paused_at',     new Date().toISOString()],
        ['news_monitor_paused_by',     actor],
        ['news_monitor_pause_reason',  reason || ''],
      ]) {
        await query(`
          INSERT INTO settings (key, value, type, group_name) VALUES ($1, $2, 'text', 'system')
          ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `, [k, v]);
      }
    }

    await query(
      `INSERT INTO system_events (event_type, actor, metadata) VALUES ($1, $2, $3)`,
      [paused ? 'news_monitor_paused' : 'news_monitor_resumed', actor, JSON.stringify({ reason })]
    ).catch(() => {});

    res.json({ ok: true, paused, paused_by: paused ? actor : null, pause_reason: reason });
  } catch (e) { next(e); }
});

// GET /monitor/health — full operational dashboard data
router.get('/health', requireAuth, async (req, res, next) => {
  try {
    // Last run per worker (most recent row per worker_name)
    const { rows: lastRuns } = await query(`
      SELECT DISTINCT ON (worker_name)
        worker_name, started_at, finished_at, duration_ms, status,
        sources_processed, items_found, items_saved, errors_count, error_message
      FROM worker_runs
      ORDER BY worker_name, started_at DESC
    `).catch(() => ({ rows: [] }));

    const runMap = Object.fromEntries(lastRuns.map(r => [r.worker_name, r]));

    // Last ACTIVE (non-skipped success) run for news monitor
    const { rows: [lastActiveNews] } = await query(`
      SELECT started_at, items_found, sources_processed, duration_ms
      FROM worker_runs
      WHERE worker_name = 'news_monitor' AND status = 'success' AND items_found > 0
      ORDER BY started_at DESC LIMIT 1
    `).catch(() => ({ rows: [null] }));

    // Aggregated stats per worker for last 24h
    const { rows: runStats } = await query(`
      SELECT
        worker_name,
        COUNT(*) FILTER (WHERE status != 'skipped')::int AS total_runs,
        COUNT(*) FILTER (WHERE status = 'success')::int  AS success_runs,
        COUNT(*) FILTER (WHERE status = 'error')::int    AS error_runs,
        COUNT(*) FILTER (WHERE status = 'skipped')::int  AS skipped_runs,
        ROUND(AVG(duration_ms) FILTER (WHERE status = 'success'))::int AS avg_duration_ms
      FROM worker_runs
      WHERE started_at > NOW() - INTERVAL '24 hours'
      GROUP BY worker_name
    `).catch(() => ({ rows: [] }));

    const statsMap = Object.fromEntries(runStats.map(r => [r.worker_name, r]));

    // Pause info from settings
    const { rows: pauseRows } = await query(`
      SELECT key, value FROM settings
      WHERE key IN ('news_monitor_paused','news_monitor_paused_at','news_monitor_paused_by','news_monitor_pause_reason')
    `).catch(() => ({ rows: [] }));
    const pauseInfo = Object.fromEntries(pauseRows.map(r => [r.key, r.value]));
    const isPaused  = pauseInfo['news_monitor_paused'] === 'true';

    // Worker alive: any news_monitor run (skipped counts) within last 2 min
    const newsLastRun  = runMap['news_monitor'];
    const socialLastRun = runMap['social_monitor'];
    const workerAlive  = newsLastRun && (Date.now() - new Date(newsLastRun.started_at).getTime()) < 120_000;
    const socialAlive  = socialLastRun && (Date.now() - new Date(socialLastRun.started_at).getTime()) < 35 * 60_000;

    let newsStatus;
    if (isPaused)       newsStatus = 'paused';
    else if (!workerAlive) newsStatus = 'stopped';
    else                   newsStatus = 'active';

    // Transcript coverage
    const { rows: [txStats] } = await query(`
      SELECT
        COUNT(sp.id) FILTER (WHERE ss.content_type IN ('videos','shorts'))::int                                                          AS eligible,
        COUNT(sp.id) FILTER (WHERE ss.content_type IN ('videos','shorts') AND sp.transcript_available = true)::int                       AS with_transcript,
        COUNT(sp.id) FILTER (WHERE ss.content_type IN ('videos','shorts') AND sp.transcript_available = false)::int                      AS without_transcript,
        COUNT(sp.id) FILTER (WHERE ss.content_type IN ('videos','shorts') AND sp.transcript_fetched_at IS NULL)::int                     AS pending,
        ROUND(AVG(vt.transcript_length) FILTER (WHERE vt.transcript_length > 0))::int                                                   AS avg_length
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      LEFT JOIN video_transcripts vt ON vt.post_id = sp.id
    `).catch(() => ({ rows: [{ eligible: 0, with_transcript: 0, without_transcript: 0, pending: 0, avg_length: 0 }] }));

    const { rows: txBySrc } = await query(`
      SELECT ss.name, ss.content_type,
        COUNT(sp.id)::int                                                                                     AS total,
        COUNT(sp.id) FILTER (WHERE sp.transcript_available = true)::int                                      AS with_transcript,
        COUNT(sp.id) FILTER (WHERE sp.transcript_fetched_at IS NULL)::int                                    AS pending,
        ROUND(100.0 * COUNT(sp.id) FILTER (WHERE sp.transcript_available = true)
          / NULLIF(COUNT(sp.id), 0), 1)::float                                                               AS coverage_pct
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.content_type IN ('videos','shorts')
      GROUP BY ss.id, ss.name, ss.content_type
      ORDER BY ss.name
    `).catch(() => ({ rows: [] }));

    // RSS source health
    const { rows: [srcStats] } = await query(`
      SELECT
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE enabled = true)::int                           AS active,
        COUNT(*) FILTER (WHERE enabled = false)::int                          AS inactive,
        COUNT(*) FILTER (WHERE last_checked > NOW() - INTERVAL '1 hour')::int AS checked_last_hour,
        COUNT(*) FILTER (WHERE last_checked > NOW() - INTERVAL '24 hours')::int AS checked_last_day
      FROM tracked_sources
    `).catch(() => ({ rows: [{ total: 0, active: 0, inactive: 0, checked_last_hour: 0, checked_last_day: 0 }] }));

    // Sources with repeated discovery failures (EMPTY/ERROR/TIMEOUT/BLOCKED) —
    // flagged for human review, never an automatic strategy switch.
    const REPEATED_FAILURE_THRESHOLD = 5;
    const { rows: repeatedFailureSources } = await query(`
      SELECT name, discovery_type, last_discovery_status, last_discovery_error, consecutive_discovery_failures
      FROM rss_sources
      WHERE enabled = true AND consecutive_discovery_failures >= $1
      ORDER BY consecutive_discovery_failures DESC
    `, [REPEATED_FAILURE_THRESHOLD]).catch(() => ({ rows: [] }));

    // Backlog estimate
    const { rows: [backlog] } = await query(`
      SELECT
        GREATEST(EXTRACT(EPOCH FROM (NOW() - MAX(detected_at))) / 3600, 0) AS hours_gap,
        COALESCE(COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '7 days') / 168.0, 0) AS avg_per_hour
      FROM monitored_articles
    `).catch(() => ({ rows: [{ hours_gap: 0, avg_per_hour: 0 }] }));

    const hoursGap   = parseFloat(backlog?.hours_gap  || 0);
    const avgPerHour = parseFloat(backlog?.avg_per_hour || 0);

    // Compute real-time alerts
    const alerts = [];
    if (!workerAlive)
      alerts.push({ type: 'worker_stopped', severity: 'critical', message: 'Worker sin actividad en los últimos 2 minutos' });
    if (isPaused && pauseInfo['news_monitor_paused_at']) {
      const pausedHrs = (Date.now() - new Date(pauseInfo['news_monitor_paused_at']).getTime()) / 3_600_000;
      if (pausedHrs > 0.5)
        alerts.push({ type: 'news_monitor_paused', severity: 'warning', message: `News Monitor pausado hace ${pausedHrs.toFixed(1)}h` });
    }
    if (!isPaused && lastActiveNews) {
      const idleMin = (Date.now() - new Date(lastActiveNews.started_at).getTime()) / 60_000;
      if (idleMin > 30)
        alerts.push({ type: 'news_monitor_idle', severity: 'warning', message: `News Monitor sin actividad hace ${Math.round(idleMin)} min` });
    }
    if (!socialAlive)
      alerts.push({ type: 'social_monitor_idle', severity: 'warning', message: 'Social Monitor sin actividad en los últimos 35 minutos' });
    const coveragePct = txStats?.eligible > 0 ? (txStats.with_transcript / txStats.eligible * 100) : 100;
    if (txStats?.eligible > 5 && coveragePct < 30)
      alerts.push({ type: 'transcript_coverage_low', severity: 'warning', message: `Cobertura de transcripts: ${coveragePct.toFixed(0)}%` });
    if (srcStats?.total > 0 && (srcStats.active / srcStats.total) < 0.8)
      alerts.push({ type: 'rss_sources_low', severity: 'warning', message: `Fuentes RSS activas: ${srcStats.active}/${srcStats.total}` });
    for (const s of repeatedFailureSources) {
      alerts.push({
        type: 'source_repeated_failure',
        severity: 'warning',
        message: `"${s.name}" (${s.discovery_type}): ${s.consecutive_discovery_failures} ciclos consecutivos en ${s.last_discovery_status}${s.last_discovery_error ? ' — ' + s.last_discovery_error : ''}`,
      });
    }

    res.json({
      worker: {
        status:        workerAlive ? 'active' : 'stopped',
        last_seen_at:  newsLastRun?.started_at || null,
      },
      news_monitor: {
        status:               newsStatus,
        paused:               isPaused,
        paused_since:         isPaused ? (pauseInfo['news_monitor_paused_at']    || null) : null,
        paused_by:            isPaused ? (pauseInfo['news_monitor_paused_by']    || null) : null,
        pause_reason:         isPaused ? (pauseInfo['news_monitor_pause_reason'] || null) : null,
        last_run_at:          newsLastRun?.started_at    || null,
        last_active_at:       lastActiveNews?.started_at || null,
        last_run_duration_ms: newsLastRun?.duration_ms   || null,
        last_sources_processed: newsLastRun?.sources_processed || 0,
        last_items_found:     newsLastRun?.items_found   || 0,
        cycles_24h:           statsMap['news_monitor']?.total_runs    || 0,
        success_rate_pct:     statsMap['news_monitor']?.total_runs > 0
          ? Math.round(statsMap['news_monitor'].success_runs / statsMap['news_monitor'].total_runs * 100) : null,
        avg_duration_ms:      statsMap['news_monitor']?.avg_duration_ms || null,
      },
      social_monitor: {
        status:               socialAlive ? 'active' : 'stopped',
        last_run_at:          socialLastRun?.started_at    || null,
        last_run_duration_ms: socialLastRun?.duration_ms   || null,
        last_sources_processed: socialLastRun?.sources_processed || 0,
        last_items_found:     socialLastRun?.items_found   || 0,
        last_items_saved:     socialLastRun?.items_saved   || 0,
        cycles_24h:           statsMap['social_monitor']?.total_runs    || 0,
        success_rate_pct:     statsMap['social_monitor']?.total_runs > 0
          ? Math.round(statsMap['social_monitor'].success_runs / statsMap['social_monitor'].total_runs * 100) : null,
        avg_duration_ms:      statsMap['social_monitor']?.avg_duration_ms || null,
      },
      transcripts: {
        total_eligible:        txStats?.eligible        || 0,
        total_with_transcript: txStats?.with_transcript || 0,
        total_without:         txStats?.without_transcript || 0,
        total_pending:         txStats?.pending         || 0,
        coverage_pct:          txStats?.eligible > 0 ? Math.round(txStats.with_transcript / txStats.eligible * 100) : 0,
        avg_length:            txStats?.avg_length      || 0,
        by_source:             txBySrc,
      },
      rss_sources:   srcStats || { total: 0, active: 0, inactive: 0, checked_last_hour: 0, checked_last_day: 0 },
      backlog: {
        hours_since_last_article: hoursGap > 0 ? parseFloat(hoursGap.toFixed(1)) : 0,
        avg_articles_per_hour:    parseFloat(avgPerHour.toFixed(1)),
        estimated_pending:        isPaused && hoursGap > 0 ? Math.round(hoursGap * avgPerHour) : 0,
      },
      alerts,
    });
  } catch (e) { next(e); }
});

// GET /monitor/worker-runs — execution history
router.get('/worker-runs', requireAuth, async (req, res, next) => {
  try {
    const worker = req.query.worker || null;
    const limit  = Math.min(parseInt(req.query.limit || '50'), 200);
    const { rows } = await query(`
      SELECT id, worker_name, started_at, finished_at, duration_ms, status,
             sources_processed, items_found, items_saved, errors_count, error_message
      FROM worker_runs
      WHERE ($1::text IS NULL OR worker_name = $1)
      ORDER BY started_at DESC
      LIMIT $2
    `, [worker, limit]).catch(() => ({ rows: [] }));
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /monitor/system-events — audit event log
router.get('/system-events', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const { rows } = await query(`
      SELECT id, event_type, actor, metadata, created_at
      FROM system_events
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]).catch(() => ({ rows: [] }));
    res.json({ items: rows });
  } catch (e) { next(e); }
});

export default router;
