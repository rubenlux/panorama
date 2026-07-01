/**
 * Persistence Module — Database Operations & Schema Management
 * Phase 2: Placeholder layer. Schema re-exported from Intelligence.
 * Phase 3+: Will contain upsert, dedup, and quality scoring logic.
 *
 * Current structure:
 * - articles.js — Article upsert logic (currently in newsMonitor.js processSource)
 * - schema.js — Idempotent ALTER TABLE operations
 */

// ── Schema Management
export {
  ensureOpportunityTriggerColumn,
  ensureAlgorithmicSummaryColumn,
  ensureClusteringSchema2,
  ensureFreshnessSchema,
} from './schema.js';
