-- P1 Crawler Schema Migration
-- Run: psql $DATABASE_URL -f scripts/migrate_p1_crawler_schema.sql

-- Add status column to monitored_articles (if not exists)
ALTER TABLE monitored_articles
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'FETCHING', 'READY', 'FAILED', 'RETRY'));

ALTER TABLE monitored_articles
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

ALTER TABLE monitored_articles
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE monitored_articles
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(100);

-- Indexes for scheduler performance
CREATE INDEX IF NOT EXISTS idx_monitored_articles_status_scheduled
  ON monitored_articles(status, scheduled_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX IF NOT EXISTS idx_monitored_articles_created_at
  ON monitored_articles(created_at DESC)
  WHERE status IN ('PENDING', 'RETRY', 'FETCHING');

-- Backfill: articles with content_text = READY, without = PENDING
UPDATE monitored_articles
  SET status = CASE WHEN content_text IS NOT NULL THEN 'READY' ELSE 'PENDING' END
  WHERE status = 'PENDING';

-- Worker observability table (ensure it exists for scheduler)
CREATE TABLE IF NOT EXISTS worker_runs (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  sources_processed INTEGER DEFAULT 0,
  items_found INTEGER DEFAULT 0,
  items_saved INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_runs_lookup
  ON worker_runs(worker_name, started_at DESC);
