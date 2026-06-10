/**
 * ArticleFetcher — downloads a news article URL and extracts its main text.
 *
 * Extraction priority:
 *   1. JSON-LD articleBody (schema.org NewsArticle / Article)
 *   2. <article> tag
 *   3. <main> tag
 *   4. <body> fallback
 *
 * Returns null on network error, paywall, or empty extraction.
 * Caches results in article_content_cache for CACHE_TTL_HOURS.
 */

import fetch from 'node-fetch';
import { query } from '../routes/db.js';

const CACHE_TTL_HOURS  = 72;    // 3-day cache — articles rarely change after publication
const FETCH_TIMEOUT_MS = 10_000;
const MAX_WORDS        = 2000;  // cap per article sent to Claude

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
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      for (const node of nodes) {
        if (node.articleBody && typeof node.articleBody === 'string' && node.articleBody.length > 200) {
          return cleanText(node.articleBody);
        }
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  }
  return null;
}

function extractHtmlContent(html) {
  // Remove noise blocks entirely
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try canonical content containers in order
  const articleM = s.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainM    = s.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyM    = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const raw = articleM?.[1] ?? mainM?.[1] ?? bodyM?.[1] ?? s;
  return cleanText(raw);
}

function extractTitle(html) {
  // og:title is the most reliable for news articles
  const ogM  = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const tagM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1M  = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const raw  = ogM?.[1] ?? tagM?.[1] ?? h1M?.[1] ?? '';
  return cleanText(raw).slice(0, 300);
}

function isPaywalled(content, wordCount) {
  if (wordCount > 150) return false;
  const lower = content.toLowerCase();
  return (
    lower.includes('suscrib') ||
    lower.includes('premium') ||
    lower.includes('regístrate') ||
    lower.includes('iniciar sesión') ||
    lower.includes('sign in') ||
    lower.includes('subscribe')
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchArticleContent(url) {
  // 1. Cache hit?
  try {
    const { rows } = await query(
      `SELECT content, word_count FROM article_content_cache
       WHERE url = $1 AND fetched_at > now() - interval '${CACHE_TTL_HOURS} hours'`,
      [url]
    );
    if (rows[0]) {
      return { content: rows[0].content, word_count: rows[0].word_count, fromCache: true };
    }
  } catch {
    // Non-fatal — proceed to fetch
  }

  // 2. Fetch HTML
  let html;
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
    html = await resp.text();
  } catch {
    return null; // Timeout, DNS failure, SSL error, etc.
  }

  // 3. Extract content
  const title = extractTitle(html);

  // Try JSON-LD first (highest quality), then HTML parsing
  let content = extractJsonLdBody(html) ?? extractHtmlContent(html);

  if (!content || content.length < 100) return null;

  // 4. Word-count cap
  const words = content.split(/\s+/);
  if (words.length > MAX_WORDS) {
    content = words.slice(0, MAX_WORDS).join(' ') + '…';
  }
  const word_count = Math.min(words.length, MAX_WORDS);

  // 5. Paywall detection
  if (isPaywalled(content, word_count)) return null;

  // 6. Persist to cache
  try {
    await query(
      `INSERT INTO article_content_cache (url, title, content, word_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (url) DO UPDATE SET
         content    = EXCLUDED.content,
         word_count = EXCLUDED.word_count,
         fetched_at = now()`,
      [url, title, content, word_count]
    );
  } catch {
    // Non-fatal
  }

  return { content, word_count, title, fromCache: false };
}

// Expose cache stats for audit/monitoring
export async function getCacheStats() {
  const { rows: [r] } = await query(`
    SELECT
      COUNT(*)::int                                                            AS total_cached,
      ROUND(AVG(word_count))::int                                              AS avg_words,
      COUNT(*) FILTER (WHERE fetched_at > now() - interval '24 hours')::int   AS fresh_24h,
      MAX(fetched_at)                                                          AS last_fetch
    FROM article_content_cache
  `);
  return r;
}
