# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack news publishing platform consisting of three independent apps:
- **API** (`src/`) — Express 5 + PostgreSQL backend, port 5000
- **CMS** (`cms/`) — Admin panel (React 19 + Vite), port 5173
- **Web** (`web/`) — Public-facing site (React 19 + Vite), port 5174

## Commands

### Development

```bash
npm run dev:all        # Recommended: API + CMS together (concurrently)
npm run dev            # API only, with nodemon auto-reload
npm run worker         # Background job worker (cron jobs, scheduled tasks)
cd cms && npm run dev  # CMS frontend only
cd web && npm run dev  # Public web frontend only
```

### Database

```bash
npm run db:up          # Start PostgreSQL container (docker-compose, host port 5435)
npm run db:init        # Initialize schema + seed data
```

### Linting

```bash
cd cms && npm run lint  # ESLint for CMS
cd web && npm run lint  # ESLint for Web
```

### Production Build

```bash
npm start              # API production server
cd cms && npm run build
cd web && npm run build
```

> No test suite is configured. No TypeScript compilation step — all JS.

## Architecture

### Backend (`src/`)

- Entry: `src/server.js` → `src/app.js` (Express app factory)
- Routes in `src/routes/` — 22 route files, mounted in `app.js`
- Business logic in `src/services/` (`AiService.js` wraps Anthropic + OpenAI)
- Auth: JWT via `src/middleware/auth.js`; roles via `src/middleware/roles.js`
- Database pool shared via `src/routes/db.js` — import from there, not a new pool
- Background jobs in `src/jobs/`, run by `src/worker.js` (separate process)
- Versioned routes: `analytics.js` (v1) and `analytics_v2.js` (v2); `ads.js` (legacy) and `ads_v2.js` (current)

### Frontend (CMS and Web)

Both apps follow the same pattern:
- `src/api.js` — centralised Axios/fetch client; all API calls go through here
- `src/App.jsx` — router root with protected-route wrappers
- `src/pages/` — one file per route
- `src/components/` — shared UI components

CMS additionally has:
- `src/editor/` — custom TipTap extensions (rich text, code blocks, image upload)
- `src/layout/` — AdminLayout shell (sidebar, header)

### Database

PostgreSQL 15 via Docker. Connection string from `DATABASE_URL` env var (default `postgres://postgres:postgres@127.0.0.1:5435/newsdb`). Schema migrations live in `scripts/` as numbered SQL files; run them manually or via `npm run db:init`.

### Ad System

Documented in Spanish in `SISTEMA_PUBLICIDAD.md`. Key concepts:
- `ads_v2.js` handles intelligent ad serving based on user interest profiles built from pixel events
- Pixel tracking endpoint (`src/routes/pixel.js`) captures user behaviour
- `src/routes/analytics_v2.js` provides campaign metrics

### AI Integration

`src/services/AiService.js` wraps both Anthropic (`@anthropic-ai/sdk`) and OpenAI SDKs. Exposed via `src/routes/ai.js` and `src/routes/editorial-studio.js`. Use `AiService` for any new AI feature rather than importing the SDK directly in a route.

### Universal Article Extractor (`src/jobs/newsMonitor.js`) — Phase 2, Production

**Architecture:** Resilient, CMS-agnostic metadata extraction via Playwright. Three extraction gates:
1. **URL pathname validation** — reject homepages (`/` or no path) early
2. **Content volume** — minimum 120 words (filters noise)
3. **Structured validation** — title source reliability, og:type, JSON-LD type

**Extract function:** `extractArticleMetadata(page, url)` → returns:
- `title` (cleaned), `canonical`, `description`, `author`, `publishedAt`, `modifiedAt`
- `contentHtml` (preserves structure), `contentText` (for AI)
- `wordCount`, `paragraphCount`, `readingTime`
- `images` (URL + alt + dimensions), `keywords`, `entities` (basic NER)
- `confidence` (weighted: JSON-LD 25pt, H1 25pt, canonical 15pt, published 10pt, author 10pt, OG 10pt, body 5pt)
- Media features: `hasVideo`, `hasGallery`, `hasIframe`, `hasEmbed`, `hasTable`

**Discovery:** RSS → Sitemap → Playwright homepage scan (URL-pattern scoring, 60+ patterns).

**Status:** Production (Phase 2 validation metrics in progress).  
**Latest fix:** BUG-001 — Homepage URL validation gate added (June 30, 2026). Homepages no longer pass discovery.

### Cost Killer Architecture (Sprints CK1 → CK3) — ⚠️ READ BEFORE TOUCHING IA CALLS

**Principio fundamental:** Claude está reservado SOLO para acciones manuales explícitas del usuario. Todo lo demás es SQL/algoritmos.

**Lo que NUNCA debe llamar a Claude automáticamente:**
- `runNewsMonitor()` — 100% algorítmico. Las funciones `summarizePendingClusters`, `summarizePendingStories`, `generateOpportunitiesForStories`, `summarizePendingEvents` están **comentadas permanentemente** (Cost Killer 1).
- `runSocialMonitor()` — `autoAnalyzeTranscript()` está **deshabilitado** (Sprint 8.4, confirmado CK2 FASE 1).
- Creación de dossiers desde historias/eventos/oportunidades — se crean con `status='draft'`, sin `setImmediate` (Cost Killer 2 FASE 6).

**Lo que SÍ usa Claude (solo bajo demanda explícita del usuario):**
- `POST /editorial-workflow/dossiers/:id/enrich` — enriquecer dossier borrador con IA
- `POST /social/posts/:id/analyze` — análisis de transcript
- `POST /stories/:id/generate-summary` — resumen IA manual
- `POST /stories/:id/generate-opportunities` — oportunidades IA manual
- `POST /events/:id/generate-summary` — resumen IA manual
- `POST /trends/:id/generate-summary` — resumen IA manual
- `POST /editorial-workflow/dossiers/:id/angles/refresh` — regenerar ángulos editoriales
- `POST /editorial-workflow/dossiers/:id/draft` — generar borrador de artículo

**Motor Algorítmico (`src/jobs/newsMonitor.js`) — se ejecuta cada ciclo:**
- `generateAlgorithmicOpportunities(storyIds)` — genera oportunidades sin IA usando `detectStoryCategory()` + `getCategoryOpportunityTemplates()`.
- `buildAlgorithmicSummary(story, entities)` — resumen tipo "N artículos de M fuentes informan sobre X."
- `detectStoryCategory(title, storyType, entities)` — **v2 (June 25):** context-aware classification. Retorna `{category, confidence, matched_rules}`. Detects SPORTS_CONTEXT (clubes, competiciones, mercado) + ENTERTAINMENT_CONTEXT (personas públicas). Si sports context detectado, reduce health/economy/international scores. Si entertainment context detectado, prioriza entertainment sobre sports (ej: "Andrea del Boca" → entertainment, not sports). Dynamic PRECEDENCE: entertainment comes first when `hasEntertainmentContext=true`. `storyType=sports/politics` remains override. **Result:** Lozano case fixed (4 fragmented → 1 consolidated), Boca stories 60%→80% sports classification.
- `getCategoryOpportunityTemplates(story, category, sourceList)` — 3-4 templates por categoría (LIVE_COVERAGE, NEWS, ANALYSIS, EXPLAINER, SEO con scores diferenciados) + 2 reglas cross-category (ventana de exclusiva / cobertura concentrada).
- `ensureAlgorithmicSummaryColumn()` + `ensureOpportunityTriggerColumn()` — idempotent ALTER TABLE al arrancar.
- `importance_score` — `LEAST(10, GREATEST(1, (LEAST(source_count*2.5, 5.0) + LEAST(article_count*0.5, 3.0) + coverage_bonus)::integer))` — 100% SQL.
- `coverage_status` — derivado de `articles_last_1h` + `source_count`: `breaking` | `growing` | `cooling` | `monitoring` — 100% SQL.

**Campos de BD añadidos por Cost Killers:**
- `story_clusters.algorithmic_summary TEXT` — resumen sin IA, generado cada ciclo por el monitor
- `story_opportunities.trigger VARCHAR(20) DEFAULT 'ai'` — `'algorithmic'` para oportunidades algorítmicas, `'ai'` para las de Claude

**Estado de dossiers:**
- `'draft'` — recién creado desde historia/evento/oportunidad. DossierDetail muestra botón "✨ Enriquecer con IA".
- `'generating'` — en proceso (puesto por el endpoint `/enrich`). DossierDetail muestra spinner y polling cada 3s.
- `'ready'` — listo. DossierDetail muestra contenido completo + opción "🔄 Regenerar" (`?force=true`).
- NO existe `'generating'` como estado inicial — siempre comienza en `'draft'`.

**Endpoint de enriquecimiento (`src/routes/editorial_workflow.js`):**
- `POST /editorial-workflow/dossiers/:id/enrich` — acepta `?force=true` para regenerar dossiers `ready`. Responde inmediatamente con `{ ok, cached, dossier }` y corre `runDossierGeneration` en background con `setImmediate`.

**`GET /opportunities` (`src/routes/opportunities.js`):**
- Ventana: `sc.last_seen > now() - interval '7 days'` (antes 24h)
- Paginación: `limit` (máx 1000, default 50) + `offset`
- Devuelve `{ items, total, offset, limit, age }`
- Devuelve `so.trigger` y `age_bucket` (`ACTIVE`/`WARM`/`ARCHIVED`) en cada oportunidad
- `?age=ALL|ACTIVE|WARM|ARCHIVED` — frontend hardcodea `'ALL'` (filtro UI de age bucket eliminado)
- `?hours=1|2|6|12|24` — override de ventana de tiempo (whitelist validada)
- `?sort=recent|score` — `recent` = `so.created_at DESC` (default); `score` = `so.composite_score DESC`
- Usa `COUNT(*) OVER()` para total de paginación real
- Ventana de historia se expande a 14 días cuando `age=ALL` o `age=ARCHIVED`

**`GET /stories` (`src/routes/stories.js`):**
- Incluye `sc.algorithmic_summary` en el SELECT
- Límite default 50, máx 500 (antes 25/200)
- `?hours=1|2|6|12|24` — filtra `sc.last_seen > now() - interval 'N hours'` (default 24)
- `?sort=recent|score` — `recent` = `sc.last_seen DESC` (default); `score` = `sc.importance_score DESC`
- `freshness_score` NO está en SELECT (evita dependency error antes del primer ciclo)

**`GET /events` (`src/routes/events.js`):**
- `?hours=1|2|6|12|24` — filtra `ec.last_updated_at > now() - interval 'N hours'` (default 24)
- `?sort=recent|score` — `recent` = `ec.last_updated_at DESC` (default); `score` = `ec.editorial_score DESC`
- `freshness_score` NO está en SELECT

**`GET /monitor/stats` (`src/routes/monitor.js`):**
- El contador `opportunities` usa ventana 7 días (antes contaba todos los pending sin filtro de tiempo)

**UI — StoryCard (`cms/src/pages/MediaMonitor.jsx`):**
- NO mostrar: `⏳ {coverage}%`, `⏳ Generando inteligencia editorial…`, `✨ Generar resumen IA`, `✨ Generar oportunidades IA`, `⏳ Enriqueciendo`
- SÍ mostrar siempre: badge `algoCorroboration()` (Cobertura alta / Cobertura creciendo / Confirmada / Corroborada / En desarrollo / Una fuente), resumen algorítmico o IA, botón `📋 Crear dossier` siempre habilitado
- `algoCorroboration(sourceCount, coverageStatus)` — función pura en el componente

**UI — Tab Oportunidades (`cms/src/pages/MediaMonitor.jsx`):**
- Paginación: 50 por página, botón "Cargar más" (`loadMoreOpps`), estado `oppsHasMore`
- Badges: `⚙️ ALGORÍTMICA` (verde) / `✨ IA` (violeta) en cada tarjeta y en el resumen del tab
- Filtro tiempo: `[Todas] [Última 1h] [Últimas 2h] [Últimas 6h] [Últimas 12h] [Últimas 24h]` (pills violeta)
- Filtro sort: `[🕐 Recientes] [⭐ Score]` (pills verde); separados por divider visual
- NO hay filtro ACTIVE/WARM/ARCHIVED — eliminado; `age: 'ALL'` hardcodeado en todas las llamadas
- Estado: `oppsHours` (default null=Todas) + `oppsHoursRef`, `oppsSort` (default 'recent') + `oppsSortRef`

**UI — Tiempo + Sort filter (Historias y Eventos tabs):**
- Mismo filtro combinado: TIME_OPTIONS pills (violet) + sort pills (green) con divider
- `storiesHours/storiesHoursRef` (default 24), `storiesSort/storiesSortRef` (default 'recent')
- `eventsHours/eventsHoursRef` (default 24), `eventsSort/eventsSortRef` (default 'recent')
- Handlers resetan la lista y llaman a load: `setStories([]); setStoriesTotal(0); loadStories()`
- Pattern `useRef` para acceso desde `setInterval` sin stale closure

**Bug fix — Schema chicken-and-egg (`src/jobs/newsMonitor.js`):**
- `detectStories()` usa `sc.detected_category` (columna de Clustering 2.0)
- `ensureClusteringSchema2()` solo se llamaba dentro de `generateAlgorithmicOpportunities()` que corre DESPUÉS de `detectStories()` — causaba error en cada ciclo con artículos nuevos
- Fix: todos los `ensure*Schema()` se movieron al inicio de `runNewsMonitor()` como preamble, antes de `startRun()`
- Preamble: `ensureOpportunityTriggerColumn()` → `ensureAlgorithmicSummaryColumn()` → `ensureClusteringSchema2()` → `ensureFreshnessSchema()`

**UI — SocialOpportunities (`cms/src/pages/SocialOpportunities.jsx`):**
- `handleAnalyzeInline(post)` — llama `POST /social/posts/:id/analyze` directo sin abrir modal
- Para posts con transcript sin análisis: botón `✨ Analizar transcript`
- Para posts con análisis: botón `🟢 Ver análisis / Dossier` (abre `AnalysisModal`)

**Scripts de migración:**
- `node scripts/migrate_cost_killer2.mjs` — trigger column, recalc importance_score, oportunidades algorítmicas iniciales
- `node scripts/migrate_cost_killer3.mjs` — columna algorithmic_summary, backfill summaries, oportunidades con categorías
- `node scripts/migrate_story_clustering_2.mjs` — rebuild completo Story Clustering 2.0 (ver sección siguiente)

### Story Clustering 2.0 — ⚠️ Arquitectura de clustering (leer antes de tocar detectStories)

**Problema resuelto:** Contaminación de historias — artículos de deportes (Mascota del Mundial) agrupados con política/internacional porque keywords como "mundial" matcheaban. Firma creciente (`sig.keywords.push(artKw)`) amplificaba el problema en cascada.

**Tres gates en orden estricto:**

1. **Gate 1 — Categoría (hard block):** `detectStoryCategory(artTitle)` debe dar la misma categoría que la historia. Si difieren, el artículo jamás se agrupa, sin importar keywords. Zero exceptions.
2. **Gate 2 — Entidades (hard block, condicional):** Si la historia tiene ≥3 entidades nombradas Y el artículo tiene ≥1 entidad nombrada Y la intersección es vacía → rechazado. Si alguna parte tiene menos datos, el gate se omite (pass-through).
3. **Gate 3 — Jaccard de keywords (threshold):** Jaccard en keywords del TÍTULO de la historia (frozen) vs keywords del artículo. Threshold: `STORY_MATCH_THRESHOLD = 0.20`.

**Firma congelada (frozen signature):**
- La firma de una historia = keywords del título original SOLAMENTE.
- NUNCA se hace `sig.keywords.push(artKw)` — eso era la raíz del cascade contamination.
- Las entidades también vienen del JOIN a `story_entities` + `knowledge_entities`, no de acumulación inline.
- Nuevos clusters creados en un ciclo SÍ se agregan a `signatures[]` para que artículos posteriores en el mismo batch puedan agruparse (pero solo sus title keywords iniciales, no los de artículos acumulados).

**Score compuesto por artículo-link (para auditoría):**
```
composite = kwScore * 0.6 + entityScore * 0.4
entityScore = sharedEntities.length / sig.entities.length   (si hay entidades)
           = 0.5                                             (si la historia no tiene entidades)
```
Columns en `story_cluster_articles`: `category_match`, `category_score`, `entity_score`, `keyword_score`.

**Columnas nuevas en BD:**
- `story_clusters.detected_category VARCHAR(20)` — categoría asignada al crear el cluster
- `story_clusters.contamination_flag BOOLEAN DEFAULT FALSE` — true si ≥25% de artículos son de categoría diferente (y el cluster tiene ≥4 artículos)
- `story_cluster_articles.category_match BOOLEAN DEFAULT TRUE` — false si el artículo fue forzado a una historia de categoría distinta (solo en backfill; en nuevo clustering esto no pasa)
- `story_cluster_articles.{category,entity,keyword}_score FLOAT` — trazabilidad del match

**Funciones en `src/jobs/newsMonitor.js`:**
- `detectStories(newArticleIds)` — clustering principal, lines ~595–870
- `detectContaminatedStories(storyIds)` — post-process, lines ~876–903
- `ensureClusteringSchema2()` — idempotent ALTER TABLE, llamado en el PREAMBLE de `runNewsMonitor()` (antes era solo en `generateAlgorithmicOpportunities()` — bug fix: necesitaba correr antes de `detectStories()`)

**Rebuild script (`scripts/migrate_story_clustering_2.mjs`):**
1. Schema — añade columnas nuevas (idempotente)
2. Clean — borra story_cluster_articles, story_opportunities, story_entities, event_cluster_stories, story_clusters no-recurrentes
3. Rebuild — re-procesa `monitored_articles` de últimos 7 días en orden cronológico ASC
4. Metrics — recalcula quality/confidence/coverage_status/importance_score para cada historia
5. Contamination — corre detector en todas las historias reconstruidas

**Constantes clave:**
- `STORY_ENTITY_GATE_MIN_STORY = 3` — historias con menos entidades no activan el gate de entidades
- `STORY_ENTITY_GATE_MIN_ARTICLE = 1` — artículos sin entidades no activan el gate de entidades
- `STORY_MATCH_THRESHOLD = 0.20` — Jaccard mínimo para el gate 3 (keyword)
- `STORY_WINDOW_HOURS = 24` — ventana para historias activas

### Story/Event Intelligence — Forensic Fixes (2026-06-19)

Three root-cause fixes applied to `src/jobs/newsMonitor.js` after regression audit (tournament context cross-clustering).

**FIX 1 — STORY_STOPWORDS: tournament context words** (Gate 3 keyword filter, line ~539)
Added to prevent intra-tournament Jaccard inflation (e.g. "Argentina gana" vs "Brasil eliminado" sharing 'mundial' → 1/2 = 0.50 ≥ 0.20 → false cluster):
```js
'copa','mundial','torneo','campeonato','fixture','grupo','fase',
'final','semifinal','cuartos','octavos','16avos','32avos',
```
Named entities like "Copa Libertadores" or "Copa América" still pass Gate 2 via NER → `knowledge_entities` (Gate 3 filters lowercased keywords, Gate 2 uses entities — separate pipelines).

**FIX 2 — MONITOR_STOPWORDS: ALL-CAPS title normalization** (NER entity extraction, line ~195)
ALL-CAPS titles (common in Facebook posts) bypassed `MONITOR_STOPWORDS` entirely because the set uses Title-case keys ('De','Los','El') but comparison used the raw all-caps word ('DE','LOS','EL').
```js
// BEFORE (bug):
const isNotStopword = !MONITOR_STOPWORDS.has(bare);
// AFTER (fix):
const normalizedBare = bare[0].toUpperCase() + bare.slice(1).toLowerCase();
const isNotStopword  = !MONITOR_STOPWORDS.has(normalizedBare);
```
Effect: 'DE FINAL' no longer extracted as a NER entity. Verb contamination remains (e.g. 'ESTADOS UNIDOS GANÓ' still accumulates 'GANÓ' since verbs aren't in MONITOR_STOPWORDS — separate problem).

**FIX 3 — `detectEvents()`: removed cascade entity accumulation** (line ~1751)
`storyEntities.forEach(e => ev.entities.add(e))` was accumulating in-memory event entities each cycle, widening Jaccard matches for later stories — same bug Story Clustering 2.0 fixed at story level.
```js
// REMOVED: storyEntities.forEach(e => ev.entities.add(e));
// KEPT:
ev.storyIds.add(String(story.id));
// Comment: DB-loaded entity set is the only source of truth; next cycle re-evaluates with full merged entity set.
```

**Pre-existing finding (NOT fixed — separate decision):**
`detectEvents()` matching loop (line ~1737) has no minimum-entity guard for incoming stories — only for creating new events (line 1759 checks `storyEntities.size >= 2`). A story with 1 entity (e.g. {'mundial'}) can match a 2-entity event at Jaccard 0.50 ≥ EVENT_ENTITY_THRESHOLD (0.35). Potential fix: `if (storyEntities.size < 2) continue;` before the matching loop to mirror the new-event guard.

### News Monitor — Critical distinction

The news monitor writes to **`monitored_articles`**, NOT `articles`. The `articles` table (22 rows) is manual CMS content only. All monitoring activity is in `monitored_articles` (8,976+ rows). Use `detected_at` as the timestamp column — not `created_at` or `ingested_at`.

### Worker Observability (Sprint 8.2)

`src/jobs/workerUtils.js` — shared utility for all workers:
- `ensureObservabilitySchema()` — idempotent CREATE TABLE for `worker_runs` and `system_events`. Called once on worker startup.
- `startRun(workerName)` → runId (inserts into `worker_runs`)
- `finishRun(runId, { status, sources_processed, items_found, items_saved, errors_count, error_message })` → updates the run record
- `logEvent(eventType, actor, metadata)` → inserts into `system_events`

Worker statuses: `running` | `success` | `error` | `skipped` (skipped = ran but exited due to pause flag — worker IS alive).

**Pause metadata** stored as additional settings rows alongside `news_monitor_paused`:
- `news_monitor_paused_at` — ISO timestamp of pause
- `news_monitor_paused_by` — username/email
- `news_monitor_pause_reason` — optional reason text

**Monitor routes (Sprint 8.2):**
- `GET /monitor/health` — full operational dashboard: worker status, news/social/transcript health, backlog estimate, real-time alerts
- `GET /monitor/worker-runs?worker=xxx&limit=50` — execution history
- `GET /monitor/system-events?limit=50` — audit event log
- `GET /monitor/worker-pause` — now returns `{ paused, paused_since, paused_by, pause_reason }`
- `POST /monitor/worker-pause` — now accepts `{ paused, reason }`, saves metadata, logs to `system_events`

### Transcript Intelligence (Sprint 8.0A → 8.7 → 8.7B)

`src/connectors/social/transcripts.js` — two transcript providers:

**Active provider — `fetchYouTubeTranscriptViaPlaywright(url)` (Sprint 8.7):** Scrapes the YouTube UI transcript panel ("Mostrar transcripción" button) using Playwright headless Chromium. Bypasses the `timedtext` endpoint entirely. Proven working: ~12s per video, 775+ words extracted. The `timedtext` endpoint is IP-blocked at the network level — not a transient rate limit. Affects yt-dlp, youtube-transcript-api, direct HTTP, and Playwright with cookies. The UI panel approach is the only viable solution.

**Legacy provider — `fetchYouTubeTranscript(url)` (Sprint 8.0A):** Uses `ytInitialPlayerResponse` + cookie forwarding. IP-blocked in practice. Available via `TRANSCRIPT_PROVIDER=legacy`.

**`TRANSCRIPT_PROVIDER` env var:** `playwright` (default) | `legacy` | `disabled`

**Timestamp cleaning (Sprint 8.7B bug fix):** YouTube concatenates `<timestamp><text>` without spaces inside `transcript-segment-view-model` elements. Word-boundary anchors (`\b`) fail on concatenated tokens. Fix: use `\d{1,2}:\d{2}(:\d{2})?` (no `\b`), replace with `' '` not `''`.

**Tables:**
- `video_transcripts` (post_id, transcript_text, transcript_language, transcript_source, transcript_length, **word_count**, **quality_score**, fetched_at)
- `transcript_analysis` (summary, entities_*, main_topics, quotes, keywords, **editorial_type**, **key_points**, generated_at)

**Quality score (Sprint 8.3):** `calculateQualityScore(text, source)` — 0-29=garbage, 30-69=incomplete, 70-99=auto-generated useful, 100=official complete. Source `'ui'` (Playwright) uses the ASR/auto branch.

**Editorial type (Sprint 8.3):** `detectEditorialType(title, text)` — keyword-based, no AI cost — returns NEWS|INTERVIEW|OPINION|SPORTS|LIVE|PODCAST|OTHER.

**Coverage:** `social_posts.transcript_available` (bool/null), `social_posts.transcript_fetched_at`. `TRANSCRIPT_BATCH = 8` videos per 30-min cycle (newest first). `backfillTranscripts()` processes up to 50 historical pending per cycle (oldest first), 5 concurrent, 1s between batches.

**Daily limits:** Default 10 transcripts/day, 10 AI analyses/day. Override: `TRANSCRIPT_DAILY_LIMIT=0` (unlimited). Admin role always bypasses limits.

**Auto-analysis (Sprint 8.3):** When a transcript is saved with `quality_score > 60`, `autoAnalyzeTranscript()` auto-runs a Claude Haiku call to populate `transcript_analysis`. Skips if analysis already exists.

**`TRANSCRIPTS_ENABLED = true`** in `cms/src/pages/SocialOpportunities.jsx` — permanently enabled since Sprint 8.7B. Do NOT set back to false.

**Backfill progress:** Stored in `settings` key `transcript_backfill_state` as JSON.

**Reset rate-limited posts:** `node scripts/reset_ratelimited.mjs`

### Social Intelligence (Sprint 7.4 → 8.7)

The Social Intelligence module uses headless Playwright scraper (`src/connectors/social/fetchers.js`) instead of official APIs. As of Sprint 8.7 both YouTube and Facebook are active.

**Core constraints:**
- **Architecture Invariant**: One source record in the DB strictly equals one content tab/URL.
- **YouTube Strategy**: Do NOT auto-derive URLs. A channel's shorts, videos, and community posts must be registered as three separate sources with an explicit `content_type` (`videos`, `shorts`, or `posts`).
- **Facebook Strategy**: One page = one source with `content_type='posts'` (always). No content_type selector needed in the UI.
- **Platform status**: YouTube ✓ active, Facebook ✓ active (Sprint 8.7), X/Twitter ⛔ DISABLED (`ENABLE_X_MONITOR=false` in `.env`). Instagram, TikTok — stubs return `[]`. Do NOT activate without explicit user authorization.
- **Concurrency guards**: `isSocialRunning` (module-level bool) prevents overlapping social cycles. `isNewsRunning` in `newsMonitor.js` prevents overlapping news cycles. Both use identical skip-and-count pattern (`socialSkippedCycles++`).

**Worker (`src/jobs/socialMonitor.js`):**
Full pipeline: `ensureSchema` → `incrementalStats.reset()` → `startRun('social_monitor')` → per-source: X-flag check → freshness check → `getFetcher(source)` → Facebook `_knownIds` load → fetch → upsert posts → YouTube `last_external_id` update → `clusterNewPosts` → `recalcClusterMetrics` → `markStaleClusters` (48h) → `recalcGapScores` → `fetchPendingTranscripts()` (8 newest) → `backfillTranscripts()` (50 oldest) → `finishRun()`. **Runs every 5 minutes** (`*/5 * * * *` in worker.js — changed from 1 min in Sprint 10.0 to prevent cycle overlap).

**`extractWords(title)` (Sprint 8.8G fix):** Returns `[...new Set(...)]` — words are deduplicated before returning. Without this, a title like `"El Uno X Uno de Brasil\nOLE.COM.AR\nEl Uno X Uno de Brasil"` produces `['brasil','brasil']` → `intersection.length = 2` → false cluster match on a single real word. The dedup ensures threshold ≥2 means ≥2 **distinct** words.

**Key metrics:**
- `viral_score` = `LEAST((total_engagement/1000 + source_count×10)::int, 100)` — capped at 100
- `gap_score` = `1 - max_jaccard(social_cluster.keywords, story_clusters.keywords)` — 1.0 = no news coverage
- `opportunity_score` = `viral_score × gap_score` — editorial priority metric; ≥70 = MUY_ALTA, ≥40 = MEDIA

**YouTube scraper (`src/connectors/social/fetchers.js`):**
- Videos: `waitUntil: 'load'`, selector `a[href*="/watch?v="]` + `h3`, CDN thumbnail `https://i.ytimg.com/vi/{id}/hqdefault.jpg`
- Shorts: `waitUntil: 'domcontentloaded'`, DO NOT use `el.querySelector('[aria-label]')` — captures "Más acciones" button. Use only `linkEl.getAttribute('aria-label')`. oEmbed enrichment via `https://www.youtube.com/oembed?url=...&format=json`.
- Shorts views = 0 is expected — YouTube does not render view counts in the channel shorts shelf DOM.
- Community posts: `ytd-backstage-post-thread-renderer`, no CDN thumbnail (text-only posts).
- **BANNED_TITLES** (never save): `''`, `'short'`, `'sin título'`, `'sin titulo'`, `'untitled'`, `'más acciones'`, `'mas acciones'`

**Facebook scraper (`SocialFetcherPlaywrightFacebook` in `fetchers.js`) — BUG-001 rewrite (2026-07-02, commit 053b081e). ⚠️ Reemplaza el scraping DOM anterior (Mode 1/Mode 2, POST_BODY_SEL, walk-up).**

**Fuente ÚNICA = payload GraphQL estructurado (NO el DOM).** Los permalinks de los posts del feed NO existen en el DOM (solo tarjetas de carrusel `hscroll-child`; los `[role="article"]` son comentarios). Verificado observablemente.

**Flujo:**
- Persistent context (`facebook-profile/`) + **inyección directa de cookies** con `context.addCookies()` leyendo `facebook_cookies.json` DESPUÉS de `launchPersistentContext`. ⚠️ `launchPersistentContext` **IGNORA silenciosamente `storageState`** — por eso hay que inyectar a mano. Sin sesión válida Facebook sirve un muro de login (scrollHeight 900 vs 4692 logueado) con ~1 post de preview.
- `context.on('response')` registrado ANTES de `goto` captura respuestas `/api/graphql`. `scrollTo(0, document.body.scrollHeight)` (NO `scrollBy` fijo) dispara la paginación del feed.
- **Segunda fuente**: los `<script>` server-rendered (RelayPrefetchedStreamCache) se parsean con el mismo walker — cubre el batch inicial si la paginación XHR no dispara.
- Dos helpers a nivel de módulo: `_parseGraphQLBody(body)` (maneja JSON único, prefijo `for(;;);`, o JSONL con `@defer`) y `_walkGraphQLStories(root)`.
- `_walkGraphQLStories`: ancla en cada objeto con `post_id` numérico (el feed unit `data.node`/`edges[N].node`), extrae del subtree acotado (se detiene al bajar a un `post_id` distinto): url (`/posts|/videos|/reel/`), `message.text` (más largo), `creation_time`, `image.uri`, `reaction_count.count`, `playable_url`.
- `external_id` = **`fb${post_id}`** (id numérico estable de Facebook — ya NO content-hash MD5).
- Smart stop: precarga `_knownIds` (últimos 100 external_id); corta cuando 2 scrolls seguidos solo traen posts conocidos. `_parseFbMetric(str)` maneja "1.2K", "5 mil".

**⚠️ REGLA — antes de tocar el scraper, verificar que las cookies NO estén vencidas** (muro de login = mismo síntoma que parser roto = 0 posts). Verificación 20s: contexto limpio + `addCookies` + goto facebook.com → logueado si `title="(N) Facebook"`, `login=false`, `scrollHeight` grande. Renovar: exportar cookies frescas (Cookie-Editor JSON) a `facebook_cookies.json` (críticas: `xs`+`c_user`, van juntas) + borrar `facebook-profile/Default/Network/Cookies`. Detalle memoria: memory/bug_001_facebook_graphql_fix.md.

**⚠️ BUG-002 ABIERTO (asociación título↔URL):** riesgo latente — el parser toma el PRIMER url del subtree (suele ser `attachments[...].url`). Para self-posts == permalink (verificado 90/90 + 19/19 real path, sin divergencias). Pero para posts que COMPARTEN contenido ajeno, `attachment.url` apuntaría a otro contenido. Fix recomendado (no aplicado, falta ejemplo concreto): extraer permalink de `comet_sections.timestamp.story.url`, nunca de `attachments`. Detalle: memory/bug_002_graphql_story_association.md.

**Common:**
- `SocialFetcherGraphApiFacebook` (wrapper): checks `source.graph_api_supported` first — if `false`, skips API entirely and goes straight to Playwright. On `OAuthException` (code 10), persists `graph_api_supported=false` in DB so all future cycles skip the HTTP round-trip. On success, persists `true`.
- All 18 current Facebook sources are marked `graph_api_supported=false` in DB (confirmed via logs — none are owned by the token). The Graph API call is effectively dead-code for Panorama's source list.
- Facebook is **now included in the automatic worker** (Sprint 10.0). `getFetcher()` returns `SocialFetcherGraphApiFacebook` → hits Playwright directly (via `graph_api_supported=false` fast-path). Freshness windows (15 min) prevent redundant scrapes.

**X/Twitter scraper (`SocialFetcherX` in `fetchers.js`) — Sprint X:**
- **Primary**: Playwright + X session cookies → intercepts internal GraphQL `UserTweets` API. Same pattern as Facebook mode 2.
- **Fallback**: Nitter RSS instances (most dead in 2026 — tried as cheap attempt before failing cleanly).
- **Required env vars** (in `.env`):
  - `X_AUTH_TOKEN` — value of `auth_token` cookie from a logged-in x.com session (DevTools → Application → Cookies → .x.com)
  - `X_CT0` — value of `ct0` cookie from the same session
  - Cookie lifetime: typically 1–3 months. When expired, scraper falls back to Nitter (which likely returns 0).
- **Dedup**: `external_id` = tweet status ID (numeric). `ON CONFLICT (platform, external_id)` handles duplicates.
- **`_debug` in check endpoint**: `auth_configured: true/false` + renewal hint when 0 posts returned.

**Sprint Performance 10.0 — Social Intelligence Incremental Fetching (completed 2026-06-19)**

**New DB columns on `social_sources`:**
- `last_external_id VARCHAR(500)` — YouTube only. Newest `external_id` seen on last successful fetch. Used for smart stop: `posts.splice(cutIdx)` when found in results. Populated automatically by worker after each YouTube fetch. **Safe design:** 1 source row = 1 content_type (confirmed in audit) — no mixing risk.
- `freshness_window_seconds INTEGER DEFAULT 900` — per-source override for freshness check. Defaults: FB/YT-videos/YT-posts = 900s (15 min), YT-shorts = 1800s (30 min). Configurable per row.
- `graph_api_supported BOOLEAN` — tri-state: `NULL`=untried, `true`=API works, `false`=skip to Playwright. Auto-updated on each `SocialFetcherGraphApiFacebook` call.

**New `social_posts` index needed (Sprint 10.1 audit finding — NOT YET CREATED):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_posts_source_captured
  ON social_posts (source_id, captured_at DESC);
```
Required for the Facebook `_knownIds` query: `WHERE source_id=$1 ORDER BY captured_at DESC LIMIT 100`. Currently uses `idx_social_posts_source` (source_id only) + in-memory sort.

**Freshness check (in worker loop, before `getFetcher`):**
```js
if (source.last_checked && (Date.now() - new Date(source.last_checked).getTime()) < freshnessWindow * 1000) {
  sourcesSkipped++; return; // logs: [SocialMonitor] Skip platform/name (checked N min ago)
}
```

**Facebook smart stop (post BUG-001 rewrite):**
- Loads `_knownIds` = Set of last 100 `external_id` (now `fb${post_id}`) for that source, from DB before `fetchLatest()`
- Per scroll: if every newly-captured `post_id` this round is already in `_knownIds` for 2 consecutive scrolls → `break` + `incrementalStats.facebookSmartStops++`. (Old DOM version counted 3 consecutive known via content-hash — replaced.)
- `_knownIds` is a duck-typed property on the `source` object — ephemeral, lives only in the `p-limit` closure. Fallback `|| new Set()` safe.

**YouTube smart stop (in `_fetchVideos`, `_fetchShorts`, `_fetchPosts`):**
- Receives `lastExternalId` from `fetchLatest()` via `source.last_external_id`
- After scroll loop: `posts.findIndex(p => p.external_id === lastExternalId)` → `posts.splice(cutIdx)` if found
- Logs: `[YouTube/VIDEOS] Smart stop — N new items (known: <id>)`

**`incrementalStats` export (in `fetchers.js`):**
```js
export const incrementalStats = { facebookSmartStops: 0, youtubeSmartStops: 0, reset() {...} }
```
Imported in `socialMonitor.js`. Reset at cycle start. Reported in "Social Optimization Report" block at end of each cycle.

**`src/services/browserLifecycleLogger.js` — Logging regression fix (2026-06-19):**
- `logBrowserLifecycle()` no longer calls `new Error().stack` — that was prepending "Error:" to every log line, creating hundreds of false `[PAGE_CLOSED]` stack traces.
- `watchBrowserDisconnect()` removed from `fetchers.js`, `transcripts.js`, `editorial-dossiers.js` — those files already log browser close in `finally` blocks; the disconnect listener was double-firing. Kept only in `BrowserManager.js` (singleton, unexpected disconnect is meaningful there).
- Clean log format: `[PAGE_CLOSED] source=YouTube/posts timestamp=2026-...` (single line, no stack).

**Re-clustering:** Run `node scripts/recluster_all.js` to reset and rebuild all clusters from scratch.

**`content_type` in cluster posts query:** Derived from URL patterns (not from `social_sources.content_type` column) to ensure accuracy. YouTube shorts/videos/posts detected from URL shape.

**SocialSources UI (`cms/src/pages/SocialSources.jsx`):**
- `PLATFORM_META`: YouTube, Facebook, X `active: true`; Instagram, TikTok `active: false` (⏳ Pronto badge)
- X sources: show `handle` field (obligatorio) + hint to get `auth_token`/`ct0` cookies from browser DevTools
- Content_type selector shown only for YouTube — Facebook always defaults to `posts`
- URL placeholder is dynamic per platform

**Platform filter in UI (`cms/src/pages/SocialIntelligence.jsx`) — Sprint 8.8F:**
- `ACTIVE_PLATFORMS` constant: `[{value:'youtube'}, {value:'facebook'}]`
- `filterPlatform` state (default `''` = all) + select dropdown beside region selector
- `filteredClusters`, `filteredTop`, `filteredGapItems` all apply `.filter(c => !filterPlatform || (c.platforms||[]).includes(filterPlatform))`
- `DrillDownModal` receives `platform={filterPlatform}` prop → appends `?platform=` to `/clusters/:id/posts` API call
- "Ver en YouTube" label is platform-aware: `p.platform === 'facebook' ? 'Facebook' : 'YouTube'`

**API endpoints (`src/routes/social.js`):**
- `GET /social/sources` — live JOIN for `post_count` + `MAX(p.captured_at) AS last_post_at` (Sprint 8.8D)
- `GET /social/clusters` — includes `opportunity_score`, `opportunity_tier`, `platforms[]`, `regions[]`, `sources[]` via LEFT JOIN ARRAY_AGG (Sprint 8.8F)
- `GET /social/content-gap` — sorted by `opportunity_score DESC`
- `GET /social/stats` — includes `opportunities_muy_alta/media/baja`, `youtube_sources`, `facebook_sources`, `sources_active`, `sources_total` (Sprint 8.8C)
- `GET /social/health` — 10 operational metrics
- `GET /social/clusters/:id/posts` — `captured_at ASC`, includes `content_type` (URL-derived), `has_analysis`; accepts `?platform=` filter (Sprint 8.8D)
- `POST /social/sources/:id/check` — manual scrape (NOT in `social_fetch_logs`)
- `GET /social/transcripts/audit` — coverage + per_source + languages
- `GET /social/transcripts/health` — provider + coverage + quality + errors (Sprint 8.7)
- `GET /social/transcripts/daily-usage` — `{transcripts:{used,limit}, ai_analyses:{used,limit}}`
- `POST /social/posts/:id/transcript` — on-demand fetch, dispatches by `TRANSCRIPT_PROVIDER`
- `GET /social/posts/:id/transcript` — get stored transcript (for AnalysisModal)
- `POST /social/posts/:id/analyze` — AI analysis on-demand (daily limit)
- `POST /social/posts/:id/dossier` — executive dossier from transcript (requires transcript row)

## Environment

Requires a `.env` file at the root:

```
PORT=5000
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/newsdb
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

Each frontend reads `VITE_API_URL` from its own `.env` (Vite convention) to point at the backend.

### Knowledge Graph (Sprint 8.6A) — ⚠️ Calidad pendiente de corrección

`src/routes/editorial-graph.js` — montado en `/editorial`. Tres endpoints: trending, entity profile, related events.
`cms/src/pages/KnowledgeGraph.jsx` — UI completa. `cms/src/pages/EditorialDossierPage.jsx` — tab "🔗 Relacionados".

**Problemas conocidos (auditados 2026-06-13, sin corrección ejecutada):**
- El pipeline NER fragmentó cada persona en 2–5 entidades (`Milei` + `Javier Milei` + `Javier Milei Es` = IDs distintos). Los grafos de relaciones son paralelos, no fusionados.
- Buscar "Javier Milei" devuelve solo 2 entidades (ILIKE exacto). El alias dominante `Milei` queda invisible.
- "Tren de Aragua" → 0 resultados (NER lo dividió en `Tren` + `Aragua` por la preposición "de").
- 195 entidades son ruido (títulos de artículos, siglas de 1 char, concatenaciones NER de 4+ palabras).
- Plan de corrección en memoria: [[knowledge-graph-audit]] — Opciones A (canonical_id), B (búsqueda por tokens), C (filtro de ruido inmediato).

### OpenClaw (Editorial Assistant) — Session Context & Instrumentation (June 2026)

`src/routes/openclaw.js` — POST /openclaw/ask endpoint. Conversational editorial assistant with request-level instrumentation.

**Architecture:**
- **RetrievalPlanner** (STEP 3) — Explicit decision tree determining `retrievalEntity` (global vs. entity-specific search)
- **GLOBAL_INTENTS Set** — `{what_happening, trends, opportunities, coverage_changes}` — blocks session reuse absolutely
- **Follow-up Detection** — `isFollowUpQuestion()` detects true context-dependent queries before allowing session.lastEntity reuse
- **Request Correlation** — Every request gets unique `requestId` prefix on all log lines (STEP 1-8)

**Instrumentation Levels:**
- STEP 1: Parser output (intent, entity, timeframe)
- STEP 2: Session state (lastEntity from prior query)
- STEP 3: Intent Analysis (global vs. entity, decision gates, session check)
- STEP 4: Retrieval results (counts per module before/after filtering)
- STEP 5: Editorial Briefing (max items selected for LLM)
- STEP 6: LLM call (context length, model)
- STEP 7: Enrichment (themes mapped to sources)
- STEP 8: Final summary (retrieved vs. briefing counts, total elapsed time)

**Audit Log Endpoint:**
- `GET /openclaw/audit-log` — Returns in-memory audit buffer (500 max lines, all requests with requestId correlation)
- Allows inspection of exact flow without needing server logs
- Useful for debugging: "¿Qué pasó con X?" → "¿Qué está pasando hoy?" sequence

**Key Design Decision (June 24):**
Replaced variable-mutation pattern (where `finalEntity` was reassigned across branches) with explicit conditional assignment. Makes decision tree obvious at glance + simplifies instrumentation proof.

**Testing Sequence for Session Contamination:**
1. Query: "¿Qué pasó con Boca?" → Check Editorial count = N
2. Query: "¿Qué está pasando hoy?" → Check Editorial count ≠ N (should be global top-100)
3. Inspect `GET /openclaw/audit-log` → STEP 3 logs should show:
   - Query 1: "INTENT IS GLOBAL ('what_happening') BUT HAS ENTITY" → entity-specific search
   - Query 2: "INTENT IS GLOBAL ('what_happening') + NO SPECIFIC ENTITY" → global search, "Session.lastEntity was: Boca (NOT USED)"

### MCP Server (June 2026) — Semantic API for Panorama

`mcp-server/src/` — Official API layer. 25 tools, organized by domain (Monitor, Story, Content, Editorial, Social Intelligence, Legacy).

**Philosophy**: Claude Desktop is just one client. Panorama is the brain. All intelligence lives in Panorama, never in Claude.

**Status**: Mature. Not adding tools. Improving editorial rigor.

**Read detailed architecture in**:
- `memory/mcp_architecture_approved.md` — Locked specification (5 tool categories, 6 immutable rules)
- `memory/social_intelligence_mcp_tools.md` — Social Intelligence domain implementation (5 new tools, June 27)
- `memory/editorial_reasoning_guide.md` — How Claude interprets Panorama (principles, rigor, comparison structure)
- `memory/mcp_posts_domain_production_ready.md` — Posts domain complete (8 tools, all tested, June 29)

### MCP Tool Naming (STRICT)

**All MCP tool names MUST use underscores ONLY** — No dots (`.`) allowed.

Valid pattern: `^[a-zA-Z0-9_-]{1,64}$`

✅ **Correct:**
```javascript
server.registerTool("posts_create", ...)
server.registerTool("posts_publish", ...)
server.registerTool("social_dashboard", ...)
```

❌ **Wrong:**
```javascript
server.registerTool("posts.create", ...)      // ERROR: dot not allowed
server.registerTool("social.dashboard", ...)  // ERROR: dot not allowed
```

**Why:** MCP schema validation rejects dots in tool names. See `memory/mcp_naming_rules.md` for full details.

### Article Lookup Pattern — Slug/UUID Dual Support (Posts Domain)

All article endpoints (`/articles/:id/*`) accept BOTH slug and UUID identifiers:

**Pattern (in all POST/PUT handlers):**
```javascript
const { id } = req.params;  // Can be slug OR UUID

// Step 1: Resolve to article and get real UUID
const current = await query(
  `SELECT id, ... FROM articles WHERE id::text = $1 OR slug = $1`,
  [id]
);
if (!current.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
const articleId = current.rows[0].id;  // Get real UUID

// Step 2: All subsequent queries use UUID only (type safety)
const r = await query(
  `UPDATE articles SET ... WHERE id=$1`,
  [articleId]  // Not id parameter, which might be slug
);
```

**Why:** SEO-friendly URLs use slugs (e.g., `test-article-from-mcp-auth-3`), but UUIDs ensure type safety in PostgreSQL queries. Resolve once, use UUID for all subsequent operations.

**Applied Endpoints:**
- `POST /articles/:id/publish`
- `POST /articles/:id/schedule`
- `POST /articles/:id/unpublish`
- `GET /articles/:id`
- `PUT /articles/:id`
- `DELETE /articles/:id`

**PostgreSQL Type Casting Note:**
Do NOT use `id=$1::uuid` because PostgreSQL fails when $1 is a slug. Instead, use:
- `id::text = $1 OR slug = $1` — let PostgreSQL choose the path based on column types

### Posts Publishing Validation (June 29, 2026)

**Principle:** Minimal validation. Only essential structural requirements.

**Required for publication:**
- `title` — must exist and be non-empty
- `slug` — must exist and be unique (generated at creation)

**NOT required:**
- `image_url` — featured image optional
- `category_id` — articles can publish without category
- `excerpt` — optional, no length minimum
- `word_count` — no minimum, any length accepted

**Validation response (on error):**
```json
{
  "error": "VALIDATION_FAILED",
  "message": "Article must have title and slug",
  "details": {
    "title": true/false,
    "slug": true/false
  }
}
```

**Force publish:**
MCP role (service account) can use `force_publish: true` to bypass any validation. Admin role same.

```javascript
POST /articles/article-slug/publish
Authorization: Bearer MCP_SERVICE_TOKEN
Content-Type: application/json

{
  "force_publish": true
}
```

### Editorial Auto-Review Flow (June 29, 2026)

**Principle:** After drafting an article, Claude automatically reviews and corrects it against professional editorial standards. No human intervention required in normal cases.

**When to trigger:**
- After article draft is complete
- Before calling `posts_create()`
- As part of editorial research → draft → review → publish pipeline

**Process (automatic):**

1. **Editorial Review** (8 checks)
   - Narrative style (no opinion, emotional language, blog voice)
   - Lead structure (5Ws implicit: who, what, when, where, why)
   - Inverted pyramid (structure)
   - Neutrality (no interpretation, evaluative verbs)
   - Evidence (attribution, sourcing)
   - Chronology (events in sequence)
   - Coherence (no contradictions, consistent voice)
   - Quality (professional journalist tone, not AI)

2. **Auto-Correct** (if any check fails)
   - Identify failures
   - Rewrite only affected sections
   - Re-run checks
   - Repeat max 3 times
   - Flag if 3 attempts still fail (blocking error → human review)

3. **SEO Review** (if Editorial passes)
   - Title (50-60 chars, includes keyword)
   - Meta description (120-160 chars)
   - Slug (lowercase, hyphenated)
   - Auto-correct if needed

4. **Publication Review** (if SEO passes)
   - Title, content, slug, category, image (if required)
   - Auto-fill missing metadata
   - Then: `posts_create()` → `posts_update()` → `posts_publish()`

**What NOT to do:**
- ❌ Ask user if draft is ready
- ❌ Show detailed check results (only show final article)
- ❌ Wait for approval between review cycles
- ❌ Publish if any check fails without auto-correction

**What to do:**
- ✅ Correct issues silently
- ✅ Re-evaluate automatically
- ✅ Proceed to publication once all checks pass
- ✅ Only escalate if blocking error (no auto-fix possible)

**Implementation:**
See `memory/editorial_review_checklist.md` for all 8 checks and correction criteria.
See `memory/editorial_auto_correction_loop.md` for auto-correction workflow.

---

## Key Conventions

- Spanish is used in documentation files and some UI strings; English is used in code identifiers and comments.
- New API routes go in `src/routes/`, registered in `src/app.js`.
- Frontend API calls always go through `src/api.js` in the respective app, not raw `fetch`.
- CMS pages with AI-assisted editing use TipTap extensions from `cms/src/editor/`.
- The `admin/` directory at root is a legacy artifact — do not add new code there.
