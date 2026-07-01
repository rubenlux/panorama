/**
 * scheduler/ - Scheduled background jobs and schema management
 * Re-exports from original newsMonitor.js during Phase 1
 * Will contain actual job scheduling in Phase 2+
 */

// Schema management (self-healing)
export {
  ensureOpportunityTriggerColumn,
  ensureAlgorithmicSummaryColumn,
  ensureClusteringSchema2,
  ensureFreshnessSchema,
} from '../../newsMonitor.js';

// Background jobs
export {
  fetchPendingArticleContent,
} from '../../newsMonitor.js';
