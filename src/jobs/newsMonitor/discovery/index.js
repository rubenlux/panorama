/**
 * Discovery Module — Feed fetching, parsing, and URL extraction
 * Public API: All parser/fetcher utilities + DiscoveryFactory
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
