/**
 * OpportunitiesService
 * Encapsulates all editorial opportunities data access logic
 */

import { query } from '../routes/db.js';

export class OpportunitiesService {
  /**
   * Get opportunities
   */
  async getOpportunities(options = {}) {
    const {
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
        so.id,
        so.title,
        so.description,
        so.composite_score,
        so.traffic_score,
        so.seo_score,
        so.urgency_score,
        so.editorial_score,
        so.opportunity_type,
        so.status,
        so.trigger,
        so.created_at,
        so.last_seen,
        CASE
          WHEN so.last_seen > now() - interval '1 hour' THEN 'ACTIVE'
          WHEN so.last_seen > now() - interval '24 hours' THEN 'WARM'
          ELSE 'ARCHIVED'
        END AS age_bucket
      FROM story_opportunities so
      WHERE so.status NOT IN ('dismissed')
        AND so.last_seen > now() - interval '${validHours} hours'
      ORDER BY
        ${validSort === 'score' ? 'so.composite_score DESC' : 'so.created_at DESC'},
        so.composite_score DESC
      LIMIT $1 OFFSET $2
    `, [validLimit, offset]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total,
      offset,
      limit: validLimit
    };
  }

  /**
   * Get opportunities by entity
   */
  async getOpportunitiesByEntity(entityName, options = {}) {
    const { limit = 10 } = options;
    const validLimit = Math.min(Math.max(1, limit), 50);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        so.id,
        so.title,
        so.description,
        so.composite_score,
        so.traffic_score,
        so.seo_score,
        so.urgency_score,
        so.editorial_score,
        so.opportunity_type,
        so.status,
        so.trigger,
        so.created_at,
        sc.title AS story_title
      FROM story_opportunities so
      JOIN story_clusters sc ON sc.id = so.story_cluster_id
      WHERE sc.title ILIKE $1
        AND so.status NOT IN ('dismissed')
        AND so.last_seen > now() - interval '7 days'
      ORDER BY so.composite_score DESC
      LIMIT $2
    `, [`%${entityName}%`, validLimit]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total
    };
  }
}

export default new OpportunitiesService();
