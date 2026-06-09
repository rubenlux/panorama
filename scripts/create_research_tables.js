import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
CREATE TABLE IF NOT EXISTS research_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  url             text,
  title           text,
  source_name     text,
  published_at    timestamptz,
  content         text,
  relevance_score real DEFAULT 0,
  connector       text DEFAULT 'rss',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_briefs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id          uuid NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  executive_summary text,
  key_facts         jsonb DEFAULT '[]',
  controversies     jsonb DEFAULT '[]',
  timeline          jsonb DEFAULT '[]',
  opportunities     text,
  risks             text,
  generated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sources_topic ON research_sources(topic_id);
CREATE INDEX IF NOT EXISTS idx_research_briefs_topic  ON research_briefs(topic_id);
`;

pool.query(SQL)
  .then(() => { console.log('✅ Research tables created.'); process.exit(0); })
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
