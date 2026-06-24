/**
 * ContextBuilder
 * ORQUESTADOR EDITORIAL DE PANORAMA
 *
 * No es un chatbot. Es el cerebro que agregá TODO el contexto
 * de Panorama antes de responder. Uso: preguntas editoriales.
 *
 * Cuando preguntás "¿Qué pasó con Boca?", esto construye:
 * 1. Historias relacionadas
 * 2. Eventos relacionados
 * 3. Posts sociales
 * 4. Cambios de coverage
 * 5. Artículos mencionando Boca
 * 6. Dossiers existentes
 * 7. Oportunidades sin cubrir
 * 8. Timeline de evolución
 * 9. Análisis de tendencia
 *
 * Solo después: responde.
 */

import StoryService from './StoryService.js';
import EventService from './EventService.js';
import CoverageService from './CoverageService.js';
import SocialService from './SocialService.js';
import OpportunitiesService from './OpportunitiesService.js';
import { query } from '../routes/db.js';

const TIMEOUT_MS = 5000;

export class ContextBuilder {
  /**
   * Construir contexto COMPLETO para "qué está pasando ahora"
   * Agregá: historias, eventos, social, coverage, oportunidades, tendencias
   */
  async buildWhatsHappening() {
    const context = {};
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        StoryService.getStories({ limit: 10, sort: 'score' }),
        EventService.getEvents({ limit: 5, sort: 'score' }),
        SocialService.getClusters({ limit: 5, sort: 'score' }),
        OpportunitiesService.getOpportunities({ limit: 5, sort: 'score' }),
        CoverageService.getCoverageStats(),
        this._getRecentChanges(),
        this._getTrendingNow()
      ]);

      context.stories = this._unwrap(results[0], { items: [], total: 0 });
      context.events = this._unwrap(results[1], { items: [], total: 0 });
      context.social = this._unwrap(results[2], { items: [], total: 0 });
      context.opportunities = this._unwrap(results[3], { items: [], total: 0 });
      context.coverage_stats = this._unwrap(results[4], {});
      context.recent_changes = this._unwrap(results[5], []);
      context.trending = this._unwrap(results[6], []);

      return { context, elapsed: Date.now() - startTime };
    } catch (error) {
      console.warn('[ContextBuilder] whatsHappening error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Construir contexto COMPLETO para una entidad
   * "¿Qué pasó con Boca?" → TODO lo relacionado con Boca
   *
   * Agregá:
   * 1. Historias (por entidad nombrada)
   * 2. Eventos (por entidad nombrada)
   * 3. Posts sociales
   * 4. Cambios de coverage
   * 5. Artículos mencionando la entidad
   * 6. Dossiers existentes
   * 7. Oportunidades
   * 8. Profile de conocimiento
   * 9. Timeline de cómo evolucionó hoy
   */
  async buildEntityContext(entityName) {
    if (!entityName) throw new Error('Entity name required');

    const context = { entity: entityName };
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        // Editorial intelligence
        StoryService.getStoriesByEntity(entityName, { limit: 5 }),
        EventService.getEventsByEntity(entityName, { limit: 3 }),

        // Social intelligence
        SocialService.getClustersByEntity(entityName, { limit: 5 }),

        // Coverage tracking
        CoverageService.getCoverageByEntity(entityName, { limit: 10 }),

        // Knowledge graph
        this._getEntityProfile(entityName),

        // Articles mentioning this entity
        this._getArticlesByEntity(entityName),

        // Existing dossiers
        this._getDossiersByEntity(entityName),

        // Uncovered opportunities
        OpportunitiesService.getOpportunitiesByEntity(entityName, { limit: 5 }),

        // Timeline of how this entity has evolved today
        this._getEntityTimeline(entityName),

        // Trend analysis for this entity
        this._getEntityTrendAnalysis(entityName)
      ]);

      // Aggregate all results
      context.stories = this._unwrap(results[0], { items: [], total: 0 }).items || [];
      context.events = this._unwrap(results[1], { items: [], total: 0 }).items || [];
      context.social = this._unwrap(results[2], { items: [], total: 0 }).items || [];
      context.coverage = this._unwrap(results[3], { items: [], total: 0 }).items || [];
      context.profile = this._unwrap(results[4], null);
      context.articles = this._unwrap(results[5], []);
      context.dossiers = this._unwrap(results[6], []);
      context.opportunities = this._unwrap(results[7], { items: [], total: 0 }).items || [];
      context.timeline = this._unwrap(results[8], []);
      context.trend_analysis = this._unwrap(results[9], {});

      return { context, elapsed: Date.now() - startTime };
    } catch (error) {
      console.warn(`[ContextBuilder] Entity context error for ${entityName}:`, error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Construir contexto para "qué temas crecieron"
   */
  async buildTrends() {
    const context = {};
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        this._getTrendingNow(),
        StoryService.getStories({ limit: 10, sort: 'score' }),
        OpportunitiesService.getOpportunities({ limit: 10, sort: 'score' }),
        this._getGrowingStories()
      ]);

      context.trending_now = this._unwrap(results[0], []);
      context.top_stories = this._unwrap(results[1], { items: [], total: 0 });
      context.opportunities = this._unwrap(results[2], { items: [], total: 0 });
      context.growing = this._unwrap(results[3], []);

      return { context, elapsed: Date.now() - startTime };
    } catch (error) {
      console.warn('[ContextBuilder] Trends error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Construir contexto para "qué puedo publicar ahora"
   */
  async buildOpportunities() {
    const context = {};
    const startTime = Date.now();

    try {
      const opps = await OpportunitiesService.getOpportunities({ limit: 20, sort: 'score' });
      const stories = await StoryService.getStories({ limit: 10, sort: 'score' });
      const coverage = await CoverageService.getCoverageFeed({ limit: 5 });

      context.opportunities = (opps.items || []).sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
      context.stories = stories.items || [];
      context.gaps = coverage.items || [];

      return { context, elapsed: Date.now() - startTime };
    } catch (error) {
      console.warn('[ContextBuilder] Opportunities error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Construir contexto para "qué cambió desde hace X tiempo"
   */
  async buildCoverageChanges() {
    const context = {};
    const startTime = Date.now();

    try {
      const [coverage, stats] = await Promise.all([
        CoverageService.getCoverageFeed({ limit: 50 }),
        CoverageService.getCoverageStats()
      ]);

      context.changes = coverage.items || [];
      context.stats = stats;

      return { context, elapsed: Date.now() - startTime };
    } catch (error) {
      console.warn('[ContextBuilder] Coverage error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE METHODS: Data aggregation queries
  // ────────────────────────────────────────────────────────────

  async _getEntityProfile(entityName) {
    try {
      const { rows } = await query(`
        SELECT id, name, entity_type, description
        FROM knowledge_entities
        WHERE name ILIKE $1
        LIMIT 1
      `, [`%${entityName}%`]);
      return rows[0] || null;
    } catch (e) {
      return null;
    }
  }

  async _getArticlesByEntity(entityName) {
    try {
      const { rows } = await query(`
        SELECT DISTINCT
          ma.id, ma.title, ma.url, ma.published_at, ma.detected_at,
          ts.name AS source_name
        FROM monitored_articles ma
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE ma.title ILIKE $1 OR ma.summary ILIKE $1
        ORDER BY ma.detected_at DESC
        LIMIT 10
      `, [`%${entityName}%`]);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async _getDossiersByEntity(entityName) {
    try {
      const { rows } = await query(`
        SELECT id, title, status, created_at, updated_at
        FROM editorial_dossiers
        WHERE title ILIKE $1 OR content ILIKE $1
        ORDER BY updated_at DESC
        LIMIT 5
      `, [`%${entityName}%`]);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async _getEntityTimeline(entityName) {
    try {
      const { rows } = await query(`
        SELECT
          'story' AS type,
          sc.title AS headline,
          sc.last_seen AS timestamp,
          sc.article_count AS count,
          sc.coverage_status AS status
        FROM story_clusters sc
        JOIN story_entities se ON se.story_id = sc.id
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE LOWER(ke.name) ILIKE LOWER($1)
          AND sc.last_seen > now() - interval '24 hours'
        UNION ALL
        SELECT
          'event' AS type,
          ec.headline,
          ec.last_updated_at,
          ec.story_count,
          ec.coverage_status
        FROM event_clusters ec
        WHERE ec.headline ILIKE $1
          AND ec.last_updated_at > now() - interval '24 hours'
        ORDER BY timestamp DESC
        LIMIT 20
      `, [`%${entityName}%`]);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async _getEntityTrendAnalysis(entityName) {
    try {
      const { rows } = await query(`
        SELECT
          COUNT(DISTINCT sc.id) AS story_count_today,
          COUNT(DISTINCT ma.id) AS article_count_today,
          COUNT(DISTINCT ts.id) AS source_count,
          MAX(sc.importance_score) AS max_score,
          AVG(sc.importance_score) AS avg_score,
          CASE
            WHEN COUNT(DISTINCT ma.id) > 5 THEN 'CRECIENDO'
            WHEN COUNT(DISTINCT ma.id) > 2 THEN 'ESTABLE'
            ELSE 'DECRECIENDO'
          END AS trend
        FROM story_clusters sc
        JOIN story_entities se ON se.story_id = sc.id
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        JOIN story_cluster_articles sca ON sca.story_id = sc.id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE LOWER(ke.name) ILIKE LOWER($1)
          AND sc.last_seen > now() - interval '24 hours'
      `, [`%${entityName}%`]);
      return rows[0] || {};
    } catch (e) {
      return {};
    }
  }

  async _getTrendingNow() {
    try {
      const { rows } = await query(`
        SELECT
          sc.id,
          sc.title,
          sc.importance_score,
          sc.article_count,
          sc.source_count,
          sc.coverage_status,
          (NOW() - sc.last_seen)::int AS minutes_ago
        FROM story_clusters sc
        WHERE sc.status IN ('active', 'ready', 'followed')
          AND sc.is_recurring = false
          AND sc.last_seen > now() - interval '2 hours'
        ORDER BY sc.importance_score DESC
        LIMIT 10
      `);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async _getGrowingStories() {
    try {
      const { rows } = await query(`
        SELECT
          sc.id,
          sc.title,
          sc.article_count,
          sc.source_count,
          sc.importance_score,
          sc.coverage_status,
          EXTRACT(EPOCH FROM (now() - sc.last_seen))::int AS seconds_since_update
        FROM story_clusters sc
        WHERE sc.status IN ('active', 'ready', 'followed')
          AND sc.is_recurring = false
          AND sc.last_seen > now() - interval '6 hours'
        ORDER BY sc.article_count DESC, sc.source_count DESC
        LIMIT 10
      `);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async _getRecentChanges() {
    try {
      const { rows } = await query(`
        SELECT
          change_type,
          source_name,
          article_title,
          detected_at
        FROM coverage_changes
        WHERE detected_at > now() - interval '2 hours'
        ORDER BY detected_at DESC
        LIMIT 10
      `);
      return rows;
    } catch (e) {
      return [];
    }
  }

  _unwrap(settledResult, fallback) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    }
    console.warn('[ContextBuilder] Promise rejected:', settledResult.reason?.message);
    return fallback;
  }

  _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      )
    ]);
  }
}

export default new ContextBuilder();
