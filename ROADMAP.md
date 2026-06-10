# ROADMAP.md — Panorama News Platform

Sprint history and planned work. Last updated: 2026-06-09.

---

## Completed Sprints

### Sprint 1–4 — Core Platform
- Express 5 API + PostgreSQL schema
- CMS (React 19 + Vite) with TipTap rich editor
- JWT auth, role-based access
- Ad system v2 with pixel tracking and user interest profiles
- Editorial Studio (AI article generation)
- Research Center (topic investigation with RSS + AI brief)
- Knowledge Base (entity tracking)
- Media Monitor v1 (RSS polling, trending entities)
- Dossier workflow C1 → C2 → C3

### Sprint 5.1 — Entity Origin Separation (2026-06-09)
**Problem:** Trending topics were contaminated by entities created during manual research (e.g. "Claude Fable 5" appeared as trending because a researcher had investigated it, pre-seeding the entity before the monitor saw it in RSS).

**Solution:**
- Added `entity_origin VARCHAR(20)` to `knowledge_entities` with values `RESEARCH | MONITOR | SOCIAL | MANUAL`
- New 3-column unique index: `(lower(name), entity_type, entity_origin)` — same entity can exist as both RESEARCH and MONITOR independently
- Two separate entity pipelines in `newsMonitor.js`:
  - `matchResearchEntities()` — matches RESEARCH entities to articles (knowledge base context only, not trending)
  - `discoverMonitorEntities()` — NER extraction → creates/updates MONITOR entities → drives trending
- `refreshTrendingTopics()` now filters `WHERE ke.entity_origin = 'MONITOR'`
- Fixed W1: Research connector now reads `tracked_sources` from DB instead of hardcoded `DEFAULT_FEEDS`
- Fixed W2: Relevance scoring in `rss.js` filters Spanish/English stopwords

### Sprint 5.2 — Full Article Research Engine (2026-06-09)
**Problem:** Research was sending only RSS descriptions (~150-300 chars) to Claude, producing superficial briefs.

**Solution:**
- New `ArticleFetcher.js` service: fetches full HTML, extracts content via JSON-LD → `<article>` → `<main>` → `<body>` fallback, with paywall detection and 2000-word cap
- 72h cache in `article_content_cache` table
- `_enrichSources()` in `research.js` enriches top 10 sources before sending to Claude
- `generateResearchBrief()` updated: removed `.slice(0, 300)`, full articles up to 1500 words, `max_tokens` 2000 → 3000
- Result: 86% success rate, average content per source 32 words → 747 words (~23x improvement)

### Sprint 5.3 — Trend Intelligence (2026-06-09)
**Problem:** Trending tab showed flat entity mention cards with no editorial context.

**Solution:**
- New tables: `trend_clusters`, `trend_cluster_articles`
- NER stopwords expanded: "Horóscopo", "Video", "Impactante", clickbait adjectives, etc.
- `upsertTrendCluster()` in newsMonitor: groups articles into 6h cycles per entity
- `summarizePendingClusters()`: triggers Claude when cluster reaches 3 articles or 2 sources — generates headline, summary, editorial_angles JSONB
- `AiService.generateTrendSummary()`: new method
- `GET/POST /trends` API (5 endpoints)
- CMS trending tab replaced with `TrendClusterCard` — shows AI headline, source badges, [Ver detalle] [Seguir] [Crear dossier]
- New page `TrendDetail.jsx` at `/trends/:id` — full cluster view with article timeline and editorial angles

---

## Planned / Backlog

### Sprint 6 — Live Coverage Engine (deprioritized)
Real-time coverage for dynamic events. Full spec preserved in conversation history.

### Near-term improvements
- **NER quality**: Replace regex NER with `compromise.js` or `@nlpjs/ner` for Spanish for fewer false positives
- **Cluster merging**: Merge clusters for the same entity when they fire close together (< 1h gap)
- **Trend alerts**: Push notification / Slack webhook when a cluster hits 'ready' status
- **Trend analytics**: Track which trends became dossiers, measure editorial conversion rate
- **Web public trending**: Expose anonymized trending data on the public web frontend

### Technical debt
| ID | Issue | Priority |
|---|---|---|
| D1 | Clarín partial paywall — truncated content | Low |
| D2 | Agenfor blocked — RSS-only for Formosa coverage | Low |
| D3 | Content extractor is pure regex, not Readability | Medium |
| D4 | No User-Agent rotation | Low |
| D5 | Sources >10 in research still use RSS snippets | Medium |
