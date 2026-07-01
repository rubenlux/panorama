/**
 * Scheduler — Health & Freshness Maintenance
 * Periodic tasks: freshness recalculation, stale marking, metrics updates
 *
 * Exported functions:
 * - recalcFreshness() — Time-decay multipliers for stories/events
 * - markStaleClusters() — Mark old clusters as stale
 *
 * Currently: recalcFreshness exported from stories.js (where schema lives)
 * Phase 3+: May consolidate cleanup operations here
 */

// Re-export freshness recalculation from stories
export { recalcFreshness } from '../intelligence/stories.js';

// Re-export stale-marking functions from intelligence
export { markStaleStories } from '../intelligence/stories.js';
export { markStaleEvents } from '../intelligence/events.js';
