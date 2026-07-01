/**
 * Opportunity Worker — Pure function
 *
 * No BD queries. Receives storyIds, processes it.
 */

import { generateAlgorithmicOpportunities } from '../intelligence/index.js';

export async function processOpportunityGeneration(storyIds) {
  if (!storyIds || storyIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    await generateAlgorithmicOpportunities(storyIds);

    return {
      processed: storyIds.length,
      error: null,
    };
  } catch (error) {
    console.error('[OpportunityWorker] Error:', error.message);
    return {
      processed: 0,
      error: error.message,
    };
  }
}
