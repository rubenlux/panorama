# Observability Layer P0 — Sprint 1 ONLY

**Status**: ✅ Ready for Production (Sprint 1)  
**Date**: 2026-06-29 (Final)  
**Scope**: Observability foundation ONLY. No crawler changes in P0.

---

## Critical: This is NOT P1

This document covers **P0 Sprint 1** only: observability infrastructure.

**P1 (Sprint 2)** = Crawler rewrite with states (separate roadmap).

Do NOT confuse them.

---

## Architecture Overview

```
P0 — Observability Layer (Sprint 1) ✓ THIS DOCUMENT
  ├─ crawl_session
  ├─ crawl_attempts
  ├─ domain_profiles
  ├─ page_metadata
  ├─ pipeline_decisions
  └─ 4 SQL views (no extra tables)

P1 — Crawler Hybrid (Sprint 2) ← NEXT
  ├─ Rewrite with states: PENDING → FETCHING → READY/FAILED/RETRY
  ├─ crawl_queue table (explicit state machine)
  ├─ Content validation pipeline
  └─ Never lose articles again

P2 — Coverage Investigation (Sprint 3)
  └─ Only after P1 stable

P3 — Social Clustering (Sprint 3)
  └─ Only after P1 stable

P4 — SEO Intelligence (Sprint 4)
  └─ Only after P1 stable
```

---

## Tables (6 Total)

All created by: `scripts/migrate_observability_layer.sql`

Run once:
```bash
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
```

### 1. `crawl_session` — Groups all attempts

```sql
CREATE TABLE crawl_session (
  id UUID PRIMARY KEY,
  article_id UUID,
  domain TEXT,
  strategy TEXT,              -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
  final_status TEXT,          -- SUCCESS | FAILED | PAYWALL
  final_method TEXT,          -- fetch | playwright | paywall | rss_only
  total_duration_ms INTEGER,
  created_at TIMESTAMPTZ
);
```

**Purpose**: Reconstructs full crawl story
```
session-abc123
  ├─ Article: abc-def-123
  ├─ Domain: reuters.com
  ├─ Attempt 1: HTTP → FAILED (403)
  ├─ Attempt 2: Playwright → FAILED (timeout)
  ├─ Attempt 3: Retry → (scheduled)
```

**Answerable**: "Show me everything that happened to article #123"

### 2. `crawl_attempts` — Individual attempts

```sql
CREATE TABLE crawl_attempts (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID,                    -- links to crawl_session
  article_id UUID,
  domain TEXT,
  attempt_number INTEGER,             -- 1, 2, 3
  stage TEXT,                         -- HTTP | PLAYWRIGHT | RETRY | VALIDATION
  status TEXT,                        -- SUCCESS | FAILED
  reason TEXT,                        -- timeout | 403 | cloudflare | empty_html | ssl | ...
  http_status INTEGER,                -- 200, 403, 404, 429, 500, null
  duration_ms INTEGER,
  bytes_downloaded INTEGER,
  content_length INTEGER,             -- extracted text length
  content_hash VARCHAR(64),           -- SHA256 for dedup
  details JSONB,                      -- {error_class, context} if exception
  created_at TIMESTAMPTZ
);
```

**Why small**: Only facts (reason codes). No full error stacks. No content preview.

**Answerable**: "Which domains have timeout problems?" → GROUP BY domain, reason

### 3. `domain_profiles` — Single source of truth

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
  strategy TEXT DEFAULT 'HTTP_ONLY',      -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT | AUTO
  manual_override BOOLEAN DEFAULT FALSE,   -- admin forced strategy
  last_failure_reason TEXT,
  consecutive_failures INTEGER,
  updated_at TIMESTAMPTZ
);
```

**Why one table**: strategy + override together. No redundancy.

**Answerable**: "Should Reuters switch to Playwright?"
- HTTP: 42% success
- Playwright: 98% success
- Recommendation: SWITCH

### 4. `page_metadata` — SEO foundation (P5 later)

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
  -- Quality checks (merged from separate table)
  has_title BOOLEAN,
  has_h1 BOOLEAN,
  has_schema BOOLEAN,
  has_canonical BOOLEAN,
  language_detected BOOLEAN,
  content_length BOOLEAN,
  article_element_found BOOLEAN,
  no_boilerplate BOOLEAN,
  updated_at TIMESTAMPTZ
);
```

**Why unified**: Quality checks are page properties, not events.

**Answerable**: "What % of articles have canonical?" → COUNT WHERE has_canonical

### 5. `pipeline_decisions` — Audit log (generic)

```sql
CREATE TABLE pipeline_decisions (
  id BIGSERIAL PRIMARY KEY,
  module TEXT,                   -- crawler | coverage | social | seo | editorial
  pipeline TEXT DEFAULT 'v1',    -- v1, v2, v3... (algorithm version)
  entity_id UUID,                -- article_id | cluster_id | post_id
  entity_type TEXT,              -- article | story_cluster | social_cluster
  decision TEXT,                 -- clustering_rejected | entity_matched | ...
  accepted BOOLEAN,
  reason TEXT,                   -- similarity_low | category_mismatch | ...
  score FLOAT,
  threshold FLOAT,
  metadata JSONB,                -- {similarity: 0.13, keywords_shared: 2}
  created_at TIMESTAMPTZ
);
```

**Why pipeline field**: "6 months from now I changed clustering. Show me v1 vs v2"

**Answerable**: "Compare rejection rates: clustering v1 vs clustering v2"

### 6. `crawl_queue` — State machine (P1 only, prepared now)

```sql
CREATE TABLE crawl_queue (
  id UUID PRIMARY KEY,
  article_id UUID,
  domain TEXT,
  url TEXT,
  state TEXT DEFAULT 'PENDING',      -- PENDING | FETCHING | READY | FAILED | RETRY
  strategy TEXT,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_reason TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**P0 Status**: Created by SQL, NOT used by current monitor.
**P1 Status**: Will replace inline monitor logic with explicit state machine.

---

## Views (Derived, Not Persistent)

### `v_crawler_daily_metrics`
```sql
SELECT domain, day, total_attempts, successes, success_rate_pct, 
       http_attempts, playwright_attempts, failure_reasons
```

### `v_domain_failures` (no table, derived)
```sql
SELECT domain, reason, count, percentage
FROM crawl_attempts
WHERE status = 'FAILED'
GROUP BY domain, reason
```

**Why VIEW**: Avoids inconsistencies. Single source of truth = crawl_attempts.

### `v_pipeline_rejection_summary`
```sql
SELECT module, pipeline, reason, count, rejection_rate_pct
```

For comparing rejection patterns across algorithm versions.

### `v_domain_performance`
```sql
SELECT domain, http_success_pct, pw_success_pct, recommendation
```

For dashboard: "Switch to Playwright?"

---

## Code Changes (Minimal)

### workerUtils.js — Recording functions

```javascript
recordCrawlSession({ articleId, domain, strategy })
  → UUID sessionId

recordCrawlAttempt({ sessionId, articleId, domain, attemptNumber, stage, status, reason, ... })

recordPipelineDecision({ module, pipeline='v1', entityId, decision, accepted, ... })

updateDomainProfile(domain, { stage, status, durationMs, failureReason })

updateDomainFailures(domain, failureReason)
  ← REMOVED (now a VIEW)
```

### ArticleFetcher.js

- Creates `crawl_session` at start
- Records each attempt
- Updates `domain_profile`
- Still returns `{ content, word_count, method }`

### newsMonitor.js

- Passes `article.id` to fetcher
- No other changes

---

## Deployment P0

### Step 1: SQL (one-time)
```bash
psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
```

### Step 2: Code (standard deploy)
```bash
git add src/jobs/workerUtils.js src/services/ArticleFetcher.js scripts/migrate_observability_layer.sql
git commit -m "Observability Layer P0 Sprint 1 — crawl_session, crawl_attempts, domain_profiles, page_metadata"
npm run dev
```

### Step 3: Verify (after 1-2 cycles)
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM crawl_session;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM crawl_attempts;"
psql $DATABASE_URL -c "SELECT domain, success_http, success_playwright FROM domain_profiles WHERE total_attempts > 10;"
```

---

## What P0 Answers

**After 24h of data:**

### "What's killing Reuters?"
```sql
SELECT reason, count, percentage FROM v_domain_failures WHERE domain='reuters.com';
```

Output:
```
403       | 154 | 45%  ← Cloudflare
Timeout   | 95  | 28%  ← Playwright timeouts
SSL       | 8   | 2%
```

### "Should Reuters switch to Playwright?"
```sql
SELECT * FROM v_domain_performance WHERE domain='reuters.com';
```

Output:
```
domain       | http_pct | pw_pct | recommendation
reuters.com  | 42%      | 98%    | SWITCH TO PLAYWRIGHT
```

### "Reconstruct article #123 crawl history"
```sql
SELECT * FROM crawl_attempts WHERE session_id = 
  (SELECT id FROM crawl_session WHERE article_id='123...') 
ORDER BY attempt_number;
```

### "Compare clustering v1 vs v2 rejection rates"
```sql
SELECT pipeline, reason, rejection_rate_pct FROM v_pipeline_rejection_summary 
WHERE module='coverage'
ORDER BY pipeline, rejection_rate_pct DESC;
```

---

## What P0 DOES NOT Do

❌ Change crawler logic
❌ Add hybrid HTTP/Playwright fallback (that's P1)
❌ Implement retry queue (that's P1)
❌ Fix empty articles (that's P1)
❌ Auto-switch domain strategies (that's P1)

P0 only **observes**. P1 **acts**.

---

## Next: P1 Sprint 2

P1 is where the real work happens. It requires:

### Explicit State Machine
```
RSS URL detected
  ↓
CREATE article (status=PENDING)
  ↓
Scheduler picks it up (status=FETCHING)
  ↓
Try HTTP
  ├─ Content valid? YES → status=READY
  └─ Content valid? NO
       ↓
       Try Playwright
       ├─ Content valid? YES → status=READY
       └─ Content valid? NO
            ↓
            Schedule Retry (status=RETRY)
            ↓
            Max retries? YES → status=FAILED_FETCH (reason=given)
```

### Content Validation
- Not just "HTTP 200"
- Not just "has HTML"
- Real checks: title, body, word_count, boilerplate removal

### crawl_queue Table
- Explicit PENDING → FETCHING → READY/FAILED/RETRY states
- Scheduler pulls from queue (not inline monitor)
- Enables scaling

### Result: Guarantees
- ✅ No article left PENDING indefinitely
- ✅ No article marked READY without real content
- ✅ All FAILEDs have documented reason
- ✅ Retryable failures scheduled explicitly

---

## Sprint Summary

| Sprint | What | Who | Duration | Outcome |
|--------|------|-----|----------|---------|
| **1 (NOW)** | Observability tables + views | Claude | ~2h | 6 tables, 4 views, 0 logic changes |
| **2** | Crawler rewrite (P1) | Dev | 3-5d | State machine, hybrid HTTP/PW, content validation |
| **3** | Coverage + Social investigation | Dev | 2-3d | Fix 27k stale stories, improve clustering |
| **4** | SEO Intelligence | Dev | 2-3d | Use page_metadata for internal links, audits, content freshness |

---

## Critical: Why This Order

❌ **Wrong order**: "Optimize Coverage before fixing Crawler"
- Coverage depends on good articles
- Articles depend on stable crawler
- If crawler breaks, Coverage breaks

✅ **Right order**: "Fix Crawler first, then everything else works"
- Stable articles → Coverage works
- Stable articles → Social clustering works
- Stable articles → SEO tools work

P0 enables P1. P1 enables everything else.

---

**Ready to deploy P0 Sprint 1. Approve?**