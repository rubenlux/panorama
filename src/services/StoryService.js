/**
 * StoryService
 * Encapsulates all story data access logic
 * Used by both HTTP routes and OpenClaw
 */

import { query } from '../routes/db.js';

export class StoryService {
  /**
   * Get active stories with pagination and filtering
   */
  async getStories(options = {}) {
    const {
      minArticles = 2,
      limit = 50,
      offset = 0,
      includeAll = false,
      hours = 24,
      sort = 'recent'
    } = options;

    const ALLOWED_HOURS = [1, 2, 6, 12, 24];
    const validHours = ALLOWED_HOURS.includes(hours) ? hours : 24;
    const validSort = sort === 'score' ? 'score' : 'recent';
    const validLimit = Math.min(Math.max(1, limit), 1000);

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
        AND sc.last_seen > now() - interval '${validHours} hours'
      ORDER BY
        ${validSort === 'score'
          ? 'sc.importance_score DESC, sc.source_count DESC, sc.last_seen DESC'
          : 'sc.last_seen DESC, sc.importance_score DESC, sc.source_count DESC'
        }
      LIMIT $2 OFFSET $3
    `, [includeAll ? 1 : minArticles, validLimit, offset]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total,
      offset,
      limit: validLimit
    };
  }

  /**
   * Get stories by entity name
   */
  async getStoriesByEntity(entityName, options = {}) {
    const { limit = 5 } = options;
    const validLimit = Math.min(Math.max(1, limit), 10);

    const { rows } = await query(`
      SELECT DISTINCT
        COUNT(*) OVER() AS total_count,
        sc.id,
        sc.title,
        sc.slug,
        sc.story_type,
        sc.summary,
        sc.importance_score,
        sc.coverage_status,
        sc.source_count,
        sc.article_count,
        sc.last_seen,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
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
      JOIN story_entities se ON se.story_id = sc.id
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      WHERE LOWER(ke.name) ILIKE LOWER($1)
        AND sc.status IN ('active', 'ready', 'followed')
        AND sc.is_recurring = false
        AND sc.last_seen > now() - interval '7 days'
      ORDER BY sc.importance_score DESC, sc.last_seen DESC
      LIMIT $2
    `, [`%${entityName}%`, validLimit]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total
    };
  }

  /**
   * Get single story by ID
   */
  async getStoryById(id) {
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
    `, [id]);

    return rows[0] || null;
  }

  /**
   * Get articles for a story
   */
  async getStoryArticles(storyId, options = {}) {
    const { limit = 30, offset = 0 } = options;
    const validLimit = Math.min(Math.max(1, limit), 50);

    const [storyRes, articlesRes] = await Promise.all([
      query('SELECT id FROM story_clusters WHERE id = $1', [storyId]),
      query(`
        SELECT
          ma.id, ma.title, ma.url, ma.summary, ma.published_at, ma.detected_at,
          ts.name AS source_name, ts.id AS source_id,
          sca.relevance_score
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
        LIMIT $2 OFFSET $3
      `, [storyId, validLimit, offset])
    ]);

    if (!storyRes.rows[0]) return null;

    return {
      articles: articlesRes.rows,
      offset,
      limit: validLimit
    };
  }
}

export default new StoryService();
