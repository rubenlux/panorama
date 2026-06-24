/**
 * CoverageService
 * Encapsulates all coverage data access logic
 */

import { query } from '../routes/db.js';

export class CoverageService {
  /**
   * Get coverage feed
   */
  async getCoverageFeed(options = {}) {
    const { limit = 100, offset = 0 } = options;
    const validLimit = Math.min(Math.max(1, limit), 500);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        cc.id,
        cc.change_type,
        cc.detected_at,
        cc.source_name,
        cc.source_url,
        cc.article_title,
        cc.article_url,
        cc.published_at,
        cc.story_id,
        sc.title AS story_title
      FROM coverage_changes cc
      LEFT JOIN story_clusters sc ON sc.id = cc.story_id
      ORDER BY cc.detected_at DESC
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
   * Get coverage changes by entity
   */
  async getCoverageByEntity(entityName, options = {}) {
    const { limit = 20 } = options;
    const validLimit = Math.min(Math.max(1, limit), 50);

    const { rows } = await query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        cc.id,
        cc.change_type,
        cc.detected_at,
        cc.source_name,
        cc.source_url,
        cc.article_title,
        cc.article_url,
        cc.published_at
      FROM coverage_changes cc
      WHERE cc.article_title ILIKE $1
        OR cc.source_name ILIKE $1
      ORDER BY cc.detected_at DESC
      LIMIT $2
    `, [`%${entityName}%`, validLimit]);

    const total = parseInt(rows[0]?.total_count || '0');
    return {
      items: rows.map(({ total_count, ...r }) => r),
      total
    };
  }

  /**
   * Get coverage statistics
   */
  async getCoverageStats() {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(DISTINCT source_name) FROM coverage_changes WHERE detected_at > now() - interval '24 hours') AS sources_24h,
        (SELECT COUNT(*) FROM coverage_changes WHERE detected_at > now() - interval '24 hours') AS changes_24h,
        (SELECT COUNT(DISTINCT source_name) FROM coverage_changes) AS total_sources,
        (SELECT COUNT(*) FROM coverage_changes) AS total_changes
    `);

    return rows[0] || {};
  }
}

export default new CoverageService();
