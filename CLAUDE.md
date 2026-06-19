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
- `detectStoryCategory(title, storyType)` — scoring por keywords (CK4): cuenta cuántos patrones regex matchean por categoría; mayor puntaje gana; empates por precedencia. 10 categorías: `judicial > security > international > politics > economy > health > technology > sports > entertainment > society`. `storyType=sports/politics` es override directo.
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
- **Platform status**: YouTube ✓ active, Facebook ✓ active (Sprint 8.7), X/Twitter ✓ active (Sprint X). Instagram, TikTok — stubs return `[]`. Do NOT activate without explicit user authorization.

**Worker (`src/jobs/socialMonitor.js`):**
Full pipeline: `ensureSchema` → `startRun('social_monitor')` → `getFetcher(source)` (routes youtube/facebook to their Playwright fetchers) → fetch per source → upsert posts → `clusterNewPosts` (word-overlap, ≥2 shared **unique** words) → `recalcClusterMetrics` → `markStaleClusters` (48h) → `recalcGapScores` (Jaccard vs `story_clusters.keywords`) → `fetchPendingTranscripts()` (8 newest, Playwright UI) → `backfillTranscripts()` (50 oldest) → `finishRun()`. Runs every 30 minutes.

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

**Facebook scraper (`SocialFetcherPlaywrightFacebook` in `fetchers.js`) — Sprint 8.8K + 8.8L:**

**Mode 1 — Public pages (unauthenticated, `[role="article"]`):**
- Opens a fresh unauthenticated browser (no cookies)
- Sprint 8.8K: public layout serves each post as a top-level `[role="article"]` with a timestamp permalink link
- `[role="article"]` in authenticated layout = comment elements (NOT posts) — this mode avoids that
- DOM recycling: Facebook removes scrolled-past posts. Extract at each scroll, accumulate in a `Map` keyed by first-line of text. Stop after 2 consecutive scrolls with no new entries.
- `external_id` = content hash: `fb` + MD5(`${source.id}:${text.slice(0,200)}`).slice(0,14)
- `_parseFbMetric(str)` handles "1.2K", "5 mil", "2 millones"

**Mode 2 — Login-walled pages (authenticated, GraphQL interception, Sprint 8.8L):**
- Triggered when: 0 `[role="article"]` after 25s AND body contains "no está disponible" / "not currently available"
- Opens persistent context (`facebook-profile/` dir) with stored cookies
- Registers `context.on('response')` BEFORE `page.goto()` to capture all GraphQL feed responses
- Facebook loads posts via `POST /api/graphql` → responses contain `data.node.timeline_list_feed_units.edges[]`
- Each `edge.node` (type `Story`) has:
  - `post_id` → numeric Facebook post ID
  - `comet_sections.timestamp.story.creation_time` → Unix timestamp
  - `comet_sections.timestamp.story.url` → clean permalink
  - `comet_sections.content.story.comet_sections.message(.story).message.text` → post text
  - `attachments[0].styles.attachment.all_subattachments.nodes[0].media.image.uri` → thumbnail
  - `reaction_count.count` (found recursively in `comet_sections`) → likes
- Pagination: `window.scrollTo(0, document.body.scrollHeight)` triggers GraphQL pagination requests. Fixed-pixel `scrollBy` does NOT reach the scroll threshold → must use `scrollHeight`.
- Cookie bootstrap: first-run reads `facebook_cookies.json` → loads into persistent context → writes `.initialized` marker so subsequent runs skip re-injection.

**Common:**
- `SocialFetcherGraphApiFacebook` (wrapper): tries Graph API token first → falls back to `SocialFetcherPlaywrightFacebook` on any API error.
- Facebook is **on-demand only** (no automatic worker). `getFetcher()` returns `null` for facebook → worker skips. Only `POST /sources/:id/check` triggers a scrape.

**X/Twitter scraper (`SocialFetcherX` in `fetchers.js`) — Sprint X:**
- **Primary**: Playwright + X session cookies → intercepts internal GraphQL `UserTweets` API. Same pattern as Facebook mode 2.
- **Fallback**: Nitter RSS instances (most dead in 2026 — tried as cheap attempt before failing cleanly).
- **Required env vars** (in `.env`):
  - `X_AUTH_TOKEN` — value of `auth_token` cookie from a logged-in x.com session (DevTools → Application → Cookies → .x.com)
  - `X_CT0` — value of `ct0` cookie from the same session
  - Cookie lifetime: typically 1–3 months. When expired, scraper falls back to Nitter (which likely returns 0).
- **Dedup**: `external_id` = tweet status ID (numeric). `ON CONFLICT (platform, external_id)` handles duplicates.
- **`_debug` in check endpoint**: `auth_configured: true/false` + renewal hint when 0 posts returned.

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

## Key Conventions

- Spanish is used in documentation files and some UI strings; English is used in code identifiers and comments.
- New API routes go in `src/routes/`, registered in `src/app.js`.
- Frontend API calls always go through `src/api.js` in the respective app, not raw `fetch`.
- CMS pages with AI-assisted editing use TipTap extensions from `cms/src/editor/`.
- The `admin/` directory at root is a legacy artifact — do not add new code there.
