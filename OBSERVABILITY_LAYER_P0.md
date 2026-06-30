# Observability Layer — P0 Implementation

**Status**: ✅ Code Complete (Ready for Testing & Deployment)  
**Date**: 2026-06-29  
**Purpose**: Enable data-driven decisions for crawler, coverage, social, and SEO pipelines

## What Is This?

The Observability Layer is not just logging. It's **the capability to answer questions**:

- ✓ Which domains fail the most?
- ✓ What crawler method works best for Reuters?
- ✓ Why did an article end up with no content?
- ✓ Why didn't a post match a story cluster?
- ✓ What percentage of extraction time is spent in Playwright vs HTTP?
- ✓ Which sites should automatically switch to Playwright?
- ✓ What rejection patterns are killing social coverage?

Without this, debugging is guessing. With this, decisions are evidence-based.

## Tables Created

All tables created in: `scripts/migrate_observability_layer.sql`

### 1. `crawl_attempts` — Detailed crawler telemetry

```sql
CREATE TABLE crawl_attempts (
  id BIGSERIAL PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES monitored_articles(id),
  domain TEXT NOT NULL,                      -- e.g., 'reuters.com'
  strategy_used TEXT NOT NULL,               -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
  attempt_number INTEGER NOT NULL DEFAULT 1, -- 1, 2, 3...
  stage TEXT NOT NULL,                       -- HTTP | PLAYWRIGHT | RETRY | VALIDATION
  status TEXT NOT NULL,                      -- SUCCESS | FAILED
  reason TEXT,                               -- timeout | 403 | cloudflare | empty_html | selector_not_found | ...
  http_status INTEGER,                       -- 200 | 403 | 404 | 429 | 500 | ...
  duration_ms INTEGER,                       -- wall-clock time for this stage
  bytes_downloaded INTEGER,                  -- raw HTML size
  content_preview TEXT,                      -- first 200 chars for debugging
  error_message TEXT,                        -- full error stack
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key indexes:**
- `idx_crawl_attempts_article` — fast article lookup
- `idx_crawl_attempts_domain` — domain performance queries
- `idx_crawl_attempts_lookup` — combined domain + status + time queries

**Why record SUCCESS too?** Without it, you can't calculate: "Reuters: HTTP 42% success, Playwright 98% success" → decision: switch to Playwright.

### 2. `pipeline_decisions` — Generic decision log (reusable across modules)

```sql
CREATE TABLE pipeline_decisions (
  id BIGSERIAL PRIMARY KEY,
  module TEXT NOT NULL,                      -- crawler | coverage | social | seo | editorial
  entity_id UUID,                            -- article_id | cluster_id | post_id
  entity_type TEXT,                          -- article | story_cluster | social_cluster
  decision TEXT NOT NULL,                    -- clustering_rejected | entity_matched | ...
  accepted BOOLEAN,                          -- true = YES, false = REJECTED
  reason TEXT,                               -- similarity_low | category_mismatch | keyword_insufficient | ...
  score FLOAT,                               -- decision confidence (0-1) or threshold value
  threshold FLOAT,                           -- gate threshold (e.g., Jaccard 0.20)
  metadata JSONB DEFAULT '{}',               -- {similarity: 0.13, keywords_shared: 2, ...}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Why generic?** Same structure for:
- Social clustering rejections (before adjusting Jaccard)
- Coverage story gates (before modifying detectStories)
- SEO internal link rules
- Editorial entity matching

### 3. `domain_profiles` — Learned crawler strategy (auto-adapts)

```sql
CREATE TABLE domain_profiles (
  domain TEXT PRIMARY KEY,
  total_attempts INTEGER DEFAULT 0,
  success_http INTEGER DEFAULT 0,
  success_playwright INTEGER DEFAULT 0,
  success_retry INTEGER DEFAULT 0,
  failed_http INTEGER DEFAULT 0,
  failed_playwright INTEGER DEFAULT 0,
  failed_retry INTEGER DEFAULT 0,
  avg_time_http_ms FLOAT,
  avg_time_playwright_ms FLOAT,
  avg_time_retry_ms FLOAT,
  preferred_strategy TEXT,                   -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
  preferred_stage TEXT,                      -- HTTP | PLAYWRIGHT | RETRY
  last_attempt_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Auto-learning example:**
```
Domain: reuters.com
  total_attempts: 847
  success_http: 356 (42%)
  success_playwright: 831 (98%)
  preferred_strategy: PLAYWRIGHT_FIRST
```

The system learns automatically. After 7 days, if Playwright succeeds 98% and HTTP 42%, a future decision engine can auto-switch strategy.

### 4. `quality_checks` — Objective HTML quality assessment

```sql
CREATE TABLE quality_checks (
  id BIGSERIAL PRIMARY KEY,
  article_id UUID NOT NULL,
  stage TEXT NOT NULL,                       -- EXTRACTED | VALIDATED | FINAL
  content_length BOOLEAN,                    -- min 100 chars?
  language_detected BOOLEAN,                 -- lang detected?
  title_found BOOLEAN,
  description_found BOOLEAN,
  canonical_found BOOLEAN,
  article_element_found BOOLEAN,             -- <article> or main found?
  schema_found BOOLEAN,
  images_found BOOLEAN,
  no_boilerplate BOOLEAN,
  html_quality_score INTEGER,                -- 0-100
  quality_pass BOOLEAN,                      -- passes all minimum checks?
  errors TEXT[],                             -- array of issues
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Prevents publishing articles with missing title, no content, or broken HTML.

### 5. `page_metadata` — Structured article metadata (SEO ready)

```sql
CREATE TABLE page_metadata (
  article_id UUID PRIMARY KEY,
  canonical TEXT,
  h1 TEXT,
  title TEXT,
  description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  language VARCHAR(5),                       -- en | es | pt | fr
  robots TEXT,                               -- index, follow | noindex, nofollow
  schema_type TEXT,                          -- NewsArticle | Article | BlogPosting
  schema_json JSONB,                         -- full schema.org JSON-LD
  word_count INTEGER,
  reading_time_minutes INTEGER,
  images_count INTEGER,
  videos_count INTEGER,
  links_internal_count INTEGER,
  links_external_count INTEGER,
  has_byline BOOLEAN,
  has_image BOOLEAN,
  has_video BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Why separate from `monitored_articles`?** SEO tools (internal linking, content audits, outdated detection) need structured data. Capture it once, reuse forever without recrawling 35K articles.

### 6. `crawler_strategies` — Domain strategy configuration (manual override)

```sql
CREATE TABLE crawler_strategies (
  domain TEXT PRIMARY KEY,
  strategy TEXT NOT NULL DEFAULT 'HTTP_ONLY',
  force_playwright BOOLEAN DEFAULT FALSE,    -- admin override
  skip_domain BOOLEAN DEFAULT FALSE,         -- admin override
  custom_selector TEXT,                      -- e.g., 'div.article-body'
  timeout_ms INTEGER DEFAULT 30000,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Allows manual tuning before auto-learning kicks in.

## Views (SQL Aggregations)

Three views for quick dashboards:

### `v_crawler_daily_metrics`
```sql
SELECT domain, day, total_attempts, successes, success_rate_pct, 
       http_attempts, playwright_attempts, failure_reasons
FROM v_crawler_daily_metrics
ORDER BY day DESC, domain;
```

**Example:**
```
domain              | day        | successes | success_rate_pct
reuters.com         | 2026-06-29 | 98        | 92.4%
tn.com.ar           | 2026-06-29 | 47        | 94.0%
agenfor.com.ar      | 2026-06-29 | 0         | 0.0%
chacodiapordia.com  | 2026-06-29 | 0         | 0.0%
```

### `v_pipeline_rejection_summary`
Tracks why posts/stories are rejected (before adjusting thresholds).

### `v_quality_pass_rates`
Shows which quality checks are failing most often.

## Code Changes

### 1. **workerUtils.js** — New functions

Added to `src/jobs/workerUtils.js`:
- `ensureObservabilityLayerSchema()` — Creates all tables (idempotent)
- `recordCrawlAttempt({articleId, domain, stage, status, reason, ...})` — Log one attempt
- `recordPipelineDecision({module, entityId, decision, accepted, reason, ...})` — Log one decision
- `updateDomainProfile(domain, {stage, status, durationMs, failureReason})` — Update learned profile

### 2. **ArticleFetcher.js** — Instrumented fetchArticleContentForMonitor()

Enhanced from:
```javascript
export async function fetchArticleContentForMonitor(url) { ... }
```

To:
```javascript
export async function fetchArticleContentForMonitor(url, articleId = null) {
  // Now records HTTP attempt, Playwright attempt, and domain profile updates
  // Passes articleId for correlation
}
```

**What gets recorded:**
- HTTP attempt: stage, status, reason, http_status, duration_ms, bytes_downloaded
- Playwright attempt: stage, status, reason, duration_ms (if HTTP was insufficient)
- Domain profile: updated with success/failure counts + avg times

### 3. **newsMonitor.js** — Call with articleId

Changed:
```javascript
const result = await fetchArticleContentForMonitor(article.url, article.id);
```

Added initialization:
```javascript
const { ensureObservabilityLayerSchema } = await import('./workerUtils.js');
await ensureObservabilityLayerSchema().catch(() => {});
```

### 4. **playwright.js** — Enhanced to return structured result

Changed from:
```javascript
export async function scrapeWithPlaywright(url, timeoutMs = 30000) {
  try { ... return html; }
  catch (e) { console.error(...); return null; }
}
```

To:
```javascript
export async function scrapeWithPlaywright(url, timeoutMs = 30000) {
  // Returns { status, reason, http_status, duration_ms, bytes_downloaded, html, error_message }
  // Classifies errors: timeout | ssl | redirect_loop | cloudflare | 404 | 429 | etc.
}
```

## How to Deploy

### Step 1: Run SQL migration
```bash
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
```

### Step 2: Deploy code
```bash
git add .
git commit -m "Observability Layer P0 — crawl_attempts, domain_profiles, pipeline_decisions"
git push
npm run dev
```

### Step 3: Monitor
The news monitor will automatically:
- Create `crawl_attempts` table if missing (idempotent)
- Record every HTTP and Playwright attempt
- Update `domain_profiles` with success rates and avg times
- Track extraction methods: fetch | playwright | paywall | rss_only

## Dashboard Queries (After 24h of data)

### "Which domains should we prioritize for Playwright?"

```sql
SELECT 
  domain,
  ROUND(100 * success_http / NULLIF(success_http + failed_http, 0), 1) AS http_success_pct,
  ROUND(100 * success_playwright / NULLIF(success_playwright + failed_playwright, 0), 1) AS pw_success_pct,
  ROUND(avg_time_http_ms / NULLIF(avg_time_playwright_ms, 0), 2) AS speed_ratio
FROM domain_profiles
WHERE total_attempts > 20
ORDER BY pw_success_pct - http_success_pct DESC NULLS LAST
LIMIT 10;
```

**Expected result:** Shows which sites get huge success rate boost from Playwright.

### "Where are we losing articles?"

```sql
SELECT 
  domain,
  stage,
  status,
  reason,
  COUNT(*) as count,
  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY domain), 1) as pct
FROM crawl_attempts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY domain, stage, status, reason
ORDER BY domain, pct DESC;
```

### "How much time do we spend in Playwright?"

```sql
SELECT 
  stage,
  COUNT(*) as attempts,
  ROUND(AVG(duration_ms), 0) as avg_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) as p95_ms
FROM crawl_attempts
WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'SUCCESS'
GROUP BY stage
ORDER BY avg_ms DESC;
```

## What's NOT Included (P1-P6)

This P0 layer only records **observed data**. Future phases will use it:

- **P1: Crawler Rewrite** — Use domain_profiles to auto-switch strategy (HTTP → Playwright if success rate drops)
- **P2: Content Extraction** — Use quality_checks to validate + retry
- **P3: Coverage Investigation** — Use pipeline_decisions to understand why stories marked 'stale'
- **P4: Social Clustering** — Use pipeline_decisions + rejection_summary to tune Jaccard thresholds
- **P5: SEO Tools** — Use page_metadata for internal linking, content audits, outdated detection

## Testing

After 1-2 complete news monitor cycles (usually 5-10 minutes):

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM crawl_attempts;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM domain_profiles;"
psql $DATABASE_URL -c "SELECT domain, success_http, success_playwright FROM domain_profiles LIMIT 5;"
```

Should show:
- crawl_attempts: 100+ rows (depends on pending articles)
- domain_profiles: 10+ rows (unique domains processed)
- Each profile showing success counts for HTTP and Playwright

---

**Next Step**: User reviews, validates deployment, then we move to P1 (Crawler hybrid pipeline with auto-strategy switching).
