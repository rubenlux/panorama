// Global Playwright audit counters — tracks active + peak instances across all callers
export const browserAudit = {
  activeBrowsers: 0,
  activeContexts: 0,
  activePages: 0,
  peakBrowsers: 0,
  peakContexts: 0,
  peakPages: 0,

  browserOpen(source) {
    this.activeBrowsers++;
    if (this.activeBrowsers > this.peakBrowsers) this.peakBrowsers = this.activeBrowsers;
    console.log(`[BROWSER_CREATED] source=${source} active_browsers=${this.activeBrowsers}`);
  },
  browserClose(source) {
    this.activeBrowsers = Math.max(0, this.activeBrowsers - 1);
    console.log(`[BROWSER_CLOSED] source=${source} active_browsers=${this.activeBrowsers}`);
  },
  contextOpen(source) {
    this.activeContexts++;
    if (this.activeContexts > this.peakContexts) this.peakContexts = this.activeContexts;
  },
  contextClose() {
    this.activeContexts = Math.max(0, this.activeContexts - 1);
  },
  pageOpen(source) {
    this.activePages++;
    if (this.activePages > this.peakPages) this.peakPages = this.activePages;
    console.log(`[PAGE_CREATED] source=${source} active_pages=${this.activePages}`);
  },
  pageClose(source) {
    this.activePages = Math.max(0, this.activePages - 1);
    console.log(`[PAGE_CLOSED] source=${source} active_pages=${this.activePages}`);
  },
  resetPeaks() {
    this.peakBrowsers = 0;
    this.peakContexts = 0;
    this.peakPages = 0;
  },
  report(label = '') {
    const prefix = label ? `[${label}] ` : '';
    console.log(`\n${prefix}=== PLAYWRIGHT AUDIT ===`);
    console.log(`Peak Browsers:  ${this.peakBrowsers}`);
    console.log(`Peak Contexts:  ${this.peakContexts}`);
    console.log(`Peak Pages:     ${this.peakPages}`);
    console.log(`Active Now:     browsers=${this.activeBrowsers} contexts=${this.activeContexts} pages=${this.activePages}`);
    console.log(`========================\n`);
  },
};

export function logBrowserLifecycle(event, source) {
  const timestamp = new Date().toISOString();
  if (event === 'BROWSER_CREATED') { browserAudit.browserOpen(source); return; }
  if (event === 'BROWSER_CLOSED')  { browserAudit.browserClose(source); return; }
  if (event === 'PAGE_CREATED')    { browserAudit.pageOpen(source); return; }
  if (event === 'PAGE_CLOSED')     { browserAudit.pageClose(source); return; }
  if (event === 'CONTEXT_CREATED') { browserAudit.contextOpen(source); }
  if (event === 'CONTEXT_CLOSED')  { browserAudit.contextClose(); }
  // Non-browser events (CONTEXT_*) still get a timestamped line
  console.log(`[${event}] source=${source} timestamp=${timestamp}`);
}

export function watchBrowserDisconnect(browser, source) {
  // Only fires on unexpected disconnect — intentional close is already logged in finally blocks
  browser.once('disconnected', () => {
    console.warn(`[BROWSER_DISCONNECTED] source=${source} (unexpected)`);
  });
}
