/**
 * Intelligence Module — Complete Public API
 * Re-exports all story, entity, event, and opportunity functions
 * PHASE 2: Extracting from monolithic newsMonitor.js into modular subfiles
 * Strangler Pattern: exports from ./stories.js, ./entities.js, ./events.js, ./opportunities.js
 */

// ── Stories & Clustering
export {
  detectStories,
  detectContaminatedStories,
  extractStoryKeywords,
  jaccardSim,
  jaccardShared,
  generateStorySlug,
  detectStoryCategory,
  buildAlgorithmicSummary,
  markStaleStories,
  summarizePendingStories,
  ensureOpportunityTriggerColumn,
  ensureAlgorithmicSummaryColumn,
  ensureClusteringSchema2,
  ensureFreshnessSchema,
  isRecurringContent,
  // Constants
  CLUSTER_WINDOW_HOURS,
  CLUSTER_SUMMARY_MIN_ARTICLES,
  CLUSTER_SUMMARY_MIN_SOURCES,
  STORY_WINDOW_HOURS,
  STORY_MATCH_THRESHOLD,
  STORY_SUMMARY_MIN_ARTICLES,
  STORY_SUMMARY_MIN_SOURCES,
  ENRICHMENT_GATE_COVERAGE,
  RELEVANCE_FILTER_THRESHOLD,
  STORY_ENTITY_GATE_MIN_STORY,
  STORY_ENTITY_GATE_MIN_ARTICLE,
  STORY_STOPWORDS,
  RECURRING_CONTENT_PATTERNS,
} from './stories.js';

// ── Entities & NER
export {
  extractMonitorEntities,
  MONITOR_STOPWORDS,
} from './entities.js';

// Re-export from original newsMonitor.js (will be extracted to entities.js in Phase 3)
export {
  discoverMonitorEntities,
  matchResearchEntities,
  upsertTrendCluster,
  refreshTrendingTopics,
  summarizePendingClusters,
  markStaleClusters,
  checkAutoResearchTriggers,
} from '../../newsMonitor.js';

// ── Events
export {
  detectEvents,
  markStaleEvents,
  summarizePendingEvents,
  calcEditorialScore,
  // Constants
  EVENT_WINDOW_HOURS,
  EVENT_ENTITY_THRESHOLD,
  EVENT_SUMMARY_MIN_STORIES,
  MIN_EVENT_MATCH_ENTITIES,
  EMPTY_EVENT_STATS,
} from './events.js';

// ── Opportunities
export {
  generateAlgorithmicOpportunities,
  generateOpportunitiesForStories,
  getCategoryOpportunityTemplates,
  calcComposite,
  // Constants
  VALID_OPP_TYPES,
} from './opportunities.js';
