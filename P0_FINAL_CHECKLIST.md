# P0 Sprint 1 — FINAL IMPLEMENTATION CHECKLIST

**Status**: Ready for Production  
**Date**: 2026-06-29  
**Locked**: YES (no changes after deployment)

---

## What Gets Deployed

### SQL Schema (6 tables + 4 views)

✅ **crawl_session**
- Groups all attempts for one article
- Enables audit trail reconstruction

✅ **crawl_attempts**
- Individual attempts with detailed stages
- Supports debugging where extraction breaks

✅ **domain_profiles**
- Learned strategy per domain
- Includes: preferred_selector, supports_http, success rates

✅ **page_metadata**
- SEO foundation for P4+
- Includes: extraction_method, content_quality, etag, last_modified_header, last_crawled_at

✅ **crawl_content_versions**
- Tracks content updates
- Includes: change_reason (CONTENT_UPDATED, TITLE_CHANGED, etc.)

✅ **pipeline_decisions**
- Audit log for Coverage/Social/SEO
- Includes: pipeline version (v1, v2, ...) for algorithm comparison

❌ **crawl_queue**
- NOT created in P0
- Will be created in P1 when crawler is rewritten

✅ **4 Views** (derived, no persistence cost)
- v_crawler_daily_metrics
- v_domain_failures
- v_pipeline_rejection_summary
- v_domain_performance

### Code Changes (3 files)

✅ **workerUtils.js**
- recordCrawlSession()
- recordCrawlAttempt() (with retryable flag)
- recordPipelineDecision() (with pipeline version)
- updateDomainProfile()

✅ **ArticleFetcher.js**
- fetchArticleContentForMonitor() logs detailed stages
- Maintains backward compatibility

✅ **newsMonitor.js**
- Pass article.id to fetcher
- No other changes

### Documentation

✅ **P0_FINAL_CHECKLIST.md** (this file)
✅ **P0_SPRINT1_READY_FOR_DEPLOYMENT.md**
✅ **P1_CRAWLER_HYBRID_SPECIFICATION.md**
✅ **scripts/migrate_observability_layer.sql**

---

## What Does NOT Get Deployed

❌ Crawler changes
❌ Retry queue implementation
❌ Content validation (that's P1)
❌ State machine (that's P1)
❌ crawl_queue table (that's P1)
❌ Any additional schema modifications after this point

---

## Deployment Sequence

### Step 1: Review
- [ ] Approver reviews all 3 files (workerUtils.js, ArticleFetcher.js, newsMonitor.js)
- [ ] Approver reviews SQL schema
- [ ] Approver confirms: "72 hours timeboxed, no more changes after"

### Step 2: Merge
- [ ] Create branch `p0/observability-foundation`
- [ ] Add all files
- [ ] Create PR with P0_SPRINT1_READY_FOR_DEPLOYMENT.md as description
- [ ] Pass CI checks
- [ ] Merge to main

### Step 3: Deployment
- [ ] Deploy to staging
- [ ] Run migration: `psql $DATABASE_URL -f scripts/migrate_observability_layer.sql`
- [ ] Verify tables exist: `\dt crawl_*` in psql
- [ ] Verify views exist: `\dv v_*` in psql
- [ ] Deploy to production
- [ ] Run migration on production

### Step 4: Data Collection (72 hours)
- [ ] Hour 0: Deployment complete, tables created
- [ ] Hour 0-4: Run 2-3 monitor cycles, verify data appearing in crawl_attempts
- [ ] Hour 4-72: Collect 15-20 monitor cycles worth of data
- [ ] Hour 72: Stop monitoring, lock schema

### Step 5: Verification (Hour 72)
- [ ] Run: `SELECT COUNT(*) FROM crawl_session;` → should be 100+
- [ ] Run: `SELECT COUNT(*) FROM crawl_attempts;` → should be 1000+
- [ ] Run: `SELECT COUNT(DISTINCT domain) FROM domain_profiles;` → should be 10+
- [ ] Run: `SELECT COUNT(*) FROM crawl_content_versions;` → should be 50+
- [ ] Verify: all tables have data

### Step 6: Hand Off to P1
- [ ] Generate initial dashboard queries (see below)
- [ ] Document findings
- [ ] **LOCK P0 SCHEMA** (no more changes)
- [ ] Hand off to P1 team with data insights
- [ ] BEGIN P1 (Crawler rewrite)

---

## Initial Dashboard Queries (After 72 Hours)

### "Which domains should switch to Playwright?"
```sql
SELECT domain, 
  total_attempts,
  ROUND(100.0 * success_http / NULLIF(success_http + failed_http, 0), 1) as http_pct,
  ROUND(100.0 * success_playwright / NULLIF(success_playwright + failed_playwright, 0), 1) as pw_pct,
  ROUND(avg_time_http_ms) as http_ms,
  ROUND(avg_time_playwright_ms) as pw_ms,
  CASE WHEN pw_pct > http_pct * 2 THEN 'SWITCH' ELSE 'KEEP' END as recommendation
FROM domain_profiles
WHERE total_attempts > 10
ORDER BY pw_pct - http_pct DESC;
```

### "What's killing each domain?"
```sql
SELECT domain, reason, count, 
  ROUND(100.0 * count / SUM(count) OVER (PARTITION BY domain), 1) as pct
FROM v_domain_failures
ORDER BY domain, pct DESC;
```

### "Which articles updated their content?"
```sql
SELECT article_id, COUNT(DISTINCT content_hash) as versions
FROM crawl_content_versions
GROUP BY article_id
HAVING COUNT(DISTINCT content_hash) > 1
ORDER BY versions DESC
LIMIT 10;
```

### "How's extraction quality distributed?"
```sql
SELECT 
  CASE 
    WHEN content_quality >= 80 THEN 'Excellent (80-100)'
    WHEN content_quality >= 60 THEN 'Good (60-79)'
    WHEN content_quality >= 40 THEN 'Fair (40-59)'
    ELSE 'Poor (0-39)'
  END as quality_tier,
  COUNT(*) as articles,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM page_metadata
WHERE content_quality IS NOT NULL
GROUP BY quality_tier
ORDER BY quality_tier DESC;
```

### "Playwright vs HTTP extraction quality"
```sql
SELECT extraction_method,
  COUNT(*) as articles,
  ROUND(AVG(content_quality), 1) as avg_quality,
  ROUND(AVG(word_count), 0) as avg_words,
  ROUND(MIN(content_quality)) as min_quality,
  ROUND(MAX(content_quality)) as max_quality
FROM page_metadata
WHERE extraction_method IN ('http', 'playwright')
GROUP BY extraction_method
ORDER BY avg_quality DESC;
```

---

## What NOT to Do After Deployment

❌ Add columns to observability tables
❌ Create new views
❌ Add new tables
❌ Modify stage values in crawl_attempts
❌ Change reason codes
❌ Use crawl_queue (not created yet, reserved for P1)

**Rule**: P0 schema is FROZEN after deployment.

All new observability needs go to P1+ (as separate schema).

---

## Critical Timeboxing

```
Hour 0:    Deployed, tables exist, logging begins
Hour 72:   P0 ENDS, schema frozen
Hour 73+:  P1 BEGINS (Crawler rewrite using P0 data)
```

**Do NOT**:
- Spend 2 weeks "optimizing" observability
- Add "just one more view"
- "Quick schema tweak for better performance"

**DO**:
- Collect data
- After 72h, move to P1
- P1 is where the real problem is solved

---

## Success = Crawler That Guarantees

After P0 observability and P1 crawler rewrite, this must be true:

**"If an article enters the system, it exits with either valid content or an explicit reason for failure. No mysteries. No lost articles. No articles sitting in PENDING indefinitely."**

That's the goal.

---

## Files Included in This PR

1. **scripts/migrate_observability_layer.sql** — SQL schema (run once)
2. **src/jobs/workerUtils.js** — Observability functions
3. **src/services/ArticleFetcher.js** — Logging in fetcher
4. **src/jobs/newsMonitor.js** — Pass article.id
5. **P0_FINAL_CHECKLIST.md** (this file)
6. **P0_SPRINT1_READY_FOR_DEPLOYMENT.md** (deployment guide)
7. **P1_CRAWLER_HYBRID_SPECIFICATION.md** (next phase design)

---

## Sign-Off

**P0 is complete.**

Ready for deployment, data collection, and hand-off to P1.

---

**Approved by**: [User to confirm]  
**Date**: [Deployment date]  
**Status**: LOCKED (no changes)
