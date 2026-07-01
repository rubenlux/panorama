/**
 * Entity Worker — Pure function
 *
 * No BD queries. No side effects beyond logging.
 * Receives data, processes it, done.
 */

import { discoverMonitorEntities } from '../intelligence/index.js';

export async function processEntityExtraction(articleIds) {
  if (!articleIds || articleIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    await discoverMonitorEntities(articleIds);
    return {
      processed: articleIds.length,
      error: null,
    };
  } catch (error) {
    console.error('[EntityWorker] Error:', error.message);
    return {
      processed: 0,
      error: error.message,
    };
  }
}
