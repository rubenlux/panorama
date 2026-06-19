import { Router } from 'express';
import { query, pool } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { AiService } from '../services/AiService.js';
import { runDossierGeneration } from '../services/DossierService.js';
import { logAiCall } from '../services/aiUsageLogger.js';

const ai = new AiService();

const router = Router();

// GET /events — active events ordered by editorial score
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const minStories = parseInt(req.query.min_stories) || 1;
    const limit      = Math.min(parseInt(req.query.limit) || 25, 1000);
    const offset     = parseInt(req.query.offset) || 0;
    const ALLOWED_HOURS = [1, 2, 6, 12, 24];
    const hours = ALLOWED_HOURS.includes(parseInt(req.query.hours)) ? parseInt(req.query.hours) : 24;
    const sort  = req.query.sort === 'score' ? 'score' : 'recent';

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
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
        AND ec.last_updated_at > now() - interval '${hours} hours'
      ORDER BY
        ${sort === 'score'
          ? 'ec.editorial_score DESC, ec.importance_score DESC, ec.last_updated_at DESC'
          : 'ec.last_updated_at DESC, ec.editorial_score DESC, ec.importance_score DESC'
        }
      LIMIT $2 OFFSET $3
    `, [minStories, limit, offset]);

    const total = parseInt(rows[0]?.total_count || '0');
    res.json({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit });
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

// POST /events/:id/create-dossier
// Sprint 5.7: full pipeline — uses event AI data (summary, timeline, entities, editorial_opportunities)
// as the research_brief. No RSS re-investigation.
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId  = req.user?.sub || null;

    const { rows: eventRows } = await query(
      `SELECT * FROM event_clusters WHERE id = $1`,
      [eventId]
    );
    if (!eventRows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = eventRows[0];

    // Enrichment gate — require ≥70% of articles across all event stories
    const { rows: [enr] } = await query(`
      SELECT
        COUNT(DISTINCT ma.id)::int AS total,
        COUNT(DISTINCT ma.id) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::int AS enriched
      FROM event_cluster_stories ecs
      JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
      JOIN monitored_articles ma ON ma.id = sca.article_id
      WHERE ecs.event_id = $1
    `, [eventId]);
    const enrCoverage = enr.total > 0 ? enr.enriched / enr.total : 0;
    if (enr.total > 0 && enrCoverage < 0.70) {
      return res.status(422).json({
        error: `El evento aún está siendo enriquecido (${Math.round(enrCoverage * 100)}% completado). Esperando captura completa de artículos antes de generar el dossier.`,
        enrichment_coverage: Math.round(enrCoverage * 100),
        total_articles: enr.total,
        enriched_articles: enr.enriched,
      });
    }

    // Articles across all stories in the event — exclude contaminated (relevance < 0.30)
    const { rows: articles } = await query(`
      SELECT DISTINCT ON (ma.id) ma.title, ma.url, ma.summary, ma.published_at,
             ma.content_text, ma.extraction_method, ma.content_words,
             ts.name AS source_name, sca.relevance_score
      FROM event_cluster_stories ecs
      JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources ts ON ts.id = ma.source_id
      WHERE ecs.event_id = $1
        AND sca.relevance_score >= 0.30
      ORDER BY ma.id, sca.relevance_score DESC
      LIMIT 15
    `, [eventId]);

    // Log AI context for traceability
    query(`
      INSERT INTO ai_generation_logs (event_id, generation_type, article_count, article_titles, total_words_sent)
      VALUES ($1, 'event_dossier', $2, $3, $4)
    `, [
      eventId,
      articles.length,
      JSON.stringify(articles.map(a => a.title)),
      articles.reduce((s, a) => s + (a.content_words || 0), 0),
    ]).catch(() => {});

    // Entities from all stories in the event (deduplicated)
    const { rows: entities } = await query(`
      SELECT DISTINCT ke.id, ke.name, ke.entity_type
      FROM event_cluster_stories ecs
      JOIN story_entities se ON se.story_id = ecs.story_id
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      WHERE ecs.event_id = $1
    `, [eventId]);

    // Editorial opportunities linked to the event
    const { rows: eventOpps } = await query(`
      SELECT id, type AS opportunity_type, title, reason AS description,
             seo_value, traffic_potential, difficulty, status
      FROM editorial_opportunities
      WHERE event_id = $1 AND status IN ('pending','in_progress')
      ORDER BY seo_value DESC NULLS LAST
      LIMIT 8
    `, [eventId]);

    const keyFacts = await ai.synthesizeKeyFacts(articles).catch(() => []);
    const finalKeyFacts = keyFacts.length > 0
      ? keyFacts
      : articles.slice(0, 5).map(a => `${a.source_name}: ${a.title}`);

    const timeline     = Array.isArray(event.timeline) ? event.timeline : [];
    const dossierTitle = event.headline;
    const tags         = ['event-cluster', event.event_type, event.coverage_status, 'source:monitor'].filter(Boolean);

    // Map event editorial_opportunities to the same shape as story_opportunities for the prompt
    const sourceOpps = eventOpps.map(o => ({
      opportunity_type: o.opportunity_type,
      title:            o.title,
      description:      o.description,
      editorial_score:  o.seo_value ? o.seo_value * 10 : null,
      composite_score:  null,
    }));

    const oppsSummary = sourceOpps.map(o => `${o.opportunity_type}: ${o.title}`).join(', ');

    // ── Full pipeline in a transaction ───────────────────────────────────────
    const client = await pool.connect();
    let topic, dossier;
    try {
      await client.query('BEGIN');

      const { rows: [t] } = await client.query(`
        INSERT INTO research_topics
          (title, status, category, tags, created_by, source_type, source_id, source_title, source_score)
        VALUES ($1, 'ready', $2, $3, $4, 'event', $5, $6, $7)
        RETURNING *
      `, [dossierTitle, event.event_type || 'editorial', tags, userId,
          eventId, dossierTitle, event.editorial_score || 0]);
      topic = t;

      await client.query(`
        INSERT INTO research_briefs
          (topic_id, executive_summary, key_facts, controversies, timeline,
           opportunities, risks, source_opportunities, model_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        topic.id,
        event.summary || dossierTitle,
        JSON.stringify(finalKeyFacts),
        JSON.stringify([]),
        JSON.stringify(timeline),
        oppsSummary,
        `Cobertura: ${event.coverage_status}. Importancia: ${event.importance_score}/10. Fuentes: ${event.source_count}.`,
        JSON.stringify(sourceOpps),
        'event-monitor',
      ]);

      for (const e of entities) {
        await client.query(`
          INSERT INTO entity_mentions (entity_id, topic_id, confidence)
          VALUES ($1, $2, 0.9)
          ON CONFLICT (entity_id, topic_id) DO NOTHING
        `, [e.id, topic.id]);
      }

      if (articles.length > 0) {
        const ph     = articles.map((_, i) => `($1,$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7},$${i*7+8})`).join(',');
        const params = [topic.id];
        articles.forEach(a => {
          const wc = a.summary ? a.summary.split(/\s+/).filter(Boolean).length : 0;
          params.push(a.url, a.title, a.source_name, a.published_at || null, a.summary || '', a.relevance_score || 1.0, wc);
        });
        await client.query(
          `INSERT INTO research_sources (topic_id, url, title, source_name, published_at, content, relevance_score, word_count)
           VALUES ${ph} ON CONFLICT DO NOTHING`,
          params
        );
      }

      const { rows: [d] } = await client.query(`
        INSERT INTO editorial_dossiers (topic_id, status, created_by)
        VALUES ($1, 'draft', $2)
        RETURNING *
      `, [topic.id, userId]);
      dossier = d;

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // [Cost Killer 2] Auto-generation disabled — use POST /editorial-workflow/dossiers/:id/enrich
    res.json({ ok: true, dossier });
  } catch (e) { next(e); }
});

// ── FASE 3: POST /events/:id/generate-summary — on-demand event summary ─────────
const RELEVANCE_THRESHOLD_EV = 0.30;

function calcEditorialScoreLocal(importanceScore, sourceCount, articleCount, coverageStatus) {
  const impPart  = (importanceScore / 10) * 40;
  const srcPart  = Math.min(sourceCount / 5, 1) * 25;
  const livePart = coverageStatus === 'breaking' ? 20 : coverageStatus === 'growing' ? 15 : 10;
  const artPart  = Math.min(articleCount / 20, 1) * 15;
  return Math.round(impPart + srcPart + livePart + artPart);
}

router.post('/:id/generate-summary', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const force   = req.query.force === 'true';
  const userId  = req.user?.sub || 'unknown';

  try {
    const { rows: [event] } = await query(`SELECT * FROM event_clusters WHERE id = $1`, [id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Cache: return existing if summarised < 2h ago and not forced
    if (!force && event.summary && event.last_summarized_at &&
        (Date.now() - new Date(event.last_summarized_at)) < 2 * 3600 * 1000) {
      await logAiCall({ feature: 'event_summary', trigger: 'on_demand', triggeredBy: userId, eventId: id, cached: true });
      return res.json({ cached: true, event });
    }

    const [storiesRes, articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT sc.id, sc.title, sc.article_count, sc.source_count, sc.importance_score, sc.coverage_status
        FROM event_cluster_stories ecs
        JOIN story_clusters sc ON sc.id = ecs.story_id
        WHERE ecs.event_id = $1
      `, [id]),
      query(`
        SELECT DISTINCT ON (ma.id)
               ma.title, ma.url, ma.summary, ma.detected_at,
               ma.content_text, ma.extraction_method, ma.content_words, ts.name AS source_name
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN tracked_sources ts ON ts.id = ma.source_id
        WHERE ecs.event_id = $1 AND sca.relevance_score >= $2
        ORDER BY ma.id, ma.detected_at DESC
        LIMIT 25
      `, [id, RELEVANCE_THRESHOLD_EV]),
      query(`
        SELECT DISTINCT ke.name, ke.entity_type
        FROM event_cluster_stories ecs
        JOIN story_entities se ON se.story_id = ecs.story_id
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE ecs.event_id = $1 LIMIT 15
      `, [id]),
    ]);

    if (storiesRes.rows.length === 0) {
      return res.status(422).json({ error: 'No stories associated with this event' });
    }

    const inputWords = articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0);
    const t0 = Date.now();
    let result;
    try {
      result = await ai.generateEventSummary(storiesRes.rows, articlesRes.rows, entitiesRes.rows);
    } catch (aiErr) {
      await logAiCall({ feature: 'event_summary', trigger: 'on_demand', triggeredBy: userId, eventId: id,
        inputWords, durationMs: Date.now() - t0, success: false, errorMessage: aiErr.message });
      return next(aiErr);
    }

    const editScore = calcEditorialScoreLocal(
      result.importance_score ?? event.importance_score ?? 5,
      event.source_count, event.article_count,
      result.coverage_status || event.coverage_status
    );

    const { rows: [updated] } = await query(`
      UPDATE event_clusters SET
        headline           = $1,
        summary            = $2,
        event_type         = $3,
        importance_score   = $4,
        editorial_score    = $5,
        coverage_status    = $6,
        main_entities      = $7,
        timeline           = $8,
        last_summarized_at = now(),
        updated_at         = now()
      WHERE id = $9
      RETURNING *
    `, [
      result.headline      || result.event_name || event.headline,
      result.summary       || null,
      result.event_type    || 'general',
      result.importance_score ?? 5,
      editScore,
      result.coverage_status || 'monitoring',
      JSON.stringify(result.main_entities || []),
      JSON.stringify(result.timeline      || []),
      id,
    ]);

    // Persist editorial opportunities from event summary
    if (Array.isArray(result.editorial_opportunities) && result.editorial_opportunities.length > 0) {
      await query(`DELETE FROM editorial_opportunities WHERE event_id = $1 AND status = 'pending'`, [id]);
      for (const opp of result.editorial_opportunities) {
        await query(`
          INSERT INTO editorial_opportunities
            (event_id, type, title, reason, seo_value, traffic_potential, difficulty)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
          id,
          opp.type              || 'noticia',
          opp.title             || '',
          opp.reason            || null,
          opp.seo_value         || null,
          opp.traffic_potential || null,
          opp.difficulty        || null,
        ]).catch(() => {});
      }
    }

    await logAiCall({ feature: 'event_summary', trigger: 'on_demand', triggeredBy: userId, eventId: id,
      inputWords, durationMs: Date.now() - t0, success: true });

    res.json({ cached: false, event: updated });
  } catch (e) { next(e); }
});

export default router;
