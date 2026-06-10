import { Router } from 'express';
import { query, pool } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { AiService } from '../services/AiService.js';
import { runDossierGeneration } from '../services/DossierService.js';

const ai = new AiService();

const router = Router();

// GET /stories — active editorial stories, ordered by importance then recency
// Excludes recurring content and stale stories by default.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const minArticles = parseInt(req.query.min_articles) || 2;
    const limit       = Math.min(parseInt(req.query.limit) || 25, 50);
    const includeAll  = req.query.include_all === 'true'; // include single-article candidates

    const { rows } = await query(`
      SELECT
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
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN tracked_sources    ts ON ts.id = ma.source_id
          WHERE sca.story_id = sc.id
        ) AS sources,
        (
          SELECT json_agg(ke.name ORDER BY ke.name)
          FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = sc.id
          LIMIT 6
        ) AS entities
      FROM story_clusters sc
      WHERE sc.status IN ('active', 'ready', 'followed')
        AND sc.is_recurring = false
        AND sc.article_count >= $1
        AND sc.last_seen > now() - interval '24 hours'
      ORDER BY
        sc.importance_score DESC,
        sc.source_count DESC,
        sc.article_count DESC,
        sc.last_seen DESC
      LIMIT $2
    `, [includeAll ? 1 : minArticles, limit]);

    res.json({ items: rows });
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
        JOIN tracked_sources    ts ON ts.id = ma.source_id
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

    // Fetch articles — content_text (full) preferred over RSS summary
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.summary, ma.published_at, ma.content_text, ma.extraction_method,
             ts.name AS source_name,
             sca.relevance_score
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
      ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      LIMIT 12
    `, [storyId]);

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
        VALUES ($1, 'generating', $2)
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

    // Build the topic object DossierService expects (mirrors editorial_workflow.js lateral join)
    const topicForGen = {
      ...topic,
      executive_summary:    story.summary || dossierTitle,
      key_facts:            finalKeyFacts,
      controversies:        [],
      timeline,
      opportunities:        oppsSummary,
      risks:                `Cobertura: ${story.coverage_status}. Importancia: ${story.importance_score}/10.`,
      source_opportunities: storyOpps,
    };

    setImmediate(() => runDossierGeneration(dossier.id, topicForGen));

    res.json({ ok: true, dossier });
  } catch (e) { next(e); }
});

export default router;
