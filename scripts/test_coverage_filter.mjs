import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

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

async function testSource(url) {
  console.log(`\n════ ${url} ════`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    timeout: 30000,
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const baseDomain = new URL(url).hostname.split('.').slice(-2).join('.');
  const sectionPrefixes = getSectionPrefixes(url);

  let totalLinks = 0;
  const kept = [];
  const dropped = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim();
    if (!href || title.length < 5) return;

    let absUrl;
    try {
      const abs = new URL(href, url);
      abs.hash = '';
      absUrl = abs.toString();
    } catch { return; }

    try {
      if (new URL(absUrl).hostname.split('.').slice(-2).join('.') !== baseDomain) return;
    } catch { return; }

    totalLinks++;
    if (isEditorialLink(absUrl, sectionPrefixes)) {
      kept.push({ url: absUrl, title });
    } else {
      dropped.push(absUrl);
    }
  });

  // Deduplicate
  const keptUniq = [...new Map(kept.map(l => [l.url, l])).values()];
  const droppedCount = totalLinks - keptUniq.length;

  console.log(`Total links on page: ${totalLinks}`);
  console.log(`After filter — kept: ${keptUniq.length}  dropped: ${droppedCount}`);
  console.log(`Noise reduction: ${Math.round(droppedCount / totalLinks * 100)}%`);
  console.log('\n✅ KEPT:');
  keptUniq.forEach((l, i) => console.log(`  ${i + 1}. ${l.title.slice(0, 55)}\n     ${l.url}`));
}

await testSource('https://www.tycsports.com/boca-juniors.html');
await testSource('https://www.tycsports.com/los-pumas.html');
await testSource('https://www.tycsports.com/mundial/equipos/seleccion-argentina.html');

process.exit(0);
