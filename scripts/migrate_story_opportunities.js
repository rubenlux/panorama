import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS story_opportunities (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        story_cluster_id UUID NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
        title            TEXT NOT NULL,
        description      TEXT,
        opportunity_type VARCHAR(30) DEFAULT 'NEWS' CHECK (opportunity_type IN (
          'NEWS','SEO','ANALYSIS','EXPLAINER','SOCIAL',
          'FACT_CHECK','LIVE_COVERAGE','OPINION'
        )),
        traffic_score    INTEGER DEFAULT 50 CHECK (traffic_score  BETWEEN 0 AND 100),
        seo_score        INTEGER DEFAULT 50 CHECK (seo_score      BETWEEN 0 AND 100),
        urgency_score    INTEGER DEFAULT 50 CHECK (urgency_score  BETWEEN 0 AND 100),
        editorial_score  INTEGER DEFAULT 50 CHECK (editorial_score BETWEEN 0 AND 100),
        composite_score  NUMERIC(5,2) DEFAULT 50.00,
        status           VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
          'pending','in_progress','done','dismissed'
        )),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_so_story    ON story_opportunities(story_cluster_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_so_composite ON story_opportunities(composite_score DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_so_status   ON story_opportunities(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_so_type     ON story_opportunities(opportunity_type)`);

    await client.query('COMMIT');
    console.log('✅ story_opportunities table created successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
