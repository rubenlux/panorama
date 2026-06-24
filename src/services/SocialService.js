/**
 * SocialService
 * Encapsulates all social intelligence data access logic
 */

import { query } from '../routes/db.js';

export class SocialService {
  /**
   * Get social clusters
   */
  async getClusters(options = {}) {
    const { limit = 50, offset = 0, sort = 'recent' } = options;
    const validLimit = Math.min(Math.max(1, limit), 500);
    const validSort = sort === 'score' ? 'DESC' : 'DESC'; // Both use DESC, just different order

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        sc.id,
        sc.title,
        sc.post_count,
        sc.total_engagement,
        sc.viral_score,
        sc.gap_score,
        sc.opportunity_score,
        sc.last_seen,
        sc.created_at,
        (
          SELECT json_agg(DISTINCT sp.platform ORDER BY sp.platform)
          FROM social_cluster_posts scp
          JOIN social_posts sp ON sp.id = scp.post_id
          WHERE scp.cluster_id = sc.id
        ) AS platforms,
        (
          SELECT json_agg(DISTINCT ss.name ORDER BY ss.name)
          FROM social_cluster_posts scp
          JOIN social_posts sp ON sp.id = scp.post_id
          JOIN social_sources ss ON ss.id = sp.source_id
          WHERE scp.cluster_id = sc.id
        ) AS sources
      FROM social_clusters sc
      WHERE sc.status = 'active'
      ORDER BY ${validSort === 'score' ? 'sc.opportunity_score DESC, sc.total_engagement DESC' : 'sc.last_seen DESC, sc.total_engagement DESC'}
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
   * Get social clusters by entity
   */
  async getClustersByEntity(entityName, options = {}) {
    const { limit = 10 } = options;
    const validLimit = Math.min(Math.max(1, limit), 50);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        sc.id,
        sc.title,
        sc.post_count,
        sc.total_engagement,
        sc.viral_score,
        sc.gap_score,
        sc.opportunity_score,
        sc.last_seen,
        (
          SELECT json_agg(DISTINCT sp.platform ORDER BY sp.platform)
          FROM social_cluster_posts scp
          JOIN social_posts sp ON sp.id = scp.post_id
          WHERE scp.cluster_id = sc.id
        ) AS platforms,
        (
          SELECT json_agg(DISTINCT ss.name ORDER BY ss.name)
          FROM social_cluster_posts scp
          JOIN social_posts sp ON sp.id = scp.post_id
          JOIN social_sources ss ON ss.id = sp.source_id
          WHERE scp.cluster_id = sc.id
        ) AS sources
      FROM social_clusters sc
      WHERE sc.title ILIKE $1
        AND sc.status = 'active'
        AND sc.last_seen > now() - interval '7 days'
      ORDER BY sc.opportunity_score DESC, sc.last_seen DESC
      LIMIT $2
    `, [`%${entityName}%`, validLimit]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total
    };
  }
}

export default new SocialService();
