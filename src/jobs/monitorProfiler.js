// Monitor Profiler v2 — per-component wall/CPU/items/errors, accumulated across
// repeated begin()/end() calls (v1 overwrote on each call, so any component
// invoked more than once per cycle — e.g. once per source — only ever
// reported its LAST call, silently discarding every call before it).
//
// begin(name) returns a token instead of mutating shared per-name state, so
// interleaved/concurrent measurements of the same component name (e.g. two
// async workers touching different components at once) can't clobber each
// other's start marks.
//
// CAVEAT (documented per instrumentation request, not solved here): if two
// components' measured sections genuinely overlap in wall-clock time (this
// happens for the async entity/story/event/opportunity workers, which are
// dispatched via setImmediate and run concurrently with each other, and can
// even overlap with the NEXT cycle's synchronous phase), the sum of
// component CPU times can exceed the CPU time attributed to the cycle as a
// whole. CPU is measured with process.cpuUsage() deltas, which reflect the
// whole Node process, not a specific async task — concurrent sections each
// see some of the same CPU ticks.
export class MonitorProfiler {
  constructor() {
    this.components = {};
    this.globalStart = null;
    this.globalCpuStart = null;
    this.memRssStart = 0;
    this.memRssPeak = 0;
    this.memRssEnd = 0;
    this.metrics = {
      browsers: 0,
      contexts: 0,
      pages: 0,
      articlesFound: 0,
      articlesValid: 0,
      sourceTimings: {},
    };
    // Playwright-specific counters, kept separate from generic component
    // timing per instrumentation request — these are cumulative counts, not
    // wall/cpu measurements (wall time for Playwright work is still recorded
    // via the normal begin/end components, e.g. "Playwright Homepage
    // Discovery" and "Article Playwright Fallback").
    this.playwright = {
      browserAcquires: 0,     // acquire() calls that launched a NEW browser
      browserReuses: 0,       // acquire() calls served from the idle pool
      pagesCreated: 0,        // browser.newPage() calls, any Playwright path
      homepageDiscoveryCalls: 0,
      articleFallbackCalls: 0,
    };
  }

  start() {
    this.globalStart = Date.now();
    this.globalCpuStart = process.cpuUsage();
    this.memRssStart = process.memoryUsage().rss;
    this.memRssPeak = this.memRssStart;
  }

  // Returns a token; pass it to end(). Safe to call multiple times per name
  // per cycle — each begin/end pair accumulates into the same component.
  begin(name) {
    if (!this.components[name]) {
      this.components[name] = {
        calls: 0,
        wallMs: 0,
        cpuUserMs: 0,
        cpuSystemMs: 0,
        itemsIn: 0,
        itemsOut: 0,
        errors: 0,
      };
    }
    return { name, t0: Date.now(), c0: process.cpuUsage() };
  }

  end(token, { itemsIn = 0, itemsOut = 0, error = false } = {}) {
    if (!token) return;
    const comp = this.components[token.name];
    if (!comp) return;

    const dt = Date.now() - token.t0;
    const dc = process.cpuUsage(token.c0);

    comp.calls += 1;
    comp.wallMs += dt;
    comp.cpuUserMs += dc.user / 1000;
    comp.cpuSystemMs += dc.system / 1000;
    comp.itemsIn += itemsIn;
    comp.itemsOut += itemsOut;
    if (error) comp.errors += 1;

    this._trackMemPeak();
  }

  _trackMemPeak() {
    const rss = process.memoryUsage().rss;
    if (rss > this.memRssPeak) this.memRssPeak = rss;
  }

  // Call once when the whole cycle (sync phase + all async workers) is done,
  // so memRssEnd reflects the true end rather than the sync-phase snapshot.
  finalizeMemory() {
    this.memRssEnd = process.memoryUsage().rss;
    this._trackMemPeak();
  }

  setMetrics(data) {
    this.metrics = { ...this.metrics, ...data };
  }

  trackSourceTiming(sourceName, durationMs) {
    if (!this.metrics.sourceTimings[sourceName]) {
      this.metrics.sourceTimings[sourceName] = [];
    }
    this.metrics.sourceTimings[sourceName].push(durationMs);
  }

  // Snapshot-diff helper for counters that live outside the profiler (e.g.
  // browserPool.stats(), which is a module-level singleton not reset per
  // cycle). Call once before the cycle and once after; pass both snapshots.
  static diffBrowserPoolStats(before, after) {
    return {
      created: after.created - before.created,
      reused: after.reused - before.reused,
      peak: after.peak, // peak is a running high-water mark, not diffable
      waiting: after.waiting,
    };
  }

  report() {
    const globalEnd = Date.now();
    const globalCpuEnd = process.cpuUsage(this.globalCpuStart);

    const totalDuration = globalEnd - this.globalStart;
    const totalCpuUser = globalCpuEnd.user / 1000;
    const totalCpuSystem = globalCpuEnd.system / 1000;

    const sorted = Object.entries(this.components)
      .sort((a, b) => b[1].wallMs - a[1].wallMs);

    console.log('\n=== Monitor Profiling Report v2 (sync phase) ===');
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`CPU Time: ${totalCpuUser.toFixed(0)}ms user / ${totalCpuSystem.toFixed(0)}ms system`);
    console.log(`Memory RSS: start ${(this.memRssStart / 1024 / 1024).toFixed(1)} MB, peak ${(this.memRssPeak / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Chromium Instances: ${this.metrics.browsers} browsers, ${this.metrics.contexts} contexts, ${this.metrics.pages} pages`);

    if (this.metrics.articlesFound > 0) {
      const throughput = ((this.metrics.articlesValid / (totalDuration / 1000)).toFixed(2));
      console.log(`Articles: ${this.metrics.articlesFound} found, ${this.metrics.articlesValid} valid (${throughput}/sec)`);
    }

    console.log('\nComponent breakdown (by wall time):');
    console.log('Name | Calls | Items In | Items Out | Wall ms | CPU User ms | CPU System ms | Errors');
    console.log('-----|-------|----------|-----------|---------|-------------|---------------|-------');

    sorted.forEach(([name, c]) => {
      console.log(
        `${name.padEnd(30)} | ${String(c.calls).padStart(5)} | ${String(c.itemsIn).padStart(8)} | ${String(c.itemsOut).padStart(9)} | ${c.wallMs.toFixed(0).padStart(7)} | ${c.cpuUserMs.toFixed(0).padStart(11)} | ${c.cpuSystemMs.toFixed(0).padStart(13)} | ${String(c.errors).padStart(6)}`
      );
    });

    console.log('\nPlaywright counters:');
    console.log(`  browser_acquires (new launches): ${this.playwright.browserAcquires}`);
    console.log(`  browser_reuses:                  ${this.playwright.browserReuses}`);
    console.log(`  pages_created:                   ${this.playwright.pagesCreated}`);
    console.log(`  homepage_discovery_calls:         ${this.playwright.homepageDiscoveryCalls}`);
    console.log(`  article_fallback_calls:           ${this.playwright.articleFallbackCalls}`);

    console.log('=================================================\n');

    return this.toJSON();
  }

  // Logged separately once the setImmediate-dispatched async workers
  // (entity/story/event/opportunity) finish — they run after report() above
  // already fired, so their timing is not part of the sync-phase report.
  reportAsyncPhase(asyncComponentNames) {
    console.log('\n=== Async Workers Profile (entity/story/event/opportunity) ===');
    console.log('Name | Calls | Items In | Items Out | Wall ms | CPU User ms | CPU System ms | Errors');
    console.log('-----|-------|----------|-----------|---------|-------------|---------------|-------');
    for (const name of asyncComponentNames) {
      const c = this.components[name];
      if (!c) continue;
      console.log(
        `${name.padEnd(30)} | ${String(c.calls).padStart(5)} | ${String(c.itemsIn).padStart(8)} | ${String(c.itemsOut).padStart(9)} | ${c.wallMs.toFixed(0).padStart(7)} | ${c.cpuUserMs.toFixed(0).padStart(11)} | ${c.cpuSystemMs.toFixed(0).padStart(13)} | ${String(c.errors).padStart(6)}`
      );
    }
    this.finalizeMemory();
    console.log(`Memory RSS at async-phase end: ${(this.memRssEnd / 1024 / 1024).toFixed(1)} MB (peak so far: ${(this.memRssPeak / 1024 / 1024).toFixed(1)} MB)`);
    console.log('================================================================\n');
  }

  toJSON() {
    const globalEnd = Date.now();
    const globalCpuEnd = process.cpuUsage(this.globalCpuStart);
    const totalDuration = globalEnd - this.globalStart;
    const totalCpuUser = globalCpuEnd.user / 1000;
    const totalCpuSystem = globalCpuEnd.system / 1000;

    return {
      timestamp: new Date(this.globalStart).toISOString(),
      duration_ms: totalDuration,
      cpu_user_ms: totalCpuUser.toFixed(0),
      cpu_system_ms: totalCpuSystem.toFixed(0),
      mem_rss_start_mb: (this.memRssStart / 1024 / 1024).toFixed(1),
      mem_rss_peak_mb: (this.memRssPeak / 1024 / 1024).toFixed(1),
      mem_rss_end_mb: this.memRssEnd ? (this.memRssEnd / 1024 / 1024).toFixed(1) : null,
      chromium: {
        browsers: this.metrics.browsers,
        contexts: this.metrics.contexts,
        pages: this.metrics.pages,
      },
      playwright: { ...this.playwright },
      articles: {
        found: this.metrics.articlesFound,
        valid: this.metrics.articlesValid,
        throughput_per_sec: this.metrics.articlesValid > 0
          ? (this.metrics.articlesValid / (totalDuration / 1000)).toFixed(2)
          : 0,
      },
      components: Object.entries(this.components)
        .map(([name, c]) => ({
          name,
          calls: c.calls,
          items_in: c.itemsIn,
          items_out: c.itemsOut,
          wall_ms: c.wallMs,
          cpu_user_ms: c.cpuUserMs.toFixed(0),
          cpu_system_ms: c.cpuSystemMs.toFixed(0),
          errors: c.errors,
          pct_wall: totalDuration > 0 ? ((c.wallMs / totalDuration) * 100).toFixed(1) : '0.0',
          pct_cpu: totalCpuUser > 0 ? ((c.cpuUserMs / totalCpuUser) * 100).toFixed(1) : '0.0',
        }))
        .sort((a, b) => b.wall_ms - a.wall_ms),
      source_timings: this.metrics.sourceTimings,
    };
  }
}
