/**
 * Workers Index
 *
 * Each worker is a pure function that processes data.
 * No BD queries. No side effects.
 */

export { processEntityExtraction } from './entityWorker.js';
export { processStoryDetection } from './storyWorker.js';
export { processEventDetection } from './eventWorker.js';
export { processOpportunityGeneration } from './opportunityWorker.js';
