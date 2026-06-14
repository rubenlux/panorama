/**
 * Sprint 8.6A — Editorial Knowledge Graph API
 * Mount: /editorial
 *
 * Routes:
 *   GET /editorial/entities/trending        — top entities by score
 *   GET /editorial/entities/:id             — entity profile
 *   GET /editorial/events/:id/related       — related events
 */

import { Router } from 'express';
import { query }  from './db.js';

const router = Router();

// ── FASE 5: Trending entities ──────────────────────────────────────────────────

router.get('/entities/trending', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
    const type   = req.query.type || null;   // 'person'|'organization'|'place'|'topic'
    const search = req.query.q    || null;

    // Normalize type filter to DB values (includes 'unknown' which we reclassify at display)
    // We expose entity_type as-is and let the frontend classify
    const conds  = ['ke.mention_count > 0'];
    const params = [];
    let p = 1;

    if (search) { conds.push(`ke.name ILIKE $${p++}`); params.push(`%${search}%`); }

    const where = conds.join(' AND ');

    const { rows } = await query(`
      SELECT
        ke.id, ke.name, ke.entity_type, ke.mention_count,
        COUNT(DISTINCT ecs.event_id)::int                           AS events_count,
        COUNT(DISTINCT aem.article_id)::int                        AS articles_count,
        (ke.mention_count + COUNT(DISTINCT ecs.event_id) * 10)::int AS score
      FROM knowledge_entities ke
      LEFT JOIN article_entity_matches aem ON aem.entity_id = ke.id
      LEFT JOIN story_entities         se  ON se.entity_id  = ke.id
      LEFT JOIN event_cluster_stories  ecs ON ecs.story_id  = se.story_id
      WHERE ${where}
      GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
      ORDER BY score DESC, ke.mention_count DESC
      LIMIT $${p}
    `, [...params, limit]);

    res.json(rows);
  } catch (e) { next(e); }
});

// ── FASE 4: Entity profile ────────────────────────────────────────────────────

router.get('/entities/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [entityR, articleCntR, eventCntR, sourceCntR, relEntR, relEvtR] = await Promise.all([

      // Entity base
      query(`SELECT * FROM knowledge_entities WHERE id = $1`, [id]),

      // Articles count
      query(`SELECT COUNT(DISTINCT article_id)::int AS n FROM article_entity_matches WHERE entity_id = $1`, [id]),

      // Events count
      query(`
        SELECT COUNT(DISTINCT ecs.event_id)::int AS n
        FROM story_entities se
        JOIN event_cluster_stories ecs ON ecs.story_id = se.story_id
        WHERE se.entity_id = $1
      `, [id]),

      // Sources count
      query(`
        SELECT COUNT(DISTINCT ma.source_id)::int AS n
        FROM article_entity_matches aem
        JOIN monitored_articles ma ON ma.id = aem.article_id
        WHERE aem.entity_id = $1
      `, [id]),

      // Related entities (via entity_relationships)
      query(`
        SELECT
          ke.id, ke.name, ke.entity_type, ke.mention_count,
          er.shared_articles, er.shared_events,
          er.strength_score
        FROM entity_relationships er
        JOIN knowledge_entities ke
          ON ke.id = CASE WHEN er.entity_a_id = $1 THEN er.entity_b_id ELSE er.entity_a_id END
        WHERE er.entity_a_id = $1 OR er.entity_b_id = $1
        ORDER BY er.strength_score DESC
        LIMIT 15
      `, [id]),

      // Related events
      query(`
        SELECT
          ec.id, ec.headline, ec.editorial_score, ec.coverage_status,
          COUNT(DISTINCT se.story_id)::int AS shared_stories
        FROM story_entities se
        JOIN event_cluster_stories ecs ON ecs.story_id = se.story_id
        JOIN event_clusters ec         ON ec.id        = ecs.event_id
        WHERE se.entity_id = $1
        GROUP BY ec.id, ec.headline, ec.editorial_score, ec.coverage_status
        ORDER BY ec.editorial_score DESC NULLS LAST
        LIMIT 8
      `, [id]),
    ]);

    if (!entityR.rows[0]) return res.status(404).json({ error: 'Entidad no encontrada' });

    res.json({
      entity:           entityR.rows[0],
      articles_count:   articleCntR.rows[0].n,
      events_count:     eventCntR.rows[0].n,
      sources_count:    sourceCntR.rows[0].n,
      related_entities: relEntR.rows,
      related_events:   relEvtR.rows,
    });
  } catch (e) { next(e); }
});

// ── FASE 3: Related events ────────────────────────────────────────────────────

router.get('/events/:id/related', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(`
      WITH target_entities AS (
        SELECT DISTINCT se.entity_id
        FROM event_cluster_stories ecs
        JOIN story_entities se ON se.story_id = ecs.story_id
        WHERE ecs.event_id = $1
      ),
      target_sources AS (
        SELECT DISTINCT ma.source_id
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id  = ecs.story_id
        JOIN monitored_articles     ma  ON ma.id         = sca.article_id
        WHERE ecs.event_id = $1
      ),
      scored AS (
        SELECT
          ec.id,
          ec.headline,
          ec.editorial_score,
          ec.coverage_status,
          ec.article_count,
          COUNT(DISTINCT CASE WHEN se.entity_id IN (SELECT entity_id FROM target_entities) THEN se.entity_id END)::int AS shared_entities,
          COUNT(DISTINCT CASE WHEN ma.source_id IN (SELECT source_id FROM target_sources)  THEN ma.source_id  END)::int AS shared_sources
        FROM event_clusters ec
        JOIN event_cluster_stories  ecs  ON ecs.event_id  = ec.id
        JOIN story_entities         se   ON se.story_id   = ecs.story_id
        LEFT JOIN story_cluster_articles sca ON sca.story_id  = ecs.story_id
        LEFT JOIN monitored_articles     ma  ON ma.id         = sca.article_id
        WHERE ec.id != $1
          AND ec.status = 'active'
        GROUP BY ec.id, ec.headline, ec.editorial_score, ec.coverage_status, ec.article_count
        HAVING COUNT(DISTINCT CASE WHEN se.entity_id IN (SELECT entity_id FROM target_entities) THEN se.entity_id END) > 0
      )
      SELECT
        id AS event_id,
        headline AS title,
        editorial_score,
        coverage_status,
        article_count,
        shared_entities,
        shared_sources,
        (shared_entities * 10 + shared_sources * 5) AS score
      FROM scored
      ORDER BY score DESC, editorial_score DESC
      LIMIT 10
    `, [id]);

    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
