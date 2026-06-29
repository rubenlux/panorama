# P1 Phase 1 — Crawler Scheduler Implementation

**Status**: ✅ Foundation complete, ready for testing  
**Date**: 2026-06-29  
**Phase**: P1 Phase 1 — State machine + HTTP/Playwright paths

---

## What's Been Implemented

### New File: `src/jobs/crawlerScheduler.js`

The core of P1. Implements the state machine:

```
PENDING → FETCHING → [HTTP] → [Playwright] → [Validate] → READY or FAILED/RETRY
```

**Key functions**:
- `runCrawlerScheduler()` — Main loop (runs every 30s)
- `processArticle()` — Processes one article through state machine
- `attemptHttpFetch()` — HTTP with structured error codes
- `attemptPlaywrightFetch()` — Playwright fallback
- `validateContentQuality()` — Objective quality scoring
- `saveReadyArticle()` — Persist to READY state
- `getSchedulerStats()` — Operational metrics

**Quality scoring** (0-100):
- Structure: title, h1, article element, boilerplate removal (40 pts)
- SEO: schema, canonical, language (30 pts)
- Content: length > 100 chars, >500 words, >1000 words (30 pts)

**Error codes captured**:
- Retryable: timeout, SSL, 403, 429, 502-504, connection errors
- Non-retryable: 404, 401, 410, paywall, empty_html

### Schema Migration: `scripts/migrate_p1_crawler_schema.sql`

Adds required columns to `monitored_articles`:
- `status VARCHAR(20)` — PENDING | FETCHING | READY | FAILED | RETRY
- `attempt_count INTEGER` — tracks retry count
- `scheduled_at TIMESTAMPTZ` — for retry scheduling
- `failure_reason VARCHAR(100)` — explicit error reason

**Indexes for performance**:
- `idx_monitored_articles_status_scheduled` — O(1) lookup for PENDING/RETRY
- `idx_monitored_articles_created_at` — recent articles first

**Backfill**: Articles with `content_text` set to `status='READY'`, without to `'PENDING'`

### Worker Integration: `src/worker.js`

Added P1 scheduler to the worker:
```javascript
// P1: Crawler Scheduler — process PENDING/RETRY articles every 30 seconds
runCrawlerScheduler().catch(...);
cron.schedule("*/30 * * * * *", () => {
    runCrawlerScheduler().catch(...);
});
```

Runs every 30 seconds (vs monitor's 60 seconds) because scheduler is lighter (no RSS fetching).

---

## Current Workflow (Unified)

```
1. Monitor (every 60s)
   ├─ Fetches RSS feeds
   ├─ Creates monitored_articles with status='PENDING'
   └─ Sets title from RSS, content_text=NULL

2. Scheduler (every 30s)
   ├─ Picks PENDING/RETRY articles
   ├─ Creates crawl_session (P0 observability)
   ├─ Tries HTTP
   ├─ If insufficient, tries Playwright
   ├─ Validates quality >= 70
   ├─ If good: sets status='READY' + saves to page_metadata
   ├─ If bad: schedules RETRY or sets status='FAILED' with reason
   └─ Records all attempts in crawl_attempts (P0 observability)

3. Coverage (processes READY articles only)
   ├─ Only sees status='READY' articles
   ├─ Can assume: valid content, quality >= 70
   └─ No broken data downstream
```

---

## Testing Checklist

### Before Production

- [ ] Run migration: `psql $DATABASE_URL -f scripts/migrate_p1_crawler_schema.sql`
- [ ] Deploy code changes (crawlerScheduler.js, worker.js)
- [ ] Start worker: `npm run worker`
- [ ] Monitor logs for "Crawler Scheduler" entries
- [ ] Verify articles transition: PENDING → READY or FAILED

### Success Criteria

After 24 hours of running:

- ✅ **Zero PENDING articles > 24h**: `SELECT COUNT(*) FROM monitored_articles WHERE status='PENDING' AND created_at < now() - '24h'` = 0
- ✅ **All FAILED have reason**: `SELECT COUNT(*) FROM monitored_articles WHERE status='FAILED' AND failure_reason IS NULL` = 0
- ✅ **READY count grows**: Compare `SELECT COUNT(*) WHERE status='READY'` across days
- ✅ **Quality distribution**: `SELECT AVG(content_quality) FROM page_metadata` > 75
- ✅ **Retry effective**: `SELECT COUNT(*) WHERE status='READY' AND attempt_count > 1` > 0 (retries succeeded)

### P0 Observability Validation

Check that P0 data flows correctly:

```sql
-- Sessions created
SELECT COUNT(*) FROM crawl_session;
-- Should be growing (1 per article processed)

-- Attempts logged
SELECT COUNT(*) FROM crawl_attempts;
-- Should be 1-2 per article (HTTP + maybe Playwright)

-- Domain profiles updated
SELECT domain, success_http, success_playwright
FROM domain_profiles
WHERE total_attempts > 0
ORDER BY total_attempts DESC LIMIT 10;
-- Should show learning: which domains prefer Playwright
```

---

## Next: P1 Phase 2 (Optional Polish)

These are nice-to-haves but NOT blocking:

1. **Domain strategy optimization**: Use domain_profiles to skip HTTP if success_http < 20%
2. **Exponential backoff tuning**: Current delays (0, 1h, 4h) may need adjustment
3. **Content extraction refinement**: Better boilerplate detection
4. **Quality scoring refinement**: Weight words/length more heavily

But NOT needed for core guarantee: "Every article = READY or FAILED(reason)"

---

## Known Limitations (By Design)

### Not Parallelized Extraction

Current implementation:
- Processes 50 articles per 30s cycle
- 5 concurrent (p-limit)
- ~6 seconds per article average = 300 articles/30min

This is intentional. Reasons:
1. Don't overload target domains
2. Playwright is single-browser (queued)
3. Parallel extraction = higher failure rates

**Scaling**: If needed later, add multiple Playwright browser pools or multi-machine deployment.

### No Advanced Selector Learning

Current: Uses standard `<article>`, `<main>`, `<body>` selectors for all domains.

Future (P1 Phase 2): Use `domain_profiles.preferred_selector` to remember which selector worked for each domain.

### Content Extraction is Basic

No ML model for content extraction. Uses simple tag removal + text extraction.

Future (P5): Integrate with content extraction service if quality scores plateau.

---

## Operational Notes

### Monitoring

Check scheduler health:
```sql
SELECT * FROM worker_runs WHERE worker_name='crawler_scheduler' ORDER BY started_at DESC LIMIT 10;
```

Check article flow:
```sql
SELECT
  COUNT(*) FILTER (WHERE status='PENDING') as pending,
  COUNT(*) FILTER (WHERE status='FETCHING') as fetching,
  COUNT(*) FILTER (WHERE status='READY') as ready,
  COUNT(*) FILTER (WHERE status='FAILED') as failed,
  COUNT(*) FILTER (WHERE status='RETRY') as retry
FROM monitored_articles
WHERE created_at > now() - interval '24 hours';
```

### Troubleshooting

**Symptom**: Articles stuck in PENDING
- Check: Scheduler logs for errors
- Check: `worker_runs` table for crash pattern
- Check: Database connection pool

**Symptom**: Too many FAILED articles
- Check: `domain_profiles` for which domains are broken
- Check: `crawl_attempts` for common failure reasons
- Action: Whitelist broken domains for Playwright-only

**Symptom**: Slow processing
- Check: `crawl_attempts.duration_ms` distribution
- Check: Playwright browser pool (only 1 instance currently)
- Action: Reduce batch size if memory pressure

---

## Deployment Steps

### Step 1: Backup
```bash
pg_dump $DATABASE_URL > backup_pre_p1.sql
```

### Step 2: Migrate
```bash
psql $DATABASE_URL -f scripts/migrate_p1_crawler_schema.sql
```

### Step 3: Verify Schema
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='monitored_articles' AND column_name IN ('status', 'attempt_count', 'scheduled_at', 'failure_reason');
-- Should return 4 rows
```

### Step 4: Deploy Code
```bash
git pull
npm run build  # if any build needed
npm run restart  # or: pm2 restart all
```

### Step 5: Monitor Logs
```bash
tail -f logs/worker.log | grep "Crawler Scheduler"
```

### Step 6: Verify After 1 Hour
- Check article transitions
- Check crawl_attempts table
- Check domain_profiles table

---

## Success = Foundation for P2+

Once P1 is stable (24h with zero PENDING > 24h):

**P2** (Coverage) can assume:
- ✅ All articles have content or explicit reason
- ✅ Articles aren't stuck indefinitely
- ✅ Quality is >= 70

**P3** (Social) uses same guarantee for reliable social clustering

**P4** (Editorial) automation can trust upstream data

---

**Ready for testing and production deployment.**