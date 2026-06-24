import { Router } from 'express';
import { query, pool } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { AiService } from '../services/AiService.js';
import { runDossierGeneration } from '../services/DossierService.js';
import { logAiCall } from '../services/aiUsageLogger.js';

const ai = new AiService();

const router = Router();

// GET /stories — active editorial stories, ordered by importance then recency
// Excludes recurring content and stale stories by default.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const minArticles = parseInt(req.query.min_articles) || 2;
    const limit       = Math.min(parseInt(req.query.limit) || 50, 1000);
    const offset      = parseInt(req.query.offset) || 0;
    const includeAll  = req.query.include_all === 'true';
    const ALLOWED_HOURS = [1, 2, 6, 12, 24];
    const hours = ALLOWED_HOURS.includes(parseInt(req.query.hours)) ? parseInt(req.query.hours) : 24;
    const sort  = req.query.sort === 'score' ? 'score' : 'recent';

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        sc.id,
        sc.title,
        sc.slug,
        sc.story_type,
        sc.summary,
        sc.editorial_opportunities,
        sc.importance_score,
        sc.coverage_status,
        sc.status,
        sc.source_count,
        sc.article_count,
        sc.is_recurring,
        sc.first_seen,
        sc.last_seen,
        sc.story_quality,
        sc.story_confidence,
        sc.avg_relevance,
        sc.story_context_score,
        sc.context_relevance_score,
        sc.context_depth_score,
        sc.context_diversity_score,
        sc.context_coverage_score,
        sc.algorithmic_summary,
        (
          SELECT COUNT(sca3.article_id) FILTER (WHERE sca3.relevance_score >= 0.30)::int
          FROM story_cluster_articles sca3
          WHERE sca3.story_id = sc.id
        ) AS valid_article_count,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources    ts ON ts.id = ma.source_id
          WHERE sca.story_id = sc.id
        ) AS sources,
        (
          SELECT json_agg(ke.name ORDER BY ke.name)
          FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = sc.id
          LIMIT 6
        ) AS entities,
        (
          SELECT CASE WHEN COUNT(*) = 0 THEN 0
                 ELSE ROUND(100.0 * COUNT(*) FILTER (
                        WHERE ma2.extraction_method IN ('fetch','playwright')
                      ) / COUNT(*))::int
                 END
          FROM story_cluster_articles sca2
          JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
          WHERE sca2.story_id = sc.id
        ) AS enrichment_coverage
      FROM story_clusters sc
      WHERE sc.status IN ('active', 'ready', 'followed')
        AND sc.is_recurring = false
        AND sc.article_count >= $1
        AND sc.last_seen > now() - interval '${hours} hours'
      ORDER BY
        ${sort === 'score'
          ? 'sc.importance_score DESC, sc.source_count DESC, sc.last_seen DESC'
          : 'sc.last_seen DESC, sc.importance_score DESC, sc.source_count DESC'
        }
      LIMIT $2 OFFSET $3
    `, [includeAll ? 1 : minArticles, limit, offset]);

    const total = parseInt(rows[0]?.total_count || '0');
    res.json({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit });
  } catch (e) { next(e); }
});

// GET /stories/:id — full story detail
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        sc.*,
        (
          SELECT json_agg(json_build_object('name', ke.name, 'entity_type', ke.entity_type, 'role', se.role))
          FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = sc.id
        ) AS entities
      FROM story_clusters sc
      WHERE sc.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Story not found' });
    res.json({ story: rows[0] });
  } catch (e) { next(e); }
});

// GET /stories/:id/articles — paginated articles in story
router.get('/:id/articles', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 50);
    const offset = parseInt(req.query.offset) || 0;

    const [storyRes, articlesRes] = await Promise.all([
      query('SELECT id FROM story_clusters WHERE id = $1', [req.params.id]),
      query(`
        SELECT
          ma.id, ma.title, ma.url, ma.summary, ma.published_at, ma.detected_at,
          ts.name AS source_name, ts.id AS source_id,
          sca.relevance_score
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources    ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
        LIMIT $2 OFFSET $3
      `, [req.params.id, limit, offset]),
    ]);

    if (!storyRes.rows[0]) return res.status(404).json({ error: 'Story not found' });
    res.json({ articles: articlesRes.rows, offset, limit });
  } catch (e) { next(e); }
});

// POST /stories/:id/follow — mark story as followed
router.post('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      UPDATE story_clusters
      SET status = 'followed', updated_at = now()
      WHERE id = $1 AND status != 'stale'
      RETURNING id, status
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Story not found or stale' });
    res.json({ ok: true, status: rows[0].status });
  } catch (e) { next(e); }
});

// POST /stories/:id/create-dossier
// Sprint 5.7: full pipeline — creates research_topic + research_brief (from story AI data)
// + entity_mentions + research_sources + editorial_dossier in one shot.
// No RSS re-investigation needed: the monitor's intelligence is the brief.
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const storyId = req.params.id;
    const userId  = req.user?.sub || null;

    const { rows: storyRows } = await query(
      `SELECT * FROM story_clusters WHERE id = $1`,
      [storyId]
    );
    if (!storyRows[0]) return res.status(404).json({ error: 'Story not found' });
    const story = storyRows[0];

    // Enrichment gate — require ≥70% of articles to have full text
    const { rows: [enr] } = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::int AS enriched
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      WHERE sca.story_id = $1
    `, [storyId]);
    const enrCoverage = enr.total > 0 ? enr.enriched / enr.total : 0;
    if (enr.total > 0 && enrCoverage < 0.70) {
      return res.status(422).json({
        error: `Esta historia aún está siendo enriquecida (${Math.round(enrCoverage * 100)}% completado). Esperando captura completa de artículos antes de generar el dossier.`,
        enrichment_coverage: Math.round(enrCoverage * 100),
        total_articles: enr.total,
        enriched_articles: enr.enriched,
      });
    }

    // Fetch articles — exclude contaminated (relevance < 0.30) from AI context
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.summary, ma.published_at, ma.content_text, ma.extraction_method,
             ma.content_words, ts.name AS source_name,
             sca.relevance_score
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN rss_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
        AND sca.relevance_score >= 0.30
      ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      LIMIT 12
    `, [storyId]);

    // Log AI context for traceability
    query(`
      INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
      VALUES ($1, 'story_dossier', $2, $3, $4)
    `, [
      storyId,
      articles.length,
      JSON.stringify(articles.map(a => a.title)),
      articles.reduce((s, a) => s + (a.content_words || 0), 0),
    ]).catch(() => {});

    // Entities already detected by the monitor
    const { rows: entities } = await query(`
      SELECT ke.id, ke.name, ke.entity_type
      FROM story_entities se
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      WHERE se.story_id = $1
    `, [storyId]);

    // Story-level editorial opportunities (structured, with scores)
    const { rows: storyOpps } = await query(`
      SELECT id, title, description, opportunity_type,
             traffic_score, seo_score, urgency_score, editorial_score, composite_score
      FROM story_opportunities
      WHERE story_cluster_id = $1 AND status = 'pending'
      ORDER BY composite_score DESC
      LIMIT 8
    `, [storyId]);

    // Event timeline if this story is linked to an event
    const { rows: eventRows } = await query(`
      SELECT ec.timeline
      FROM event_cluster_stories ecs
      JOIN event_clusters ec ON ec.id = ecs.event_id
      WHERE ecs.story_id = $1
      ORDER BY ec.editorial_score DESC
      LIMIT 1
    `, [storyId]);
    const timeline = eventRows[0]?.timeline || [];

    // Synthesize concrete key facts from article titles + RSS snippets
    const keyFacts = await ai.synthesizeKeyFacts(articles).catch(() => []);
    const finalKeyFacts = keyFacts.length > 0
      ? keyFacts
      : articles.slice(0, 5).map(a => `${a.source_name}: ${a.title}`);

    const dossierTitle = story.title || `Historia: ${storyId}`;
    const tags = ['story-cluster', story.story_type, story.coverage_status, 'source:monitor'].filter(Boolean);

    const oppsSummary = storyOpps.length > 0
      ? storyOpps.map(o => `${o.opportunity_type}: ${o.title}`).join(', ')
      : story.editorial_opportunities?.map?.(o => o.title || o).join(', ') || '';

    // ── Full pipeline in a transaction ───────────────────────────────────────
    const client = await pool.connect();
    let topic, briefRow, dossier;
    try {
      await client.query('BEGIN');

      // 1. research_topic — status='ready' (brief is already here, no RSS needed)
      const { rows: [t] } = await client.query(`
        INSERT INTO research_topics
          (title, status, category, tags, created_by, source_type, source_id, source_title, source_score)
        VALUES ($1, 'ready', $2, $3, $4, 'story', $5, $6, $7)
        RETURNING *
      `, [dossierTitle, story.story_type || 'editorial', tags, userId, storyId, dossierTitle, story.importance_score || 0]);
      topic = t;

      // 2. research_brief — seeded from story AI data
      const { rows: [b] } = await client.query(`
        INSERT INTO research_briefs
          (topic_id, executive_summary, key_facts, controversies, timeline,
           opportunities, risks, source_opportunities, model_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        topic.id,
        story.summary || dossierTitle,
        JSON.stringify(finalKeyFacts),
        JSON.stringify([]),
        JSON.stringify(timeline),
        oppsSummary,
        `Cobertura: ${story.coverage_status}. Importancia: ${story.importance_score}/10. Fuentes: ${story.source_count}.`,
        JSON.stringify(storyOpps),
        'story-monitor',
      ]);
      briefRow = b;

      // 3. entity_mentions — map monitor entities to this research topic
      for (const e of entities) {
        await client.query(`
          INSERT INTO entity_mentions (entity_id, topic_id, confidence)
          VALUES ($1, $2, 0.9)
          ON CONFLICT (entity_id, topic_id) DO NOTHING
        `, [e.id, topic.id]);
      }

      // 4. research_sources — articles with RSS content
      if (articles.length > 0) {
        const ph     = articles.map((_, i) => `($1,$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7},$${i*7+8})`).join(',');
        const params = [topic.id];
        articles.forEach(a => {
          const wordCount = a.summary ? a.summary.split(/\s+/).filter(Boolean).length : 0;
          params.push(a.url, a.title, a.source_name, a.published_at || null, a.summary || '', a.relevance_score || 1.0, wordCount);
        });
        await client.query(
          `INSERT INTO research_sources (topic_id, url, title, source_name, published_at, content, relevance_score, word_count)
           VALUES ${ph} ON CONFLICT DO NOTHING`,
          params
        );
      }

      // 5. editorial_dossier
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

// ── FASE 2: POST /stories/:id/generate-summary — on-demand story summary ────────
const RELEVANCE_THRESHOLD = 0.30;

router.post('/:id/generate-summary', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const force   = req.query.force === 'true';
  const userId  = req.user?.sub || 'unknown';

  try {
    const { rows: [story] } = await query(`SELECT * FROM story_clusters WHERE id = $1`, [id]);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    // Cache: return existing unless forced
    if (story.summary && story.status === 'ready' && !force) {
      await logAiCall({ feature: 'story_summary', trigger: 'on_demand', triggeredBy: userId, storyId: id, cached: true });
      return res.json({ cached: true, story });
    }

    const [articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
               ma.content_words, ts.name AS source_name
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources    ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1 AND sca.relevance_score >= $2
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      `, [id, RELEVANCE_THRESHOLD]),
      query(`
        SELECT ke.name, ke.entity_type, se.role
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = $1 LIMIT 12
      `, [id]),
    ]);

    if (articlesRes.rows.length === 0) {
      return res.status(422).json({ error: 'No articles available for this story' });
    }

    const inputWords = articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0);
    await query(`UPDATE story_clusters SET status = 'summarizing', updated_at = now() WHERE id = $1`, [id]);

    const t0 = Date.now();
    let result, success = true, errorMsg = null;
    try {
      result = await ai.generateStorySummary(articlesRes.rows, entitiesRes.rows);
    } catch (aiErr) {
      success = false; errorMsg = aiErr.message;
      await query(`UPDATE story_clusters SET status = 'active', updated_at = now() WHERE id = $1`, [id]);
      await logAiCall({ feature: 'story_summary', trigger: 'on_demand', triggeredBy: userId, storyId: id,
        inputWords, durationMs: Date.now() - t0, success: false, errorMessage: errorMsg });
      return next(aiErr);
    }

    const { rows: [updated] } = await query(`
      UPDATE story_clusters SET
        title                   = $1,
        summary                 = $2,
        story_type              = $3,
        importance_score        = $4,
        coverage_status         = $5,
        editorial_opportunities = $6,
        status                  = 'ready',
        updated_at              = now()
      WHERE id = $7
      RETURNING *
    `, [
      result.headline,
      result.summary,
      result.story_type       || story.story_type || 'news',
      result.importance_score ?? 5,
      result.coverage_status  || 'monitoring',
      JSON.stringify(result.editorial_opportunities || []),
      id,
    ]);

    await logAiCall({ feature: 'story_summary', trigger: 'on_demand', triggeredBy: userId, storyId: id,
      inputWords, durationMs: Date.now() - t0, success: true });

    res.json({ cached: false, story: updated });
  } catch (e) { next(e); }
});

// ── FASE 4: POST /stories/:id/generate-opportunities — on-demand opportunities ──
const VALID_OPP_TYPES = new Set(['NEWS','SEO','ANALYSIS','EXPLAINER','SOCIAL','FACT_CHECK','LIVE_COVERAGE','OPINION']);

function calcComposite(editorial, traffic, seo, urgency) {
  return parseFloat((editorial * 0.4 + traffic * 0.3 + seo * 0.2 + urgency * 0.1).toFixed(2));
}

router.post('/:id/generate-opportunities', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const force   = req.query.force === 'true';
  const userId  = req.user?.sub || 'unknown';

  try {
    const { rows: [story] } = await query(`SELECT * FROM story_clusters WHERE id = $1`, [id]);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    // Cache: if fresh opportunities exist (< 4h) and not forced, return them
    if (!force) {
      const { rows: existing } = await query(`
        SELECT * FROM story_opportunities
        WHERE story_cluster_id = $1 AND status = 'pending' AND created_at > now() - interval '4 hours'
        ORDER BY composite_score DESC
      `, [id]);
      if (existing.length > 0) {
        await logAiCall({ feature: 'opportunities', trigger: 'on_demand', triggeredBy: userId, storyId: id, cached: true });
        return res.json({ cached: true, opportunities: existing });
      }
    }

    const [articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
               ma.content_words, ts.name AS source_name
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources    ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1 AND sca.relevance_score >= $2
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
        LIMIT 15
      `, [id, RELEVANCE_THRESHOLD]),
      query(`
        SELECT ke.name, ke.entity_type
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = $1 LIMIT 10
      `, [id]),
    ]);

    if (articlesRes.rows.length === 0) {
      return res.status(422).json({ error: 'No articles available' });
    }

    const inputWords = articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0);
    const t0 = Date.now();
    let opps;
    try {
      opps = await ai.generateEditorialOpportunities(story, articlesRes.rows, entitiesRes.rows);
    } catch (aiErr) {
      await logAiCall({ feature: 'opportunities', trigger: 'on_demand', triggeredBy: userId, storyId: id,
        inputWords, durationMs: Date.now() - t0, success: false, errorMessage: aiErr.message });
      return next(aiErr);
    }

    // Clear stale pending, insert fresh
    await query(`DELETE FROM story_opportunities WHERE story_cluster_id = $1 AND status = 'pending'`, [id]);

    const inserted = [];
    for (const opp of opps) {
      const type      = VALID_OPP_TYPES.has(opp.opportunity_type) ? opp.opportunity_type : 'NEWS';
      const editorial = Math.min(100, Math.max(0, opp.editorial_score || 50));
      const traffic   = Math.min(100, Math.max(0, opp.traffic_score   || 50));
      const seo       = Math.min(100, Math.max(0, opp.seo_score       || 50));
      const urgency   = Math.min(100, Math.max(0, opp.urgency_score   || 50));
      const composite = calcComposite(editorial, traffic, seo, urgency);

      const { rows: [row] } = await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [id, opp.title, opp.description || null, type, traffic, seo, urgency, editorial, composite]);
      inserted.push(row);
    }

    await logAiCall({ feature: 'opportunities', trigger: 'on_demand', triggeredBy: userId, storyId: id,
      inputWords, durationMs: Date.now() - t0, success: true });

    res.json({ cached: false, opportunities: inserted });
  } catch (e) { next(e); }
});

// GET /by-entity/:name — stories mentioning a specific entity (OpenClaw)
// Read-only, max 5 results for context aggregation
router.get('/by-entity/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    const { rows } = await query(`
      SELECT DISTINCT
        sc.id, sc.title, sc.slug, sc.importance_score, sc.coverage_status,
        sc.source_count, sc.article_count, sc.summary,
        json_agg(DISTINCT ke.name ORDER BY ke.name) AS entities,
        json_agg(DISTINCT ts.name ORDER BY ts.name) AS sources
      FROM story_clusters sc
      JOIN story_entities se ON se.story_id = sc.id
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      LEFT JOIN story_cluster_articles sca ON sca.story_id = sc.id
      LEFT JOIN monitored_articles ma ON ma.id = sca.article_id
      LEFT JOIN rss_sources ts ON ts.id = ma.source_id
      WHERE LOWER(ke.name) ILIKE LOWER($1)
        AND sc.status IN ('active', 'ready', 'followed')
        AND sc.is_recurring = false
      GROUP BY sc.id, sc.title, sc.slug, sc.importance_score, sc.coverage_status,
               sc.source_count, sc.article_count, sc.summary
      ORDER BY sc.importance_score DESC, sc.last_seen DESC
      LIMIT $2
    `, [name, limit]);

    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});

export default router;
