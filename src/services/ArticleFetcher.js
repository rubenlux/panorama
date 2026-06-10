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

import fetch from 'node-fetch';
import { query } from '../routes/db.js';

const CACHE_TTL_HOURS    = 72;
const FETCH_TIMEOUT_MS   = 10_000;
const PLAYWRIGHT_TIMEOUT = 20_000;
const MAX_WORDS          = 2000;
const MIN_WORDS_FETCH    = 80;   // below this, try Playwright before giving up

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
  try {
    const { chromium } = await import('playwright');
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
      await page.setDefaultNavigationTimeout(PLAYWRIGHT_TIMEOUT);

      await page.goto(url, { waitUntil: 'domcontentloaded' });
      // Wait briefly for content scripts
      await page.waitForTimeout(1500);

      const html = await page.content();
      return extractFromHtml(html);
    } finally {
      browser?.close().catch(() => {});
    }
  } catch {
    // playwright not installed or browser launch failed — graceful skip
    return null;
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

export async function fetchArticleContentForMonitor(url) {
  // Level 2: node-fetch
  let html = null;
  try { html = await fetchHtml(url); } catch { /* timeout/dns */ }

  if (html) {
    const result = extractFromHtml(html);
    if (result?.paywall) return { content: null, word_count: 0, method: 'paywall' };

    if (result && result.word_count >= MIN_WORDS_FETCH) {
      return { content: result.content, word_count: result.word_count, method: 'fetch' };
    }
  }

  // Level 3: Playwright (only if fetch was insufficient)
  const pwResult = await fetchWithPlaywright(url);
  if (pwResult && !pwResult.paywall && pwResult.word_count >= MIN_WORDS_FETCH) {
    return { content: pwResult.content, word_count: pwResult.word_count, method: 'playwright' };
  }
  if (pwResult?.paywall) {
    return { content: null, word_count: 0, method: 'paywall' };
  }

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
