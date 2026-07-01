/**
 * extraction/ - Article metadata extraction and validation
 * Re-exports from original newsMonitor.js during Phase 1
 * Will be split into separate modules in Phase 2+
 */

export { validateArticle, isRecurringContent } from '../../newsMonitor.js';
export { extractArticleMetadata, extractArticlesWithConcurrency, discoverArticleUrlsFromHomepage } from '../../newsMonitor.js';
export { discoverArticlesViaPlaywright } from '../../newsMonitor.js';
