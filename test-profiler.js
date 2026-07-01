#!/usr/bin/env node

/**
 * Simple profiler test — validates MonitorProfiler works without hitting crash issues
 */

import { MonitorProfiler } from './src/jobs/monitorProfiler.js';
import fs from 'fs';

console.log('Testing MonitorProfiler...\n');

const profiler = new MonitorProfiler();
profiler.start();

// Simulate component execution
profiler.begin('RSS Discovery');
await new Promise(r => setTimeout(r, 500));
profiler.end('RSS Discovery');

profiler.begin('URL Extraction');
await new Promise(r => setTimeout(r, 300));
profiler.end('URL Extraction');

profiler.begin('Playwright Extraction');
await new Promise(r => setTimeout(r, 400));
profiler.end('Playwright Extraction');

profiler.begin('Story Clustering');
await new Promise(r => setTimeout(r, 200));
profiler.end('Story Clustering');

// Set metrics
profiler.setMetrics({
  browsers: 1,
  contexts: 2,
  pages: 5,
  articlesFound: 42,
  articlesValid: 38,
  sourceTimings: {
    'Reuters': [1200, 1250, 1100],
    'TN': [950, 1000, 900],
    'BBC': [2500, 2400, 2600]
  }
});

// Generate report
const profileJson = profiler.report();

// Save to file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filePath = `./logs/monitor-profile-test-${timestamp}.json`;

try {
  // Ensure directory exists
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(profileJson, null, 2));
  console.log(`\n✅ Profile saved to: ${filePath}`);
  console.log(`   File size: ${fs.statSync(filePath).size} bytes`);

  // Verify it's valid JSON
  const read = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`✅ Valid JSON verified`);
  console.log(`   Keys: ${Object.keys(read).join(', ')}`);

} catch (e) {
  console.error(`❌ Error saving profile: ${e.message}`);
  process.exit(1);
}

console.log('\n✅ Profiler test passed!');
