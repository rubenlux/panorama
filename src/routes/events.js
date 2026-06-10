import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /events — active events ordered by editorial score
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const minStories = parseInt(req.query.min_stories) || 1;
    const limit      = Math.min(parseInt(req.query.limit) || 25, 50);

    const { rows } = await query(`
      SELECT
        ec.id,
        ec.headline,
        ec.summary,
        ec.event_type,
        ec.importance_score,
        ec.editorial_score,
        ec.coverage_status,
        ec.status,
        ec.story_count,
        ec.article_count,
        ec.source_count,
        ec.main_entities,
        ec.timeline,
        ec.first_detected_at,
        ec.last_updated_at,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN tracked_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = ec.id
        ) AS sources,
        (
          SELECT json_agg(json_build_object(
            'id', eo.id, 'type', eo.type, 'title', eo.title,
            'traffic_potential', eo.traffic_potential, 'difficulty', eo.difficulty,
            'status', eo.status
          ) ORDER BY eo.seo_value DESC NULLS LAST)
          FROM editorial_opportunities eo
          WHERE eo.event_id = ec.id AND eo.status NOT IN ('dismissed')
          LIMIT 5
        ) AS opportunities
      FROM event_clusters ec
      WHERE ec.status IN ('active', 'followed')
        AND ec.story_count >= $1
        AND ec.last_updated_at > now() - interval '48 hours'
      ORDER BY
        ec.editorial_score DESC,
        ec.importance_score DESC,
        ec.source_count DESC,
        ec.last_updated_at DESC
      LIMIT $2
    `, [minStories, limit]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /events/:id — full event detail
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT ec.*
      FROM event_clusters ec
      WHERE ec.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });

    // Load sources
    const { rows: sources } = await query(`
      SELECT DISTINCT ts.id, ts.name, ts.rss_url
      FROM event_cluster_stories ecs
      JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources ts ON ts.id = ma.source_id
      WHERE ecs.event_id = $1
      ORDER BY ts.name
    `, [req.params.id]);

    res.json({ event: { ...rows[0], sources } });
  } catch (e) { next(e); }
});

// GET /events/:id/stories — story clusters inside the event
router.get('/:id/stories', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        sc.id, sc.title, sc.summary, sc.story_type, sc.coverage_status,
        sc.article_count, sc.source_count, sc.importance_score, sc.status,
        sc.first_seen, sc.last_seen,
        ecs.linked_at
      FROM event_cluster_stories ecs
      JOIN story_clusters sc ON sc.id = ecs.story_id
      WHERE ecs.event_id = $1
      ORDER BY sc.importance_score DESC, sc.last_seen DESC
    `, [req.params.id]);

    res.json({ stories: rows });
  } catch (e) { next(e); }
});

// GET /events/:id/articles — all articles across all stories
router.get('/:id/articles', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { rows } = await query(`
      SELECT DISTINCT ON (ma.id)
        ma.id, ma.title, ma.url, ma.summary, ma.published_at, ma.detected_at,
        ts.name AS source_name, ts.id AS source_id,
        sca.relevance_score,
        sc.title AS story_title
      FROM event_cluster_stories ecs
      JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources ts ON ts.id = ma.source_id
      JOIN story_clusters sc ON sc.id = ecs.story_id
      WHERE ecs.event_id = $1
      ORDER BY ma.id, ma.detected_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    res.json({ articles: rows, offset, limit });
  } catch (e) { next(e); }
});

// GET /events/:id/opportunities — all editorial opportunities for the event
router.get('/:id/opportunities', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, type, title, reason, seo_value, traffic_potential, difficulty, status, created_at
      FROM editorial_opportunities
      WHERE event_id = $1
      ORDER BY seo_value DESC NULLS LAST, created_at ASC
    `, [req.params.id]);

    res.json({ opportunities: rows });
  } catch (e) { next(e); }
});

// PATCH /events/:id/opportunities/:oppId — update opportunity status
router.patch('/:id/opportunities/:oppId', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'in_progress', 'done', 'dismissed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { rows } = await query(`
      UPDATE editorial_opportunities
      SET status = $1
      WHERE id = $2 AND event_id = $3
      RETURNING id, status
    `, [status, req.params.oppId, req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Opportunity not found' });
    res.json({ ok: true, opportunity: rows[0] });
  } catch (e) { next(e); }
});

// POST /events/:id/follow — mark event as followed
router.post('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      UPDATE event_clusters
      SET status = 'followed', updated_at = now()
      WHERE id = $1 AND status != 'stale'
      RETURNING id, status
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Event not found or stale' });
    res.json({ ok: true, status: rows[0].status });
  } catch (e) { next(e); }
});

// POST /events/:id/create-dossier — creates research_topic + pre-seeds articles
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const { rows: eventRows } = await query(
      `SELECT * FROM event_clusters WHERE id = $1`,
      [req.params.id]
    );
    if (!eventRows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = eventRows[0];

    const { rows: articles } = await query(`
      SELECT DISTINCT ON (ma.id) ma.title, ma.url, ma.published_at, ts.name AS source_name
      FROM event_cluster_stories ecs
      JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources ts ON ts.id = ma.source_id
      WHERE ecs.event_id = $1
      ORDER BY ma.id, sca.relevance_score DESC
      LIMIT 10
    `, [req.params.id]);

    const tags = ['event-cluster', event.event_type, event.coverage_status].filter(Boolean);

    const { rows: topicRows } = await query(`
      INSERT INTO research_topics (title, status, category, tags, created_by)
      VALUES ($1, 'pending', $2, $3, $4)
      RETURNING *
    `, [event.headline, event.event_type || 'trending', tags, req.user?.sub || null]);

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

    res.json({ ok: true, topic });
  } catch (e) { next(e); }
});

export default router;
