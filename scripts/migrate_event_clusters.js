import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── event_clusters ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_clusters (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        headline         TEXT NOT NULL,
        summary          TEXT,
        event_type       TEXT DEFAULT 'general' CHECK (event_type IN (
                           'sports_live','sports','politics','economy','culture',
                           'science','international','breaking','investigation',
                           'analysis','entertainment','health','technology','general'
                         )),
        importance_score INTEGER DEFAULT 5 CHECK (importance_score BETWEEN 1 AND 10),
        editorial_score  INTEGER DEFAULT 0 CHECK (editorial_score BETWEEN 0 AND 100),
        coverage_status  TEXT DEFAULT 'monitoring' CHECK (coverage_status IN (
                           'monitoring','growing','breaking','cooling','archived'
                         )),
        status           TEXT DEFAULT 'active' CHECK (status IN (
                           'active','followed','stale','archived'
                         )),
        story_count      INTEGER DEFAULT 0,
        article_count    INTEGER DEFAULT 0,
        source_count     INTEGER DEFAULT 0,
        main_entities    JSONB DEFAULT '[]',
        timeline         JSONB DEFAULT '[]',
        first_detected_at TIMESTAMPTZ DEFAULT NOW(),
        last_updated_at  TIMESTAMPTZ DEFAULT NOW(),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── event_cluster_stories ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_cluster_stories (
        event_id   UUID REFERENCES event_clusters(id) ON DELETE CASCADE,
        story_id   UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
        linked_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (event_id, story_id)
      )
    `);

    // ── editorial_opportunities ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS editorial_opportunities (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id         UUID REFERENCES event_clusters(id) ON DELETE CASCADE,
        type             TEXT NOT NULL CHECK (type IN (
                           'noticia','analisis','seo','redes','explicador',
                           'entrevista','opinion','multimedia','cobertura_viva'
                         )),
        title            TEXT NOT NULL,
        reason           TEXT,
        seo_value        INTEGER CHECK (seo_value BETWEEN 1 AND 10),
        traffic_potential TEXT CHECK (traffic_potential IN ('alto','medio','bajo')),
        difficulty       TEXT CHECK (difficulty IN ('facil','medio','dificil')),
        status           TEXT DEFAULT 'pending' CHECK (status IN (
                           'pending','in_progress','done','dismissed'
                         )),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── indexes ─────────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ec_status      ON event_clusters(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ec_last_updated ON event_clusters(last_updated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ec_importance  ON event_clusters(importance_score DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ec_score       ON event_clusters(editorial_score DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ec_coverage    ON event_clusters(coverage_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_eo_event       ON editorial_opportunities(event_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_eo_status      ON editorial_opportunities(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ecs_event      ON event_cluster_stories(event_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ecs_story      ON event_cluster_stories(story_id)`);

    await client.query('COMMIT');
    console.log('✅ Event Intelligence tables created successfully');
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
