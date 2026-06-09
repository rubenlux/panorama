import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating editorial_dossiers...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS editorial_dossiers (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        topic_id            uuid REFERENCES research_topics(id) ON DELETE SET NULL,
        status              varchar NOT NULL DEFAULT 'generating',
        executive_summary   text,
        verified_facts      jsonb DEFAULT '[]',
        timeline            jsonb DEFAULT '[]',
        entities            jsonb DEFAULT '[]',
        seo_keywords        text[],
        suggested_categories text[],
        suggested_tags      text[],
        suggested_headlines text[],
        suggested_angles    jsonb DEFAULT '[]',
        hero_image_prompt   text,
        created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at          timestamptz DEFAULT now(),
        updated_at          timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dossiers_topic    ON editorial_dossiers(topic_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dossiers_status   ON editorial_dossiers(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dossiers_created  ON editorial_dossiers(created_at DESC)`);

    console.log('Adding origin/dossier_id to articles...');
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS origin    varchar DEFAULT 'manual'`);
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES editorial_dossiers(id) ON DELETE SET NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_origin    ON articles(origin)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_dossier   ON articles(dossier_id)`);

    await client.query('COMMIT');
    console.log('Editorial Workflow migration complete.');
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
