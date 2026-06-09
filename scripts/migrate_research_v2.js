import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
-- Fix A: created_by for audit + rate limiting
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Fix D: category and tags for future KB intersection
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS category varchar;
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Fix H: future-proof columns for Knowledge Base
ALTER TABLE research_sources
  ADD COLUMN IF NOT EXISTS language    varchar DEFAULT 'es';
ALTER TABLE research_sources
  ADD COLUMN IF NOT EXISTS entities    jsonb   DEFAULT '[]';
ALTER TABLE research_sources
  ADD COLUMN IF NOT EXISTS word_count  integer;

-- Fix H: source attribution and model tracking in briefs
ALTER TABLE research_briefs
  ADD COLUMN IF NOT EXISTS source_attribution jsonb   DEFAULT '{}';
ALTER TABLE research_briefs
  ADD COLUMN IF NOT EXISTS model_used         varchar DEFAULT 'claude-sonnet-4-5-20250929';
ALTER TABLE research_briefs
  ADD COLUMN IF NOT EXISTS prompt_version     integer DEFAULT 1;

-- Fix G: missing indices
CREATE INDEX IF NOT EXISTS idx_research_topics_created  ON research_topics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_topics_status   ON research_topics(status);
CREATE INDEX IF NOT EXISTS idx_research_topics_title    ON research_topics(lower(title));
CREATE INDEX IF NOT EXISTS idx_research_topics_user     ON research_topics(created_by);
CREATE INDEX IF NOT EXISTS idx_research_sources_score   ON research_sources(topic_id, relevance_score DESC);
`;

pool.query(SQL)
  .then(() => { console.log('✅ Research v2 migration applied.'); process.exit(0); })
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
