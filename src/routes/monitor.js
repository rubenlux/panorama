import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /monitor/stats
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows: [r] } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM tracked_sources   WHERE enabled = true)                                  AS sources_active,
        (SELECT COUNT(*)::int FROM tracked_sources)                                                         AS sources_total,
        (SELECT COUNT(*)::int FROM monitored_articles WHERE detected_at > now() - interval '24 hours')      AS articles_today,
        (SELECT COUNT(*)::int FROM trending_topics    WHERE last_seen_at > now() - interval '30 minutes')   AS trending_now,
        (SELECT COUNT(*)::int FROM trending_topics
         WHERE mention_count >= 5 AND source_count >= 3
           AND last_seen_at  > now() - interval '30 minutes')                                               AS opportunities
    `);
    res.json(r);
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
       FROM tracked_sources ORDER BY enabled DESC, name`
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
      `INSERT INTO tracked_sources (name, type, rss_url, homepage, check_interval)
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
      `UPDATE tracked_sources SET
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
    await query('DELETE FROM tracked_sources WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /monitor/articles?hours=24&source_id=&entity_id=&limit=60
router.get('/articles', requireAuth, async (req, res, next) => {
  try {
    const hours      = Math.min(parseInt(req.query.hours  || '24'), 168);
    const limit      = Math.min(parseInt(req.query.limit  || '60'), 200);
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

    const { rows } = await query(`
      SELECT
        ma.id, ma.title, ma.url, ma.summary, ma.published_at, ma.detected_at,
        ts.name  AS source_name,
        ts.type  AS source_type,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', ke.id, 'name', ke.name, 'entity_type', ke.entity_type))
          FILTER (WHERE ke.id IS NOT NULL),
          '[]'
        ) AS entities
      FROM monitored_articles ma
      JOIN tracked_sources ts ON ts.id = ma.source_id
      LEFT JOIN article_entity_matches aem ON aem.article_id = ma.id
      LEFT JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE ${where}
      GROUP BY ma.id, ts.name, ts.type
      ORDER BY ma.detected_at DESC
      LIMIT $${params.length}
    `, params);

    res.json({ items: rows });
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

export default router;
