/**
 * Scheduler Module — Background Jobs & Periodic Tasks
 * Phase 2: Placeholder layer with re-exports from Intelligence + newsMonitor.js
 * Phase 3+: Will contain fetchPendingArticleContent and additional schedulers
 *
 * Current structure:
 * - content.js — Article content fetching (currently in newsMonitor.js)
 * - health.js — Freshness recalculation & stale marking
 */

// ── Health & Freshness Maintenance
export {
  recalcFreshness,
  markStaleStories,
} from './health.js';

export {
  markStaleEvents,
} from './health.js';

// ── Content Fetching (Phase 3: will extract fetchPendingArticleContent from newsMonitor.js)
