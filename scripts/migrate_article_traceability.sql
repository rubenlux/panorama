-- Add article traceability columns
-- Tracks who created the article, how it was created, and what workflow it used

ALTER TABLE articles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'cms_ui';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS workflow VARCHAR(50) DEFAULT 'manual';

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_articles_workflow ON articles(workflow);
CREATE INDEX IF NOT EXISTS idx_articles_created_via ON articles(created_via);
CREATE INDEX IF NOT EXISTS idx_articles_created_by ON articles(created_by);

-- Add comments for clarity
COMMENT ON COLUMN articles.created_by IS 'User ID who initiated the creation (real user, not service account)';
COMMENT ON COLUMN articles.created_via IS 'Channel: claude_desktop, cms_ui, cli, api';
COMMENT ON COLUMN articles.workflow IS 'Workflow type: editorial_ai, manual, optimized, translated, curated';

-- Backfill existing articles
-- Articles created before this migration are assumed to be manual
UPDATE articles
SET created_via = 'cms_ui', workflow = 'manual'
WHERE created_via IS NULL;

-- Verify migration
SELECT COUNT(*) as total, workflow, created_via
FROM articles
GROUP BY workflow, created_via;
