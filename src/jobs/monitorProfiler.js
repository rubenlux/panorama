// Monitor Profiler — Track timing, CPU, memory, and throughput
export class MonitorProfiler {
  constructor() {
    this.components = {};
    this.globalStart = null;
    this.globalCpuStart = null;
    this.globalMemStart = null;
    this.peakMemory = 0;
    this.metrics = {
      browsers: 0,
      contexts: 0,
      pages: 0,
      articlesFound: 0,
      articlesValid: 0,
      sourceTimings: {},
    };
  }

  start() {
    this.globalStart = Date.now();
    this.globalCpuStart = process.cpuUsage();
    this.globalMemStart = process.memoryUsage().heapUsed;
    this.peakMemory = this.globalMemStart;
  }

  begin(name) {
    if (!this.components[name]) {
      this.components[name] = {
        startTime: null,
        startCpu: null,
        duration: 0,
        cpuUser: 0,
        cpuSystem: 0,
      };
    }
    this.components[name].startTime = Date.now();
    this.components[name].startCpu = process.cpuUsage();
  }

  end(name) {
    if (!this.components[name]) return;

    const endTime = Date.now();
    const endCpu = process.cpuUsage(this.components[name].startCpu);

    this.components[name].duration = endTime - this.components[name].startTime;
    this.components[name].cpuUser = endCpu.user / 1000;
    this.components[name].cpuSystem = endCpu.system / 1000;

    // Track peak memory
    const currentMem = process.memoryUsage().heapUsed;
    if (currentMem > this.peakMemory) {
      this.peakMemory = currentMem;
    }
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

  report() {
    const globalEnd = Date.now();
    const globalCpuEnd = process.cpuUsage(this.globalCpuStart);

    const totalDuration = globalEnd - this.globalStart;
    const totalCpuUser = globalCpuEnd.user / 1000;
    const peakMemoryMb = (this.peakMemory / 1024 / 1024).toFixed(1);

    // Sort by duration descending
    const sorted = Object.entries(this.components)
      .sort((a, b) => b[1].duration - a[1].duration);

    console.log('\n=== Monitor Profiling Report ===');
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`CPU Time: ${totalCpuUser.toFixed(0)}ms user`);
    console.log(`Peak Memory: ${peakMemoryMb} MB`);
    console.log(`Chromium Instances: ${this.metrics.browsers} browsers, ${this.metrics.contexts} contexts, ${this.metrics.pages} pages`);

    if (this.metrics.articlesFound > 0) {
      const throughput = ((this.metrics.articlesValid / (totalDuration / 1000)).toFixed(2));
      console.log(`Articles: ${this.metrics.articlesFound} found, ${this.metrics.articlesValid} valid (${throughput}/sec)`);
    }

    console.log('\nComponent breakdown (by duration):');
    console.log('Name | Wall (ms) | % Time | CPU (ms) | % CPU');
    console.log('-----|-----------|--------|---------|--------');

    sorted.forEach(([name, data]) => {
      const pctTime = ((data.duration / totalDuration) * 100).toFixed(1);
      const pctCpu = totalCpuUser > 0 ? ((data.cpuUser / totalCpuUser) * 100).toFixed(1) : '0.0';
      console.log(
        `${name.padEnd(18)} | ${String(data.duration).padStart(9)} | ${pctTime.padStart(6)} | ${String(data.cpuUser.toFixed(0)).padStart(7)} | ${pctCpu.padStart(6)}`
      );
    });

    // Source timings if any
    if (Object.keys(this.metrics.sourceTimings).length > 0) {
      console.log('\nSource timings (avg):');
      const sourceAvgs = Object.entries(this.metrics.sourceTimings)
        .map(([name, timings]) => ({
          name,
          avg: timings.reduce((a, b) => a + b, 0) / timings.length,
          count: timings.length,
        }))
        .sort((a, b) => b.avg - a.avg);

      sourceAvgs.slice(0, 10).forEach(({ name, avg, count }) => {
        console.log(`${name.padEnd(25)} ${avg.toFixed(1)}ms (${count} calls)`);
      });
    }

    console.log('==================================\n');

    return this.toJSON();
  }

  toJSON() {
    const globalEnd = Date.now();
    const globalCpuEnd = process.cpuUsage(this.globalCpuStart);
    const totalDuration = globalEnd - this.globalStart;
    const totalCpuUser = globalCpuEnd.user / 1000;

    return {
      timestamp: new Date(this.globalStart).toISOString(),
      duration_ms: totalDuration,
      cpu_user_ms: totalCpuUser.toFixed(0),
      peak_memory_mb: (this.peakMemory / 1024 / 1024).toFixed(1),
      chromium: {
        browsers: this.metrics.browsers,
        contexts: this.metrics.contexts,
        pages: this.metrics.pages,
      },
      articles: {
        found: this.metrics.articlesFound,
        valid: this.metrics.articlesValid,
        throughput_per_sec: this.metrics.articlesValid > 0
          ? (this.metrics.articlesValid / (totalDuration / 1000)).toFixed(2)
          : 0,
      },
      components: Object.entries(this.components)
        .map(([name, data]) => ({
          name,
          wall_ms: data.duration,
          cpu_ms: data.cpuUser.toFixed(0),
          pct_time: ((data.duration / totalDuration) * 100).toFixed(1),
          pct_cpu: totalCpuUser > 0 ? ((data.cpuUser / totalCpuUser) * 100).toFixed(1) : '0.0',
        }))
        .sort((a, b) => b.wall_ms - a.wall_ms),
      source_timings: this.metrics.sourceTimings,
    };
  }
}
