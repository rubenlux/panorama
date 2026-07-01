/**
 * Extraction Module — Article metadata extraction and validation
 * Public API: extractArticleMetadata, validateArticle, and URL screening functions
 */

export {
  belongsToMedia,
  isGarbageUrl,
  isBlockedByChallenge,
  isCandidateUrl,
  validateArticle,
} from './validator.js';

export {
  extractArticleMetadata,
} from './metadata.js';
