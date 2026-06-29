/**
 * Crawler Scheduler — P1 Content Extraction Pipeline
 *
 * Processes monitored_articles with explicit state machine:
 * PENDING → FETCHING → READY (valid content) OR FAILED (explicit reason)
 *
 * Uses P0 observability: crawl_session, crawl_attempts, page_metadata
 */

import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { query } from '../routes/db.js';
import { startRun, finishRun } from './workerUtils.js';
import { recordCrawlSession, recordCrawlAttempt, updateDomainProfile } from './workerUtils.js';
import { scrapeWithPlaywright } from '../connectors/playwright.js';

let isSchedulerRunning = false;
let schedulerSkippedCycles = 0;

const BATCH_SIZE = parseInt(process.env.CRAWLER_BATCH_SIZE || '50', 10);
const CONCURRENT_LIMIT = parseInt(process.env.CRAWLER_CONCURRENT || '5', 10);
const MAX_ATTEMPTS = parseInt(process.env.CRAWLER_MAX_ATTEMPTS || '3', 10);
const QUALITY_THRESHOLD = parseInt(process.env.CRAWLER_QUALITY_THRESHOLD || '70', 10);
const HTTP_TIMEOUT_MS = 30000;
const PLAYWRIGHT_TIMEOUT_MS = 20000;
const MIN_CONTENT_LENGTH = 100;

// Retry backoff: attempt 1 = now, attempt 2 = 1h, attempt 3 = 4h
const RETRY_DELAYS_MS = [0, 3600000, 14400000];

// Error codes that can be retried
const RETRYABLE_REASONS = new Set([
  'timeout', 'ssl', 'redirect_loop', 'connection_timeout', 'dns_fail',
  '403', '429', '502', '503', '504', 'connection_refused'
]);

// Error codes that should NOT retry
const NON_RETRYABLE_REASONS = new Set([
  '404', '401', '410', 'paywall_detected', 'empty_html'
]);

// ============================================================================
// Content Quality Calculation
// ============================================================================

function calculateContentQuality(metadata) {
  let score = 0;

  // Basic structure (40 points)
  if (metadata.has_title) score += 10;
  if (metadata.has_h1) score += 10;
  if (metadata.article_element_found) score += 10;
  if (metadata.no_boilerplate) score += 10;

  // SEO foundation (30 points)
  if (metadata.has_schema) score += 10;
  if (metadata.has_canonical) score += 10;
  if (metadata.language_detected) score += 10;

  // Content quality (30 points)
  if (metadata.content_length) score += 10; // > 100 chars
  if (metadata.word_count >= 500) score += 10; // Substantial article
  if (metadata.word_count >= 1000) score += 10; // Long-form article

  return Math.min(100, score);
}

// ============================================================================
// Content Extraction & Validation
// ============================================================================

async function validateContentQuality(html, contentText, title) {
  if (!contentText || contentText.trim().length < MIN_CONTENT_LENGTH) {
    return { quality: 0, issues: ['content_too_short'] };
  }

  const wordCount = contentText.split(/\s+/).length;
  const hasTitle = !!title && title.trim().length > 0;
  const hasLanguage = /[a-z]/i.test(contentText); // Basic language detection
  const hasArticleElement = /<article/i.test(html) || /<main/i.test(html);
  const hasH1 = /<h1/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasCanonical = /rel=["']canonical["']/i.test(html);

  return {
    quality: calculateContentQuality({
      has_title: hasTitle,
      has_h1: hasH1,
      article_element_found: hasArticleElement,
      no_boilerplate: true, // Assumed if we got here
      has_schema: hasSchema,
      has_canonical: hasCanonical,
      language_detected: hasLanguage,
      content_length: contentText.length >= MIN_CONTENT_LENGTH,
      word_count: wordCount
    }),
    word_count: wordCount,
    metadata: {
      has_title: hasTitle,
      has_h1: hasH1,
      article_element_found: hasArticleElement,
      has_schema: hasSchema,
      has_canonical: hasCanonical,
      language_detected: hasLanguage,
      content_length: contentText.length >= MIN_CONTENT_LENGTH
    }
  };
}

async function attemptHttpFetch(url, domain, timeoutMs = HTTP_TIMEOUT_MS) {
  const startTime = Date.now();
  let httpStatus = null;
  let reason = null;
  let html = null;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PanoramaNews/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });

    httpStatus = resp.status;
    const contentType = resp.headers.get('content-type') || '';

    if (!resp.ok) {
      if (resp.status === 403) reason = '403';
      else if (resp.status === 404) reason = '404';
      else if (resp.status === 429) reason = '429';
      else if (resp.status >= 500) reason = `5${resp.status.toString().slice(1)}`;
      else reason = `http_${resp.status}`;

      return {
        status: 'FAILED',
        reason,
        http_status: httpStatus,
        duration_ms: Date.now() - startTime,
        bytes_downloaded: 0,
        html: null,
        retryable: RETRYABLE_REASONS.has(reason)
      };
    }

    if (!contentType.includes('html')) {
      return {
        status: 'FAILED',
        reason: 'not_html',
        http_status: httpStatus,
        duration_ms: Date.now() - startTime,
        bytes_downloaded: 0,
        html: null,
        retryable: false
      };
    }

    html = await resp.text();
    const bytesDownloaded = Buffer.byteLength(html, 'utf8');

    if (!html || html.trim().length === 0) {
      return {
        status: 'FAILED',
        reason: 'empty_html',
        http_status: httpStatus,
        duration_ms: Date.now() - startTime,
        bytes_downloaded: bytesDownloaded,
        html: null,
        retryable: true
      };
    }

    return {
      status: 'SUCCESS',
      reason: null,
      http_status: httpStatus,
      duration_ms: Date.now() - startTime,
      bytes_downloaded: bytesDownloaded,
      html,
      retryable: false
    };
  } catch (e) {
    const duration = Date.now() - startTime;
    let reason = 'fetch_error';

    if (e.message.includes('Timeout') || e.message.includes('timeout')) {
      reason = 'timeout';
    } else if (e.message.includes('ECONNREFUSED')) {
      reason = 'connection_refused';
    } else if (e.message.includes('ETIMEDOUT')) {
      reason = 'connection_timeout';
    } else if (e.message.includes('ENOTFOUND')) {
      reason = 'dns_fail';
    } else if (e.message.includes('SSL')) {
      reason = 'ssl';
    }

    return {
      status: 'FAILED',
      reason,
      http_status: null,
      duration_ms: duration,
      bytes_downloaded: 0,
      html: null,
      retryable: RETRYABLE_REASONS.has(reason)
    };
  }
}

async function attemptPlaywrightFetch(url, timeoutMs = PLAYWRIGHT_TIMEOUT_MS) {
  const startTime = Date.now();

  try {
    const result = await scrapeWithPlaywright(url, timeoutMs);
    const duration = Date.now() - startTime;

    if (result.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        reason: null,
        duration_ms: duration,
        bytes_downloaded: result.bytes_downloaded,
        html: result.html,
        retryable: false
      };
    }

    return {
      status: 'FAILED',
      reason: result.reason,
      duration_ms: duration,
      bytes_downloaded: 0,
      html: null,
      retryable: RETRYABLE_REASONS.has(result.reason)
    };
  } catch (e) {
    const duration = Date.now() - startTime;
    const reason = e.message.includes('Timeout') ? 'timeout' : 'playwright_error';

    return {
      status: 'FAILED',
      reason,
      duration_ms: duration,
      bytes_downloaded: 0,
      html: null,
      retryable: RETRYABLE_REASONS.has(reason)
    };
  }
}

function extractContentFromHtml(html) {
  if (!html) return null;

  // Simple extraction: look for article, main, or body content
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  let content = articleMatch?.[1] ?? mainMatch?.[1] ?? bodyMatch?.[1] ?? html;

  // Remove script, style, nav, header, footer, aside
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, '');

  // Extract text
  const text = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 10000); // Cap at 10k chars
}

// ============================================================================
// Main Scheduler Loop
// ============================================================================

export async function runCrawlerScheduler() {
  if (isSchedulerRunning) {
    schedulerSkippedCycles++;
    console.log('[CrawlerScheduler] Already running. Skipping cycle.');
    return;
  }

  isSchedulerRunning = true;
  const cycleStart = Date.now();
  const runId = await startRun('crawler_scheduler');

  try {
    console.log('[CrawlerScheduler] Cycle start');

    // Get articles that need processing
    const { rows: articles } = await query(`
      SELECT
        id, url, title,
        status, attempt_count, scheduled_at,
        domain
      FROM monitored_articles
      WHERE status IN ('PENDING', 'RETRY')
        AND (scheduled_at IS NULL OR scheduled_at <= now())
      ORDER BY
        CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (articles.length === 0) {
      console.log('[CrawlerScheduler] No pending articles. Idle.');
      await finishRun(runId, { status: 'success' });
      isSchedulerRunning = false;
      return;
    }

    console.log(`[CrawlerScheduler] Processing ${articles.length} articles`);

    const limiter = pLimit(CONCURRENT_LIMIT);
    const tasks = articles.map(article =>
      limiter(() => processArticle(article, runId))
    );

    const results = await Promise.allSettled(tasks);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[CrawlerScheduler] Processed: ${successful} success, ${failed} errors`);
    console.log(`[CrawlerScheduler] Cycle took ${Date.now() - cycleStart}ms`);

    await finishRun(runId, {
      status: successful > 0 ? 'success' : 'error',
      items_processed: articles.length,
      items_saved: successful
    });
  } catch (e) {
    console.error('[CrawlerScheduler] Fatal error:', e.message);
    await finishRun(runId, {
      status: 'error',
      error_message: e.message
    });
  } finally {
    isSchedulerRunning = false;
  }
}

async function processArticle(article, runId) {
  const { id: articleId, url, title, status, attempt_count } = article;
  let domain = 'unknown';

  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {}

  // Create session
  const sessionId = await recordCrawlSession({
    articleId,
    domain,
    strategy: 'HTTP_THEN_PLAYWRIGHT'
  }).catch(() => null);

  if (!sessionId) {
    console.warn(`[ProcessArticle] ${articleId}: Failed to create session`);
    return;
  }

  // Mark as FETCHING
  await query(`UPDATE monitored_articles SET status='FETCHING' WHERE id=$1`, [articleId]);

  // Attempt 1: HTTP
  console.log(`[ProcessArticle] ${articleId}: Attempting HTTP`);
  const httpResult = await attemptHttpFetch(url, domain);

  await recordCrawlAttempt({
    sessionId,
    articleId,
    domain,
    attemptNumber: attempt_count + 1,
    stage: 'HTTP',
    status: httpResult.status,
    reason: httpResult.reason,
    httpStatus: httpResult.http_status,
    durationMs: httpResult.duration_ms,
    bytesDownloaded: httpResult.bytes_downloaded,
    retryable: httpResult.retryable
  }).catch(() => {});

  if (httpResult.status === 'SUCCESS' && httpResult.html) {
    const contentText = extractContentFromHtml(httpResult.html);
    const validation = await validateContentQuality(httpResult.html, contentText, title);

    if (validation.quality >= QUALITY_THRESHOLD) {
      // HTTP succeeded with good quality
      await saveReadyArticle(articleId, contentText, 'http', validation);
      await updateDomainProfile(domain, { stage: 'HTTP', status: 'SUCCESS', durationMs: httpResult.duration_ms });
      return;
    }
  }

  // Attempt 2: Playwright
  console.log(`[ProcessArticle] ${articleId}: Attempting Playwright`);
  const pwResult = await attemptPlaywrightFetch(url);

  await recordCrawlAttempt({
    sessionId,
    articleId,
    domain,
    attemptNumber: attempt_count + 1,
    stage: 'PLAYWRIGHT',
    status: pwResult.status,
    reason: pwResult.reason,
    durationMs: pwResult.duration_ms,
    bytesDownloaded: pwResult.bytes_downloaded,
    retryable: pwResult.retryable
  }).catch(() => {});

  if (pwResult.status === 'SUCCESS' && pwResult.html) {
    const contentText = extractContentFromHtml(pwResult.html);
    const validation = await validateContentQuality(pwResult.html, contentText, title);

    if (validation.quality >= QUALITY_THRESHOLD) {
      // Playwright succeeded with good quality
      await saveReadyArticle(articleId, contentText, 'playwright', validation);
      await updateDomainProfile(domain, { stage: 'PLAYWRIGHT', status: 'SUCCESS', durationMs: pwResult.duration_ms });
      return;
    }
  }

  // Both failed or low quality — check if retryable
  const finalReason = pwResult.reason ?? httpResult.reason ?? 'unknown_failure';
  const isRetryable = RETRYABLE_REASONS.has(finalReason) && attempt_count < MAX_ATTEMPTS - 1;

  if (isRetryable) {
    // Schedule retry
    const nextDelay = RETRY_DELAYS_MS[attempt_count + 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const scheduledAt = new Date(Date.now() + nextDelay);

    await query(
      `UPDATE monitored_articles
       SET status='RETRY', attempt_count=$2, scheduled_at=$3, failure_reason=$4
       WHERE id=$1`,
      [articleId, attempt_count + 1, scheduledAt, finalReason]
    );

    console.log(`[ProcessArticle] ${articleId}: Retry scheduled for ${scheduledAt.toISOString()}`);
  } else {
    // Give up
    await query(
      `UPDATE monitored_articles
       SET status='FAILED', attempt_count=$2, failure_reason=$3, extracted_at=now()
       WHERE id=$1`,
      [articleId, attempt_count + 1, finalReason]
    );

    console.log(`[ProcessArticle] ${articleId}: FAILED (${finalReason})`);
  }

  await updateDomainProfile(domain, {
    stage: 'EXTRACTION',
    status: 'FAILED',
    durationMs: httpResult.duration_ms + pwResult.duration_ms,
    failureReason: finalReason
  }).catch(() => {});
}

async function saveReadyArticle(articleId, contentText, method, validation) {
  const wordCount = contentText.split(/\s+/).length;

  await query(
    `UPDATE monitored_articles
     SET status='READY',
         content_text=$2,
         content_words=$3,
         extraction_method=$4,
         extracted_at=now(),
         failure_reason=NULL
     WHERE id=$1`,
    [articleId, contentText, wordCount, method]
  );

  // Also update page_metadata with quality info
  await query(
    `INSERT INTO page_metadata (article_id, extraction_method, content_quality)
     VALUES ($1, $2, $3)
     ON CONFLICT (article_id)
     DO UPDATE SET extraction_method=$2, content_quality=$3, updated_at=now()`,
    [articleId, method, validation.quality]
  ).catch(() => {});

  console.log(`[ProcessArticle] ${articleId}: READY (${method}, quality: ${validation.quality})`);
}

// ============================================================================
// Exports
// ============================================================================

export async function getSchedulerStats() {
  const { rows: stats } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status='READY') as ready_count,
      COUNT(*) FILTER (WHERE status='FAILED') as failed_count,
      COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRY', 'FETCHING')) as pending_count,
      COUNT(*) FILTER (WHERE status='PENDING' AND created_at < now() - interval '24 hours') as stale_pending
    FROM monitored_articles
  `);

  return stats[0] || {};
}
