/**
 * Entity Worker — Extract named entities from articles
 *
 * Reutiliza discoverMonitorEntities del newsMonitor original
 * Puede ser invocado por:
 * 1. runNewsMonitor (synchronous, como hoy)
 * 2. Worker independiente (future, async)
 */

import { query } from '../../../routes/db.js';
import { extractMonitorEntities, discoverMonitorEntities } from '../intelligence/index.js';

export async function processEntityExtraction(articleIds) {
  if (!articleIds || articleIds.length === 0) {
    return { processed: 0, error: null };
  }

  try {
    // Call existing function without modification
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
