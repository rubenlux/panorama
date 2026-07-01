/**
 * newsMonitor/index.js - Main orchestrator for news monitoring
 *
 * PHASE 2 IN PROGRESS:
 * - ✅ Intelligence module extracted (stories, entities, events, opportunities)
 * - ✅ Persistence & Scheduler module structure created (Phase 3 implementation)
 * - ⏳ Still exporting runNewsMonitor from monolithic newsMonitor.js
 * - ⏳ Will be replaced by orchestrator.js in Phase 2 finalization
 *
 * Architecture: Strangler Pattern
 * New code uses ./intelligence/index.js, ./persistence/index.js, ./scheduler/index.js
 * Old code still works via ../newsMonitor.js (3245 lines, unchanged)
 * Behavior: 100% identical to Phase 1
 */

// Main export: orchestrator function (currently from original file)
// Will migrate to ./orchestrator.js once all modules extracted
export { runNewsMonitor } from '../newsMonitor.js';

// Re-export module groups for convenience
export * from './intelligence/index.js';
export * from './persistence/index.js';
export * from './scheduler/index.js';
