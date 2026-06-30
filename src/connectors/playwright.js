import { chromium } from 'playwright';

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
  }
  return browser;
}

// Returns { status, reason, http_status, duration_ms, bytes_downloaded, html } for observability
export async function scrapeWithPlaywright(url, timeoutMs = 30000) {
  let page = null;
  const startTime = Date.now();
  let lastHttpStatus = null;

  try {
    const br = await getBrowser();
    page = await br.newPage();

    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    // Capture HTTP status codes
    page.on('response', (response) => {
      if (response.url() === url) {
        lastHttpStatus = response.status();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    const durationMs = Date.now() - startTime;
    const bytesDownloaded = Buffer.byteLength(html, 'utf8');

    if (!html || html.trim().length === 0) {
      return {
        status: 'FAILED',
        reason: 'empty_html',
        http_status: lastHttpStatus,
        duration_ms: durationMs,
        bytes_downloaded: 0,
        html: null,
      };
    }

    return {
      status: 'SUCCESS',
      reason: null,
      http_status: lastHttpStatus || 200,
      duration_ms: durationMs,
      bytes_downloaded: bytesDownloaded,
      html,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    let reason = 'unknown_error';

    if (e.message.includes('Timeout') || e.message.includes('timeout')) {
      reason = 'timeout';
    } else if (e.message.includes('SSL') || e.message.includes('ssl')) {
      reason = 'ssl';
    } else if (e.message.includes('ERR_TOO_MANY_REDIRECTS')) {
      reason = 'redirect_loop';
    } else if (e.message.includes('navigation timeout')) {
      reason = 'navigation_timeout';
    } else if (lastHttpStatus === 403) {
      reason = 'cloudflare';
    } else if (lastHttpStatus === 404) {
      reason = '404';
    } else if (lastHttpStatus === 429) {
      reason = '429';
    }

    return {
      status: 'FAILED',
      reason,
      http_status: lastHttpStatus,
      duration_ms: durationMs,
      bytes_downloaded: 0,
      html: null,
      error_message: e.message,
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function isPlaywrightAvailable() {
  try {
    const br = await getBrowser();
    return !!br;
  } catch {
    return false;
  }
}
