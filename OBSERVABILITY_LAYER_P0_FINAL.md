# Observability Layer — P0 Implementation (Refactored)

**Status**: ✅ Code Complete & Refactored (Ready for Deployment)  
**Date**: 2026-06-29 (Revised)  
**Purpose**: Enable data-driven decisions for crawler, coverage, social, and SEO pipelines

## Key Changes from Initial Design

This refactored version addresses user feedback:

1. ✅ **No schema creation in worker code** — All tables created by SQL script (runs once)
2. ✅ **Removed content_preview** — Use content_length + content_hash instead
3. ✅ **Replaced error_message TEXT** — Use reason (codes) + details JSONB
4. ✅ **Removed html_quality_score persistency** — Only store boolean checks
5. ✅ **Unified domain_profiles** — Single source of truth (no separate crawler_strategies)
6. ✅ **Added crawl_session** — Groups all attempts for one article
7. ✅ **Added domain_failures** — Aggregated view (critical for dashboard)

## Tables Created

All tables created in: `scripts/migrate_observability_layer.sql`

Run once manually:
```bash
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
```

### 1. `crawl_session` — Groups all attempts for one article

```sql
CREATE TABLE crawl_session (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES monitored_articles(id),
  domain TEXT NOT NULL,
  strategy TEXT NOT NULL,                    -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
  final_status TEXT,                         -- SUCCESS | FAILED | PAYWALL (set after all attempts)
  final_method TEXT,                         -- fetch | playwright | paywall | rss_only
  total_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Why**: Allows reconstructing the full story: Article #123 → HTTP (403) → Playwright (timeout) → Retry (success). Single ID groups them.

### 2. `crawl_attempts` — Individual attempts within a session

```sql
CREATE TABLE crawl_attempts (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES crawl_session(id),
  article_id UUID NOT NULL,
  domain TEXT NOT NULL,
  attempt_number INTEGER,                   -- 1, 2, 3...
  stage TEXT,                               -- HTTP | PLAYWRIGHT | RETRY | VALIDATION
  status TEXT,                              -- SUCCESS | FAILED
  reason TEXT,                              -- timeout | 403 | cloudflare | empty_html | ssl | ...
  http_status INTEGER,                      -- 200 | 403 | 404 | 429 | 500 | null
  duration_ms INTEGER,
  bytes_downloaded INTEGER,
  content_length INTEGER,                   -- text length (null if failed)
  content_hash VARCHAR(64),                 -- SHA256 for dedup detection
  details JSONB,                            -- {error_class, context} for exceptions
  created_at TIMESTAMPTZ
);
```

**Kept small:** Only facts (reason codes, not full error stacks). Details stored as JSON if needed.

### 3. `domain_profiles` — Learned strategy (auto-adapts)

```sql
CREATE TABLE domain_profiles (
  domain TEXT PRIMARY KEY,
  total_attempts INTEGER,
  success_http INTEGER,
  success_playwright INTEGER,
  success_retry INTEGER,
  failed_http INTEGER,
  failed_playwright INTEGER,
  failed_retry INTEGER,
  avg_time_http_ms FLOAT,
  avg_time_playwright_ms FLOAT,
  avg_time_retry_ms FLOAT,
  strategy TEXT DEFAULT 'HTTP_ONLY',        -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT | AUTO
  manual_override BOOLEAN DEFAULT FALSE,    -- admin forced strategy = don't auto-learn
  last_failure_reason TEXT,
  consecutive_failures INTEGER,
  updated_at TIMESTAMPTZ
);
```

**Single source of truth**: No separate `crawler_strategies` table. Strategy + override in one place.

### 4. `domain_failures` — Aggregated failure summary (for dashboard)

```sql
CREATE TABLE domain_failures (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  reason TEXT NOT NULL,                     -- 403 | cloudflare | ssl | timeout | ...
  count INTEGER,
  percentage FLOAT,                         -- % of all failures for this domain
  updated_at TIMESTAMPTZ,
  UNIQUE(domain, reason)
);
```

**Critical**: This is what you see in the dashboard. Example:

```
Reuters
  403           | 154 (45%)
  Cloudflare    | 32  (9%)
  SSL Error     | 8   (2%)
  Timeout       | 95  (28%)
```

### 5. `pipeline_decisions` — Generic decision log (reusable)

```sql
CREATE TABLE pipeline_decisions (
  id BIGSERIAL PRIMARY KEY,
  module TEXT,                              -- crawler | coverage | social | seo | editorial
  entity_id UUID,                           -- article_id | cluster_id | post_id
  decision TEXT,                            -- clustering_rejected | entity_matched | ...
  accepted BOOLEAN,
  reason TEXT,                              -- similarity_low | category_mismatch | ...
  score FLOAT,
  threshold FLOAT,
  metadata JSONB,                           -- {similarity: 0.13, keywords_shared: 2}
  created_at TIMESTAMPTZ
);
```

**Reutilizable**: Same table for Coverage gates, Social rejections, SEO rules.

### 6. `quality_checks` — Objective HTML validation

```sql
CREATE TABLE quality_checks (
  id BIGSERIAL PRIMARY KEY,
  article_id UUID,
  stage TEXT,                               -- EXTRACTED | VALIDATED | FINAL
  content_length BOOLEAN,                   -- min 100 chars?
  language_detected BOOLEAN,
  title_found BOOLEAN,
  description_found BOOLEAN,
  canonical_found BOOLEAN,
  article_element_found BOOLEAN,            -- <article> or main?
  schema_found BOOLEAN,
  images_found BOOLEAN,
  no_boilerplate BOOLEAN,
  errors TEXT[],                            -- array of issues
  created_at TIMESTAMPTZ
);
```

**Pure facts, no scoring**: SQL calculates score when needed, not stored.

## Code Changes

### workerUtils.js

**Removed:**
- `ensureObservabilityLayerSchema()` — Never call from code

**New functions:**
```javascript
recordCrawlSession({ articleId, domain, strategy })
  → returns sessionId (UUID)

recordCrawlAttempt({ sessionId, articleId, domain, attemptNumber, stage, status, reason, httpStatus, durationMs, bytesDownloaded, contentLength, contentHash, details })

recordPipelineDecision({ module, entityId, entityType, decision, accepted, reason, score, threshold, metadata })

updateDomainProfile(domain, { stage, status, durationMs, failureReason })

updateDomainFailures(domain, failureReason)
  → Auto-recalculates percentages
```

### ArticleFetcher.js

Enhanced `fetchArticleContentForMonitor(url, articleId = null)`:

```javascript
1. Create crawl_session (groups all attempts)
2. Try HTTP
   → record attempt
   → update domain_profile
   → if fail, update domain_failures
3. Try Playwright (if HTTP insufficient)
   → record attempt
   → update domain_profile
   → if fail, update domain_failures
4. Return { content, word_count, method }
```

**No breaking changes**: Still returns same shape, caller unaffected.

### newsMonitor.js

**Changed:**
```javascript
const result = await fetchArticleContentForMonitor(article.url, article.id);
```

**Removed:**
- The `ensureObservabilityLayerSchema()` call (never belonged in worker)

## Dashboard Queries

### "Which domains should we switch to Playwright?"

```sql
SELECT 
  domain,
  total_attempts,
  ROUND(100 * success_http / (success_http + failed_http), 1) AS http_pct,
  ROUND(100 * success_playwright / (success_playwright + failed_playwright), 1) AS pw_pct,
  ROUND(avg_time_http_ms) AS http_ms,
  ROUND(avg_time_playwright_ms) AS pw_ms
FROM domain_profiles
WHERE total_attempts > 20
ORDER BY pw_pct - http_pct DESC;
```

**Example output:**
```
reuters.com       | 847 | 42% | 98% | 2200ms | 1800ms  ← SWITCH
agenfor.com.ar    | 56  | 0%  | 78% | 5000ms | 3200ms  ← SWITCH
chacodiapordia    | 42  | 0%  | 0%  | 4800ms | 9000ms  ← INVESTIGATE
tn.com.ar         | 1203| 94% | 92% | 800ms  | 2100ms  ← KEEP HTTP
```

### "What's killing Reuters?"

```sql
SELECT reason, count, percentage
FROM domain_failures
WHERE domain = 'reuters.com'
ORDER BY percentage DESC;
```

**Example output:**
```
403       | 154 | 45%   ← Cloudflare
timeout   | 95  | 28%   ← Playwright timeout
ssl       | 8   | 2%
```

### "Full story of article #123"

```sql
SELECT 
  ca.session_id,
  ca.attempt_number,
  ca.stage,
  ca.status,
  ca.reason,
  ca.http_status,
  ca.duration_ms,
  ca.bytes_downloaded
FROM crawl_attempts ca
WHERE ca.article_id = '123...'
ORDER BY ca.attempt_number;
```

**Example output:**
```
session-abc | 1 | HTTP       | FAILED | 403       | 403  | 1200ms | 0
session-abc | 2 | PLAYWRIGHT | FAILED | timeout   | null | 12500ms| 0
(Retry will happen next cycle)
```

## Deployment

### Step 1: Run SQL migration (one-time)
```bash
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
```

### Step 2: Deploy code
```bash
git add src/jobs/workerUtils.js src/services/ArticleFetcher.js src/jobs/newsMonitor.js scripts/migrate_observability_layer.sql
git commit -m "Observability Layer P0 — Clean instrumentation (crawl_session, domain_profiles, domain_failures)"
git push
npm run dev
```

### Step 3: Verify
After 1-2 news monitor cycles (5-10 minutes):

```bash
# Should have data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM crawl_session;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM crawl_attempts;"
psql $DATABASE_URL -c "SELECT domain, total_attempts, success_http, success_playwright FROM domain_profiles LIMIT 5;"

# Check failures are aggregated
psql $DATABASE_URL -c "SELECT * FROM domain_failures WHERE domain='reuters.com';"
```

## What's NOT Included (Reserved for P1-P5)

This P0 only **observes** and **records**. It does NOT:

- ❌ Change crawler logic (still HTTP → Playwright fallback)
- ❌ Adjust Jaccard thresholds for social clustering
- ❌ Modify detectStories() for coverage
- ❌ Calculate SEO metrics
- ❌ Auto-switch strategies (yet)

Those come in P1-P5 once you have data.

## Critical: Order of Next Phases

**DO NOT skip to P3+ before P1 is done.**

1. **P1: Crawler Hybrid (CRITICAL)** — Use domain_profiles to implement:
   - PENDING → HTTP → Check content → NO → Playwright → Check content → NO → Retry → NO → FAILED(reason)
   - Never lose articles. Status always explicit: PENDING | FETCHING | EXTRACTING | VALIDATING | READY | FAILED_HTTP | FAILED_PW | FAILED_VALIDATION

2. **P2: Coverage Investigation** — Only after P1 works:
   - Understand why 27,563 stories marked 'stale'
   - Then decide: is it bug or intentional?
   - Only then modify `detectStories()`

3. **P3: Social Clustering** — Only after P2:
   - Use pipeline_decisions to log rejection reasons
   - Understand distribution before adjusting Jaccard
   - Then tune thresholds with data

4. **P4: SEO Tools** — Last:
   - Use domain_profiles + domain_failures for site health
   - Use quality_checks for content audit
   - Use pipeline_decisions for link analysis

---

**Ready to deploy.** User approves P0 → immediately move to P1 (crawler hybrid) → data drives everything after.
