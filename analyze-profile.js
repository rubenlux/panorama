#!/usr/bin/env node

/**
 * Analyze Monitor Profiler JSON files (Windows/cross-platform compatible)
 * Usage: node analyze-profile.js [action]
 *
 * Actions:
 *   latest  - Show latest profile stats (default)
 *   all     - List all profiles with timestamps
 *   trend   - Show last 5 profiles trend
 *   compare - Compare first vs last profile
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getProfileFiles() {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    return [];
  }

  return fs.readdirSync(logsDir)
    .filter(f => f.startsWith('monitor-profile-') && f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(logsDir, f),
      time: fs.statSync(path.join(logsDir, f)).mtime
    }))
    .sort((a, b) => a.time - b.time);
}

function readProfile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function showLatest() {
  const files = getProfileFiles();
  if (files.length === 0) {
    console.log('❌ No profile files found in ./logs/');
    console.log('   Run: npm run worker');
    return;
  }

  const latest = readProfile(files[files.length - 1].path);

  console.log('\n=== Latest Profile ===\n');
  console.log(`Timestamp:  ${latest.timestamp}`);
  console.log(`Duration:   ${(latest.duration_ms / 1000).toFixed(1)}s`);
  console.log(`CPU:        ${(latest.cpu_user_ms / 1000).toFixed(0)}s`);
  console.log(`Memory:     ${latest.peak_memory_mb} MB`);
  console.log(`Chromium:   ${latest.chromium.browsers} browsers, ${latest.chromium.contexts} contexts, ${latest.chromium.pages} pages`);
  console.log(`Articles:   ${latest.articles.found} found, ${latest.articles.valid} valid (${latest.articles.throughput_per_sec}/sec)`);

  console.log('\nTop Components (by wall-clock time):');
  const sorted = latest.components.sort((a, b) => b.wall_ms - a.wall_ms);
  sorted.slice(0, 5).forEach(c => {
    console.log(`  ${c.name.padEnd(30)} ${(c.wall_ms/1000).toFixed(1)}s wall (${c.pct_time}% of cycle) | ${c.cpu_ms}ms CPU (${c.pct_cpu}%)`);
  });

  if (Object.keys(latest.source_timings).length > 0) {
    console.log('\nSource Timings (slowest first):');
    const sources = Object.entries(latest.source_timings)
      .map(([name, times]) => ({
        name,
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        count: times.length
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    sources.forEach(s => {
      console.log(`  ${s.name.padEnd(25)} ${s.avg.toFixed(1)}ms avg (${s.count} calls)`);
    });
  }

  console.log('');
}

function showAll() {
  const files = getProfileFiles();
  if (files.length === 0) {
    console.log('❌ No profile files found');
    return;
  }

  console.log('\n=== All Profiles ===\n');
  files.forEach(f => {
    const profile = readProfile(f.path);
    console.log(`${f.name.substring(16, 35)} | ${(profile.duration_ms/1000).toFixed(0)}s duration | ${(profile.cpu_user_ms/1000).toFixed(0)}s CPU | ${profile.peak_memory_mb} MB | ${profile.articles.valid} articles`);
  });
  console.log('');
}

function showTrend() {
  const files = getProfileFiles();
  if (files.length === 0) {
    console.log('❌ No profile files found');
    return;
  }

  const recent = files.slice(-5).map(f => readProfile(f.path));

  console.log('\n=== Trend (Last 5 Runs) ===\n');
  console.log('Timestamp              | Duration | CPU  | Memory | Pages');
  console.log('------------------------|----------|------|--------|-------');

  recent.forEach(p => {
    const ts = p.timestamp.substring(11, 19);
    const dur = (p.duration_ms / 1000).toFixed(0).padStart(4);
    const cpu = (p.cpu_user_ms / 1000).toFixed(0).padStart(3);
    const mem = p.peak_memory_mb.padStart(5);
    const pages = String(p.chromium.pages).padStart(4);
    console.log(`${ts}      | ${dur}s    | ${cpu}s  | ${mem}MB | ${pages}`);
  });

  // Calculate averages
  const avgCpu = recent.reduce((a, p) => a + parseInt(p.cpu_user_ms), 0) / recent.length;
  const avgMem = recent.reduce((a, p) => a + parseFloat(p.peak_memory_mb), 0) / recent.length;
  const avgDur = recent.reduce((a, p) => a + p.duration_ms, 0) / recent.length;

  console.log('');
  console.log(`Average: ${(avgDur/1000).toFixed(0)}s duration, ${(avgCpu/1000).toFixed(0)}s CPU, ${avgMem.toFixed(1)} MB peak`);
  console.log('');
}

function showComparison() {
  const files = getProfileFiles();
  if (files.length < 2) {
    console.log('❌ Need at least 2 profiles to compare');
    return;
  }

  const first = readProfile(files[0].path);
  const last = readProfile(files[files.length - 1].path);

  console.log('\n=== Before/After Comparison ===\n');

  const cpuChange = ((last.cpu_user_ms - first.cpu_user_ms) / first.cpu_user_ms * 100).toFixed(0);
  const durChange = ((last.duration_ms - first.duration_ms) / first.duration_ms * 100).toFixed(0);

  console.log(`First:  ${first.timestamp}`);
  console.log(`  Duration: ${(first.duration_ms/1000).toFixed(0)}s | CPU: ${(first.cpu_user_ms/1000).toFixed(0)}s | Memory: ${first.peak_memory_mb} MB`);

  console.log(`\nLast:   ${last.timestamp}`);
  console.log(`  Duration: ${(last.duration_ms/1000).toFixed(0)}s | CPU: ${(last.cpu_user_ms/1000).toFixed(0)}s | Memory: ${last.peak_memory_mb} MB`);

  console.log(`\nChange: CPU ${cpuChange > 0 ? '+' : ''}${cpuChange}% | Duration ${durChange > 0 ? '+' : ''}${durChange}%`);
  console.log('');
}

// Main
const action = process.argv[2] || 'latest';

switch (action) {
  case 'latest':
    showLatest();
    break;
  case 'all':
    showAll();
    break;
  case 'trend':
    showTrend();
    break;
  case 'compare':
    showComparison();
    break;
  default:
    console.log(`Usage: node analyze-profile.js [latest|all|trend|compare]`);
    showLatest();
}
