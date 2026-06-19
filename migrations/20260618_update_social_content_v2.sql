-- SPRINT: SOCIAL CONTENT ENGINE V2

-- Add new columns for video platforms
ALTER TABLE social_content_packages 
ADD COLUMN IF NOT EXISTS tiktok_script JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS instagram_reel JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS facebook_reel JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS youtube_short JSONB DEFAULT '{}'::jsonb;

-- Update status check constraint
ALTER TABLE social_content_packages DROP CONSTRAINT IF EXISTS social_content_packages_status_check;
ALTER TABLE social_content_packages ADD CONSTRAINT social_content_packages_status_check 
CHECK (status IN ('draft', 'review', 'approved', 'scheduled', 'published', 'failed'));
