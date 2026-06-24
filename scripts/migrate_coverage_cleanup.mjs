/**
 * Coverage V2.1 — Retroactive cleanup migration
 *
 * Purges tracked_articles that were captured before the editorial filter was
 * implemented (all nav/category/institutional/out-of-section links).
 *
 * Deletes:
 *   - coverage_changes associated with invalid articles
 *   - tracked_articles that fail the editorial filter
 *
 * Does NOT:
 *   - generate link_removed events
 *   - mark articles is_active=false (they are deleted entirely)
 *   - touch tracked_source_snapshots (keyed by source, not article — not orphaned)
 *   - touch any other table outside Coverage V2
 *
 * Resets last_hash on tracked_sources so the next cycle produces a clean
 * baseline fingerprint using only the filtered article set.
 */

import { query } from '../src/routes/db.js';

// ── Same filter logic as trackedSourceMonitor.js ──────────────────────────────

const BLACKLIST_FIRST_SEGMENTS = new Set([
  'estadisticas', 'reels', 'autor', 'author', 'periodista',
]);
const BLACKLIST_PATH_PREFIXES = [
  '/politica-de-privacidad', '/privacy', '/sitemap',
  '/contacto', '/contact', '/terminos', '/cookies',
];
const BLACKLIST_DOMAINS = ['mediakit.'];
const SLUG_MIN_LENGTH = 30;
const SECTION_MAP = {
  'los-pumas':           ['los-pumas', 'rugby'],
  'seleccion-argentina': ['seleccion-argentina', 'mundial'],
};

function getSectionPrefixes(sourceUrl) {
  try {
    const segs = new URL(sourceUrl).pathname.replace(/\.html$/, '').split('/').filter(Boolean);
    const section = segs[segs.length - 1];
    return SECTION_MAP[section] || [section];
  } catch { return []; }
}

function isEditorialLink(url, sectionPrefixes) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const segments = pathname.split('/').filter(Boolean);
  for (const bl of BLACKLIST_DOMAINS) { if (hostname.includes(bl)) return false; }
  for (const prefix of BLACKLIST_PATH_PREFIXES) { if (pathname.startsWith(prefix)) return false; }
  const firstSeg = segments[0] || '';
  if (BLACKLIST_FIRST_SEGMENTS.has(firstSeg)) return false;
  if (segments.length < 2) return false;
  const lastSeg = segments[segments.length - 1];
  if (lastSeg.length < SLUG_MIN_LENGTH || !lastSeg.includes('-')) return false;
  if (sectionPrefixes.length > 0 && !sectionPrefixes.includes(firstSeg)) return false;
  return true;
}

// ── Pre-flight: show what will be deleted ─────────────────────────────────────

console.log('Coverage V2.1 — Retroactive cleanup\n');

const { rows: articles } = await query(`
  SELECT ta.id, ta.url, ta.title, ta.is_active,
         ts.name AS source_name, ts.url AS source_url
  FROM tracked_articles ta
  JOIN tracked_sources ts ON ts.id = ta.tracked_source_id
  ORDER BY ts.name, ta.url
`);

const keep    = [];
const invalid = [];

for (const row of articles) {
  const prefixes = getSectionPrefixes(row.source_url);
  if (isEditorialLink(row.url, prefixes)) {
    keep.push(row);
  } else {
    invalid.push(row);
  }
}

console.log(`Total articles in DB:  ${articles.length}`);
console.log(`Will KEEP:             ${keep.length}`);
console.log(`Will DELETE (invalid): ${invalid.length}`);

const bySource = {};
for (const r of invalid) {
  if (!bySource[r.source_name]) bySource[r.source_name] = 0;
  bySource[r.source_name]++;
}
console.log('\nDeletions by source:');
Object.entries(bySource).forEach(([name, cnt]) => console.log(`  ${name}: -${cnt}`));

console.log('\nArticles that will REMAIN:');
for (const r of keep) {
  console.log(`  [${r.source_name}] ${r.title?.slice(0, 55)}`);
}

// ── Execute ───────────────────────────────────────────────────────────────────

const invalidIds = invalid.map(r => r.id);

if (invalidIds.length === 0) {
  console.log('\nNothing to delete.');
  process.exit(0);
}

// Step 1: Delete coverage_changes tied to invalid articles
const { rowCount: changesDeleted } = await query(
  `DELETE FROM coverage_changes WHERE tracked_article_id = ANY($1::uuid[])`,
  [invalidIds]
);
console.log(`\n[1] coverage_changes deleted: ${changesDeleted}`);

// Step 2: Delete invalid tracked_articles (cascade removes content_text too — it's inline)
const { rowCount: articlesDeleted } = await query(
  `DELETE FROM tracked_articles WHERE id = ANY($1::uuid[])`,
  [invalidIds]
);
console.log(`[2] tracked_articles deleted: ${articlesDeleted}`);

// Step 3: Reset last_hash on all active sources so next cycle recomputes a
// clean fingerprint from only the filtered article set. Without this reset,
// the worker would compare against a stale hash built with garbage links and
// potentially skip the first clean scrape thinking "nothing changed".
const { rowCount: sourcesReset } = await query(
  `UPDATE tracked_sources SET last_hash = NULL WHERE active = true`
);
console.log(`[3] tracked_sources last_hash reset: ${sourcesReset}`);

// ── Verify ────────────────────────────────────────────────────────────────────

const { rows: remaining } = await query(`
  SELECT ts.name, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ta.is_active)::int AS active
  FROM tracked_articles ta
  JOIN tracked_sources ts ON ts.id = ta.tracked_source_id
  GROUP BY ts.name
  ORDER BY ts.name
`);

console.log('\n── Remaining tracked_articles after cleanup ──');
remaining.forEach(r => console.log(`  ${r.name}: ${r.total} total (${r.active} active)`));

console.log('\nDone.');
process.exit(0);
