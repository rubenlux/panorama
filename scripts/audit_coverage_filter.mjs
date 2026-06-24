import { query } from '../src/routes/db.js';

// ─── Filter rules (corrected) ─────────────────────────────────────────────────

const BLACKLIST_FIRST_SEGMENTS = new Set([
  'estadisticas', 'reels', 'autor', 'author', 'periodista',
]);
const BLACKLIST_PATHS = [
  '/politica-de-privacidad', '/privacy', '/sitemap', '/contacto',
  '/contact', '/terminos', '/cookies',
];
const BLACKLIST_DOMAINS = ['mediakit.'];

// Minimum length for the last path segment to be considered an article slug.
// Category pages: "liga-mx.html"=12, "austria.html"=12, "seleccion-argentina.html"=24
// Article slugs:  "de-la-fuente-revelo-a-que-jugador..."=60+
const SLUG_MIN_LENGTH = 30;

function getFirstSegment(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs[0] || '';
  } catch { return ''; }
}

// Section prefixes allowed for each source (derived from source URL filename).
// Handles cases where articles live under a different path than the source page.
const SECTION_MAP = {
  'los-pumas':              ['los-pumas', 'rugby'],
  'seleccion-argentina':    ['seleccion-argentina', 'mundial'],
  // Default: use the source's own filename as prefix
};

function getSectionPrefixes(sourceUrl) {
  try {
    const segs = new URL(sourceUrl).pathname.replace('.html', '').split('/').filter(Boolean);
    const section = segs[segs.length - 1]; // last segment of source path
    return SECTION_MAP[section] || [section];
  } catch { return []; }
}

function applyFilter(url, sourceUrl) {
  const lcUrl = url.toLowerCase();

  // Level 1 — institutional blacklist
  for (const bl of BLACKLIST_DOMAINS) {
    if (lcUrl.includes(bl)) return { keep: false, level: 1, reason: 'domain:' + bl };
  }
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const bl of BLACKLIST_PATHS) {
      if (pathname.startsWith(bl)) return { keep: false, level: 1, reason: 'path:' + bl };
    }
    const firstSeg = pathname.split('/').filter(Boolean)[0] || '';
    if (BLACKLIST_FIRST_SEGMENTS.has(firstSeg)) {
      return { keep: false, level: 1, reason: 'first_seg:' + firstSeg };
    }
  } catch {}

  // Level 2 — URL shape: must have ≥2 segments with a long last slug
  try {
    const parsed  = new URL(url);
    const segs    = parsed.pathname.split('/').filter(Boolean);
    const lastSeg = segs[segs.length - 1] || '';

    if (segs.length < 2) {
      return { keep: false, level: 2, reason: 'single_segment' };
    }
    if (lastSeg.length < SLUG_MIN_LENGTH) {
      return { keep: false, level: 2, reason: `short_slug(${lastSeg.length})` };
    }
    if (!lastSeg.includes('-')) {
      return { keep: false, level: 2, reason: 'no_hyphen_in_slug' };
    }
  } catch {
    return { keep: false, level: 2, reason: 'parse_error' };
  }

  // Level 3 — must belong to the monitored section
  try {
    const firstSeg = new URL(url).pathname.split('/').filter(Boolean)[0];
    const allowed  = getSectionPrefixes(sourceUrl);
    if (!allowed.includes(firstSeg)) {
      return { keep: false, level: 3, reason: `section:${firstSeg}≠${allowed.join('|')}` };
    }
  } catch {
    return { keep: false, level: 3, reason: 'section_parse_error' };
  }

  return { keep: true, reason: 'pass' };
}

// ─── Run simulation ───────────────────────────────────────────────────────────

const { rows } = await query(`
  SELECT ta.url, ta.title, ts.name AS source_name, ts.url AS source_url
  FROM tracked_articles ta
  JOIN tracked_sources ts ON ts.id = ta.tracked_source_id
  ORDER BY ts.name, ta.url
`);

const bySource = {};
for (const row of rows) {
  const sn = row.source_name;
  if (!bySource[sn]) bySource[sn] = { sourceUrl: row.source_url, keep: [], discard: [] };
  const result = applyFilter(row.url, row.source_url);
  if (result.keep) {
    bySource[sn].keep.push({ url: row.url, title: row.title });
  } else {
    bySource[sn].discard.push({ url: row.url, title: row.title, reason: result.reason, level: result.level });
  }
}

for (const [name, data] of Object.entries(bySource)) {
  const total = data.keep.length + data.discard.length;
  console.log(`\n════ ${name} ════`);
  console.log(`Total: ${total}  →  Keep: ${data.keep.length}  Discard: ${data.discard.length}`);

  const byLevel = {};
  data.discard.forEach(d => { byLevel['L' + d.level] = (byLevel['L' + d.level] || 0) + 1; });
  console.log(`Descartados por nivel: ${JSON.stringify(byLevel)}`);

  console.log(`\n✅ URLs QUE QUEDARÍAN (${data.keep.length}):`);
  data.keep.forEach(u => console.log(`  [${u.title?.slice(0,45)}]\n  ${u.url}`));

  const reasonCounts = {};
  data.discard.forEach(d => {
    const k = `L${d.level} ${d.reason}`;
    reasonCounts[k] = (reasonCounts[k] || 0) + 1;
  });

  console.log(`\n❌ Descartadas por razón:`);
  for (const [reason, cnt] of Object.entries(reasonCounts)) {
    const examples = data.discard.filter(d => `L${d.level} ${d.reason}` === reason).slice(0, 2);
    console.log(`  ${reason} (${cnt}):`);
    examples.forEach(u => console.log(`    ${u.url}`));
  }
}

const totKeep    = Object.values(bySource).reduce((s, d) => s + d.keep.length, 0);
const totDiscard = Object.values(bySource).reduce((s, d) => s + d.discard.length, 0);
const total      = totKeep + totDiscard;
console.log(`\n════ RESUMEN GLOBAL ════`);
console.log(`Total en BD:  ${total}`);
console.log(`Quedarían:    ${totKeep} (${Math.round(totKeep / total * 100)}%)`);
console.log(`Descartados:  ${totDiscard} (${Math.round(totDiscard / total * 100)}%)`);

process.exit(0);
