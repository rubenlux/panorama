/**
 * BrowserPool — Sprint 4
 *
 * Single responsibility: administer reusable Chromium browsers.
 * Does NOT manage pages, scraping logic, or workers.
 *
 * MAX_BROWSERS is configurable via BROWSER_POOL_MAX_BROWSERS (default 3).
 * Never launches more than maxBrowsers concurrently — acquire() beyond that
 * waits FIFO until a release() frees one.
 */

import { chromium } from 'playwright';

const MAX_BROWSERS = parseInt(process.env.BROWSER_POOL_MAX_BROWSERS) || 3;

class BrowserPool {
  constructor(maxBrowsers = MAX_BROWSERS) {
    this.maxBrowsers = maxBrowsers;
    this.browsers = [];   // browsers that have finished launching (<= maxBrowsers)
    this.available = [];  // idle browsers ready to hand out
    this.waiting = [];    // FIFO queue of resolve() callbacks when pool is exhausted
    this.pending = 0;     // launches reserved but not yet finished (see acquire() race note)
    this.busy = 0;
    this.peak = 0;
    this.reused = 0;
  }

  async acquire() {
    if (this.available.length > 0) {
      const browser = this.available.shift();
      this.busy++;
      this.reused++;
      return browser;
    }

    // Reserve the slot synchronously (before the first await) so concurrent
    // acquire() calls can't all pass this check before any of them finishes
    // launching — chromium.launch() is async, and this.browsers only grows
    // once it resolves, so checking this.browsers.length alone here would
    // let N concurrent callers all launch before any push() lands.
    if (this.browsers.length + this.pending < this.maxBrowsers) {
      this.pending++;
      this.busy++;
      this.peak = Math.max(this.peak, this.browsers.length + this.pending);
      try {
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        this.browsers.push(browser);
        return browser;
      } finally {
        this.pending--;
      }
    }

    // Pool exhausted at maxBrowsers — wait FIFO for a release().
    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(browser) {
    this.busy--;

    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      this.busy++;
      this.reused++;
      resolve(browser);
      return;
    }

    this.available.push(browser);
  }

  async closeAll() {
    await Promise.all(this.browsers.map(b => b.close().catch(() => {})));
    this.browsers = [];
    this.available = [];
    this.waiting = [];
    this.busy = 0;
  }

  stats() {
    return {
      created: this.browsers.length,
      busy: this.busy,
      idle: this.available.length,
      waiting: this.waiting.length,
      peak: this.peak,
      reused: this.reused,
    };
  }
}

export const browserPool = new BrowserPool();
export { BrowserPool };
