// Monitor Profiler — Track timing and CPU by component
export class MonitorProfiler {
  constructor() {
    this.components = {};
    this.globalStart = null;
    this.globalCpuStart = null;
  }

  start() {
    this.globalStart = Date.now();
    this.globalCpuStart = process.cpuUsage();
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
    this.components[name].cpuUser = endCpu.user / 1000; // Convert to ms
    this.components[name].cpuSystem = endCpu.system / 1000;
  }

  report() {
    const globalEnd = Date.now();
    const globalCpuEnd = process.cpuUsage(this.globalCpuStart);

    const totalDuration = globalEnd - this.globalStart;
    const totalCpuUser = globalCpuEnd.user / 1000;

    // Sort by duration descending
    const sorted = Object.entries(this.components)
      .sort((a, b) => b[1].duration - a[1].duration);

    console.log('\n=== Monitor Profiling Report ===');
    console.log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`Total CPU: ${totalCpuUser.toFixed(0)}ms user time\n`);

    console.log('Component breakdown (sorted by duration):');
    console.log('Name | Duration (ms) | % of Total | CPU User (ms) | % CPU');
    console.log('-----|---------------|-----------|---------------|---------');

    sorted.forEach(([name, data]) => {
      const pctTime = ((data.duration / totalDuration) * 100).toFixed(1);
      const pctCpu = ((data.cpuUser / totalCpuUser) * 100).toFixed(1);
      console.log(
        `${name.padEnd(20)} | ${String(data.duration).padStart(13)} | ${pctTime.padStart(9)} | ${String(data.cpuUser.toFixed(0)).padStart(13)} | ${pctCpu.padStart(7)}`
      );
    });

    console.log('==================================\n');
  }
}
