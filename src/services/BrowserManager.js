import { chromium } from 'playwright';
import { perfTracker } from './PerformanceTracker.js';

/**
 * BrowserManager — Singleton manager for Playwright Chromium.
 * Aims to reduce CPU/RAM by reusing a single browser instance.
 */
class BrowserManager {
  constructor() {
    this.browser = null;
    this.launchPromise = null;
  }

  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    console.log('[BROWSER_CREATED] BrowserManager Singleton');
    console.log(new Error().stack);
    
    this.launchPromise = (async () => {
      try {
        const browser = await chromium.launch({
          headless: true,
          args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
        });
        this.browser = browser;
        this.browser.once('disconnected', () => {
          console.warn('[BROWSER_CLOSED] BrowserManager Singleton (Unexpected)');
          this.browser = null;
          this.launchPromise = null;
        });
        return browser;
      } catch (e) {
        this.launchPromise = null;
        throw e;
      }
    })();

    return this.launchPromise;
  }

  async newContext(options = {}) {
    console.log('[CONTEXT_CREATED] BrowserManager');
    const browser = await this.getBrowser();
    return await browser.newContext(options);
  }

  async newPage(options = {}) {
    console.log('[PAGE_CREATED] BrowserManager');
    const context = await this.newContext(options);
    const page = await context.newPage();
    return { page, context };
  }
}

export const browserManager = new BrowserManager();
