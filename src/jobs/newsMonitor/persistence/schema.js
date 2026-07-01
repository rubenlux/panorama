/**
 * Persistence — Schema Management
 * Idempotent ALTER TABLE operations for monitored_articles and related tables
 * Currently: Re-exported from Intelligence module (stories.js)
 *
 * NOTE: Schema ensures are currently in intelligence/stories.js:
 * - ensureOpportunityTriggerColumn()
 * - ensureAlgorithmicSummaryColumn()
 * - ensureClusteringSchema2()
 * - ensureFreshnessSchema()
 *
 * Phase 3+: May consolidate all schema operations here if beneficial
 */

// Re-export schema functions from intelligence module
export {
  ensureOpportunityTriggerColumn,
  ensureAlgorithmicSummaryColumn,
  ensureClusteringSchema2,
  ensureFreshnessSchema,
} from '../intelligence/stories.js';
