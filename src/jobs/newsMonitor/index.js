/**
 * newsMonitor/index.js - Main orchestrator for news monitoring
 *
 * Phase 1: Modular structure. Imports from original monolithic file.
 * During Phase 2+: Will import from individual modules as they're extracted.
 */

// For now, re-export everything from the original file to maintain 100% compatibility
export { runNewsMonitor } from '../newsMonitor.js';
