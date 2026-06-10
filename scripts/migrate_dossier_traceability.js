/**
 * Sprint 5.7 — Dossier Traceability + Structured Opportunities
 *
 * research_topics: adds source_type, source_id, source_title, source_score
 *   so every dossier can be traced back to its origin (story/opportunity/event/manual).
 *
 * research_briefs: adds source_opportunities JSONB
 *   so AI-generated editorial opportunities from the monitor are preserved
 *   as structured data (not serialized text) for the dossier generation prompt.
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
-- Traceability on research_topics
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS source_type  varchar(20) DEFAULT 'manual';
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS source_id    uuid;
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS source_title text;
ALTER TABLE research_topics
  ADD COLUMN IF NOT EXISTS source_score integer;

CREATE INDEX IF NOT EXISTS idx_rt_source_type ON research_topics(source_type);
CREATE INDEX IF NOT EXISTS idx_rt_source_id   ON research_topics(source_id);

-- Structured opportunities on research_briefs
ALTER TABLE research_briefs
  ADD COLUMN IF NOT EXISTS source_opportunities jsonb DEFAULT '[]';
`;

pool.query(SQL)
  .then(() => {
    console.log('✅ Dossier traceability migration applied.');
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  });
