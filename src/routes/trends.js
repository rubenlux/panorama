import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /trends — list active/ready clusters, ordered by recency + coverage
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const minArticles = parseInt(req.query.min_articles) || 2;
    const limit       = Math.min(parseInt(req.query.limit) || 20, 50);

    const { rows } = await query(`
      SELECT
        tc.id,
        tc.headline,
        tc.summary,
        tc.editorial_angles,
        tc.article_count,
        tc.source_count,
        tc.status,
        tc.first_seen,
        tc.last_seen,
        ke.id          AS entity_id,
        ke.name        AS entity_name,
        ke.entity_type,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM trend_cluster_articles tca
          JOIN monitored_articles ma ON ma.id = tca.article_id
          JOIN tracked_sources    ts ON ts.id = ma.source_id
          WHERE tca.trend_id = tc.id
        ) AS sources
      FROM trend_clusters tc
      JOIN knowledge_entities ke ON ke.id = tc.entity_id
      WHERE tc.status IN ('active', 'ready', 'followed')
        AND tc.article_count >= $1
        AND tc.last_seen > now() - interval '24 hours'
      ORDER BY tc.source_count DESC, tc.article_count DESC, tc.last_seen DESC
      LIMIT $2
    `, [minArticles, limit]);

    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /trends/:id — cluster detail
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        tc.*,
        ke.name        AS entity_name,
        ke.entity_type,
        ke.description AS entity_description,
        ke.mention_count AS entity_mention_count
      FROM trend_clusters tc
      JOIN knowledge_entities ke ON ke.id = tc.entity_id
      WHERE tc.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Cluster not found' });

    res.json({ cluster: rows[0] });
  } catch (e) { next(e); }
});

// GET /trends/:id/articles — paginated articles in cluster
router.get('/:id/articles', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const [clusterRes, articlesRes] = await Promise.all([
      query('SELECT id FROM trend_clusters WHERE id = $1', [req.params.id]),
      query(`
        SELECT
          ma.id,
          ma.title,
          ma.url,
          ma.summary,
          ma.published_at,
          ma.detected_at,
          ts.name AS source_name,
          ts.id   AS source_id
        FROM trend_cluster_articles tca
        JOIN monitored_articles ma ON ma.id = tca.article_id
        JOIN tracked_sources    ts ON ts.id = ma.source_id
        WHERE tca.trend_id = $1
        ORDER BY ma.detected_at DESC
        LIMIT $2 OFFSET $3
      `, [req.params.id, limit, offset]),
    ]);

    if (!clusterRes.rows[0]) return res.status(404).json({ error: 'Cluster not found' });

    res.json({ articles: articlesRes.rows, offset, limit });
  } catch (e) { next(e); }
});

// POST /trends/:id/follow — mark cluster as followed
router.post('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      UPDATE trend_clusters
      SET status = 'followed', updated_at = now()
      WHERE id = $1
        AND status != 'stale'
      RETURNING id, status
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Cluster not found or stale' });
    res.json({ ok: true, status: rows[0].status });
  } catch (e) { next(e); }
});

// POST /trends/:id/create-dossier — create editorial dossier from cluster
router.post('/:id/create-dossier', requireAuth, async (req, res, next) => {
  try {
    const { rows: clusterRows } = await query(`
      SELECT tc.*, ke.name AS entity_name
      FROM trend_clusters tc
      JOIN knowledge_entities ke ON ke.id = tc.entity_id
      WHERE tc.id = $1
    `, [req.params.id]);

    if (!clusterRows[0]) return res.status(404).json({ error: 'Cluster not found' });
    const cluster = clusterRows[0];

    // Fetch top articles for context
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.published_at, ts.name AS source_name
      FROM trend_cluster_articles tca
      JOIN monitored_articles ma ON ma.id = tca.article_id
      JOIN tracked_sources    ts ON ts.id = ma.source_id
      WHERE tca.trend_id = $1
      ORDER BY ma.detected_at DESC
      LIMIT 5
    `, [req.params.id]);

    // Build the dossier title from cluster intelligence
    const dossierTitle = cluster.headline
      ? `${cluster.headline}`
      : `Cobertura: ${cluster.entity_name}`;

    // Tags derived from cluster
    const tags = ['trend-cluster', cluster.entity_name.toLowerCase().replace(/\s+/g, '-')];

    // Create research topic record that the dossier system picks up
    const { rows: topicRows } = await query(`
      INSERT INTO research_topics (title, status, category, tags, created_by)
      VALUES ($1, 'pending', 'trending', $2, $3)
      RETURNING *
    `, [dossierTitle, tags, req.user?.sub || null]);

    const topic = topicRows[0];

    // Pre-seed sources from cluster articles so research doesn't start from scratch
    if (articles.length > 0) {
      const placeholders = articles
        .map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`)
        .join(', ');
      const params = [topic.id];
      articles.forEach(a => params.push(a.url, a.title, a.source_name, a.published_at || null));
      await query(
        `INSERT INTO research_sources (topic_id, url, title, source_name, published_at)
         VALUES ${placeholders}
         ON CONFLICT DO NOTHING`,
        params
      );
    }

    res.json({ ok: true, topic });
  } catch (e) { next(e); }
});

export default router;
