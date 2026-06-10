import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /opportunities — story-derived editorial opportunities, sorted by composite score
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const status = req.query.status || 'pending';
    const type   = req.query.type || null;

    const conditions = [`so.status = $1`, `sc.is_recurring = false`, `sc.last_seen > now() - interval '24 hours'`];
    const params = [status];
    let pi = 2;
    if (type) { conditions.push(`so.opportunity_type = $${pi++}`); params.push(type); }
    params.push(limit);

    const { rows } = await query(`
      SELECT
        so.id,
        so.title,
        so.description,
        so.opportunity_type,
        so.traffic_score,
        so.seo_score,
        so.urgency_score,
        so.editorial_score,
        so.composite_score,
        so.status,
        so.created_at,
        sc.id          AS story_cluster_id,
        sc.title       AS story_title,
        sc.story_type  AS story_type,
        sc.coverage_status AS story_coverage_status,
        sc.importance_score AS story_importance,
        sc.source_count AS story_source_count,
        sc.article_count AS story_article_count,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN tracked_sources ts ON ts.id = ma.source_id
          WHERE sca.story_id = sc.id
        ) AS story_sources
      FROM story_opportunities so
      JOIN story_clusters sc ON sc.id = so.story_cluster_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY so.composite_score DESC, so.created_at DESC
      LIMIT $${pi}
    `, params);

    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});

// GET /opportunities/summary — count by type + top composite score
router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        so.opportunity_type,
        COUNT(*)::int AS count,
        ROUND(AVG(so.composite_score)::numeric, 1) AS avg_score
      FROM story_opportunities so
      JOIN story_clusters sc ON sc.id = so.story_cluster_id
      WHERE so.status = 'pending'
        AND sc.is_recurring = false
        AND sc.last_seen > now() - interval '24 hours'
      GROUP BY so.opportunity_type
      ORDER BY avg_score DESC
    `);
    res.json({ types: rows });
  } catch (e) { next(e); }
});

// PATCH /opportunities/:id — update status
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'in_progress', 'done', 'dismissed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { rows } = await query(`
      UPDATE story_opportunities
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, status
    `, [status, req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Opportunity not found' });
    res.json({ ok: true, opportunity: rows[0] });
  } catch (e) { next(e); }
});

// POST /opportunities/:id/create-dossier
// Creates a research_topic seeded with the story's articles + entities
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const { rows: oppRows } = await query(
      `SELECT so.*, sc.story_type FROM story_opportunities so
       JOIN story_clusters sc ON sc.id = so.story_cluster_id
       WHERE so.id = $1`,
      [req.params.id]
    );
    if (!oppRows[0]) return res.status(404).json({ error: 'Opportunity not found' });
    const opp = oppRows[0];

    // Top articles from the story
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.published_at, ts.name AS source_name
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
      ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      LIMIT 10
    `, [opp.story_cluster_id]);

    const tags = [
      'story-opportunity',
      opp.opportunity_type?.toLowerCase(),
      opp.story_type,
    ].filter(Boolean);

    const { rows: topicRows } = await query(`
      INSERT INTO research_topics (title, status, category, tags, created_by)
      VALUES ($1, 'pending', $2, $3, $4)
      RETURNING *
    `, [opp.title, opp.story_type || 'editorial', tags, req.user?.sub || null]);

    const topic = topicRows[0];

    if (articles.length > 0) {
      const ph     = articles.map((_, i) => `($1,$${i*4+2},$${i*4+3},$${i*4+4},$${i*4+5})`).join(',');
      const params = [topic.id];
      articles.forEach(a => params.push(a.url, a.title, a.source_name, a.published_at || null));
      await query(
        `INSERT INTO research_sources (topic_id, url, title, source_name, published_at)
         VALUES ${ph} ON CONFLICT DO NOTHING`,
        params
      );
    }

    // Mark opportunity as in_progress when dossier is created
    await query(
      `UPDATE story_opportunities SET status = 'in_progress', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    res.json({ ok: true, topic });
  } catch (e) { next(e); }
});

export default router;
