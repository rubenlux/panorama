/**
 * Sprint 5.8 — Full Article Acquisition Layer
 *
 * Adds content storage columns to monitored_articles so the intelligence
 * pipeline can use real article text instead of RSS snippets.
 *
 * extraction_method values:
 *   NULL        → not yet attempted (pending)
 *   'fetch'     → content extracted via node-fetch + HTML parsing
 *   'playwright'→ content extracted via Playwright (JS-rendered sites)
 *   'rss_only'  → all methods failed; summary is the best available
 *   'paywall'   → paywall detected during fetch
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_article_content] Starting…');

  await query(`
    ALTER TABLE monitored_articles
      ADD COLUMN IF NOT EXISTS content_text       TEXT,
      ADD COLUMN IF NOT EXISTS content_words      INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS extraction_method  VARCHAR(20),
      ADD COLUMN IF NOT EXISTS extracted_at       TIMESTAMPTZ
  `);

  // Index for the background job: find recent unfetched articles efficiently
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ma_unfetched
      ON monitored_articles (detected_at DESC)
      WHERE extraction_method IS NULL
  `);

  // Index for metrics queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ma_extraction
      ON monitored_articles (extraction_method)
  `);

  console.log('[migrate_article_content] Done. New columns:');
  console.log('  - content_text TEXT');
  console.log('  - content_words INTEGER');
  console.log('  - extraction_method VARCHAR(20)');
  console.log('  - extracted_at TIMESTAMPTZ');
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate_article_content] FAILED:', err.message);
  process.exit(1);
});
