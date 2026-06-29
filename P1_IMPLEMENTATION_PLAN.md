# P1 Implementation Plan — Crawler Hybrid with Guarantees

**Phase**: Rewrite content extraction pipeline  
**Goal**: Every article = READY (valid content) OR FAILED (explicit reason)  
**Timeline**: 1-2 weeks

---

## Current State (What Breaks It)

```
runNewsMonitor() 
  ├─ processSource() → creates monitored_articles (raw RSS data)
  ├─ fetchPendingArticleContent() → tries HTTP only, marks rss_only on fail
  ├─ NO RETRY → if HTTP fails, article stays empty
  ├─ NO VALIDATION → boilerplate not removed, quality not checked
  └─ Coverage uses broken data
```

**Problems**:
- ❌ Articles created with no content_text (just RSS summary)
- ❌ HTTP failures mark `extraction_method='rss_only'` (no retry)
- ❌ No explicit failure reason
- ❌ Boilerplate contamination
- ❌ Quality not validated (< 70 articles published)
- ❌ No state tracking (PENDING? FETCHING? READY? Unknown)

---

## New Architecture (What Fixes It)

### Separation of Concerns

```
Component 1: NewsMonitor (unchanged from P0)
  ├─ Reads RSS feeds
  ├─ Creates monitored_articles
  └─ Sets status='PENDING' (NEW)

Component 2: CrawlerScheduler (NEW)
  ├─ Processes PENDING queue
  ├─ HTTP attempt
  ├─ Playwright fallback
  ├─ Content validation
  ├─ Sets status=READY or FAILED(reason)
  └─ Records all attempts in crawl_attempts (P0 observability)
```

### State Machine (Detailed)

```
[1] monitored_articles.status = PENDING
  ├─ url: extracted from RSS
  ├─ title: from RSS
  ├─ content_text: NULL
  └─ Waiting for scheduler
  ↓
[2] Scheduler picks from PENDING
  ├─ status = FETCHING
  ├─ Create crawl_session
  └─ Begin attempt
  ↓
[3] Try HTTP
  ├─ Record stage=HTTP
  ├─ Response 200-299?
  │  ├─ YES → [4] PARSE
  │  └─ NO → [5] PLAYWRIGHT
  └─ Record: reason code (403, 404, timeout, etc.)
  ↓
[4] PARSE & VALIDATE
  ├─ Extract article (selector)
  ├─ Remove boilerplate
  ├─ Validate: word_count > 100
  ├─ Validate: title exists
  ├─ Validate: language detected
  ├─ Calculate: content_quality (0-100)
  ├─ Record: page_metadata
  ├─ Quality >= 70?
  │  ├─ YES → [6] READY
  │  └─ NO (quality < 70) → [5] PLAYWRIGHT
  └─ Paywall detected?
     ├─ YES → [9] FAILED (paywall)
     └─ NO → continue
  ↓
[5] PLAYWRIGHT (if needed)
  ├─ Launch browser
  ├─ Same as [4]
  ├─ Quality >= 70?
  │  ├─ YES → [6] READY
  │  └─ NO → [7] RETRY SCHEDULED
  └─ Close browser
  ↓
[6] READY
  ├─ status = READY
  ├─ content_text = validated
  ├─ content_quality = score
  ├─ extraction_method = 'http' | 'playwright'
  ├─ Record: crawl_session.final_status = SUCCESS
  └─ ✅ Coverage can use it
  ↓
[7] RETRY SCHEDULED
  ├─ retryable? (check reason)
  │  ├─ YES (timeout, 403, SSL) → schedule retry
  │  └─ NO (404, paywall) → [9] FAILED
  ├─ status = RETRY
  ├─ scheduled_at = now() + delay
  ├─ attempt_count++
  └─ Next scheduler cycle
  ↓
[8] RETRY ATTEMPT (next cycle)
  ├─ max_attempts exceeded?
  │  ├─ NO → go to [3]
  │  └─ YES → [9] FAILED
  └─ Record new attempt
  ↓
[9] FAILED
  ├─ status = FAILED
  ├─ failure_reason = explicit code
  ├─ Record: crawl_session.final_status = FAILED
  └─ ❌ Coverage skips it (with reason visible to editors)
```

---

## Files to Create/Modify

### New File: `src/jobs/crawlerScheduler.js`

Main scheduler loop (runs every 30 seconds, separate from monitor).

```javascript
export async function runCrawlerScheduler() {
  // Get articles with status in (PENDING, RETRY)
  // WHERE scheduled_at <= now() (for RETRY)
  // Limit batch size (50-100)
  
  for each article:
    - Create crawl_session
    - Execute state machine [1-9]
    - Record all crawl_attempts
    - Update status (READY | FAILED)
}
```

### Modify: `src/jobs/newsMonitor.js`

Change `fetchPendingArticleContent()`:
- Instead of HTTP-only inline
- Just set `status='PENDING'`
- Let scheduler handle it

### Modify: `src/services/ArticleFetcher.js`

Split into two functions:
1. `attemptHttpFetch()` — returns structured result
2. `attemptPlaywrightFetch()` — returns structured result
3. `validateContent()` — quality check (NEW)
4. `extractMetadata()` — page_metadata population (NEW)

### Modify: `src/worker.js`

Add new cron job:
```javascript
// Every 30 seconds
schedule('*/30 * * * * *', () => runCrawlerScheduler());
```

---

## Database Changes

### New Columns in `monitored_articles`

(Already exist from P0):
- `status` VARCHAR(20) — PENDING | FETCHING | READY | FAILED | RETRY
- `failure_reason` VARCHAR(100) — explicit reason code
- `attempt_count` INTEGER DEFAULT 0
- `scheduled_at` TIMESTAMPTZ — for RETRY scheduling

### New Tables Used (from P0)

- `crawl_session` — groups attempts
- `crawl_attempts` — logs each stage
- `page_metadata` — stores extracted metadata
- `crawl_content_versions` — tracks updates

---

## Implementation Sequence

### Phase 1: Foundation (Day 1-2)

1. ✅ Create `crawlerScheduler.js` skeleton
2. ✅ Add status column to `monitored_articles` (if not exists)
3. ✅ Implement state machine logic
4. ✅ Add validation functions (content_quality calculation)

### Phase 2: HTTP Path (Day 2-3)

1. ✅ Implement attemptHttpFetch()
2. ✅ Record crawl_attempts for HTTP
3. ✅ Quality validation
4. ✅ Test with sample domains

### Phase 3: Playwright Path (Day 3-4)

1. ✅ Implement attemptPlaywrightFetch()
2. ✅ Reuse existing `scrapeWithPlaywright()`
3. ✅ Record crawl_attempts
4. ✅ Fallback logic

### Phase 4: Retry Logic (Day 4-5)

1. ✅ Implement retryable flag logic
2. ✅ Exponential backoff scheduling
3. ✅ Max attempts gate
4. ✅ Test retry scenarios

### Phase 5: Integration (Day 5-6)

1. ✅ Modify newsMonitor to set status=PENDING
2. ✅ Add scheduler cron job to worker
3. ✅ Test full pipeline
4. ✅ Monitor logs

### Phase 6: Validation (Day 6-7)

1. ✅ Run 72-hour test cycle
2. ✅ Verify: 0 articles in PENDING > 24h
3. ✅ Verify: All FAILED have reason
4. ✅ Verify: 95% quality >= 70
5. ✅ Check P0 observability data

---

## Success Criteria for P1

✅ **Zero PENDING articles > 24h**  
✅ **All FAILED articles have explicit reason**  
✅ **Content quality distribution: 95% >= 70**  
✅ **No duplicate content (unique content_hash)**  
✅ **Retry effectiveness: 60%+ succeed on retry**  
✅ **Coverage/Social can trust the data**  

---

## Risk Mitigation

### Risk 1: Breaking current monitor

**Mitigation**: 
- Scheduler is opt-in (feature flag)
- Monitor continues working as before
- Gradual rollout: 10% articles → 50% → 100%

### Risk 2: Performance impact

**Mitigation**:
- Scheduler runs every 30s (not every 5min like monitor)
- Batch size: 50-100 articles per cycle
- Parallel attempts via p-limit

### Risk 3: Scheduler overlaps

**Mitigation**:
- Use `isSchedulerRunning` lock (same pattern as monitor)
- Skip cycle if already running

### Risk 4: Content_quality calculation wrong

**Mitigation**:
- Store boolean checks separately
- SQL can recalculate score on demand
- Threshold is configurable (start 70, adjust based on data)

---

## Key Design Decisions

### Decision 1: Separate scheduler from monitor

**Why**: Monitor is I/O bound (RSS fetching). Scheduler is CPU bound (content extraction). Separation allows independent tuning and retry logic.

### Decision 2: Async retry scheduling

**Why**: Don't retry immediately. Exponential backoff (1h, 4h, 8h) reduces load on problematic domains.

### Decision 3: Quality gate before READY

**Why**: Coverage should only see high-quality articles. If quality < 70, try Playwright (might extract better). If still < 70, FAILED (don't force bad data downstream).

### Decision 4: Explicit reason codes

**Why**: Editorial team can see why articles failed. "403 (Cloudflare)" is actionable. "extraction failed" is not.

---

## What This Enables for P2+

Once P1 is stable:

**P2 (Coverage)**:
- Input: only READY articles
- Reason: no mystery failures, no empty articles
- Result: better clustering, better stories

**P3 (Social)**:
- Input: articles with valid metadata
- Reason: extraction_method tells us quality level
- Result: better correlations with social posts

**P4 (Editorial)**:
- Input: guaranteed quality articles
- Reason: no need for fallback logic
- Result: editorial automation can assume good data

---

## Start P1: Now

Next step: Create `crawlerScheduler.js` and implement state machine.

Ready?