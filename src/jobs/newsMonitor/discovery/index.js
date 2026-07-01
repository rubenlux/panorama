/**
 * Discovery Module — Feed fetching, parsing, and URL extraction
 * Public API: All parser/fetcher utilities + DiscoveryFactory
 * Re-exports extraction functions for convenience
 */

export {
  decodeHtmlEntities,
  extractTag,
  parseRssItems,
  parseNewsSitemapItems,
  parseSitemapIndexUrls,
} from './parsers.js';

export {
  detectFeedFormat,
  fetchFeedXml,
} from './fetcher.js';

export {
  DISCOVERY_LIMIT,
  discoverArticleUrlsFromHomepage,
  extractArticlesWithConcurrency,
  discoverArticlesViaPlaywright,
} from './homepage.js';

export {
  DiscoveryFactory,
  DiscoveryStrategy,
  initializeFactory,
} from './DiscoveryFactory.js';

// Re-export extraction functions for convenience (discovery depends on extraction)
export {
  belongsToMedia,
  isGarbageUrl,
  isBlockedByChallenge,
  isCandidateUrl,
  validateArticle,
  extractArticleMetadata,
} from '../extraction/index.js';
