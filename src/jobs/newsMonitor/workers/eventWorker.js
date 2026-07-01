/**
 * Event Worker — Pure function
 *
 * No BD queries. Receives storyIds, processes it.
 */

import { detectEvents } from '../intelligence/index.js';

export async function processEventDetection(storyIds) {
  if (!storyIds || storyIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    const eventStats = await detectEvents(storyIds);

    return {
      processed: storyIds.length,
      error: null,
      stats: eventStats,
    };
  } catch (error) {
    console.error('[EventWorker] Error:', error.message);
    return {
      processed: 0,
      error: error.message,
    };
  }
}
