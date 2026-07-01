/**
 * intelligence/ - Story, entity, trending, and event intelligence
 * Re-exports from original newsMonitor.js during Phase 1
 * Will be split into: stories.js, entities.js, trending.js, events.js in Phase 2+
 */

// Stories & Clustering
export {
  detectStories,
  detectContaminatedStories,
  extractStoryKeywords,
  jaccardSim,
  jaccardShared,
  generateStorySlug,
  detectStoryCategory,
  buildAlgorithmicSummary,
} from '../../newsMonitor.js';

// Entities & Trending
export {
  extractMonitorEntities,
  discoverMonitorEntities,
  matchResearchEntities,
  upsertTrendCluster,
  refreshTrendingTopics,
  summarizePendingClusters,
  markStaleClusters,
  checkAutoResearchTriggers,
} from '../../newsMonitor.js';

// Events
export {
  detectEvents,
  markStaleEvents,
  summarizePendingEvents,
} from '../../newsMonitor.js';

// Opportunities
export {
  generateAlgorithmicOpportunities,
  getCategoryOpportunityTemplates,
  generateOpportunitiesForStories,
  summarizePendingStories,
  markStaleStories,
  calcEditorialScore,
} from '../../newsMonitor.js';
