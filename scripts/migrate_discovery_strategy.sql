-- Sprint 2: Discovery Strategy Implementation (Refined)
-- Separate URL from discovery method, add metrics, use closed enum

-- Add new columns to rss_sources table
ALTER TABLE rss_sources
ADD COLUMN IF NOT EXISTS discovery_type VARCHAR(20) NOT NULL DEFAULT 'RSS',
ADD COLUMN IF NOT EXISTS last_discovery_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS last_discovery_error TEXT,
ADD COLUMN IF NOT EXISTS last_discovery_duration_ms INTEGER,
ADD COLUMN IF NOT EXISTS last_articles_found INTEGER,
ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMP;

-- Add check constraint for discovery_type (closed enum)
-- First drop if exists, then add
DO $$ BEGIN
  ALTER TABLE rss_sources
  ADD CONSTRAINT check_discovery_type
  CHECK (discovery_type IN ('RSS', 'SITEMAP', 'PLAYWRIGHT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_rss_sources_discovery_type
ON rss_sources(discovery_type);

CREATE INDEX IF NOT EXISTS idx_rss_sources_discovery_status
ON rss_sources(last_discovery_status);

CREATE INDEX IF NOT EXISTS idx_rss_sources_last_discovery_at
ON rss_sources(last_discovery_at DESC);

-- Log the migration
INSERT INTO system_events (event_type, actor, metadata)
VALUES (
  'migration',
  'system',
  jsonb_build_object('migration', 'migrate_discovery_strategy', 'status', 'completed', 'timestamp', NOW()::text)
)
ON CONFLICT DO NOTHING;
