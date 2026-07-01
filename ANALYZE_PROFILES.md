# Analyze Profiler Data

Cross-platform Node.js script for analyzing monitor profiler JSON files (no jq required).

## Quick Start

```bash
# Show latest profile
node analyze-profile.js

# Show all profiles collected so far
node analyze-profile.js all

# Show trend of last 5 profiles
node analyze-profile.js trend

# Compare first profile vs latest
node analyze-profile.js compare
```

## What Each Command Shows

### `latest` (default)
Shows the most recent profile with:
- Timestamp, duration, CPU time, peak memory
- Chromium instance count
- Articles found/valid and throughput
- Top 5 components by wall-clock time
- Source timings (slowest first)

**Use this:** After each monitor cycle to see real performance

### `all`
Lists all collected profiles with their key metrics in a table.

**Use this:** To see the full history and identify outliers

### `trend`
Shows the last 5 profiles as a timeline with averages.

**Use this:** To detect trends (CPU growing? Memory stable?)

### `compare`
Compares the first vs last profile with percentage changes.

**Use this:** After running for a few hours to see if performance changed

## Example Output

```
=== Latest Profile ===

Timestamp:  2026-07-01T14:32:15.000Z
Duration:   372.5s
CPU:        24s
Memory:     8.2 MB
Chromium:   1 browsers, 4 contexts, 18 pages
Articles:   420 found, 380 valid (1.02/sec)

Top Components (by wall-clock time):
  RSS + Playwright Discovery    225.0s wall (60.4% of cycle) | 14800ms CPU (61.7%)
  Story Detection + Clustering   65.0s wall (17.5% of cycle) | 4200ms CPU (17.5%)
  Event Detection                42.0s wall (11.3% of cycle) | 2500ms CPU (10.4%)
  HTTP Fetch                     48.0s wall (12.9% of cycle) | 3200ms CPU (13.3%)
  Entity Matching + NER          18.0s wall (4.8% of cycle) | 1100ms CPU (4.6%)

Source Timings (slowest first):
  Vía País                   22.0ms avg (2 calls)
  Guau                        5.7ms avg (8 calls)
  Infobae                     1.8ms avg (20 calls)
  Reuters                     2.1ms avg (18 calls)
  TN                          1.4ms avg (22 calls)
```

## Integration with Profiling Workflow

**Day 1 - Collect Baseline:**
```bash
npm run worker              # Run 1 cycle
node analyze-profile.js     # See first profile

# Run 9 more times (or wait for scheduler)
npm run worker
node analyze-profile.js trend  # After 5+ profiles
```

**Day 2 - Optimize:**
```bash
# Make a change (e.g., reduce Chromium pages)
# Then run monitor again
npm run worker
node analyze-profile.js compare  # See improvement
```

**Week 1 - Regression Testing:**
```bash
# Every day, run:
node analyze-profile.js trend    # Check for gradual increases
```

## Common Interpretation Patterns

| What You See | What It Means | Action |
|--------------|---------------|--------|
| Duration 360s, CPU 20s | 95% waiting, 5% compute | I/O-bound (normal for Playwright) |
| Duration 360s, CPU 350s | Nearly all CPU | CPU-bound, consider optimization |
| CPU trending up 5% per day | Performance degradation | Investigate top component |
| Memory peaked 500MB | Possible memory leak | Check if consistent across runs |
| Chromium pages = 22 | High parallelism | May need more instances at scale |
| Throughput 1.02/sec | Normal speed | Baseline validated |

## Troubleshooting

**"No profile files found"**
- Monitor hasn't run yet or had an error
- Check: `npm run worker` and wait for completion
- Check logs: Look for `[Monitor] Profile saved to ...`

**All metrics showing zero**
- Monitor ran but collected 0 articles
- This is correct behavior when no new articles found
- Run on an hour with active news feeds

**Script exits with error**
- Ensure Node.js is available: `node --version`
- Ensure logs directory exists: `mkdir -p logs`

## Advanced: Manual CSV Export

To export all profiles to CSV for spreadsheet analysis:

```bash
# Extract key metrics from all profiles
node -e "
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('logs')
  .filter(f => f.startsWith('monitor-profile-'))
  .sort();

console.log('timestamp,duration_s,cpu_s,memory_mb,articles_valid,pages');

files.forEach(f => {
  const p = JSON.parse(fs.readFileSync(path.join('logs', f)));
  console.log([
    p.timestamp,
    (p.duration_ms/1000).toFixed(1),
    (p.cpu_user_ms/1000).toFixed(0),
    p.peak_memory_mb,
    p.articles.valid,
    p.chromium.pages
  ].join(','));
});
" > profiles-export.csv
```

Then import `profiles-export.csv` into Excel/Sheets and create graphs.

---

## Summary

Use `node analyze-profile.js` to understand system performance without manual JSON inspection. Run it after each monitor cycle to track trends and make infrastructure decisions.

