import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /knowledge/entities — list all entities, with optional ?type=&search= filters
router.get('/entities', requireAuth, async (req, res, next) => {
  try {
    const { type, search, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (type) {
      params.push(type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(
      `SELECT * FROM knowledge_entities
       ${where}
       ORDER BY mention_count DESC, last_seen_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM knowledge_entities ${where}`,
      params.slice(0, -2)
    );

    res.json({ items: rows, total: countRes.rows[0].total });
  } catch (e) { next(e); }
});

// GET /knowledge/entities/:id — entity detail with topics and events
router.get('/entities/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [entityRes, topicsRes, eventsRes] = await Promise.all([
      query('SELECT * FROM knowledge_entities WHERE id = $1', [id]),
      query(
        `SELECT rt.id, rt.title, rt.status, rt.created_at, em.confidence
         FROM entity_mentions em
         JOIN research_topics rt ON rt.id = em.topic_id
         WHERE em.entity_id = $1
         ORDER BY rt.created_at DESC
         LIMIT 20`,
        [id]
      ),
      query(
        `SELECT ke.*, rt.title AS topic_title
         FROM knowledge_events ke
         LEFT JOIN research_topics rt ON rt.id = ke.source_topic_id
         WHERE ke.entity_id = $1
         ORDER BY ke.event_date DESC NULLS LAST, ke.created_at DESC
         LIMIT 50`,
        [id]
      ),
    ]);

    if (!entityRes.rows[0]) return res.status(404).json({ error: 'Entity not found' });

    res.json({
      entity: entityRes.rows[0],
      topics: topicsRes.rows,
      events: eventsRes.rows,
    });
  } catch (e) { next(e); }
});

// GET /knowledge/stats — counts for dashboard widget
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const [entitiesRes, eventsRes, mentionsRes] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM knowledge_entities`),
      query(`SELECT COUNT(*)::int AS total FROM knowledge_events`),
      query(`SELECT COUNT(*)::int AS total FROM entity_mentions`),
    ]);

    res.json({
      entities: entitiesRes.rows[0].total,
      events:   eventsRes.rows[0].total,
      mentions: mentionsRes.rows[0].total,
    });
  } catch (e) { next(e); }
});

export default router;
