import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Creating knowledge_entities...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_entities (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name          varchar NOT NULL,
        entity_type   varchar NOT NULL,
        description   text,
        first_seen_at timestamptz DEFAULT now(),
        last_seen_at  timestamptz DEFAULT now(),
        mention_count integer DEFAULT 1,
        created_at    timestamptz DEFAULT now(),
        updated_at    timestamptz DEFAULT now()
      )
    `);
    // Unique: same name (case-insensitive) + same type = same entity
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_entities_name_type
        ON knowledge_entities(lower(name), entity_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type
        ON knowledge_entities(entity_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_entities_mentions
        ON knowledge_entities(mention_count DESC)
    `);

    console.log('Creating entity_mentions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS entity_mentions (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id  uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        topic_id   uuid NOT NULL REFERENCES research_topics(id)    ON DELETE CASCADE,
        source_id  uuid REFERENCES research_sources(id)            ON DELETE SET NULL,
        confidence real DEFAULT 1.0,
        created_at timestamptz DEFAULT now()
      )
    `);
    // One mention record per entity per topic
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_mentions_unique
        ON entity_mentions(entity_id, topic_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity
        ON entity_mentions(entity_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_topic
        ON entity_mentions(topic_id)
    `);

    console.log('Creating knowledge_events...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_events (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id       uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        title           varchar NOT NULL,
        summary         text,
        event_date      date,
        event_type      varchar DEFAULT 'news',
        source_topic_id uuid REFERENCES research_topics(id) ON DELETE SET NULL,
        created_at      timestamptz DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_entity
        ON knowledge_events(entity_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_date
        ON knowledge_events(event_date DESC NULLS LAST)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_type
        ON knowledge_events(event_type)
    `);

    await client.query('COMMIT');
    console.log('Knowledge Base tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
