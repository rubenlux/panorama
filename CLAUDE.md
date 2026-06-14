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
- **Platform status**: YouTube ✓ active, Facebook ✓ active (Sprint 8.7). Instagram, X, TikTok — stubs return `[]`. Do NOT activate without explicit user authorization.

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

**Facebook scraper (`SocialFetcherPlaywrightFacebook` in `fetchers.js`) — Sprint 8.8B/8.8D/8.8F/8.8G:**
- Uses `launchPersistentContext(FB_PROFILE_DIR)` to preserve cookies/session across runs
- Cookie bootstrap on first run from `facebook_cookies.json` → `.initialized` marker prevents re-injection
- Full 8-class Stylex selector: `div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl`
- **DO NOT use `[role="article"]`** — those are comment elements, not post bodies
- DOM recycling: Facebook removes scrolled-past posts from DOM. Extract at EACH scroll step and accumulate in a `Map` keyed by first line of text. Stop after 2 consecutive scrolls with no new entries (`noGrowthStreak`).
- Noise filter `isNoise()`: rejects sidebars, contact info, phone numbers, "Ver más comentarios", domain-only strings, **video player overlays** (`\n\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}` — format `0:02 / 0:50`), and **Facebook page metadata headers** (`\n(Canal|Página|Grupo)\s*·\s*[\d]` — e.g. `TN Todo Noticias\nCanal · 39 mil miembros`). The Stylex selector matches video player elements and page info cards; these filters remove them.
- Walk-up (max 25 levels) for thumbnail, video_url, likes count
- **Thumbnail filter (Sprint 8.8F):** `img[src*="fbcdn"]` also matches `emoji.php` and `rsrc.php` (UI sprites). Use `querySelectorAll(...).find(i => !i.src.includes('emoji.php') && !i.src.includes('rsrc.php'))` — never `querySelector` directly.
- **URL field known issue:** Walk-up at depth 15-25 becomes a common ancestor → URL field is often wrong (sibling post URL for Olé, page root for TN/NF). `external_id` is NOT affected (uses content hash). "Ver original" links may be broken. Fix deferred — not blocking for engine.
- **`external_id` = content hash ALWAYS** — `fb` + MD5(`${source.id}:${text.slice(0,200)}`).slice(0,14). Never use URL-derived IDs: the walk-up at depth 15-25 becomes a common ancestor of multiple post bodies, returning the same sibling post URL for every post in the page.
- `_parseFbMetric(str)` handles "1.2K", "5 mil", "2 millones"
- **`SocialFetcherGraphApiFacebook`** (wrapper class): uses `FB_PAGE_ACCESS_TOKEN` if set; falls back to `SocialFetcherPlaywrightFacebook` when no token or when API returns permissions error. The `/check` endpoint imports this wrapper — functionally correct via fallback.
- Facebook is **on-demand only** (no automatic worker). `getFetcher()` returns `null` for facebook → worker skips. Only `POST /sources/:id/check` triggers a scrape.

**Re-clustering:** Run `node scripts/recluster_all.js` to reset and rebuild all clusters from scratch.

**`content_type` in cluster posts query:** Derived from URL patterns (not from `social_sources.content_type` column) to ensure accuracy. YouTube shorts/videos/posts detected from URL shape.

**SocialSources UI (`cms/src/pages/SocialSources.jsx`):**
- `PLATFORM_META`: YouTube and Facebook `active: true`; Instagram, X, TikTok `active: false` (⏳ Pronto badge)
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
