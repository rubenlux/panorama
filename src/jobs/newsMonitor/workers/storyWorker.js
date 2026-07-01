/**
 * Story Worker — Pure function
 *
 * No BD queries. Receives data, processes it.
 */

import { detectStories, detectContaminatedStories } from '../intelligence/index.js';

export async function processStoryDetection(articleIds, storyIds) {
  if (!articleIds || articleIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    await detectStories(articleIds);

    // Contamination detection if we have recent stories
    if (storyIds && storyIds.length > 0) {
      await detectContaminatedStories(storyIds);
    }

    return {
      processed: articleIds.length,
      error: null,
    };
  } catch (error) {
    console.error('[StoryWorker] Error:', error.message);
    return {
      processed: 0,
      error: error.message,
    };
  }
}
