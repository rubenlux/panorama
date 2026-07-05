/**
 * ArticleFetcher — downloads a news article URL and extracts its main text.
 *
 * Extraction pipeline (Sprint 5.8 — Full Article Acquisition Layer):
 *   Level 1: RSS Feed → URL (handled by newsMonitor)
 *   Level 2: node-fetch + HTML parser (always attempted)
 *   Level 3: Playwright headless browser (fallback when fetch yields < MIN_WORDS)
 *   Fallback: rss_only — RSS summary is the best available
 *
 * fetchArticleContent(url)
 *   Used by the Research pipeline (research.js). Caches in article_content_cache.
 *   Kept backwards-compatible: returns { content, word_count, fromCache }.
 *
 * fetchArticleContentForMonitor(url)
 *   Used by the news monitor pipeline. Returns { content, word_count, method }
 *   where method is one of: 'fetch' | 'playwright' | 'paywall' | null (failed).
 *   Does NOT use the article_content_cache — content stored in monitored_articles.
 */

import { browserPool } from '../jobs/newsMonitor/playwright/BrowserPool.js';
import fetch from 'node-fetch';
import { query } from '../routes/db.js';
import { browserAudit } from './browserLifecycleLogger.js';
import { recordCrawlSession, recordCrawlAttempt, updateDomainProfile, updateDomainFailures } from '../jobs/workerUtils.js';

const CACHE_TTL_HOURS    = 72;
const FETCH_TIMEOUT_MS   = 10_000;
const PLAYWRIGHT_TIMEOUT = 20_000;
const MAX_WORDS          = 2000;
const MIN_WORDS_FETCH    = 80;   // below this, try Playwright before giving up
export const playwrightMetrics = {
  pagesOpened: 0,
  browsersLaunched: 0
};

// ── HTML utilities ────────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&amp;/g,  '&').replace(/&lt;/g,   '<').replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g,   (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

function cleanText(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

// ── Content extraction ────────────────────────────────────────────────────────

function extractJsonLdBody(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data  = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      for (const node of nodes) {
        if (node.articleBody && typeof node.articleBody === 'string' && node.articleBody.length > 200) {
          return cleanText(node.articleBody);
        }
      }
    } catch { /* malformed JSON-LD */ }
  }
  return null;
}

function extractHtmlContent(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi,  '')
    .replace(/<nav[\s\S]*?<\/nav>/gi,      '')
    .replace(/<header[\s\S]*?<\/header>/gi,'')
    .replace(/<footer[\s\S]*?<\/footer>/gi,'')
    .replace(/<aside[\s\S]*?<\/aside>/gi,  '')
    .replace(/<!--[\s\S]*?-->/g,           '');

  const articleM = s.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainM    = s.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyM    = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  return cleanText(articleM?.[1] ?? mainM?.[1] ?? bodyM?.[1] ?? s);
}

function extractTitle(html) {
  const ogM  = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const tagM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1M  = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return cleanText(ogM?.[1] ?? tagM?.[1] ?? h1M?.[1] ?? '').slice(0, 300);
}

function capWords(text) {
  const words = text.split(/\s+/);
  if (words.length <= MAX_WORDS) return { content: text, word_count: words.length };
  return { content: words.slice(0, MAX_WORDS).join(' ') + '…', word_count: MAX_WORDS };
}

function isPaywalled(content, wordCount) {
  if (wordCount > 150) return false;
  const lower = content.toLowerCase();
  return lower.includes('suscrib') || lower.includes('premium') ||
         lower.includes('regístrate') || lower.includes('iniciar sesión') ||
         lower.includes('sign in') || lower.includes('subscribe');
}

// ── Level 2: node-fetch ───────────────────────────────────────────────────────

async function fetchHtml(url) {
  const resp = await fetch(url, {
    signal:   AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent':      'Mozilla/5.0 (compatible; PanoramaResearch/1.0)',
      'Accept':          'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Cache-Control':   'no-cache',
    },
  });
  if (!resp.ok) return null;
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('html')) return null;
  return resp.text();
}

function extractFromHtml(html) {
  if (!html) return null;
  const content = extractJsonLdBody(html) ?? extractHtmlContent(html);
  if (!content || content.length < 100) return null;
  const { content: capped, word_count } = capWords(content);
  if (isPaywalled(capped, word_count)) return { content: capped, word_count, paywall: true };
  return { content: capped, word_count, paywall: false };
}

// ── Level 3: Playwright fallback ──────────────────────────────────────────────
// Only invoked when fetch yields < MIN_WORDS_FETCH.
// Requires: npm install playwright && npx playwright install chromium
// If playwright is not installed, this returns null gracefully.

async function fetchWithPlaywright(url) {
  let browser;
  try {
    playwrightMetrics.pagesOpened++;
    playwrightMetrics.browsersLaunched++;
    browser = await browserPool.acquire();
    browserAudit.browserOpen('Article/Playwright');
    const context = await browser.newContext({
      extraHTTPHeaders: { 'Accept-Language': 'es-AR,es;q=0.9' },
    });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PLAYWRIGHT_TIMEOUT });
      await page.waitForTimeout(1500);
      const html = await page.content();
      return extractFromHtml(html);
    } finally {
      await context.close().catch(() => {});
    }
  } catch {
    return null;
  } finally {
    if (browser) {
      browserAudit.browserClose('Article/Playwright');
      browserPool.release(browser);
    }
  }
}

// ── fetchArticleContent — Research pipeline (backwards-compatible) ────────────

export async function fetchArticleContent(url) {
  // 1. Cache hit?
  try {
    const { rows } = await query(
      `SELECT content, word_count FROM article_content_cache
       WHERE url = $1 AND fetched_at > now() - interval '${CACHE_TTL_HOURS} hours'`,
      [url]
    );
    if (rows[0]) return { content: rows[0].content, word_count: rows[0].word_count, fromCache: true };
  } catch { /* non-fatal */ }

  // 2. Fetch
  let html;
  try { html = await fetchHtml(url); } catch { return null; }
  const result = extractFromHtml(html);
  if (!result) return null;
  if (result.paywall) return null;

  // 3. Persist to cache
  const title = html ? extractTitle(html) : '';
  try {
    await query(
      `INSERT INTO article_content_cache (url, title, content, word_count)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (url) DO UPDATE SET content=EXCLUDED.content, word_count=EXCLUDED.word_count, fetched_at=now()`,
      [url, title, result.content, result.word_count]
    );
  } catch { /* non-fatal */ }

  return { content: result.content, word_count: result.word_count, title, fromCache: false };
}

// ── fetchArticleContentForMonitor — News Intelligence pipeline (Sprint 5.8) ───
// Returns { content, word_count, method } or null on complete failure.
// method: 'fetch' | 'playwright' | 'paywall'
// Records observability data (crawl_session, crawl_attempts, domain_profiles) if articleId provided

export async function fetchArticleContentForMonitor(url, articleId = null) {
  let domain = 'unknown';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {}

  const startTime = Date.now();
  let sessionId = null;

  // Create session if we have articleId (groups all attempts)
  if (articleId) {
    sessionId = await recordCrawlSession({ articleId, domain, strategy: 'HTTP_THEN_PLAYWRIGHT' }).catch(() => null);
  }

  // Level 2: node-fetch
  let html = null;
  let fetchStatus = 'FAILED';
  let fetchReason = 'unknown';
  let httpStatus = null;
  let fetchDuration = 0;
  let bytesDownloaded = 0;

  try {
    const start = Date.now();
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PanoramaResearch/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });
    fetchDuration = Date.now() - start;
    httpStatus = resp.status;

    if (!resp.ok) {
      if (resp.status === 403) fetchReason = 'cloudflare';
      else if (resp.status === 404) fetchReason = '404';
      else if (resp.status === 429) fetchReason = '429';
      else fetchReason = `http_${resp.status}`;
    } else {
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('html')) {
        fetchReason = 'not_html';
      } else {
        html = await resp.text();
        bytesDownloaded = Buffer.byteLength(html, 'utf8');
        if (!html || html.trim().length === 0) {
          fetchReason = 'empty_html';
        } else {
          fetchStatus = 'SUCCESS';
          fetchReason = null;
        }
      }
    }
  } catch (e) {
    fetchDuration = Date.now() - startTime;
    if (e.message.includes('Timeout') || e.message.includes('timeout')) {
      fetchReason = 'timeout';
    } else if (e.message.includes('ECONNREFUSED')) {
      fetchReason = 'connection_refused';
    } else if (e.message.includes('ETIMEDOUT')) {
      fetchReason = 'connection_timeout';
    } else if (e.message.includes('ENOTFOUND')) {
      fetchReason = 'dns_fail';
    } else {
      fetchReason = 'fetch_error';
    }
  }

  // Record HTTP attempt if we have sessionId
  if (sessionId) {
    await recordCrawlAttempt({
      sessionId,
      articleId,
      domain,
      attemptNumber: 1,
      stage: 'HTTP',
      status: fetchStatus,
      reason: fetchReason,
      httpStatus,
      durationMs: fetchDuration,
      bytesDownloaded,
      contentLength: html?.length,
    }).catch(() => {});

    if (fetchStatus === 'SUCCESS') {
      await updateDomainProfile(domain, { stage: 'HTTP', status: 'SUCCESS', durationMs: fetchDuration }).catch(() => {});
    } else {
      await updateDomainProfile(domain, { stage: 'HTTP', status: 'FAILED', durationMs: fetchDuration, failureReason: fetchReason }).catch(() => {});
      await updateDomainFailures(domain, fetchReason).catch(() => {});
    }
  }

  if (fetchStatus === 'SUCCESS' && html) {
    const result = extractFromHtml(html);
    console.log(`[FETCH] extractFromHtml result: ${result ? result.word_count : 0} words`);
    if (result?.paywall) {
      console.log(`[FETCH] Paywall detected`);
      if (sessionId) {
        await recordCrawlAttempt({
          sessionId,
          articleId,
          domain,
          attemptNumber: 1,
          stage: 'VALIDATION',
          status: 'FAILED',
          reason: 'paywall_detected',
          durationMs: Date.now() - startTime,
        }).catch(() => {});
      }
      return { content: null, word_count: 0, method: 'paywall' };
    }

    if (result && result.word_count >= MIN_WORDS_FETCH) {
      console.log(`[FETCH] SUCCESS (${result.word_count} words) → returning 'fetch'`);
      return { content: result.content, word_count: result.word_count, method: 'fetch' };
    }
    console.log(`[FETCH] Insufficient content (${result?.word_count || 0} words < ${MIN_WORDS_FETCH}) → trying Playwright`);
  } else {
    console.log(`[FETCH] HTTP failed or no HTML → trying Playwright`);
  }

  // Level 3: Playwright (always attempted if fetch insufficient or failed)
  console.log(`[PLAYWRIGHT] Starting attempt...`);
  let pwStartTime = Date.now();
  let pwStatus = 'FAILED';
  let pwReason = 'unknown';
  let pwDuration = 0;
  let pwResult = null;

  try {
    console.log(`[PLAYWRIGHT] Calling fetchWithPlaywright(${url.slice(0, 60)}...)`);
    pwResult = await fetchWithPlaywright(url);
    if (pwResult) {
      pwStatus = 'SUCCESS';
      pwReason = null;
      console.log(`[PLAYWRIGHT] SUCCESS: ${pwResult.word_count} words`);
    } else {
      console.log(`[PLAYWRIGHT] Returned null`);
    }
  } catch (e) {
    pwReason = e.message.includes('Timeout') ? 'timeout' : 'playwright_error';
    console.log(`[PLAYWRIGHT] EXCEPTION: ${pwReason} - ${e.message}`);
  }

  pwDuration = Date.now() - pwStartTime;
  console.log(`[PLAYWRIGHT] Duration: ${pwDuration}ms, Status: ${pwStatus}`);

  if (sessionId) {
    await recordCrawlAttempt({
      sessionId,
      articleId,
      domain,
      attemptNumber: 2,
      stage: 'PLAYWRIGHT',
      status: pwStatus,
      reason: pwReason,
      durationMs: pwDuration,
      contentLength: pwResult?.content?.length,
    }).catch(() => {});

    if (pwStatus === 'SUCCESS') {
      await updateDomainProfile(domain, { stage: 'PLAYWRIGHT', status: 'SUCCESS', durationMs: pwDuration }).catch(() => {});
    } else {
      await updateDomainProfile(domain, { stage: 'PLAYWRIGHT', status: 'FAILED', durationMs: pwDuration, failureReason: pwReason }).catch(() => {});
      await updateDomainFailures(domain, pwReason).catch(() => {});
    }
  }

  if (pwResult && !pwResult.paywall && pwResult.word_count >= MIN_WORDS_FETCH) {
    console.log(`[FINAL] PLAYWRIGHT SUCCESS: ${pwResult.word_count} words → returning 'playwright'`);
    return { content: pwResult.content, word_count: pwResult.word_count, method: 'playwright' };
  }
  if (pwResult?.paywall) {
    console.log(`[FINAL] Paywall detected in Playwright result`);
    if (sessionId) {
      await recordCrawlAttempt({
        sessionId,
        articleId,
        domain,
        attemptNumber: 2,
        stage: 'VALIDATION',
        status: 'FAILED',
        reason: 'paywall_detected',
        durationMs: Date.now() - pwStartTime,
      }).catch(() => {});
    }
    return { content: null, word_count: 0, method: 'paywall' };
  }

  // BOTH HTTP and Playwright failed or insufficient
  console.log(`[FINAL] BOTH FAILED → returning null (rss_only)`);
  console.log(`[FINAL] HTTP: ${fetchStatus}/${fetchReason}, Playwright: ${pwStatus}/${pwReason}, Duration: ${Date.now() - startTime}ms`);
  return null; // rss_only — caller handles this
}

// ── Cache stats for monitoring ────────────────────────────────────────────────

export async function getCacheStats() {
  const { rows: [r] } = await query(`
    SELECT
      COUNT(*)::int                                                          AS total_cached,
      ROUND(AVG(word_count))::int                                            AS avg_words,
      COUNT(*) FILTER (WHERE fetched_at > now() - interval '24 hours')::int AS fresh_24h,
      MAX(fetched_at)                                                        AS last_fetch
    FROM article_content_cache
  `);
  return r;
}
