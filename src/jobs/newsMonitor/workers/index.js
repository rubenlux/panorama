/**
 * Workers Index — Centralized processing components
 *
 * Each worker is a reusable component that can be invoked:
 * 1. Synchronously from runNewsMonitor (current)
 * 2. Asynchronously from independent worker processes (future)
 */

export { processEntityExtraction } from './entityWorker.js';
export { processStoryDetection } from './storyWorker.js';
export { processEventDetection } from './eventWorker.js';
export { processOpportunityGeneration } from './opportunityWorker.js';

/**
 * Orchestrator — Runs all workers sequentially (current behavior)
 * Can be replaced with async orchestration later
 */
export async function runWorkersSequential(articleIds, storyIds) {
  const { processEntityExtraction } = await import('./entityWorker.js');
  const { processStoryDetection } = await import('./storyWorker.js');
  const { processEventDetection } = await import('./eventWorker.js');
  const { processOpportunityGeneration } = await import('./opportunityWorker.js');

  const results = {
    entity: await processEntityExtraction(articleIds),
    story: await processStoryDetection(articleIds),
    event: await processEventDetection(storyIds),
    opportunity: await processOpportunityGeneration(storyIds),
  };

  return results;
}
