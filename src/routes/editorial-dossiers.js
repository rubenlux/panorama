import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── GET / — list event_clusters ───────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const status   = req.query.status   || null;
    const minScore = parseInt(req.query.min_score) || 0;
    const q        = req.query.q        || null;
    const limit    = Math.min(parseInt(req.query.limit) || 20, 200);
    const offset   = parseInt(req.query.offset) || 0;

    const conds  = [];
    const params = [];

    if (status === 'active') {
      conds.push(`ec.status IN ('active', 'followed')`);
    } else if (status === 'stale') {
      conds.push(`ec.status = 'stale'`);
    }
    if (minScore > 0) {
      params.push(minScore);
      conds.push(`ec.editorial_score >= $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conds.push(`ec.headline ILIKE $${params.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER()::int AS total_count,
        ec.id, ec.headline, ec.summary, ec.event_type,
        ec.importance_score, ec.editorial_score, ec.coverage_status, ec.status,
        ec.story_count, ec.article_count, ec.source_count,
        ec.main_entities, ec.first_detected_at, ec.last_updated_at,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
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
      ${where}
      ORDER BY ec.editorial_score DESC NULLS LAST, ec.last_updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = rows[0]?.total_count ?? 0;
    res.json({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit });
  } catch (e) { next(e); }
});

// ── GET /stats ────────────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        COUNT(*)::int                                                            AS total_events,
        COUNT(*) FILTER (WHERE status IN ('active','followed'))::int            AS active_events,
        COUNT(*) FILTER (WHERE coverage_status = 'breaking')::int              AS breaking,
        COUNT(*) FILTER (WHERE coverage_status = 'growing')::int               AS growing,
        ROUND(AVG(editorial_score))::int                                        AS avg_score,
        MAX(editorial_score)::int                                               AS max_score,
        (SELECT COUNT(*)::int FROM editorial_opportunities WHERE status = 'pending') AS pending_opps
      FROM event_clusters
    `);
    res.json(stats);
  } catch (e) { next(e); }
});

// ── GET /:id/pdf — stub (PDF generation not yet ported to event_clusters) ─────

router.get('/:id/pdf', requireAuth, (_req, res) => {
  res.status(501).json({ error: 'PDF generation not available for this version' });
});

// ── GET /:id — event cluster detail ──────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [event] } = await query(
      `SELECT ec.* FROM event_clusters ec WHERE ec.id = $1`, [id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const [timelineR, entitiesR, mediaR, opportunitiesR, storyOppsR] = await Promise.all([

      // Individual articles for this event — ordered ASC for Cronología tab
      query(`
        SELECT
          ma.id, ma.title, ma.url,
          ma.published_at  AS ts,
          ma.summary,
          rs.name          AS source_name
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles     ma  ON ma.id        = sca.article_id
        JOIN rss_sources            rs  ON rs.id        = ma.source_id
        WHERE ecs.event_id = $1
        ORDER BY ma.published_at ASC
        LIMIT 50
      `, [id]),

      // Named entities across this event
      query(`
        SELECT ke.id, ke.name, ke.entity_type, ke.mention_count
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        JOIN event_cluster_stories ecs ON ecs.story_id = se.story_id
        WHERE ecs.event_id = $1
        GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
        ORDER BY ke.mention_count DESC
        LIMIT 30
      `, [id]),

      // Media coverage breakdown
      query(`
        SELECT ts.id, ts.name AS source_name,
               COUNT(DISTINCT ma.id)::int AS article_count,
               MIN(ma.detected_at) AS first_article,
               MAX(ma.detected_at) AS last_article
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE ecs.event_id = $1
        GROUP BY ts.id, ts.name
        ORDER BY article_count DESC
      `, [id]),

      // Editorial opportunities for this event
      query(`
        SELECT id, type, title, traffic_potential, difficulty, status, seo_value, created_at
        FROM editorial_opportunities
        WHERE event_id = $1 AND status NOT IN ('dismissed')
        ORDER BY seo_value DESC NULLS LAST
      `, [id]),

      // Story opportunities for stories inside this event
      query(`
        SELECT DISTINCT ON (so.id)
          so.id, so.title, so.opportunity_type AS type,
          so.composite_score, so.traffic_score, so.seo_score,
          so.status, so.trigger, so.created_at
        FROM story_opportunities so
        JOIN event_cluster_stories ecs ON ecs.story_id = so.story_cluster_id
        WHERE ecs.event_id = $1 AND so.status NOT IN ('dismissed')
        ORDER BY so.id, so.composite_score DESC NULLS LAST
        LIMIT 20
      `, [id]),
    ]);

    res.json({
      event,
      timeline:            timelineR.rows,
      entities:            entitiesR.rows,
      media:               mediaR.rows,
      opportunities:       opportunitiesR.rows,
      story_opportunities: storyOppsR.rows,
    });
  } catch (e) { next(e); }
});

export default router;
