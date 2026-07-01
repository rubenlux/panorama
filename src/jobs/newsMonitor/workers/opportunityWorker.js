/**
 * Opportunity Worker — Generate editorial opportunities
 *
 * Reutiliza generateAlgorithmicOpportunities del newsMonitor original
 */

import { generateAlgorithmicOpportunities } from '../intelligence/index.js';
import { query } from '../../../routes/db.js';

export async function processOpportunityGeneration(storyIds) {
  if (!storyIds || storyIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    // Call existing function without modification
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

async function getRecentStoryIds() {
  // Get recent story IDs that should have opportunities (same logic as original monitor)
  const result = await query(
    `SELECT DISTINCT id FROM story_clusters
     WHERE last_seen > now() - interval '24 hours'
     ORDER BY last_seen DESC`
  );
  return result.rows.map(r => r.id);
}
