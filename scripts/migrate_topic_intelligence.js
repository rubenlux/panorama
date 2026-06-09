import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── topics ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            VARCHAR(255) UNIQUE NOT NULL,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        category        VARCHAR(100),
        region          VARCHAR(100),
        coverage_scope  VARCHAR(50)  DEFAULT 'national'
                          CHECK (coverage_scope IN ('international','national','regional','local')),
        importance_score DECIMAL(5,2) DEFAULT 0,
        created_at      TIMESTAMPTZ  DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  DEFAULT NOW()
      );
    `);

    // ── topic_articles ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS topic_articles (
        topic_id        UUID    REFERENCES topics(id) ON DELETE CASCADE,
        article_id      UUID    REFERENCES articles(id) ON DELETE CASCADE,
        relevance_score DECIMAL(3,2) DEFAULT 1.0,
        added_at        TIMESTAMPTZ  DEFAULT NOW(),
        PRIMARY KEY (topic_id, article_id)
      );
    `);

    // ── topic_research ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS topic_research (
        topic_id          UUID REFERENCES topics(id)          ON DELETE CASCADE,
        research_topic_id UUID REFERENCES research_topics(id) ON DELETE CASCADE,
        added_at          TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (topic_id, research_topic_id)
      );
    `);

    // ── topic_entities ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS topic_entities (
        topic_id         UUID REFERENCES topics(id)           ON DELETE CASCADE,
        entity_id        UUID REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        prominence_score DECIMAL(3,2) DEFAULT 1.0,
        added_at         TIMESTAMPTZ  DEFAULT NOW(),
        PRIMARY KEY (topic_id, entity_id)
      );
    `);

    // ── topic_events ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS topic_events (
        topic_id  UUID REFERENCES topics(id)          ON DELETE CASCADE,
        event_id  UUID REFERENCES knowledge_events(id) ON DELETE CASCADE,
        added_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (topic_id, event_id)
      );
    `);

    // ── articles: coverage_scope + region columns ────────────────────────────
    await client.query(`
      ALTER TABLE articles
        ADD COLUMN IF NOT EXISTS coverage_scope VARCHAR(50) DEFAULT 'national',
        ADD COLUMN IF NOT EXISTS region          VARCHAR(100);
    `);

    // ── indexes ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_topics_region   ON topics(region);
      CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category);
      CREATE INDEX IF NOT EXISTS idx_topics_importance ON topics(importance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_topic_articles_article ON topic_articles(article_id);
      CREATE INDEX IF NOT EXISTS idx_articles_region ON articles(region);
      CREATE INDEX IF NOT EXISTS idx_articles_coverage ON articles(coverage_scope);
    `);

    await client.query("COMMIT");
    console.log("✅ Sprint 5 migration complete — Topic Intelligence Engine");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
