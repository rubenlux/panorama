import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

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
// Creates a research_topic from the story so the dossier workflow can pick it up.
// Pre-seeds research_sources with the story's top articles.
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const { rows: storyRows } = await query(
      `SELECT * FROM story_clusters WHERE id = $1`,
      [req.params.id]
    );
    if (!storyRows[0]) return res.status(404).json({ error: 'Story not found' });
    const story = storyRows[0];

    // Top articles for context
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.published_at, ts.name AS source_name
      FROM story_cluster_articles sca
      JOIN monitored_articles ma ON ma.id = sca.article_id
      JOIN tracked_sources    ts ON ts.id = ma.source_id
      WHERE sca.story_id = $1
      ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      LIMIT 8
    `, [req.params.id]);

    const dossierTitle = story.title || `Historia: ${req.params.id}`;
    const tags = [
      'story-cluster',
      story.story_type,
      story.coverage_status,
    ].filter(Boolean);

    const { rows: topicRows } = await query(`
      INSERT INTO research_topics (title, status, category, tags, created_by)
      VALUES ($1, 'pending', $2, $3, $4)
      RETURNING *
    `, [dossierTitle, story.story_type || 'trending', tags, req.user?.sub || null]);

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
