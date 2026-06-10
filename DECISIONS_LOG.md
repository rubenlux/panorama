# DECISIONS_LOG.md — Architecture Decision Record

Decisions that are non-obvious from the code. Ordered newest-first.

---

## 2026-06-09 — Cluster window is 6 hours, not 24 hours

**Context:** Sprint 5.3, choosing the `CLUSTER_WINDOW_HOURS` constant in `newsMonitor.js`.

**Decision:** 6 hours.

**Reasoning:** A news cycle for a breaking story typically spans 4–8 hours. 24 hours is too long — it would merge morning and evening coverage of the same entity into one cluster even when they concern completely separate events. 6 hours balances cluster coherence with separation of distinct news moments.

**Implication:** If the same entity trends again after 6 hours with no activity, a new cluster is created.

---

## 2026-06-09 — MONITOR_STOPWORDS breaks entire sequences, not just the word

**Context:** Sprint 5.3, NER design in `extractMonitorEntities()`.

**Decision:** Any word in `MONITOR_STOPWORDS` terminates the current proper-noun sequence (calls `flush()`).

**Reasoning:** "Horóscopo Piscis" — we don't want "Piscis" to survive as a single entity. By making "Horóscopo" a sequence terminator, "Piscis" becomes a solo word and is filtered by the length/caps rule. Same for "Impactante Derrota" → "Derrota" alone is filtered. If only the stopword itself were dropped, partial sequences would leak.

---

## 2026-06-09 — entity_origin is a VARCHAR(20) CHECK, not a boolean flag

**Context:** Sprint 5.1, choosing how to separate research vs. monitor entities.

**Decision:** `entity_origin VARCHAR(20) NOT NULL CHECK (... IN ('RESEARCH','MONITOR','SOCIAL','MANUAL'))` rather than `source VARCHAR(10)` or a boolean `is_monitor`.

**Reasoning:** The user explicitly requested forward-compatibility for social (Twitter/X, Reddit) and YouTube connectors. A two-value boolean forecloses that. The CHECK constraint documents the valid values at the DB level, failing fast if a future connector sends an invalid origin.

---

## 2026-06-09 — Research enrichment caps at TOP 10 sources, not all

**Context:** Sprint 5.2, `_enrichSources()` in `research.js`.

**Decision:** Only the top 10 sources by relevance score get full-text fetched. Sources 11+ use RSS description.

**Reasoning:** Full-text fetching is sequential with 10s timeouts. At 10 sources that's up to ~100s of I/O before Claude can start. Beyond 10, the marginal benefit is low because sources are ranked by relevance — the 11th source is less relevant than the 10th. `max_tokens: 3000` also imposes a practical ceiling on how much text Claude can process anyway.

---

## 2026-06-09 — Summarization fires after 3 articles OR 2 sources (OR, not AND)

**Context:** Sprint 5.3, `CLUSTER_SUMMARY_MIN_ARTICLES` / `CLUSTER_SUMMARY_MIN_SOURCES` thresholds.

**Decision:** OR condition — either 3 articles from any sources, or 2 distinct sources.

**Reasoning:** 2 distinct sources is a stronger editorial signal than 3 articles from the same outlet. A story covered by both La Nación and Clarín is more significant than 3 brief mentions on a single wire. The OR allows summaries to fire earlier on cross-outlet stories.

---

## 2026-06-09 — `summarizePendingClusters()` is fire-and-forget (non-blocking)

**Context:** Sprint 5.3, integration in `runNewsMonitor()`.

**Decision:** Called as `summarizePendingClusters().catch(...)` without `await`.

**Reasoning:** Claude API calls for summaries take 3–10 seconds. The monitor job runs on a timer and must not block subsequent cycles. A summarization that takes 8 seconds should not delay the next RSS poll. The cluster's `status = 'summarizing'` DB flag prevents double-processing across concurrent cycles.

---

## 2026-06-09 — `/trends` API requires auth (requireAuth on all endpoints)

**Context:** Sprint 5.3, `src/routes/trends.js`.

**Decision:** All 5 endpoints require JWT authentication.

**Reasoning:** Trend intelligence is an editorial tool that reveals unpublished editorial signals (what topics the newsroom is tracking). It should not be publicly accessible. The public web frontend will get a separate, limited trending endpoint if needed.

---

## 2026-06-09 — `createDossierFromTrend` pre-seeds research_sources from cluster articles

**Context:** Sprint 5.3, `POST /trends/:id/create-dossier`.

**Decision:** The endpoint inserts cluster articles as `research_sources` before the research pipeline runs.

**Reasoning:** Without pre-seeding, the research pipeline would re-fetch the same RSS feeds and might not find the specific articles that defined this cluster (especially if they're more than 30 minutes old and no longer in the top RSS results). Pre-seeding ensures the dossier is grounded in the actual articles that triggered the trend.

---

## 2026-06-08 — `requireAuth` is a named export, not default

**Context:** Sprint 5.1, multiple route files needed the middleware.

**Decision:** `import { requireAuth } from '../middleware/auth.js'` — named export.

**Reasoning:** `auth.js` exports multiple things (`requireAuth`, token utilities). Using a named export is the correct ES module pattern when the module isn't a single-export file. Using `import requireAuth from ...` (default) would silently import `undefined` and fail at runtime with no obvious error.

---

## 2026-06-08 — JWT `sub` is a UUID string, not an integer

**Context:** Found during Sprint 5.1 audit of `verify` endpoint.

**Decision:** Always use `req.user?.sub` directly as UUID string. Never `parseInt(req.user?.sub)`.

**Reasoning:** Users table uses UUID primary keys. The JWT `sub` claim contains the UUID string. `parseInt('550e8400-...')` returns `NaN`, silently corrupting `created_by` foreign keys and user lookups. The fix pattern is `req.user?.sub || null`.
