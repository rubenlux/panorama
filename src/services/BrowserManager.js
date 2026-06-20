import { chromium } from 'playwright';
import { perfTracker } from './PerformanceTracker.js';
import { logBrowserLifecycle, watchBrowserDisconnect } from './browserLifecycleLogger.js';

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

    this.launchPromise = (async () => {
      try {
        const browser = await chromium.launch({
          headless: true,
          args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
        });
        logBrowserLifecycle('BROWSER_CREATED', 'BrowserManager');
        this.browser = browser;
        watchBrowserDisconnect(this.browser, 'BrowserManager');
        this.browser.once('disconnected', () => {
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
    const browser = await this.getBrowser();
    const context = await browser.newContext(options);
    logBrowserLifecycle('CONTEXT_CREATED', 'BrowserManager');
    return context;
  }

  async newPage(options = {}) {
    const context = await this.newContext(options);
    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'BrowserManager');
    return { page, context };
  }
}

export const browserManager = new BrowserManager();
