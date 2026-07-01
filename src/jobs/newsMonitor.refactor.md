# newsMonitor.js Refactor Phase 1 — Modularization Strategy

## STATUS: PLANNING

Refactor Phase 1 implementa arquitectura modular para `newsMonitor.js` (3245 líneas).

**Requisito crítico:** 100% comportamiento idéntico antes/después. Pure mechanical refactoring.

## ESTRUCTURA DESTINO

```
src/jobs/newsMonitor/
├── index.js                    (300 líneas máx) — orchestrator principal
├── shared.js                   ✅ DONE — utilidades compartidas (parsing, NER, hashing)
├── discovery/
│   ├── index.js               ✅ DONE — orchestrador discovery + DB persistence
│   ├── fetcher.js             TODO — fetchFeedXml (HTTP)
│   └── articles.js            TODO — extractArticleMetadata, validateArticle, extractArticlesWithConcurrency
├── extraction/
│   ├── index.js               TODO — orquestador
│   ├── metadata.js            TODO — extractArticleMetadata, related functions
│   └── validation.js          TODO — validateArticle, isRecurringContent
├── persistence/
│   ├── index.js               TODO — orchestrator
│   └── db.js                  TODO — inserts, dedupe
├── intelligence/
│   ├── index.js               TODO — orchestrator
│   ├── stories.js             TODO — detectStories, story clustering
│   ├── entities.js            TODO — extractMonitorEntities, discoverMonitorEntities
│   ├── trending.js            TODO — refreshTrendingTopics, upsertTrendCluster
│   ├── events.js              TODO — detectEvents, event clustering
│   └── opportunities.js       TODO — generateAlgorithmicOpportunities
├── metrics/
│   ├── index.js               TODO — orchestrator + profiler interface
│   └── profiler.js            EXISTING → wrap MonitorProfiler
└── scheduler/
    ├── index.js               TODO — orchestrator
    └── jobs.js                TODO — job scheduling functions
```

## MAPEO DE FUNCIONES

### shared.js ✅ DONE (250 líneas)
- decodeHtmlEntities
- extractTag
- parseRssItems
- parseNewsSitemapItems
- parseSitemapIndexUrls
- detectFeedFormat
- hashUrl
- extractMonitorEntities
- belongsToMedia / isGarbageUrl / isBlockedByChallenge
- isCandidateUrl / logQueryDebug
- MONITOR_STOPWORDS constant

### discovery/ 
**discovery/index.js** ✅ DONE (145 líneas)
- discoverArticlesForSource()
- processSource()

**discovery/fetcher.js** TODO (30 líneas)
- fetchFeedXml(url)

**discovery/articles.js** TODO (300 líneas) — Playwright discovery
- discoverArticleUrlsFromHomepage()
- extractArticlesWithConcurrency()
- discoverArticlesViaPlaywright()

### extraction/
**extraction/metadata.js** TODO (400 líneas) — Article content extraction
- extractArticleMetadata(page, url)
- Helper functions for DOM traversal

**extraction/validation.js** TODO (100 líneas)
- validateArticle(article)
- isRecurringContent(title)

### persistence/
**persistence/db.js** TODO (80 líneas)
- DB inserts for monitored_articles
- Dedup logic

### intelligence/
**intelligence/stories.js** TODO (450 líneas)
- detectStories(newArticleIds)
- detectContaminatedStories(storyIds)
- extractStoryKeywords, jaccardSim, jaccardShared
- generateStorySlug
- Story clustering gates (category, entity, keyword)

**intelligence/entities.js** TODO (150 líneas)
- discoverMonitorEntities(newArticleIds)
- matchResearchEntities(newArticleIds)
- Entity extraction from titles

**intelligence/trending.js** TODO (150 líneas)
- upsertTrendCluster(entityId, articleId)
- refreshTrendingTopics()
- checkAutoResearchTriggers()
- markStaleClusters()
- summarizePendingClusters()

**intelligence/events.js** TODO (200 líneas)
- detectEvents(affectedStoryIds)
- markStaleEvents()

**intelligence/opportunities.js** TODO (500 líneas)
- generateAlgorithmicOpportunities(storyIds)
- detectStoryCategory()
- buildAlgorithmicSummary()
- getCategoryOpportunityTemplates()
- generateOpportunitiesForStories()
- summarizePendingStories()

### metrics/
**metrics/index.js** TODO (50 líneas)
- Wrapper around existing MonitorProfiler
- Interface for cycle metrics

### scheduler/
**scheduler/jobs.js** TODO (150 líneas)
- fetchPendingArticleContent()
- Schema ensure functions (ensureOpportunityTriggerColumn, etc.)

### index.js TODO (300 líneas)
Main orchestrator: runNewsMonitor()

## IMPLEMENTATION CHECKLIST

- [ ] shared.js ✅ DONE
- [ ] discovery/index.js ✅ DONE
- [ ] discovery/fetcher.js 
- [ ] discovery/articles.js
- [ ] extraction/metadata.js
- [ ] extraction/validation.js
- [ ] persistence/db.js
- [ ] intelligence/stories.js
- [ ] intelligence/entities.js
- [ ] intelligence/trending.js
- [ ] intelligence/events.js
- [ ] intelligence/opportunities.js
- [ ] metrics/index.js
- [ ] scheduler/jobs.js
- [ ] index.js (main orchestrator)
- [ ] Test: git diff behavior
- [ ] Commit Phase 1

## VERIFICATION STRATEGY

After each module:
1. Test builds without errors
2. Run monitor cycle
3. Check article count before/after ≈ identical
4. Check DB operations same
5. Check log output similar

## ROLLBACK PLAN

If refactoring breaks behavior:
1. Revert modular files
2. Keep original newsMonitor.js
3. Document issue
4. Re-plan strategy

## NOTES

- Keep original newsMonitor.js until all modules proven working
- Use git branch for refactor
- Commits: one module per commit (easier to debug)
- Goal: Phase 1 done in ~3-4 hours real time
