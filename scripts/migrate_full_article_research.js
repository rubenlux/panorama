/**
 * Sprint 5.2 — Full Article Research Engine
 *
 * 1. article_content_cache — avoid re-fetching the same URL
 * 2. research_sources.content_fetched — track whether content is full article vs RSS snippet
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_full_article_research] Starting…');

  // 1. article_content_cache
  await query(`
    CREATE TABLE IF NOT EXISTS article_content_cache (
      id          SERIAL PRIMARY KEY,
      url         TEXT        NOT NULL UNIQUE,
      title       TEXT,
      content     TEXT        NOT NULL,
      word_count  INTEGER     NOT NULL DEFAULT 0,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_acc_url       ON article_content_cache (url)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acc_fetched   ON article_content_cache (fetched_at DESC)`);
  console.log('[migrate_full_article_research] article_content_cache ready.');

  // 2. research_sources: add content_fetched column
  await query(`
    ALTER TABLE research_sources
      ADD COLUMN IF NOT EXISTS content_fetched BOOLEAN NOT NULL DEFAULT false
  `);
  console.log('[migrate_full_article_research] research_sources.content_fetched added.');

  console.log('[migrate_full_article_research] Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate_full_article_research] FAILED:', err.message);
  process.exit(1);
});
