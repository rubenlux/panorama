-- Add scheduled_at column to articles table for scheduling functionality

ALTER TABLE articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- Create index for scheduled posts query
CREATE INDEX IF NOT EXISTS idx_articles_scheduled_at ON articles(scheduled_at) WHERE scheduled_at > now();

-- Verify migration
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'articles' AND column_name = 'scheduled_at';

SELECT COUNT(*) as columns_with_scheduled_at FROM articles WHERE scheduled_at IS NOT NULL;
