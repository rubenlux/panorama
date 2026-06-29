# P0 Sprint 1 — READY FOR DEPLOYMENT

**Status**: ✅ Final. Ready to deploy.  
**Date**: 2026-06-29  
**Timeboxing**: 72 hours maximum (create → log → deploy → collect data → DONE)

---

## Critical Rule: P0 Ends After 72 Hours

```
Hour 0-4:   Deploy SQL + code
Hour 4-72:  Collect data
Hour 72:    P0 ENDS
           ↓
           START P1 (Crawler rewrite)
```

P0 is NOT a long project. It's infrastructure for P1.

Do NOT spend weeks adding columns, refining views, or "optimizing queries."

Stop at Hour 72 and move on.

---

## Tables (7 Total)

### Table 1: `crawl_session`

Groups all attempts for one article.

```sql
session-abc123
  ├─ article_id: UUID
  ├─ domain: TEXT
  ├─ strategy: TEXT (HTTP_ONLY | PLAYWRIGHT_FIRST | ...)
  ├─ final_status: TEXT (SUCCESS | FAILED | PAYWALL)
  ├─ final_method: TEXT (fetch | playwright | paywall | rss_only)
  ├─ total_duration_ms: INTEGER
  └─ created_at: TIMESTAMPTZ
```

**Use**: Reconstruct full crawl history for article #123

### Table 2: `crawl_attempts`

Individual attempts within a session. **Most important table.**

```sql
{
  session_id,
  article_id,
  domain,
  attempt_number,              -- 1, 2, 3
  stage TEXT,                  -- HTTP | PLAYWRIGHT | RETRY | HTML_PARSE | ARTICLE_SELECTOR | BOILERPLATE | CONTENT_VALIDATION
  status TEXT,                 -- SUCCESS | FAILED
  reason TEXT,                 -- timeout | 403 | cloudflare | empty_html | selector_missing | ...
  http_status INTEGER,         -- 200, 403, 404, 429, 500, null
  duration_ms,
  bytes_downloaded,
  content_length,              -- extracted text length
  content_hash VARCHAR(64),    -- SHA256 of content
  retryable BOOLEAN,           -- false: 404, paywall | true: timeout, 403, dns, ssl
  details JSONB,               -- {error_class, context}
  created_at
}
```

**Why stage is detailed**: Captures EACH step of extraction pipeline, not just HTTP vs Playwright.

Example trail:
```
HTTP → SUCCESS
HTML_PARSE → SUCCESS
ARTICLE_SELECTOR → FAILED (selector_missing)
[retry with Playwright]
ARTICLE_SELECTOR → SUCCESS
BOILERPLATE → SUCCESS
CONTENT_VALIDATION → SUCCESS
```

**Answerable**: "Why did Reuters fail?" → Find all failure stages + reasons.

### Table 3: `domain_profiles`

Single source of truth for domain strategy.

```sql
{
  domain TEXT PRIMARY KEY,
  total_attempts,
  success_http,
  success_playwright,
  success_retry,
  failed_http,
  failed_playwright,
  failed_retry,
  avg_time_http_ms,
  avg_time_playwright_ms,
  avg_time_retry_ms,
  strategy TEXT,               -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT | AUTO
  manual_override BOOLEAN,     -- admin forced strategy
  preferred_selector TEXT,     -- article | main | .content | .story (learned from successes)
  supports_http BOOLEAN,       -- if false, never try HTTP
  last_failure_reason,
  consecutive_failures,
  updated_at
}
```

**Why preferred_selector**: Many news sites always use the same selector. No need to discover every time.

**Why supports_http**: Some domains will NEVER work with HTTP. Skip wasted attempts.

### Table 4: `page_metadata`

SEO foundation. Everything needed for P4 audits.

```sql
{
  article_id UUID PRIMARY KEY,
  canonical TEXT,
  h1 TEXT,
  title TEXT,
  description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  meta_keywords TEXT,          -- NEW: for SEO audit
  twitter_card TEXT,           -- NEW: for SEO audit
  favicon TEXT,                -- NEW: domain health check
  rss_url TEXT,                -- NEW: for future RSS integration
  sitemap_url TEXT,            -- NEW: for SEO audit
  amp_url TEXT,                -- NEW: for SEO audit
  author TEXT,
  published_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  language VARCHAR(5),
  robots TEXT,
  schema_type TEXT,
  schema_json JSONB,
  word_count INTEGER,
  reading_time_minutes INTEGER,
  images_count INTEGER,
  videos_count INTEGER,
  links_internal_count INTEGER,
  links_external_count INTEGER,
  has_byline BOOLEAN,
  has_image BOOLEAN,
  has_video BOOLEAN,
  extraction_method TEXT,      -- NEW: http | playwright | rss | cache | manual (for quality comparison)
  -- Quality checks (unified, not separate table)
  has_title BOOLEAN,
  has_h1 BOOLEAN,
  has_schema BOOLEAN,
  has_canonical BOOLEAN,
  language_detected BOOLEAN,
  content_length BOOLEAN,
  article_element_found BOOLEAN,
  no_boilerplate BOOLEAN,
  updated_at TIMESTAMPTZ
}
```

**Design**: All properties together. Enables future audits (SEO, freshness, internal linking).

### Table 5: `crawl_content_versions`

Tracks content changes over time. **Critical for breaking news detection.**

```sql
{
  id BIGSERIAL PRIMARY KEY,
  article_id UUID,
  content_hash VARCHAR(64),    -- SHA256 of content
  word_count INTEGER,
  version_number INTEGER,      -- 1, 2, 3... increments on each change
  detected_at TIMESTAMPTZ
}
```

**Use cases**:
- Detect content updates (e.g., 300 words → 500 words)
- Auto-refresh Coverage when article updates
- Auto-refresh Social when article updates
- Breaking news detection (word_count jump)
- Version audit trail

**Example**:
```
Article #123 (Buenos Aires breaking news)
  v1: 08:00 — 300 words
  v2: 12:00 — 500 words ← Auto-refresh Coverage/Social
  v3: 18:00 — 1200 words ← Breaking news signal
```

### Table 6: `pipeline_decisions`

Audit log for Coverage, Social, SEO algorithms.

```sql
{
  module TEXT,                 -- crawler | coverage | social | seo | editorial
  pipeline TEXT,               -- v1 | v2 | v3 (algorithm version)
  entity_id UUID,              -- article_id | cluster_id | post_id
  entity_type TEXT,            -- article | story_cluster | social_cluster
  decision TEXT,               -- clustering_rejected | entity_matched | ...
  accepted BOOLEAN,
  reason TEXT,
  score FLOAT,
  threshold FLOAT,
  metadata JSONB,              -- {similarity: 0.13, keywords_shared: 2}
  created_at TIMESTAMPTZ
}
```

**Why pipeline field**: "6 months from now I changed clustering v2→v3. Compare rejection rates."

### Table 7: `crawl_queue` — ⚠️ RESERVED FOR P1

```sql
{
  id UUID PRIMARY KEY,
  article_id UUID,
  domain TEXT,
  url TEXT,
  state TEXT DEFAULT 'PENDING',   -- PENDING | FETCHING | READY | FAILED | RETRY
  strategy TEXT,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_reason TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
}
```

**CRITICAL**: Do NOT use this table in P0.

```
❌ NO:  INSERT INTO crawl_queue ...
❌ NO:  SELECT * FROM crawl_queue ...
❌ NO:  Reference crawl_queue in code
```

This table is created for P1 but NOT used yet. When crawler is rewritten, P1 will use it.

### Views (4 Derived, Not Persistent)

1. **`v_crawler_daily_metrics`** — Performance by domain/day
2. **`v_domain_failures`** — Aggregated from crawl_attempts (no table)
3. **`v_pipeline_rejection_summary`** — Compare v1 vs v2 rejections
4. **`v_domain_performance`** — "Switch to Playwright?" recommendations

---

## Code Changes (Minimal)

### workerUtils.js

```javascript
recordCrawlSession({ articleId, domain, strategy })
recordCrawlAttempt({ sessionId, articleId, domain, attempt, stage, status, reason, retryable, ... })
recordPipelineDecision({ module, pipeline, entityId, decision, accepted, reason, ... })
updateDomainProfile(domain, { stage, status, durationMs, failureReason })
```

### ArticleFetcher.js

- Creates crawl_session
- Records each extraction stage (not just HTTP vs Playwright)
- Tracks retryable flag based on reason
- Still returns `{ content, word_count, method }`

### newsMonitor.js

- Passes `article.id` to fetcher
- No other changes

---

## Extraction Pipeline (Detailed Logging)

Instead of just logging "HTTP succeeded/failed", log EVERY stage:

```
stage: HTTP
reason: 200 OK
↓
stage: HTML_PARSE
status: SUCCESS
↓
stage: ARTICLE_SELECTOR
status: SUCCESS (selector: 'article')
↓
stage: BOILERPLATE
status: SUCCESS (removed nav, footer, ads)
↓
stage: CONTENT_VALIDATION
status: SUCCESS (word_count: 450, quality: good)
↓
FINAL: READY
```

This audit trail explains **why** an extraction succeeded or failed at each step.

---

## Deployment (72-Hour Timeline)

### Hour 0-4: Setup
```bash
# 1. Run SQL (once)
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql

# 2. Deploy code
git add .
git commit -m "P0 Sprint 1 — Observability infrastructure (7 tables, 4 views)"
npm run dev

# 3. Verify tables exist
psql $DATABASE_URL -c "\dt crawl_*"
psql $DATABASE_URL -c "\dv v_*"
```

### Hour 4-72: Data Collection
- Run 15-20 news monitor cycles
- Accumulate crawl_attempts data
- Fill domain_profiles with success rates
- Collect crawl_content_versions updates

### Hour 72: P0 ENDS
- Lock P0 schema (no more column additions)
- Generate initial dashboard:
  - "Which domains should switch to Playwright?"
  - "What reasons are killing us?"
  - "How many updates/articles changed?"
- **Immediately hand off to P1 team**

---

## What NOT to Do in P0

❌ Add more columns
❌ Create new views
❌ Optimize queries
❌ Refactor extraction logic
❌ Change crawler behavior
❌ Use crawl_queue
❌ Implement retry logic
❌ Change Playwright/HTTP strategy

P0 is **observation only**. P1 is **action**.

---

## First Questions P0 Answers (Hour 72+)

### "Why does Reuters fail 45% of the time?"
```sql
SELECT reason, COUNT(*) 
FROM crawl_attempts 
WHERE domain='reuters.com' AND status='FAILED'
GROUP BY reason
ORDER BY COUNT(*) DESC;
```

Output:
```
reason              | count
403 (Cloudflare)    | 154
empty_html          | 89
selector_missing    | 42
timeout             | 28
```

### "What's the main problem in Playwright?"
```sql
SELECT reason, COUNT(*) 
FROM crawl_attempts 
WHERE stage='PLAYWRIGHT' AND status='FAILED'
GROUP BY reason;
```

### "Which articles updated their content?"
```sql
SELECT article_id, COUNT(DISTINCT content_hash) as versions
FROM crawl_content_versions
GROUP BY article_id
HAVING COUNT(DISTINCT content_hash) > 1
ORDER BY versions DESC;
```

### "Which extraction method produces better quality?"
```sql
SELECT extraction_method, 
  ROUND(AVG(word_count)) as avg_words,
  COUNT(*) as articles
FROM page_metadata
GROUP BY extraction_method
ORDER BY avg_words DESC;
```

---

## Next: P1 (Sprint 2)

With 72 hours of data, you now know:

1. ✓ Which domains need Playwright
2. ✓ Which reasons are retryable
3. ✓ Which selectors work
4. ✓ How many articles update
5. ✓ Which extraction method works best

**P1 uses this data to build:**

```
RSS URL
  ↓
CREATE article (PENDING)
  ↓
Scheduler queues (FETCHING)
  ↓
Try HTTP
  ├─ Content valid? → READY
  └─ NO → Try Playwright
     ├─ Content valid? → READY
     └─ NO → Schedule Retry
        └─ Max retries? → FAILED_FETCH(reason)
```

**Result**: Zero articles lost. All have documented reason.

---

## Summary

| Aspect | Scope |
|--------|-------|
| Timeboxing | 72 hours MAXIMUM |
| Tables | 7 (6 observational, 1 reserved) |
| Views | 4 (derived, no persistence cost) |
| Code changes | 3 files, minimal |
| Logging | Yes (detailed extraction stages) |
| Schema changes | FROZEN after deployment |
| crawl_queue usage | ❌ FORBIDDEN in P0 |

---

**Ready to deploy P0 Sprint 1.**

After 72 hours, immediately begin P1: Crawler rewrite with states.

The goal is not perfect observability. The goal is stable articles. P0 enables P1. P1 solves the problem.