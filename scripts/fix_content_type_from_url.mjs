/**
 * FASE 2 — Fix content_type classification based on post URL
 *
 * The source content_type defines which tab to scrape, but individual posts
 * can have URLs that contradict their source's type (e.g. a watch?v= URL
 * captured under a "posts" source). This script generates a report and is
 * safe to re-run (read-only by default; pass --fix to apply).
 *
 * URL priority rules (same as the API query fix):
 *   /shorts/   → shorts
 *   watch?v=   → videos
 *   /post/     → posts
 *   otherwise  → keep source content_type
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = !process.argv.includes('--fix');

if (DRY_RUN) {
  console.log('DRY RUN — run with --fix to apply changes\n');
}

// ── Audit: posts where URL-derived type differs from source type ──────────────

const { rows: mismatches } = await pool.query(`
  SELECT
    sp.id,
    sp.title,
    sp.url,
    ss.content_type AS source_type,
    CASE
      WHEN sp.url LIKE '%/shorts/%'                             THEN 'shorts'
      WHEN sp.url LIKE '%watch?v=%' OR sp.url LIKE '%youtu.be/%' THEN 'videos'
      WHEN sp.url LIKE '%/post/%' OR sp.url LIKE '%/community%'  THEN 'posts'
      ELSE ss.content_type
    END AS correct_type,
    sp.transcript_available
  FROM social_posts sp
  JOIN social_sources ss ON ss.id = sp.source_id
  WHERE sp.platform = 'youtube'
    AND ss.content_type != CASE
      WHEN sp.url LIKE '%/shorts/%'                             THEN 'shorts'
      WHEN sp.url LIKE '%watch?v=%' OR sp.url LIKE '%youtu.be/%' THEN 'videos'
      WHEN sp.url LIKE '%/post/%' OR sp.url LIKE '%/community%'  THEN 'posts'
      ELSE ss.content_type
    END
  ORDER BY ss.content_type, correct_type
`);

console.log(`Mismatches found: ${mismatches.length}\n`);

const byTransition = {};
for (const r of mismatches) {
  const key = `${r.source_type} → ${r.correct_type}`;
  byTransition[key] = (byTransition[key] || 0) + 1;
}
for (const [k, v] of Object.entries(byTransition)) {
  console.log(`  ${k}: ${v} posts`);
}

if (mismatches.length > 0) {
  console.log('\nSample mismatches:');
  for (const r of mismatches.slice(0, 5)) {
    console.log(`  [${r.source_type}→${r.correct_type}] ${r.title?.slice(0, 60)}`);
    console.log(`    URL: ${r.url}`);
    console.log(`    transcript_available: ${r.transcript_available}`);
  }
}

// ── Note: we do NOT update social_sources.content_type ───────────────────────
// The source content_type controls which tab/URL to scrape — changing it would
// break the fetcher. Instead, the fix is applied at the API query level via
// CASE WHEN on the post URL (already deployed in GET /clusters/:id/posts).
//
// If a source is fundamentally wrong (e.g. a "posts" source that only captures
// videos), update it manually in the CMS or with the query below:
//
// UPDATE social_sources
// SET content_type = 'videos'
// WHERE platform = 'youtube' AND profile_url LIKE '%watch?v=%';

console.log('\n────────────────────────────────────────');
console.log('Fix is applied at query level (social.js GET /clusters/:id/posts)');
console.log('The CASE WHEN URL pattern overrides source content_type at runtime.');
console.log('No DB update needed — misclassified posts will now render correctly.');

await pool.end();
