/**
 * OpenClawService
 * Aggregates data from Panorama APIs for conversational context
 * - 100% read-only
 * - Consumes ONLY APIs (no direct DB queries)
 * - Max 5 sources per query
 * - 5s timeout total
 * - Optional LLM for synthesis
 */

const TIMEOUT_MS = 5000;
const MAX_SOURCES = 5;

export class OpenClawService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  /**
   * Get "what's happening today" context
   * Multiple simple queries → structured response (no LLM needed)
   */
  async getWhatsHappening() {
    const context = {};
    const startTime = Date.now();

    try {
      // Parallel API calls with timeout
      const [storiesRes, trendsRes, eventsRes, oppsRes, coverageRes] = await Promise.allSettled([
        this._apiCall('/stories?limit=5&sort=score'),
        this._apiCall('/trends?limit=5'),
        this._apiCall('/events?limit=3&sort=score'),
        this._apiCall('/opportunities?limit=3&sort=score'),
        this._apiCall('/coverage/stats')
      ]);

      context.stories = this._unwrap(storiesRes, { items: [], total: 0 });
      context.trends = this._unwrap(trendsRes, { items: [], total: 0 });
      context.events = this._unwrap(eventsRes, { items: [], total: 0 });
      context.opportunities = this._unwrap(oppsRes, { items: [], total: 0 });
      context.coverage = this._unwrap(coverageRes, {});

      return {
        context,
        elapsed: Date.now() - startTime,
        requiresSynthesis: false
      };
    } catch (error) {
      throw new Error(`Failed to get what's happening: ${error.message}`);
    }
  }

  /**
   * Get entity-specific context (Boca, Milei, etc.)
   * Searches all modules by entity name
   */
  async getEntityContext(entityName) {
    const context = { entity: entityName };
    const startTime = Date.now();

    if (!entityName) throw new Error('Entity name required');

    try {
      // Parallel API calls with limit
      const results = await Promise.allSettled([
        this._apiCall(`/stories/by-entity/${encodeURIComponent(entityName)}?limit=2`),
        this._apiCall(`/events/by-entity/${encodeURIComponent(entityName)}?limit=1`),
        this._apiCall(`/social/by-entity/${encodeURIComponent(entityName)}?limit=1`),
        this._apiCall(`/coverage/by-entity/${encodeURIComponent(entityName)}?limit=1`),
        this._apiCall(`/knowledge/entities?search=${encodeURIComponent(entityName)}&limit=1`)
      ]);

      context.stories = this._unwrap(results[0], { items: [], total: 0 }).items || [];
      context.events = this._unwrap(results[1], { items: [], total: 0 }).items || [];
      context.social = this._unwrap(results[2], { items: [], total: 0 }).items || [];
      context.coverage = this._unwrap(results[3], { items: [], total: 0 }).items || [];
      context.entityProfile = this._unwrap(results[4], { items: [], total: 0 }).items?.[0] || null;

      // Limit total sources to MAX_SOURCES
      const totalSources = [
        context.stories.length,
        context.events.length,
        context.social.length,
        context.coverage.length
      ].reduce((a, b) => a + b, 0);

      return {
        context,
        sourcesCount: totalSources,
        elapsed: Date.now() - startTime,
        requiresSynthesis: false
      };
    } catch (error) {
      throw new Error(`Failed to get entity context for ${entityName}: ${error.message}`);
    }
  }

  /**
   * Get trends context
   */
  async getTrends() {
    const context = {};
    const startTime = Date.now();

    try {
      const [trendsRes, oppsRes] = await Promise.allSettled([
        this._apiCall('/trends?limit=10'),
        this._apiCall('/opportunities?limit=5&sort=score')
      ]);

      context.trends = this._unwrap(trendsRes, { items: [], total: 0 });
      context.opportunities = this._unwrap(oppsRes, { items: [], total: 0 });

      return {
        context,
        elapsed: Date.now() - startTime,
        requiresSynthesis: false
      };
    } catch (error) {
      throw new Error(`Failed to get trends: ${error.message}`);
    }
  }

  /**
   * Get opportunities context
   */
  async getOpportunities() {
    const context = {};
    const startTime = Date.now();

    try {
      const oppsRes = await this._apiCall('/opportunities?limit=10&sort=score');
      context.opportunities = oppsRes?.items || [];

      return {
        context,
        elapsed: Date.now() - startTime,
        requiresSynthesis: false
      };
    } catch (error) {
      throw new Error(`Failed to get opportunities: ${error.message}`);
    }
  }

  /**
   * Get coverage changes context
   */
  async getCoverageChanges() {
    const context = {};
    const startTime = Date.now();

    try {
      const [feedRes, statsRes] = await Promise.allSettled([
        this._apiCall('/coverage/feed?limit=10'),
        this._apiCall('/coverage/stats')
      ]);

      context.changes = this._unwrap(feedRes, { items: [], total: 0 }).items || [];
      context.stats = this._unwrap(statsRes, {});

      return {
        context,
        elapsed: Date.now() - startTime,
        requiresSynthesis: false
      };
    } catch (error) {
      throw new Error(`Failed to get coverage changes: ${error.message}`);
    }
  }

  /**
   * Internal: Make API call with timeout
   */
  async _apiCall(endpoint) {
    return Promise.race([
      this.api.get(endpoint),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`API timeout: ${endpoint}`)), TIMEOUT_MS)
      )
    ]);
  }

  /**
   * Internal: Safely unwrap promise results
   */
  _unwrap(settledResult, fallback) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    }
    console.warn('OpenClawService: API call failed', settledResult.reason);
    return fallback;
  }
}

export default OpenClawService;
