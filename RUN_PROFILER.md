# Run Monitor with Profiler

Execute the news monitor to collect profiler data.

## Prerequisites

```bash
# Ensure database is running
npm run db:up

# Ensure database is initialized
npm run db:init
```

## Collect Profiler Data

```bash
# Run monitor once (5+ minutes)
npm run worker

# Monitor will output:
# [Monitor] Profile saved to ./logs/monitor-profile-2026-07-01T102530-000Z.json

# Check generated profile
ls -lh logs/monitor-profile-*.json
```

## View Real Data

```bash
# Latest profile (formatted)
jq '.timestamp, .duration_ms, .cpu_user_ms, .peak_memory_mb, .articles, .chromium' \
  logs/monitor-profile-*.json | tail -1

# Example output:
# "2026-07-01T10:25:30.000Z"
# 372400
# "24000"
# "8.2"
# {...}
```

## Quick Analysis

```bash
# Top 3 components by wall-clock time
jq '.components | sort_by(.wall_ms) | reverse | .[0:3] | .[] | {name, wall_ms, pct_time}' \
  logs/monitor-profile-*.json | tail -1

# Source timings
jq '.source_timings' logs/monitor-profile-*.json | tail -1
```

## Collect Baseline (Week 1)

Run monitor every 30 minutes for 1 week:

```bash
# Daily baseline collection (example for Linux/macOS)
while true; do
  npm run worker
  echo "[$(date)] Monitor cycle complete"
  sleep 1800  # 30 minutes
done
```

After 1 week, compare profiles:

```bash
# Average CPU over all profiles
jq -s 'map(.cpu_user_ms | tonumber) | add/length' logs/monitor-profile-*.json

# Average duration
jq -s 'map(.duration_ms) | add/length' logs/monitor-profile-*.json

# Peak memory
jq -s 'map(.peak_memory_mb | tonumber) | max' logs/monitor-profile-*.json
```

## Infrastructure Sizing Decision

With 10+ profiles, you can decide:

```bash
# Show all profiles as timeline
jq -s '.[] | {
  time: .timestamp,
  cpu_sec: (.cpu_user_ms/1000 | round),
  mem_mb: (.peak_memory_mb | tonumber),
  duration_sec: (.duration_ms/1000 | round)
} | "\(.time): \(.cpu_sec)s CPU, \(.mem_mb)MB, \(.duration_sec)s total"' \
  logs/monitor-profile-*.json
```

**Decision matrix:**

| Avg CPU | Peak Mem | Chromium Pages | AWS Tier |
|---------|----------|---|---|
| <10s | <5MB | <12 | t3.micro (1 core, 1GB) |
| 15-25s | 8-10MB | 15-20 | t3.small (2 cores, 2GB) |
| 30-40s | 12-15MB | 20-25 | t3.medium (2 cores, 4GB) |
| >40s | >15MB | >25 | t3.large (2 cores, 8GB) |

---

## See Also

- `memory/monitor_profiler_production_guide.md` — Full guide to interpretation and optimization
- `memory/monitor_profiler_analysis_script.md` — Analysis scripts and CSV export
