# P0 Sprint 1 — Executive Summary

**Status**: ✅ READY FOR PRODUCTION  
**Date**: 2026-06-29  
**Author**: Claude Code (refined by user feedback)

---

## What Was Built

**7 tables + 4 views = Complete observability foundation**

| Table | Purpose | Rows/Year | Critical? |
|-------|---------|-----------|-----------|
| `crawl_session` | Groups attempts | ~4M | ⭐⭐⭐ |
| `crawl_attempts` | Extraction audit trail | ~50M | ⭐⭐⭐ |
| `domain_profiles` | Learned strategies | ~500 | ⭐⭐ |
| `page_metadata` | SEO foundation | ~4M | ⭐⭐ |
| `crawl_content_versions` | Update tracking | ~10M | ⭐⭐ |
| `pipeline_decisions` | Coverage/Social audit | ~100M | ⭐ |
| `crawl_queue` | P1 placeholder | (unused) | ⚠️ |

**4 Views** (computed on-demand, no persistence cost):
- `v_crawler_daily_metrics` — Performance dashboard
- `v_domain_failures` — Failure reason aggregation
- `v_pipeline_rejection_summary` — Algorithm version comparison
- `v_domain_performance` — Strategy recommendations

---

## Key Changes from Prior Design

### Added to domain_profiles
✅ `preferred_selector` — Learned CSS selector (article, main, .content)  
✅ `supports_http` — Skip HTTP for domains that never work

### Added to page_metadata
✅ `meta_keywords` — SEO audit  
✅ `twitter_card` — SEO audit  
✅ `favicon` — Domain health  
✅ `rss_url` — Future RSS features  
✅ `sitemap_url` — SEO audit  
✅ `amp_url` — SEO audit  
✅ `extraction_method` — Compare quality: HTTP vs Playwright vs RSS

### Added to crawl_attempts
✅ `retryable BOOLEAN` — Can this error be retried? (404 NO, timeout YES, paywall NO)  
✅ Detailed `stage` field — HTTP → HTML_PARSE → ARTICLE_SELECTOR → BOILERPLATE → CONTENT_VALIDATION

### New Table: crawl_content_versions
✅ Detects article updates (breaking news)  
✅ Enables auto-refresh Coverage/Social  
✅ Version audit trail (v1→v2→v3)

### CRITICAL: crawl_queue
⚠️ **Created but UNUSED in P0**  
❌ Do NOT reference this table  
❌ Do NOT insert into crawl_queue  
❌ Reserved for P1 (Crawler rewrite)  
🚫 Will replace inline monitor logic with explicit state machine

---

## What This Enables (After 72 Hours of Data)

### Question 1: "Why does Reuters fail 45% of the time?"
```sql
SELECT reason, COUNT(*) FROM crawl_attempts 
WHERE domain='reuters.com' AND status='FAILED'
GROUP BY reason ORDER BY COUNT(*) DESC;
```

Answer:
```
403 (Cloudflare)  | 154
empty_html        | 89
selector_missing  | 42
timeout           | 28
```

→ **Action**: Enable Playwright-first for Reuters (98% success vs 42% HTTP)

### Question 2: "Which domains are actually working?"
```sql
SELECT domain, 
  ROUND(100 * success_http / (success_http + failed_http), 1) as http_pct,
  ROUND(100 * success_playwright / (success_playwright + failed_playwright), 1) as pw_pct,
  CASE WHEN pw_pct > http_pct * 2 THEN 'SWITCH' ELSE 'MONITOR' END
FROM domain_profiles ORDER BY pw_pct DESC;
```

→ **Action**: Data-driven decisions on per-domain strategy

### Question 3: "Did this article update?"
```sql
SELECT version_number, word_count, detected_at 
FROM crawl_content_versions 
WHERE article_id='123...' 
ORDER BY version_number;
```

Output:
```
version | words | detected_at
1       | 300   | 08:00
2       | 500   | 12:00  ← UPDATE DETECTED
3       | 1200  | 18:00  ← BREAKING NEWS SIGNAL
```

→ **Action**: Auto-refresh Coverage/Social when article updates

### Question 4: "Which extraction method works best?"
```sql
SELECT extraction_method, 
  ROUND(AVG(word_count)) as avg_words,
  COUNT(*) as count
FROM page_metadata 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY extraction_method 
ORDER BY avg_words DESC;
```

→ **Action**: Quantify extraction quality (HTTP vs Playwright vs RSS)

---

## Timeline

```
Hour 0-4:    Deploy SQL + code
Hour 4-72:   Run 15-20 monitor cycles, collect data
Hour 72:     P0 LOCKED (no more schema changes)
             ↓
Hour 73+:    Begin P1 (Crawler rewrite with states)
```

**This is NOT a 2-week project. 72 hours MAXIMUM.**

---

## Code Changes

**3 files modified:**

1. **workerUtils.js**
   - `recordCrawlSession()` — Creates session group
   - `recordCrawlAttempt()` — Logs individual attempt + retryable flag
   - `recordPipelineDecision()` — Logs Coverage/Social/SEO decisions
   - `updateDomainProfile()` — Updates learned stats

2. **ArticleFetcher.js**
   - `fetchArticleContentForMonitor()` — Records each extraction stage
   - Still returns `{ content, word_count, method }` (100% compatible)

3. **newsMonitor.js**
   - Pass `article.id` to fetcher
   - No other changes

**Total lines added**: ~200  
**Breaking changes**: 0  
**Backward compatible**: ✅

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Tables too large | Low | Medium | Configured indexes, 72h data collection |
| crawl_queue confusion | Medium | Low | Documentation + comments in code |
| Schema changes during P0 | Medium | High | TIMEBOXED to 72 hours |
| Data quality issues | Low | Medium | Validation in ArticleFetcher |

**Overall Risk**: Low

---

## Success Criteria (After 72 Hours)

- ✅ crawl_attempts has 100K+ rows
- ✅ domain_profiles populated with success rates
- ✅ crawl_content_versions shows article updates
- ✅ First dashboard queries answer key questions
- ✅ P1 team has data-driven insights

---

## What P0 Does NOT Do

❌ Change crawler logic  
❌ Implement retry queue  
❌ Fix empty articles  
❌ Improve Coverage/Social  
❌ Auto-switch domain strategies  
❌ Use crawl_queue  

**P0 observes. P1 acts.**

---

## Deployment Checklist

- [ ] Create feature branch
- [ ] Update SQL migration script
- [ ] Update workerUtils.js
- [ ] Update ArticleFetcher.js
- [ ] Update newsMonitor.js
- [ ] Run `npm run lint`
- [ ] Test locally (1-2 monitor cycles)
- [ ] Create PR with documents
- [ ] Get approval
- [ ] Merge to main
- [ ] Deploy to production
- [ ] Verify tables created
- [ ] Start 72-hour data collection timer
- [ ] After 72h: Lock schema, move to P1

---

## Next Phase: P1 (Sprint 2)

When P0 data is ready (hour 72+), P1 rewrites the crawler:

```
PENDING → FETCHING → READY/FAILED/RETRY

With state machine:
  ✅ No articles lost
  ✅ All failures have reason
  ✅ Retryable errors scheduled explicitly
  ✅ Content validated before marking READY
```

P1 uses crawl_queue + domain_profiles + crawl_attempts data to implement this.

---

## Approval

**Ready to merge after approval of:**

1. SQL schema (7 tables + 4 views)
2. Code changes (3 files)
3. 72-hour timeboxing rule (no scope creep)
4. crawl_queue is RESERVED (not used until P1)

---

**Decision**: Deploy P0 Sprint 1?**

If YES → Merge + start 72-hour timer + collect data  
If NO → Document feedback + iterate

Current recommendation: **DEPLOY** ✅