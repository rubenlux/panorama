CREATE TABLE IF NOT EXISTS social_content_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id UUID NOT NULL REFERENCES editorial_dossiers(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published')),
    
    facebook_post TEXT,
    instagram_feed TEXT,
    instagram_story TEXT,
    instagram_carousel JSONB DEFAULT '[]'::jsonb,
    x_post TEXT,
    linkedin_post TEXT,
    newsletter_content TEXT,
    push_notification TEXT,
    
    recommendations JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint to have only one package per dossier for now
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_content_dossier_id ON social_content_packages(dossier_id);
