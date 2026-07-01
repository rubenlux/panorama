/**
 * Event Worker — Detect and cluster events
 *
 * Reutiliza detectEvents del newsMonitor original
 */

import { detectEvents } from '../intelligence/index.js';
import { query } from '../../../routes/db.js';

export async function processEventDetection(storyIds) {
  if (!storyIds || storyIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    // Call existing function without modification
    await detectEvents(storyIds);

    return {
      processed: storyIds.length,
      error: null,
    };
  } catch (error) {
    console.error('[EventWorker] Error:', error.message);
    return {
      processed: 0,
      error: error.message,
    };
  }
}

async function getRecentStoryIds() {
  // Get recent story IDs (same logic as original monitor)
  const result = await query(
    `SELECT DISTINCT id FROM story_clusters
     WHERE last_seen > now() - interval '24 hours'
     ORDER BY last_seen DESC`
  );
  return result.rows.map(r => r.id);
}
