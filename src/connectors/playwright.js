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

export async function scrapeWithPlaywright(url, timeoutMs = 30000) {
  let page = null;
  try {
    const br = await getBrowser();
    page = await br.newPage();

    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    return html;
  } catch (e) {
    console.error(`[Playwright] Failed to scrape ${url}: ${e.message}`);
    return null;
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
