/**
 * Sprint 7.0 — Social Intelligence Platform
 * Creates 4 new tables for social media monitoring.
 * Tables mirror the tracked_sources / monitored_articles pattern:
 *   social_sources → curated accounts to monitor (user-managed)
 *   social_posts   → individual posts captured from those accounts
 *   social_clusters → topic groups (Jaccard keyword clustering)
 *   social_cluster_posts → junction table
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_social_intelligence] Starting…');

  // ── social_sources ────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS social_sources (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name         VARCHAR(100) NOT NULL,
      platform     VARCHAR(20)  NOT NULL CHECK (platform IN ('youtube','instagram','facebook','x','tiktok','whatsapp')),
      profile_url  TEXT         NOT NULL,
      handle       VARCHAR(100),
      platform_id  VARCHAR(200),      -- cached platform-specific ID (e.g. YouTube channelId)
      enabled      BOOLEAN      DEFAULT true,
      priority     INTEGER      DEFAULT 5,
      region       VARCHAR(50)  DEFAULT 'nacional',
      category     VARCHAR(50)  DEFAULT 'medio',
      last_checked TIMESTAMPTZ,
      last_post_at TIMESTAMPTZ,
      post_count   INTEGER      DEFAULT 0,
      created_at   TIMESTAMPTZ  DEFAULT now(),
      updated_at   TIMESTAMPTZ  DEFAULT now(),
      UNIQUE(platform, profile_url)
    )
  `);
  console.log('[migrate_social_intelligence] ✓ social_sources');

  // ── social_posts ──────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id        UUID NOT NULL REFERENCES social_sources(id) ON DELETE CASCADE,
      platform         VARCHAR(20) NOT NULL,
      external_id      VARCHAR(500) NOT NULL,
      url              TEXT NOT NULL,
      published_at     TIMESTAMPTZ,
      title            TEXT,
      content          TEXT,
      thumbnail_url    TEXT,
      video_url        TEXT,
      views            BIGINT DEFAULT 0,
      likes            BIGINT DEFAULT 0,
      comments         BIGINT DEFAULT 0,
      shares           BIGINT DEFAULT 0,
      engagement_score FLOAT  DEFAULT 0,
      keywords         JSONB  DEFAULT '[]',
      captured_at      TIMESTAMPTZ DEFAULT now(),
      enriched_at      TIMESTAMPTZ,
      UNIQUE(platform, external_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_source    ON social_posts(source_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_published ON social_posts(published_at DESC)`);
  console.log('[migrate_social_intelligence] ✓ social_posts');

  // ── social_clusters ───────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS social_clusters (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title            TEXT NOT NULL,
      keywords         JSONB   DEFAULT '[]',
      post_count       INTEGER DEFAULT 0,
      source_count     INTEGER DEFAULT 0,
      total_views      BIGINT  DEFAULT 0,
      total_likes      BIGINT  DEFAULT 0,
      total_comments   BIGINT  DEFAULT 0,
      total_shares     BIGINT  DEFAULT 0,
      total_engagement BIGINT  DEFAULT 0,
      engagement_score FLOAT   DEFAULT 0,
      growth_rate      FLOAT   DEFAULT 0,
      status           VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','stale')),
      first_seen       TIMESTAMPTZ DEFAULT now(),
      last_seen        TIMESTAMPTZ DEFAULT now(),
      created_at       TIMESTAMPTZ DEFAULT now(),
      updated_at       TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_clusters_status     ON social_clusters(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_clusters_engagement ON social_clusters(total_engagement DESC)`);
  console.log('[migrate_social_intelligence] ✓ social_clusters');

  // ── social_cluster_posts ──────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS social_cluster_posts (
      cluster_id UUID NOT NULL REFERENCES social_clusters(id) ON DELETE CASCADE,
      post_id    UUID NOT NULL REFERENCES social_posts(id)    ON DELETE CASCADE,
      linked_at  TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (cluster_id, post_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_scp_cluster ON social_cluster_posts(cluster_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_scp_post    ON social_cluster_posts(post_id)`);
  console.log('[migrate_social_intelligence] ✓ social_cluster_posts');

  console.log('[migrate_social_intelligence] Done. Tables created.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
