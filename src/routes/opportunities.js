import { Router } from 'express';
import { query, pool } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { AiService } from '../services/AiService.js';
import { runDossierGeneration } from '../services/DossierService.js';

const ai = new AiService();

const router = Router();

// GET /opportunities — story-derived editorial opportunities, sorted by composite score
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 300);
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
// Sprint 5.7: full pipeline — creates research_brief from opportunity + story AI data,
// entity_mentions, research_sources, editorial_dossier. No RSS re-investigation.
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const oppId  = req.params.id;
    const userId = req.user?.sub || null;

    const { rows: oppRows } = await query(`
      SELECT so.*, sc.id AS story_id, sc.title AS story_title, sc.summary AS story_summary,
             sc.story_type, sc.coverage_status, sc.importance_score, sc.source_count,
             sc.editorial_opportunities
      FROM story_opportunities so
      JOIN story_clusters sc ON sc.id = so.story_cluster_id
      WHERE so.id = $1
    `, [oppId]);
    if (!oppRows[0]) return res.status(404).json({ error: 'Opportunity not found' });
    const opp = oppRows[0];

    // Enrichment gate — require ≥70% of articles to have full text
    const { rows: [enr] } = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::int AS enriched
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      WHERE sca.story_id = $1
    `, [opp.story_id]);
    const enrCoverage = enr.total > 0 ? enr.enriched / enr.total : 0;
    if (enr.total > 0 && enrCoverage < 0.70) {
      return res.status(422).json({
        error: `La historia base aún está siendo enriquecida (${Math.round(enrCoverage * 100)}% completado). Esperando captura completa de artículos antes de generar el dossier.`,
        enrichment_coverage: Math.round(enrCoverage * 100),
        total_articles: enr.total,
        enriched_articles: enr.enriched,
      });
    }

    // Articles from the parent story — exclude contaminated (relevance < 0.30)
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.summary, ma.published_at, ma.content_text, ma.extraction_method,
             ma.content_words, ts.name AS source_name, sca.relevance_score
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
        AND sca.relevance_score >= 0.30
      ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      LIMIT 12
    `, [opp.story_id]);

    // Log AI context for traceability
    query(`
      INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
      VALUES ($1, 'opportunity_dossier', $2, $3, $4)
    `, [
      opp.story_id,
      articles.length,
      JSON.stringify(articles.map(a => a.title)),
      articles.reduce((s, a) => s + (a.content_words || 0), 0),
    ]).catch(() => {});

    // Monitor entities for the story
    const { rows: entities } = await query(`
      SELECT ke.id, ke.name, ke.entity_type
      FROM story_entities se
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      WHERE se.story_id = $1
    `, [opp.story_id]);

    // All story opportunities (for structured context — this opp + siblings)
    const { rows: storyOpps } = await query(`
      SELECT id, title, description, opportunity_type,
             traffic_score, seo_score, urgency_score, editorial_score, composite_score
      FROM story_opportunities
      WHERE story_cluster_id = $1 AND status IN ('pending','in_progress')
      ORDER BY composite_score DESC
      LIMIT 8
    `, [opp.story_id]);

    // Event timeline if available
    const { rows: eventRows } = await query(`
      SELECT ec.timeline
      FROM event_cluster_stories ecs
      JOIN event_clusters ec ON ec.id = ecs.event_id
      WHERE ecs.story_id = $1
      ORDER BY ec.editorial_score DESC
      LIMIT 1
    `, [opp.story_id]);
    const timeline = eventRows[0]?.timeline || [];

    // Synthesize key facts from article snippets
    const keyFacts = await ai.synthesizeKeyFacts(articles).catch(() => []);
    const finalKeyFacts = keyFacts.length > 0
      ? keyFacts
      : articles.slice(0, 5).map(a => `${a.source_name}: ${a.title}`);

    const dossierTitle = opp.title;
    const tags = ['story-opportunity', opp.opportunity_type?.toLowerCase(), opp.story_type, 'source:monitor'].filter(Boolean);
    const oppsSummary = storyOpps.map(o => `${o.opportunity_type}: ${o.title}`).join(', ');

    // ── Full pipeline in a transaction ───────────────────────────────────────
    const client = await pool.connect();
    let topic, dossier;
    try {
      await client.query('BEGIN');

      const { rows: [t] } = await client.query(`
        INSERT INTO research_topics
          (title, status, category, tags, created_by, source_type, source_id, source_title, source_score)
        VALUES ($1, 'ready', $2, $3, $4, 'opportunity', $5, $6, $7)
        RETURNING *
      `, [dossierTitle, opp.story_type || 'editorial', tags, userId,
          oppId, opp.story_title, Math.round(opp.composite_score || 0)]);
      topic = t;

      await client.query(`
        INSERT INTO research_briefs
          (topic_id, executive_summary, key_facts, controversies, timeline,
           opportunities, risks, source_opportunities, model_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        topic.id,
        opp.story_summary || opp.description || dossierTitle,
        JSON.stringify(finalKeyFacts),
        JSON.stringify([]),
        JSON.stringify(timeline),
        oppsSummary,
        `Cobertura: ${opp.coverage_status}. Importancia: ${opp.importance_score}/10. Fuentes: ${opp.source_count}.`,
        JSON.stringify(storyOpps),
        'story-monitor',
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
        VALUES ($1, 'generating', $2)
        RETURNING *
      `, [topic.id, userId]);
      dossier = d;

      await client.query(`
        UPDATE story_opportunities SET status = 'in_progress', updated_at = now() WHERE id = $1
      `, [oppId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const topicForGen = {
      ...topic,
      executive_summary:    opp.story_summary || opp.description || dossierTitle,
      key_facts:            finalKeyFacts,
      controversies:        [],
      timeline,
      opportunities:        oppsSummary,
      risks:                `Cobertura: ${opp.coverage_status}. Importancia: ${opp.importance_score}/10.`,
      source_opportunities: storyOpps,
      source_articles:      articles,
    };

    setImmediate(() => runDossierGeneration(dossier.id, topicForGen));

    res.json({ ok: true, dossier });
  } catch (e) { next(e); }
});

export default router;
