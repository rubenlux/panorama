/**
 * Sprint 5.5 — Story Intelligence Engine
 * Creates story_clusters, story_cluster_articles, story_entities.
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_story_clusters] Starting…');

  await query(`
    CREATE TABLE IF NOT EXISTS story_clusters (
      id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title                   TEXT,
      slug                    TEXT        UNIQUE,
      story_type              VARCHAR(50) NOT NULL DEFAULT 'news'
        CHECK (story_type IN (
          'news','breaking_news','event','live_event',
          'investigation','analysis','politics','sports',
          'technology','entertainment','economy','health',
          'science','international','culture'
        )),
      summary                 TEXT,
      editorial_opportunities JSONB       NOT NULL DEFAULT '[]',
      keywords                JSONB       NOT NULL DEFAULT '[]',
      importance_score        INTEGER     NOT NULL DEFAULT 0,
      coverage_status         VARCHAR(30) NOT NULL DEFAULT 'monitoring'
        CHECK (coverage_status IN ('monitoring','growing','breaking','cooling','archived')),
      status                  VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','summarizing','ready','stale','followed')),
      source_count            INTEGER     NOT NULL DEFAULT 0,
      article_count           INTEGER     NOT NULL DEFAULT 0,
      is_recurring            BOOLEAN     NOT NULL DEFAULT false,
      first_seen              TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen               TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sc_status       ON story_clusters (status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sc_last_seen    ON story_clusters (last_seen DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sc_importance   ON story_clusters (importance_score DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sc_coverage     ON story_clusters (coverage_status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sc_story_type   ON story_clusters (story_type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sc_recurring    ON story_clusters (is_recurring)`);
  console.log('[migrate_story_clusters] story_clusters ready.');

  await query(`
    CREATE TABLE IF NOT EXISTS story_cluster_articles (
      story_id        UUID        NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
      article_id      UUID        NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
      relevance_score NUMERIC     NOT NULL DEFAULT 1.0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (story_id, article_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_sca_story   ON story_cluster_articles (story_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sca_article ON story_cluster_articles (article_id)`);
  console.log('[migrate_story_clusters] story_cluster_articles ready.');

  await query(`
    CREATE TABLE IF NOT EXISTS story_entities (
      story_id   UUID        NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
      entity_id  UUID        NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      role       VARCHAR(50) NOT NULL DEFAULT 'participant',
      PRIMARY KEY (story_id, entity_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_se_story  ON story_entities (story_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_se_entity ON story_entities (entity_id)`);
  console.log('[migrate_story_clusters] story_entities ready.');

  console.log('[migrate_story_clusters] Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate_story_clusters] FAILED:', err.message);
  process.exit(1);
});
