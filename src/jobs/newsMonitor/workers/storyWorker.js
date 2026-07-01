/**
 * Story Worker — Detect and cluster stories
 *
 * Reutiliza detectStories del newsMonitor original
 */

import { detectStories, detectContaminatedStories } from '../intelligence/index.js';

export async function processStoryDetection(articleIds) {
  if (!articleIds || articleIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    // Call existing function without modification
    await detectStories(articleIds);

    // Contamination detection is part of story processing
    const recentStoryIds = await getRecentStoryIds();
    if (recentStoryIds.length > 0) {
      await detectContaminatedStories(recentStoryIds);
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

async function getRecentStoryIds() {
  // Get stories from the last 24 hours (same as original monitor)
  const { query: dbQuery } = await import('../../../routes/db.js');
  const result = await dbQuery(
    `SELECT DISTINCT id FROM story_clusters
     WHERE last_seen > now() - interval '24 hours'
     ORDER BY last_seen DESC`
  );
  return result.rows.map(r => r.id);
}
