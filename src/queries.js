/**
 * Shared queries for Panorama
 * Reutilizadas por rutas HTTP y OpenClaw
 */

import { query } from './routes/db.js';

// ── Stories ───────────────────────────────────────────────────────────────

export async function getActiveStories(options = {}) {
  const { limit = 50, offset = 0, hours = 24, sort = 'recent', minArticles = 2, entity = null } = options;

  // Construcción condicional de cláusula WHERE para entity filter
  const entityFilter = entity
    ? `(
        LOWER(sc.title) LIKE LOWER($4) OR
        EXISTS (
          SELECT 1 FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = sc.id AND LOWER(ke.name) LIKE LOWER($4)
        )
      )`
    : 'true';

  const params = [minArticles, limit, offset];
  if (entity) params.push(`%${entity}%`);

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
        JOIN rss_sources ts ON ts.id = ma.source_id
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
      AND ${entityFilter}
    ORDER BY
      ${sort === 'score'
        ? 'sc.importance_score DESC, sc.source_count DESC, sc.last_seen DESC'
        : 'sc.last_seen DESC, sc.importance_score DESC, sc.source_count DESC'
      }
    LIMIT $2 OFFSET $3
  `, params);

  const total = parseInt(rows[0]?.total_count || '0');
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total,
    offset,
    limit
  };
}

// ── Events ────────────────────────────────────────────────────────────────

export async function getActiveEvents(options = {}) {
  const { limit = 25, offset = 0, hours = 24, sort = 'recent', minStories = 1, entity = null } = options;

  const entityFilter = entity
    ? `(
        LOWER(ec.headline) LIKE LOWER($4) OR
        LOWER(ec.summary) LIKE LOWER($4) OR
        ec.main_entities @> ARRAY[($4)::text]
      )`
    : 'true';

  const params = [minStories, limit, offset];
  if (entity) params.push(`%${entity}%`);

  const { rows } = await query(`
    SELECT
      COUNT(*) OVER() AS total_count,
      ec.id,
      ec.headline,
      ec.summary,
      ec.event_type,
      ec.importance_score,
      ec.editorial_score,
      ec.coverage_status,
      ec.status,
      ec.story_count,
      ec.article_count,
      ec.source_count,
      ec.main_entities,
      ec.timeline,
      ec.first_detected_at,
      ec.last_updated_at,
      (
        SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE ecs.event_id = ec.id
      ) AS sources,
      (
        SELECT json_agg(json_build_object(
          'id', eo.id, 'type', eo.type, 'title', eo.title,
          'traffic_potential', eo.traffic_potential, 'difficulty', eo.difficulty,
          'status', eo.status
        ) ORDER BY eo.seo_value DESC NULLS LAST)
        FROM editorial_opportunities eo
        WHERE eo.event_id = ec.id AND eo.status NOT IN ('dismissed')
        LIMIT 5
      ) AS opportunities
    FROM event_clusters ec
    WHERE ec.status IN ('active', 'followed')
      AND ec.story_count >= $1
      AND ec.last_updated_at > now() - interval '${hours} hours'
      AND ${entityFilter}
    ORDER BY
      ${sort === 'score'
        ? 'ec.editorial_score DESC, ec.importance_score DESC, ec.last_updated_at DESC'
        : 'ec.last_updated_at DESC, ec.editorial_score DESC, ec.importance_score DESC'
      }
    LIMIT $2 OFFSET $3
  `, params);

  const total = parseInt(rows[0]?.total_count || '0');
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total,
    offset,
    limit
  };
}

// ── Social Clusters ───────────────────────────────────────────────────────

export async function getActiveSocialClusters(options = {}) {
  const { limit = 25, offset = 0, hours = 24, sort = 'recent', entity = null } = options;

  const entityFilter = entity ? `AND LOWER(sc.title) LIKE LOWER($3)` : '';
  const params = entity ? [limit, offset, `%${entity}%`] : [limit, offset];

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
      sc.status,
      sc.last_seen,
      (
        SELECT json_agg(DISTINCT sp.platform ORDER BY sp.platform)
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        WHERE scp.cluster_id = sc.id
      ) AS platforms
    FROM social_clusters sc
    WHERE sc.status = 'active'
      AND sc.last_seen > now() - interval '${hours} hours'
      ${entityFilter}
    ORDER BY
      ${sort === 'score'
        ? 'sc.opportunity_score DESC, sc.total_engagement DESC'
        : 'sc.last_seen DESC, sc.opportunity_score DESC'
      }
    LIMIT $1 OFFSET $2
  `, params);

  const total = parseInt(rows[0]?.total_count || '0');
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total,
    offset,
    limit
  };
}

// ── Coverage Changes ──────────────────────────────────────────────────────

export async function getCoverageChanges(options = {}) {
  const { limit = 50, offset = 0, hours = 24, entity = null } = options;

  const entityFilter = entity
    ? `AND (LOWER(ts.name) LIKE LOWER($3) OR LOWER(ta.title) LIKE LOWER($3))`
    : '';

  const params = entity ? [limit, offset, `%${entity}%`] : [limit, offset];

  const { rows } = await query(`
    SELECT
      COUNT(*) OVER() AS total_count,
      cc.id,
      cc.change_type,
      cc.old_value,
      cc.new_value,
      cc.detected_at,
      ts.id AS source_id,
      ts.name AS source_name,
      ts.url AS source_url,
      ts.type AS source_type,
      ta.id AS article_id,
      ta.url AS article_url,
      ta.title AS article_title,
      ta.current_position,
      ta.is_active,
      ta.published_at
    FROM coverage_changes cc
    JOIN tracked_sources ts ON ts.id = cc.tracked_source_id
    LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
    WHERE cc.detected_at > now() - interval '${hours} hours'
      ${entityFilter}
    ORDER BY cc.detected_at DESC
    LIMIT $1 OFFSET $2
  `, params);

  const total = parseInt(rows[0]?.total_count || '0');
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total,
    offset,
    limit
  };
}

// ── Opportunities ─────────────────────────────────────────────────────────

export async function getOpportunities(options = {}) {
  const { limit = 50, offset = 0, status = 'pending', sort = 'recent', hours = 24, entity = null } = options;

  const conditions = [`so.status = $1`, `sc.is_recurring = false`, `sc.last_seen > now() - interval '7 days'`];
  const params = [status];

  if (hours) {
    conditions.push(`so.created_at > now() - interval '${hours} hours'`);
  }

  if (entity) {
    conditions.push(`(LOWER(so.title) LIKE LOWER($${params.length + 1}) OR LOWER(sc.title) LIKE LOWER($${params.length + 1}))`);
    params.push(`%${entity}%`);
  }

  params.push(limit);
  params.push(offset);

  const { rows } = await query(`
    SELECT
      COUNT(*) OVER() AS total_count,
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
      so.trigger,
      so.created_at,
      CASE
        WHEN so.created_at > now() - interval '24 hours' THEN 'ACTIVE'
        WHEN so.created_at > now() - interval '72 hours' THEN 'WARM'
        ELSE 'ARCHIVED'
      END AS age_bucket,
      sc.id AS story_cluster_id,
      sc.title AS story_title,
      sc.story_type,
      sc.coverage_status AS story_coverage_status,
      sc.importance_score AS story_importance,
      sc.source_count AS story_source_count,
      sc.article_count AS story_article_count,
      (
        SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE sca.story_id = sc.id
      ) AS story_sources
    FROM story_opportunities so
    JOIN story_clusters sc ON sc.id = so.story_cluster_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      ${sort === 'score'
        ? 'so.composite_score DESC, so.created_at DESC'
        : 'so.created_at DESC, so.composite_score DESC'
      }
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  const total = parseInt(rows[0]?.total_count || '0');
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total,
    offset,
    limit
  };
}

// ── Knowledge Graph Entities ──────────────────────────────────────────────

export async function getEntityProfile(entityName) {
  const { rows } = await query(`
    SELECT id, name, entity_type, description, mentions
    FROM knowledge_entities
    WHERE name ILIKE $1
    LIMIT 5
  `, [`%${entityName}%`]);

  return rows;
}
