# Monitor Profiler — Quick Setup

Your profiler is ready to collect real data. Here's the minimal checklist to get started.

## What to Expect

When you run `npm run worker`, the monitor will:
1. Process news sources (RSS, sitemap, Playwright discovery)
2. Extract article metadata
3. Detect stories and clusters
4. Track performance metrics
5. **Save JSON profile to `./logs/monitor-profile-{timestamp}.json`**

The cycle takes 5–10 minutes depending on network and number of sources.

## Commands

### Run Monitor (Collect Data)
```bash
npm run worker
```

Monitor logs will show: `[Monitor] Profile saved to ./logs/monitor-profile-2026-07-01T...json`

### Analyze Data (No jq required)
```bash
# Latest profile
node analyze-profile.js

# All profiles collected
node analyze-profile.js all

# Trend of last 5
node analyze-profile.js trend

# Before vs After comparison
node analyze-profile.js compare
```

### Files Created
- `logs/monitor-profile-YYYY-MM-DDTHH-MM-SS-sssZ.json` — Profiler data
- `analyze-profile.js` — Analysis tool (Windows-compatible)

## Immediate Next Steps

1. **Today:** Run monitor once or twice
   ```bash
   npm run worker
   node analyze-profile.js
   ```

2. **This week:** Collect 5-10 profiles across different hours
   ```bash
   npm run worker                    # Run 1
   # ... later ...
   npm run worker                    # Run 2
   node analyze-profile.js trend     # See pattern
   ```

3. **Next week:** Use baseline data to make infrastructure decisions
   - Compare CPU%, memory, duration against your budget
   - Identify if bottleneck is Playwright (I/O) or clustering (CPU)

## Documentation

- **Interpretation:** `memory/monitor_profiler_production_guide.md`
- **Analysis Scripts:** `memory/monitor_profiler_analysis_script.md`
- **This Tool:** `ANALYZE_PROFILES.md`
- **Troubleshooting:** `PROFILER_TROUBLESHOOTING.md`

## TL;DR

1. `npm run worker` → Wait for completion
2. `node analyze-profile.js` → See real metrics
3. Run 5+ times this week → Build a baseline
4. Use baseline to size infrastructure

**That's it. No configuration needed. Just run and analyze.**

