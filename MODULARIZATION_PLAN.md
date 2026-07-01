# Plan de Modularización: newsMonitor.js

## Situación Actual

- **Archivo**: src/jobs/newsMonitor.js
- **Líneas**: 3,245
- **Funciones**: 42 (2 exportadas)
- **Dominio**: Monolito que realiza 11 responsabilidades diferentes
- **Problema**: Difícil de testear, mantener, debuggear y modularizar

---

## Arquitectura Propuesta: 8 Módulos

### 1. `src/services/RssParser.js` (150 líneas)
**Responsabilidad**: Parsing de XML/RSS/Sitemap

**Funciones**:
```javascript
export function decodeHtmlEntities(str)
export function extractTag(xml, tag)
export function parseRssItems(xml)
export function parseNewsSitemapItems(xml)
export function parseSitemapIndexUrls(xml)
export function detectFeedFormat(xml)
export async function fetchFeedXml(url)
export function hashUrl(url)
```

**Dependencias**: node-fetch

---

### 2. `src/services/ArticleValidator.js` (400 líneas)
**Responsabilidad**: Extracción, validación y limpieza de artículos

**Funciones**:
```javascript
export function extractMonitorEntities(title)
export function belongsToMedia(hostname, mediaHostname)
export function isGarbageUrl(url)
export function isBlockedByChallenge(title, content)
export function isCandidateUrl(url, mediaHostname)
export function validateArticle(article)
export async function extractArticleMetadata(page, url)
```

**Dependencias**: playwright, crypto (hash)

---

### 3. `src/services/DiscoveryOrchestrator.js` (100 líneas)
**Responsabilidad**: Coordinación de métodos de descubrimiento (RSS, Sitemap, Playwright)

**Funciones**:
```javascript
export async function processSource(source)
export async function discoverArticlesForSource(source)
export async function discoverArticlesViaPlaywright(source)
```

**Dependencias**: DiscoveryFactory, RssParser, ArticleValidator

**Nota**: Refactorizar con DiscoveryFactory (ya existe)

---

### 4. `src/services/EntityMatcher.js` (250 líneas)
**Responsabilidad**: Matching de entidades, trends y clustering de tópicos

**Funciones**:
```javascript
export async function matchResearchEntities(newArticleIds)
export async function upsertTrendCluster(entityId, articleId)
export async function discoverMonitorEntities(newArticleIds)
export async function refreshTrendingTopics()
export async function summarizePendingClusters()
export async function markStaleClusters()
```

**Dependencias**: query (db), AiService

---

### 5. `src/services/StoryClustering.js` (450 líneas)
**Responsabilidad**: Story detection, clustering y validación de contaminación

**Funciones**:
```javascript
export function extractStoryKeywords(text)
export function jaccardSim(arrA, arrB)
export function jaccardShared(arrA, arrB)
export function isRecurringContent(title)
export function generateStorySlug(title)
export async function detectStories(newArticleIds)
export async function detectContaminatedStories(storyIds)
export function detectStoryCategory(title, storyType, entities)
export function buildAlgorithmicSummary(story, entities)
```

**Dependencias**: query (db), constants (STORY_*, MONITOR_STOPWORDS)

**Nota**: Ya está parcialmente refactorizado (Sprint 2.0)

---

### 6. `src/services/OpportunitiesEngine.js` (400 líneas)
**Responsabilidad**: Generación de oportunidades editoriales (algorithmic + IA)

**Funciones**:
```javascript
export function getCategoryOpportunityTemplates(story, category, sourceList)
export async function generateAlgorithmicOpportunities(storyIds)
export function calcComposite(editorial, traffic, seo, urgency)
export async function generateOpportunitiesForStories()
export function calcEditorialScore(importanceScore, sourceCount, articleCount, coverageStatus)
export async function markStaleStories()
export async function summarizePendingStories()
```

**Dependencias**: query (db), StoryClustering, AiService

**Nota**: Lógica de scoring puede extraerse a OpportunityScoringEngine

---

### 7. `src/services/EventDetection.js` (300 líneas)
**Responsabilidad**: Detección de eventos y agregación de historias

**Funciones**:
```javascript
export async function detectEvents(affectedStoryIds)
export async function markStaleEvents()
export async function summarizePendingEvents()
export function calcEditorialScore(...)  // Comparte con 6
```

**Dependencias**: query (db), StoryClustering, AiService

**Nota**: Posible refactor: extraer `detectEventCategory()` similar a `detectStoryCategory()`

---

### 8. `src/jobs/NewsMonitorOrchestrator.js` (200 líneas)
**Responsabilidad**: Orquestación principal del ciclo de monitor

**Funciones**:
```javascript
export async function runNewsMonitor()
export async function recalcFreshness()
export async function fetchPendingArticleContent()

// Utilities
async function ensureOpportunityTriggerColumn()
async function ensureAlgorithmicSummaryColumn()
async function ensureClusteringSchema2()
async function ensureFreshnessSchema()
async function checkAutoResearchTriggers()
```

**Dependencias**: Todos los módulos anteriores

---

## Dependencias Entre Módulos

```
RssParser
  ↓
DiscoveryOrchestrator → ArticleValidator
  ↓
NewsMonitorOrchestrator
  ├→ DiscoveryOrchestrator
  ├→ EntityMatcher
  ├→ StoryClustering
  ├→ OpportunitiesEngine
  ├→ EventDetection
  └→ ArticleValidator
```

---

## Archivo Original (newsMonitor.js): Descomponer en

```
src/services/
  ├── RssParser.js              (150 líneas)
  ├── ArticleValidator.js       (400 líneas)
  ├── DiscoveryOrchestrator.js  (100 líneas)
  ├── EntityMatcher.js          (250 líneas)
  ├── StoryClustering.js        (450 líneas)
  ├── OpportunitiesEngine.js    (400 líneas)
  ├── EventDetection.js         (300 líneas)
  └── OpportunityScoringEngine.js (?) ← Nueva, extraída de 6

src/jobs/
  └── NewsMonitorOrchestrator.js (200 líneas)
      [index.js que re-exporta para compat]

TOTAL: ~2,250 líneas distribuidas
Original: 3,245 líneas en 1 archivo
```

---

## Impacto

### Beneficios

✅ **Testabilidad**: Cada módulo puede testearse independientemente  
✅ **Mantenibilidad**: Bug en story detection NO afecta entity matching  
✅ **Debuggabilidad**: Error en events es obvio (stack trace corto)  
✅ **Reutilización**: StoryClustering puede usarse en MCP tools  
✅ **Concurrencia**: Modules pueden ejecutarse en paralelo más claramente  
✅ **Observabilidad**: Cada módulo tiene responsabilidad única  

### Cambios Necesarios

⚠️ Imports en newsMonitor.js → Actualizar a imports de nuevos módulos  
⚠️ Tests: Crear suite de tests para cada módulo  
⚠️ Constants: Extraer a `src/constants/monitor.js` (STORY_*, SOCIAL_GENERIC_TERMS, etc.)  
⚠️ Utils: Extraer helpers a `src/utils/monitor-utils.js`  

---

## Fases de Implementación

### FASE 1: Low-risk (Sin cambios de lógica)
1. Crear RssParser.js (move 8 functions, no logic change)
2. Crear ArticleValidator.js (move 9 functions, no logic change)
3. Crear OpportunitiesEngine.js (move 7 functions, validate scoring)
4. Update imports en newsMonitor.js

### FASE 2: Medium-risk (Refactor, validation required)
5. Crear StoryClustering.js (move 9 functions, test detectStories thoroughly)
6. Crear EventDetection.js (move 3 functions, test event merging)
7. Validate no regressions in story/event detection

### FASE 3: High-impact (Integration)
8. Crear EntityMatcher.js (move 6 functions, complex interactions)
9. Crear DiscoveryOrchestrator.js (already DiscoveryFactory, minimal change)
10. Crear NewsMonitorOrchestrator.js (main orchestrator, keep runNewsMonitor thin)

### FASE 4: Cleanup
11. Delete newsMonitor.js → Replace with index.js (re-export for compat)
12. Add lint/test rules to prevent monolithic regressions

---

## Estimated Effort

- **Phase 1**: 4-6 hours (safe, mostly move)
- **Phase 2**: 6-8 hours (test story detection regression)
- **Phase 3**: 8-10 hours (integration testing)
- **Phase 4**: 2-3 hours (cleanup, docs)

**Total**: 20-27 hours

---

## Success Criteria

- [ ] All 42 functions accounted for in 8 modules
- [ ] newsMonitor.js executes identical logic (bit-for-bit)
- [ ] No regressions in article discovery, story clustering, event detection
- [ ] Each module has <500 lines (except Orchestrator)
- [ ] Import graph is acyclic (DAG)
- [ ] Test coverage ≥80% for new modules

---
