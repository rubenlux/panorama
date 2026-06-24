/**
 * ContextBuilder
 * Orchestrates all services to build rich context for OpenClaw
 * Single source of truth for how to gather editorial intelligence
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
   * Build context for "what's happening today"
   */
  async buildWhatsHappening() {
    const context = {};
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        StoryService.getStories({ limit: 5, sort: 'score' }),
        EventService.getEvents({ limit: 3, sort: 'score' }),
        OpportunitiesService.getOpportunities({ limit: 3, sort: 'score' }),
        CoverageService.getCoverageStats(),
        this._withTimeout(this._getFreshnessTrends(), TIMEOUT_MS)
      ]);

      context.stories = this._unwrap(results[0], { items: [], total: 0 });
      context.events = this._unwrap(results[1], { items: [], total: 0 });
      context.opportunities = this._unwrap(results[2], { items: [], total: 0 });
      context.coverage = this._unwrap(results[3], {});
      context.trends = this._unwrap(results[4], []);

      return {
        context,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      console.warn('[ContextBuilder] whatsHappening error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Build context for entity-specific query
   */
  async buildEntityContext(entityName) {
    if (!entityName) throw new Error('Entity name required');

    const context = { entity: entityName };
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        StoryService.getStoriesByEntity(entityName, { limit: 2 }),
        EventService.getEventsByEntity(entityName, { limit: 1 }),
        SocialService.getClustersByEntity(entityName, { limit: 1 }),
        CoverageService.getCoverageByEntity(entityName, { limit: 5 }),
        this._getEntityProfile(entityName)
      ]);

      context.stories = this._unwrap(results[0], { items: [], total: 0 }).items || [];
      context.events = this._unwrap(results[1], { items: [], total: 0 }).items || [];
      context.social = this._unwrap(results[2], { items: [], total: 0 }).items || [];
      context.coverage = this._unwrap(results[3], { items: [], total: 0 }).items || [];
      context.entityProfile = this._unwrap(results[4], null);

      return {
        context,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      console.warn(`[ContextBuilder] Entity context error for ${entityName}:`, error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Build context for trends
   */
  async buildTrends() {
    const context = {};
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        this._getFreshnessTrends(),
        OpportunitiesService.getOpportunities({ limit: 5, sort: 'score' })
      ]);

      context.trends = this._unwrap(results[0], []);
      context.opportunities = this._unwrap(results[1], { items: [], total: 0 });

      return {
        context,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      console.warn('[ContextBuilder] Trends error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Build context for opportunities
   */
  async buildOpportunities() {
    const context = {};
    const startTime = Date.now();

    try {
      const opps = await OpportunitiesService.getOpportunities({ limit: 10, sort: 'score' });
      context.opportunities = opps.items || [];

      return {
        context,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      console.warn('[ContextBuilder] Opportunities error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Build context for coverage changes
   */
  async buildCoverageChanges() {
    const context = {};
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled([
        CoverageService.getCoverageFeed({ limit: 10 }),
        CoverageService.getCoverageStats()
      ]);

      context.changes = this._unwrap(results[0], { items: [], total: 0 }).items || [];
      context.stats = this._unwrap(results[1], {});

      return {
        context,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      console.warn('[ContextBuilder] Coverage error:', error.message);
      return { context: {}, elapsed: Date.now() - startTime };
    }
  }

  /**
   * Private: Get freshness/trending stories
   */
  async _getFreshnessTrends() {
    try {
      const { rows } = await query(`
        SELECT
          sc.id,
          sc.title,
          sc.importance_score,
          sc.coverage_status,
          sc.article_count,
          sc.source_count,
          sc.last_seen,
          (NOW() - sc.last_seen)::int AS minutes_ago
        FROM story_clusters sc
        WHERE sc.status IN ('active', 'ready', 'followed')
          AND sc.is_recurring = false
          AND sc.last_seen > now() - interval '1 hour'
        ORDER BY sc.last_seen DESC
        LIMIT 5
      `);
      return rows;
    } catch (error) {
      console.warn('[ContextBuilder] Trends query error:', error.message);
      return [];
    }
  }

  /**
   * Private: Get entity profile from knowledge graph
   */
  async _getEntityProfile(entityName) {
    try {
      const { rows } = await query(`
        SELECT id, name, entity_type, description, relevance_score
        FROM knowledge_entities
        WHERE name ILIKE $1
        LIMIT 1
      `, [`%${entityName}%`]);
      return rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Private: Safely unwrap promise results
   */
  _unwrap(settledResult, fallback) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    }
    console.warn('[ContextBuilder] Promise rejected:', settledResult.reason?.message);
    return fallback;
  }

  /**
   * Private: Wrap promise with timeout
   */
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
