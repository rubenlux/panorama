import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INITIAL_SOURCES = [
  // Argentine nationals
  { name: 'Infobae',    type: 'news',    rss_url: 'https://www.infobae.com/feeds/rss/',                homepage: 'https://www.infobae.com' },
  { name: 'La Nación',  type: 'news',    rss_url: 'https://www.lanacion.com.ar/arcio/rss/',            homepage: 'https://www.lanacion.com.ar' },
  { name: 'Clarin',     type: 'news',    rss_url: 'https://www.clarin.com/rss/lo-ultimo/',             homepage: 'https://www.clarin.com' },
  { name: 'Telam',      type: 'news',    rss_url: 'https://www.telam.com.ar/rss/portada.xml',          homepage: 'https://www.telam.com.ar' },
  { name: 'Perfil',     type: 'news',    rss_url: 'https://www.perfil.com/feed',                       homepage: 'https://www.perfil.com' },
  // International Spanish
  { name: 'BBC Mundo',  type: 'news',    rss_url: 'https://feeds.bbci.co.uk/mundo/rss.xml',            homepage: 'https://bbc.com/mundo' },
  { name: 'DW Español', type: 'news',    rss_url: 'https://rss.dw.com/rdf/rss-es-all',                homepage: 'https://dw.com/es' },
  // Technology
  { name: 'TechCrunch', type: 'blog',    rss_url: 'https://techcrunch.com/feed/',                      homepage: 'https://techcrunch.com' },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating tracked_sources...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_sources (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name            varchar NOT NULL,
        type            varchar NOT NULL DEFAULT 'news',
        rss_url         text NOT NULL,
        homepage        text,
        enabled         boolean DEFAULT true,
        check_interval  integer DEFAULT 60,
        last_checked    timestamptz,
        created_at      timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_sources_enabled ON tracked_sources(enabled)`);

    console.log('Creating monitored_articles...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS monitored_articles (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id    uuid NOT NULL REFERENCES tracked_sources(id) ON DELETE CASCADE,
        external_id  text,
        title        text NOT NULL,
        url          text NOT NULL,
        summary      text,
        published_at timestamptz,
        detected_at  timestamptz DEFAULT now(),
        hash         varchar(64) NOT NULL
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_articles_hash     ON monitored_articles(hash)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_monitored_articles_detected  ON monitored_articles(detected_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_monitored_articles_source    ON monitored_articles(source_id)`);

    console.log('Creating article_entity_matches...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS article_entity_matches (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id uuid NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
        entity_id  uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aem_unique        ON article_entity_matches(article_id, entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aem_by_entity     ON article_entity_matches(entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aem_by_article    ON article_entity_matches(article_id)`);

    console.log('Creating trending_topics...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS trending_topics (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id       uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        mention_count   integer DEFAULT 1,
        source_count    integer DEFAULT 1,
        window_minutes  integer DEFAULT 30,
        last_seen_at    timestamptz DEFAULT now(),
        auto_researched boolean DEFAULT false,
        created_at      timestamptz DEFAULT now(),
        updated_at      timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_entity    ON trending_topics(entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trending_mentions   ON trending_topics(mention_count DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trending_last_seen  ON trending_topics(last_seen_at DESC)`);

    console.log('Seeding tracked_sources...');
    for (const src of INITIAL_SOURCES) {
      await client.query(
        `INSERT INTO tracked_sources (name, type, rss_url, homepage)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [src.name, src.type, src.rss_url, src.homepage]
      );
    }

    await client.query('COMMIT');
    console.log(`News Intelligence tables created. ${INITIAL_SOURCES.length} sources seeded.`);
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
