/**
 * newsMonitor/index.js - Main orchestrator for news monitoring
 *
 * Strangler migration status (Consolidation Sprint, 2026-07-06):
 * - Intelligence module (stories, entities, events, opportunities) is the
 *   live implementation, reached via ./workers/*.js -> ./intelligence/index.js.
 * - discovery/, extraction/, persistence/, scheduler/, metrics/, shared.js,
 *   constants.js, and discovery.js were removed — none had any importer
 *   outside their own dead subtree (verified: static imports, dynamic
 *   import(), scripts/, and package.json all checked before deletion).
 * - runNewsMonitor() itself still lives in the monolithic ../newsMonitor.js,
 *   which also still contains ~1500 lines of inline logic superseded by
 *   intelligence/ (separate cleanup, not yet done as of this commit).
 */

export { runNewsMonitor } from '../newsMonitor.js';

// Re-export the one module group that's actually live.
export * from './intelligence/index.js';
