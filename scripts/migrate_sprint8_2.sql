-- Sprint 8.2 — Operabilidad, Pausa Inteligente y Observabilidad
-- Run: psql $DATABASE_URL -f scripts/migrate_sprint8_2.sql
-- Also auto-run by worker on startup via ensureObservabilitySchema()

-- Execution log for all worker jobs
CREATE TABLE IF NOT EXISTS worker_runs (
  id                SERIAL PRIMARY KEY,
  worker_name       TEXT NOT NULL,              -- 'news_monitor', 'social_monitor'
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  status            TEXT NOT NULL DEFAULT 'running', -- running | success | error | skipped
  sources_processed INTEGER DEFAULT 0,
  items_found       INTEGER DEFAULT 0,
  items_saved       INTEGER DEFAULT 0,
  errors_count      INTEGER DEFAULT 0,
  error_message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_worker_runs_lookup ON worker_runs(worker_name, started_at DESC);

-- Audit log for significant platform events
CREATE TABLE IF NOT EXISTS system_events (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,      -- worker_started | news_monitor_paused | news_monitor_resumed | ...
  actor       TEXT DEFAULT 'system',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_events_lookup ON system_events(event_type, created_at DESC);

-- Pause metadata stored as additional settings rows (no schema change to settings table)
-- Keys added dynamically by the pause endpoint:
--   news_monitor_paused_at     TEXT  — ISO timestamp of when pause was set
--   news_monitor_paused_by     TEXT  — username/email who paused
--   news_monitor_pause_reason  TEXT  — optional reason text
