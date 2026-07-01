# newsMonitor Module Structure

**Status:** Phase 1 - Modular layout with re-exports from monolithic source

## Overview

The news monitoring system is being refactored from a monolithic 3245-line file into a modular structure. This is a gradual process to maintain 100% behavioral compatibility during the refactor.

**Current state:** All code is still in `../newsMonitor.js`. Each module in this directory re-exports the necessary functions.

## Module Structure

```
newsMonitor/
├── index.js                  → Main entry point (exports runNewsMonitor)
├── shared.js                 → Shared utilities (parsing, NER, validation)
├── constants.js              → All constants (windows, thresholds, patterns)
├── discovery/
│   └── index.js             → Discovery orchestration + DB persistence
├── extraction/
│   └── index.js             → Article metadata extraction & validation
├── persistence/
│   └── index.js             → (placeholder for DB layer)
├── intelligence/
│   └── index.js             → Stories, entities, trending, events, opportunities
├── scheduler/
│   └── index.js             → Background jobs & schema management
└── metrics/
    └── index.js             → Profiling utilities
```

## Imports

**From main entry point:**
```javascript
import { runNewsMonitor } from './jobs/newsMonitor/index.js';
```

**From modules (if needed):**
```javascript
import { processSource } from './jobs/newsMonitor/discovery/index.js';
import { detectStories } from './jobs/newsMonitor/intelligence/index.js';
```

## Phase Roadmap

### Phase 1 ✅ COMPLETE
- [x] Create modular directory structure
- [x] Extract shared utilities to `shared.js`
- [x] Extract constants to `constants.js`
- [x] Create module index files with re-exports
- [x] Update imports in worker.js
- [x] Verify behavior identical (no changes to actual code)

### Phase 2 (Future)
- [ ] Extract discovery functions to `discovery/fetcher.js` and `discovery/articles.js`
- [ ] Extract extraction functions to `extraction/metadata.js` and `extraction/validation.js`
- [ ] Extract intelligence functions to `intelligence/{stories,entities,trending,events,opportunities}.js`
- [ ] Extract scheduler functions to `scheduler/jobs.js`
- [ ] Update all imports to use new modules
- [ ] Remove original monolithic newsMonitor.js
- [ ] Test full cycle behavior

### Phase 3+ (Optional)
- [ ] Introduce proper error handling per module
- [ ] Add unit tests per module
- [ ] Optimize imports for tree-shaking
- [ ] Add TypeScript types (optional)

## Golden Rule

**100% Behavior Identical**

Before any refactoring:
1. Article count: same before/after
2. DB operations: same timestamps, values, order
3. Log output: same key messages
4. Discovery status: same metrics

If behavior changes → stop and revert.

## Testing

```bash
# Run monitor cycle
npm run worker

# Check article count
sqlite3 newsdb.sqlite "SELECT COUNT(*) FROM monitored_articles"

# Check logs for:
# - Discovery counts match
# - Clustering counts match
# - No new errors
```

## Notes

- Original `newsMonitor.js` stays in place during Phase 1
- No code is actually duplicated (just re-exported)
- Module structure allows future split without disrupting current system
- Each phase commits cleanly with testable boundary
