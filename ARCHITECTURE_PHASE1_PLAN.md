# Sprint de Arquitectura Fase 1 — Desacople Modular

## Contexto

**Regresión del 2026-07-01**: Una línea de código cambió en DiscoveryFactory y **rompió TODO el monitor de noticias**.

### Root Cause
- `newsMonitor.js`: 3,245 líneas, 15 responsabilidades, 1 archivo
- Una dependencia transversal sin aislamiento
- Cambio en Discovery → falla en Persistence → falla en Intelligence
- **Cascading failures**, no module isolation

### Lección
> El monitor **NO PUEDE crecer más** sin arquitectura modular.

---

## Objetivo Fase 1

**Desacoplar módulos sin cambiar absolutamente NADA de lógica.**

✅ Mover código a carpetas independientes  
✅ Crear interfaces limpias entre módulos  
✅ Resultado funcional: **idéntico antes/después** (byte-for-byte en BD)  
❌ NO optimizar  
❌ NO refactorizar lógica  
❌ NO agregar features  

**Regla de Oro**: Si algo rompe, revert. El refactor es pure structural.

---

## Estructura Propuesta

```
src/jobs/newsMonitor/
│
├── index.js                      (200-300 líneas)
│   └─ Orquestación: load → discover → extract → persist → process
│
├── discovery/
│   ├── index.js
│   ├── factory.js
│   ├── strategies/
│   │   ├── rss.js
│   │   ├── sitemap.js
│   │   └── playwright.js
│   ├── parsers.js
│   ├── utils.js
│   └── config.js
│
├── extraction/
│   ├── index.js
│   ├── extractor.js
│   ├── validator.js
│   ├── entities.js
│   └── config.js
│
├── persistence/
│   ├── index.js
│   ├── articles.js
│   ├── dedupe.js
│   └── schema.js
│
├── intelligence/
│   ├── index.js
│   ├── stories.js
│   ├── clustering.js
│   ├── categories.js
│   ├── entities.js
│   ├── events.js
│   ├── opportunities.js
│   └── config.js
│
├── metrics/
│   ├── profiler.js
│   └── config.js
│
├── scheduler/
│   ├── index.js
│   ├── health.js
│   └── content.js
│
└── config/
    └── monitor.js
```

---

## Fase 1 Steps

### 1. Create Structure
```bash
mkdir -p src/jobs/newsMonitor/{discovery,extraction,persistence,intelligence,metrics,scheduler,config}
```

### 2. Move Code (Pure Mechanical)
- Copy functions from `newsMonitor.js` into submodules
- **No changes to implementation**
- Example: `parseRssItems` → `discovery/parsers.js`

### 3. Create Indices
Wrapper exports for clean APIs:
```javascript
// discovery/index.js
export { DiscoveryFactory, initializeFactory } from './factory.js';
export async function discoverArticlesForSource(source) { ... }
```

### 4. Create Orchestrator
```javascript
// newsMonitor/index.js
export async function runNewsMonitor() {
    const sources = await loadSources();
    const discovered = await discoverArticlesForSource(sources);
    const extracted = await extractArticles(discovered);
    const inserted = await persistArticles(extracted);
    
    await Promise.all([
        processIntelligence.stories(inserted),
        processIntelligence.entities(inserted),
        processIntelligence.events(inserted),
        processIntelligence.opportunities(inserted)
    ]);
}
```

### 5. Validate
**Black box validation**:
```javascript
const before = await countArticles();
await runNewsMonitor();
const inserted = await countArticles() - before;
// Must equal N (same as old version)
```

---

## Benefits After Fase 1

### Isolation
```
change in discovery/ → only discovery/ tests fail
change in extraction/ → only extraction/ tests fail
change in intelligence/ → only intelligence/ tests fail
```
**NO cascading failures**

### Testability
```javascript
import { discoverArticlesForSource } from './discovery/index.js';
const articles = await discoverArticlesForSource(mockSource);
assert.equal(articles.length, 100);
```

### Extensibility
To add `AtomDiscovery`:
```
1. Copy src/jobs/newsMonitor/discovery/strategies/rss.js
2. Rename to atom.js
3. Change 3-5 lines
4. Register in factory.js
Done. No other files touched.
```

---

## Success Criteria

- [ ] All 42 functions accounted for (moved, not changed)
- [ ] newsMonitor/index.js is 200-300 lines
- [ ] Each submodule < 500 lines
- [ ] No behavior changes (black-box validation passes)
- [ ] Article count before/after identical
- [ ] Discovery status identical
- [ ] All 37 sources process correctly
- [ ] Git history clean (one commit per major module)

---

## Estimate

- Structure setup: 1h
- Move discovery/: 2h
- Move extraction/: 2h
- Move persistence/: 1h
- Move intelligence/: 3h (largest)
- Create orchestrator: 2h
- Validation & testing: 3h
- Buffer: 2h

**Total: 16-18 hours** (two 4-5 hour sessions)

---

## Guard Rails

Stop and revert if:
- ❌ Article count changes → boundary was wrong
- ❌ Discovery status changes → dependency was missed
- ❌ New bugs appear → refactoring broke something
- ❌ Any logic needs change → not pure move anymore

---

## Why This Matters

**Today**: One file, everything depends on everything. One change → entire monitor breaks.

**After Fase 1**: Clear module boundaries. Change discovery? Only discovery tests fail. Change extraction? Only extraction tests fail.

**Result**: 
- Facebook fix doesn't break monitor
- Instagram improvements don't cascade
- New discovery methods are trivial to add
- 10x safer to evolve the system

---

## Next Priorities

**BEFORE:**
- Fixing Facebook scraper (Sprint 8.8+)
- Adding Instagram/X improvements
- New discovery methods

**REASON:** After Fase 1, those become 10x easier and 100x safer.

---
