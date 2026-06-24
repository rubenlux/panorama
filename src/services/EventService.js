/**
 * EventService
 * Encapsulates all event data access logic
 */

import { query } from '../routes/db.js';

export class EventService {
  /**
   * Get active events with pagination and filtering
   */
  async getEvents(options = {}) {
    const {
      minStories = 1,
      limit = 50,
      offset = 0,
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
        ec.id,
        ec.headline,
        ec.summary,
        ec.status,
        ec.story_count,
        ec.article_count,
        ec.importance_score,
        ec.editorial_score,
        ec.coverage_status,
        ec.first_seen,
        ec.last_updated_at,
        ec.timeline,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = ec.id
        ) AS sources,
        (
          SELECT json_agg(DISTINCT sc.title ORDER BY sc.title)
          FROM event_cluster_stories ecs
          JOIN story_clusters sc ON sc.id = ecs.story_id
          WHERE ecs.event_id = ec.id
        ) AS story_titles
      FROM event_clusters ec
      WHERE ec.status IN ('active', 'followed')
        AND ec.story_count >= $1
        AND ec.last_updated_at > now() - interval '${validHours} hours'
      ORDER BY
        ${validSort === 'score'
          ? 'ec.editorial_score DESC, ec.importance_score DESC, ec.last_updated_at DESC'
          : 'ec.last_updated_at DESC, ec.editorial_score DESC, ec.importance_score DESC'
        }
      LIMIT $2 OFFSET $3
    `, [minStories, validLimit, offset]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total,
      offset,
      limit: validLimit
    };
  }

  /**
   * Get events by entity name
   */
  async getEventsByEntity(entityName, options = {}) {
    const { limit = 5 } = options;
    const validLimit = Math.min(Math.max(1, limit), 10);

    const { rows } = await query(`
      SELECT DISTINCT
        COUNT(*) OVER() AS total_count,
        ec.id,
        ec.headline,
        ec.summary,
        ec.importance_score,
        ec.editorial_score,
        ec.coverage_status,
        ec.story_count,
        ec.article_count,
        ec.last_updated_at,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = ec.id
        ) AS sources
      FROM event_clusters ec
      WHERE ec.headline ILIKE $1
        AND ec.status IN ('active', 'followed')
        AND ec.last_updated_at > now() - interval '7 days'
      ORDER BY ec.editorial_score DESC, ec.last_updated_at DESC
      LIMIT $2
    `, [`%${entityName}%`, validLimit]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total
    };
  }

  /**
   * Get single event by ID
   */
  async getEventById(id) {
    const { rows } = await query(`
      SELECT ec.*
      FROM event_clusters ec
      WHERE ec.id = $1
    `, [id]);

    return rows[0] || null;
  }
}

export default new EventService();
