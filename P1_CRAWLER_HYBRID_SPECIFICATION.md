# P1 Sprint 2 — Crawler Hybrid Specification

**Status**: Specification (not implementation)  
**Date**: 2026-06-29  
**Purpose**: Define crawler rewrite using P0 observability data

---

## The Core Guarantee

Every article that enters the system MUST exit with either:

1. ✅ **Valid content** (READY state) OR
2. ❌ **Explicit reason for failure** (FAILED state with reason code)

No article should be:
- Left in PENDING state indefinitely
- Marked READY without real content
- Lost without explanation

---

## State Machine

```
RSS/Feed URL detected
  ↓
[1] CREATE article
  ├─ status: PENDING
  ├─ url: <extracted>
  └─ created_at: now()
  ↓
[2] Scheduler picks from PENDING queue
  ├─ status: FETCHING
  ├─ attempt_count: 0
  └─ started_at: now()
  ↓
[3] Try HTTP
  ├─ Send request
  ├─ Record: crawl_session, crawl_attempts
  ├─ content_hash = SHA256(html)
  ├─ Response 200-299?
  │  ├─ YES → [4] PARSE
  │  └─ NO → [5] TRY PLAYWRIGHT
  └─ Record: reason code (403, 404, timeout, etc.)
  ↓
[4] PARSE & VALIDATE
  ├─ Parse HTML
  ├─ Extract article selector (article, main, .content, ...)
  ├─ Remove boilerplate
  ├─ Validate: word_count > 100?
  ├─ Validate: title exists?
  ├─ Validate: language detected?
  ├─ Calculate: content_quality (0-100)
  ├─ Store: page_metadata
  ├─ Result: VALID?
  │  ├─ YES → [6] READY
  │  ├─ NO (quality < 70) → [5] TRY PLAYWRIGHT
  │  └─ NO (paywall detected) → [9] FAILED (paywall)
  └─ Record: extraction method, quality score
  ↓
[5] TRY PLAYWRIGHT (only if HTTP failed or low quality)
  ├─ Launch browser
  ├─ Load URL
  ├─ Record: stage=PLAYWRIGHT
  ├─ Parse rendered HTML
  ├─ Extract content (same as [4])
  ├─ Validate (same as [4])
  ├─ Result: VALID?
  │  ├─ YES → [6] READY
  │  ├─ NO (quality < 70) → [7] RETRY SCHEDULED
  │  └─ NO (paywall) → [9] FAILED (paywall)
  └─ Close browser
  ↓
[6] READY
  ├─ status: READY
  ├─ content_text: validated text
  ├─ extraction_method: 'http' | 'playwright'
  ├─ content_quality: 0-100
  ├─ finished_at: now()
  ├─ Record crawl_session: final_status=SUCCESS
  └─ ✅ DONE (Coverage can proceed)
  ↓
[7] RETRY SCHEDULED
  ├─ Check: retryable?
  │  ├─ YES (timeout, SSL, 403, 429, DNS) → schedule retry
  │  └─ NO (404, paywall) → [9] FAILED
  ├─ status: RETRY
  ├─ scheduled_at: now() + delay (exponential backoff)
  ├─ attempt_count: +1
  ├─ Record: reason, retryable=true
  └─ Wait for next scheduler cycle
  ↓
[8] RETRY ATTEMPT (next cycle)
  ├─ Check: max_attempts (default 3)?
  │  ├─ NO → Go to [3] (try HTTP again) or [5] (try Playwright)
  │  └─ YES → [9] FAILED (max_retries_exceeded)
  ├─ Check: domain strategy (supports_http)?
  │  ├─ YES → try HTTP first
  │  └─ NO → skip to Playwright
  └─ Record: new attempt in crawl_attempts
  ↓
[9] FAILED
  ├─ status: FAILED
  ├─ failure_reason: explicit code (403, 404, timeout, paywall, max_retries_exceeded, quality_too_low, etc.)
  ├─ Record crawl_session: final_status=FAILED, final_reason
  ├─ Record crawl_attempts: reason=explicit, retryable=boolean
  ├─ finished_at: now()
  └─ ❌ DONE (Coverage/Social skip this article)
```

---

## Decision Points

### [3] HTTP Strategy
**Decision**: Try HTTP or skip?
- **Input**: domain_profiles.supports_http
- **If FALSE**: Skip HTTP, go directly to Playwright
- **If TRUE**: Try HTTP

### [4] Content Quality
**Decision**: Valid content?
- **Input**: word_count, title, language, boilerplate removal, title_found, schema_found, article_element_found
- **Calculation**: content_quality = objective score (0-100)
- **Gate**: quality > 70?
- **If NO AND NOT paywall**: Try Playwright
- **If YES**: Mark READY

### [5] Playwright
**Decision**: Use Playwright?
- **When**: HTTP failed OR quality < 70
- **When NOT**: paywall detected (don't waste time)

### [7] Retryable?
**Decision**: Can this fail again?
- **YES**: timeout, SSL error, 403, 429, 502, DNS fail, connection_refused
- **NO**: 404, 401, 410, paywall, empty_html, invalid_url

### [8] Max Attempts
**Decision**: Retry or give up?
- **Default**: 3 total attempts
- **After 3**: Mark FAILED with reason=max_retries_exceeded

---

## Data Requirements

### Domain-Level Decisions (from domain_profiles)
- `strategy` — HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
- `supports_http` — Can skip HTTP if false
- `preferred_selector` — CSS selector (article, main, .content, .story)
- `success_http` — % success with HTTP (for learning)
- `success_playwright` — % success with Playwright (for learning)

### Article-Level Tracking (from crawl_attempts)
- `stage` — HTTP | PLAYWRIGHT | RETRY | HTML_PARSE | ARTICLE_SELECTOR | BOILERPLATE | CONTENT_VALIDATION
- `status` — SUCCESS | FAILED
- `reason` — Exact reason code (403, 404, timeout, selector_missing, etc.)
- `retryable` — Can retry? (boolean, for scheduler)
- `content_quality` — Objective score (0-100)

### Content Versioning (from crawl_content_versions)
- `content_hash` — SHA256 of content (for dedup)
- `change_reason` — CONTENT_UPDATED, TITLE_CHANGED, etc.
- Enables: detecting breaking news, auto-refresh Coverage/Social

### Page Metadata (from page_metadata)
- `extraction_method` — 'http' | 'playwright' | 'rss'
- `content_quality` — 0-100 (can use for: quality > 70 gates)
- `etag` — For HTTP 304 Not Modified caching
- `last_modified_header` — For If-Modified-Since header

---

## Extraction Pipeline (Detailed)

Each attempt logs stages:

```
[crawl_session_id] article-123
  ├─ [attempt 1] HTTP
  │  ├─ stage: HTTP → status: SUCCESS → http_status: 200
  │  ├─ stage: HTML_PARSE → status: SUCCESS → bytes: 5000
  │  ├─ stage: ARTICLE_SELECTOR → status: FAILED → reason: selector_missing
  │  └─ → Go to Playwright
  ├─ [attempt 2] PLAYWRIGHT
  │  ├─ stage: PLAYWRIGHT → status: SUCCESS → duration: 8500ms
  │  ├─ stage: HTML_PARSE → status: SUCCESS
  │  ├─ stage: ARTICLE_SELECTOR → status: SUCCESS → selector: 'article'
  │  ├─ stage: BOILERPLATE → status: SUCCESS
  │  └─ stage: CONTENT_VALIDATION → status: SUCCESS → quality: 85
  └─ → [READY]
```

This audit trail explains EXACTLY where extraction failed or succeeded.

---

## Scheduler Implementation

### Queue Processing
```
LOOP every N seconds:
  ├─ Get articles with status in (PENDING, RETRY)
  ├─ WHERE scheduled_at <= now() (for RETRY)
  ├─ Limit batch size (e.g., 50 per cycle)
  ├─ For each article:
  │  ├─ Start crawl_session
  │  ├─ Execute state machine [1]-[9]
  │  ├─ Record all crawl_attempts
  │  └─ Update status (READY or FAILED)
  └─ Commit batch
```

### Limits
- **Max attempts per article**: 3
- **Max batch size per cycle**: 50-100
- **Backoff strategy**: exponential (1h, 4h, 8h for retries)
- **Timeout per attempt**: 30s (HTTP), 20s (Playwright)

---

## Success Metrics

After P1 deployment, measure:

1. **Zero PENDING articles** > 24h
   - Target: 0
   - Metric: `SELECT COUNT(*) FROM monitored_articles WHERE status='PENDING' AND created_at < now() - '24h'`

2. **All FAILED have explicit reason**
   - Target: 100%
   - Metric: `SELECT COUNT(*) FROM monitored_articles WHERE status='FAILED' AND failure_reason IS NULL`

3. **Content quality distribution**
   - Target: 95% with quality > 70
   - Metric: `SELECT AVG(content_quality), PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY content_quality) FROM page_metadata`

4. **Retry effectiveness**
   - Target: 60% of retries succeed
   - Metric: `SELECT COUNT(*) FILTER (WHERE status='READY' AND attempt_count > 1) * 100 / COUNT(*) FROM monitored_articles`

5. **No duplicate content**
   - Target: content_hash uniqueness
   - Metric: `SELECT COUNT(DISTINCT content_hash) / COUNT(*) FROM page_metadata`

---

## Comparison: Before vs After P1

### BEFORE (Current)
```
Article enters
  ↓
Try HTTP
  ├─ Fail? Mark rss_only
  └─ Success? Extract (may be boilerplate, may be incomplete)
  ↓
Might be empty, might be paywall, might be garbage
  ↓
Coverage tries to use it anyway
  ↓
Results: Fragmented stories, missing articles, bad data
```

### AFTER (P1)
```
Article enters → PENDING
  ↓
Scheduler → FETCHING
  ↓
Try HTTP → Parse → Validate
  ├─ Quality > 70? → READY ✅
  └─ NO → Try Playwright → Parse → Validate
     ├─ Quality > 70? → READY ✅
     └─ NO → Schedule Retry (or FAILED with reason)
  ↓
Coverage only sees: READY articles (with quality > 70) OR FAILED (with explicit reason)
  ↓
Results: Complete data, no mysteries, clear reasons, reliable upstream
```

---

## Integration Points

### Coverage (Sprint 3)
- Input: articles with status=READY only
- Quality guarantee: content_quality > 70
- Failure handling: articles with status=FAILED show reason to editorial team

### Social (Sprint 4)
- Input: same as Coverage (READY articles)
- Update detection: watch crawl_content_versions for breaking news signals

### SEO (Sprint 6)
- Input: page_metadata (extraction_method, etag, last_modified_header, quality score)
- Optimization: Use etag for HTTP 304 Not Modified (save bandwidth)

---

## Implementation Notes

### What NOT to change in P0
- ✅ Keep observability schema frozen
- ✅ Use domain_profiles data for strategy decisions
- ✅ Use crawl_attempts data for debugging

### What to rewrite in P1
- ❌ Remove inline monitor logic
- ❌ Replace with explicit state machine
- ❌ Implement scheduler (separate from monitor cycle)
- ❌ Add content validation pipeline

### Why This Order
1. **P0 gives data**: "Which domains fail? How often? Why?"
2. **P1 uses data**: "Reuters fails 403 45% of the time → switch to Playwright"
3. **P2-4 depend on P1**: Coverage/Social/SEO all assume articles have valid content

---

## Conclusion

P1 is where Panorama transitions from "guessing what went wrong" to "guaranteeing what's stored is valid."

This is the foundation for everything after.