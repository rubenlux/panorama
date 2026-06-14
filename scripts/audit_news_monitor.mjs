/**
 * Auditoría profunda del News Monitor — solo lectura
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p) => pool.query(sql, p);
const sep = t => console.log(`\n${'═'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

const NOW = new Date();

// ── SECCIÓN A: Estado de fuentes ──────────────────────────────────────────────
sep('A — FUENTES RSS (tracked_sources)');
{
  const { rows } = await q(`
    SELECT name, enabled, last_checked, last_format_detected, trust_score,
           NOW() - last_checked AS ago
    FROM tracked_sources
    ORDER BY last_checked ASC NULLS FIRST
  `);
  console.log(`${'Fuente'.padEnd(28)} ${'Habilitada'.padEnd(12)} ${'last_checked (UTC)'.padEnd(22)} ${'Hace'.padEnd(14)} Formato`);
  console.log('─'.repeat(95));
  for (const r of rows) {
    const agoStr = r.ago ? r.ago.hours != null
      ? `${r.ago.hours}h ${r.ago.minutes}m`
      : (r.ago.minutes != null ? `${r.ago.minutes}m` : JSON.stringify(r.ago))
      : 'NUNCA';
    const lc = r.last_checked?.toISOString?.()?.slice(0,19) ?? 'NUNCA';
    console.log(`${r.name.slice(0,27).padEnd(28)} ${String(r.enabled).padEnd(12)} ${lc.padEnd(22)} ${agoStr.padEnd(14)} ${r.last_format_detected||'?'}`);
  }
}

// ── SECCIÓN B: monitored_articles — columnas y actividad ─────────────────────
sep('B — MONITORED_ARTICLES — estructura y actividad');
{
  const { rows: cols } = await q(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='monitored_articles' ORDER BY ordinal_position
  `);
  console.log('Columnas:', cols.map(c=>`${c.column_name}(${c.data_type})`).join(', '));

  const { rows: [cnt] } = await q(`SELECT COUNT(*) as total, MAX(ingested_at) as last_ingested FROM monitored_articles`).catch(async () => {
    const { rows } = await q(`SELECT COUNT(*) as total FROM monitored_articles`);
    return { rows: [{ ...rows[0], last_ingested: 'columna no existe' }] };
  });
  console.log('Total articles monitored:', cnt.total);
  console.log('Último ingested_at:', cnt.last_ingested);

  // Try various timestamp columns
  for (const col of ['ingested_at','created_at','updated_at','fetched_at','published_at']) {
    await q(`SELECT MAX(${col}) as v FROM monitored_articles`).then(r => {
      console.log(`  MAX(${col}): ${r.rows[0].v}`);
    }).catch(() => {});
  }

  // Recent articles
  const { rows: cols2 } = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='monitored_articles'`);
  const colNames = cols2.map(c=>c.column_name);
  const tsCol = colNames.find(c=>['ingested_at','created_at'].includes(c));
  if (tsCol) {
    const { rows: recent } = await q(`
      SELECT title, source_id, ${tsCol} FROM monitored_articles
      ORDER BY ${tsCol} DESC LIMIT 10
    `);
    console.log(`\nÚltimos 10 monitored_articles (por ${tsCol}):`);
    recent.forEach(r => console.log(`  ${r[tsCol]?.toISOString?.()?.slice(0,19)} | ${r.title?.slice(0,70)}`));
  }
}

// ── SECCIÓN C: trend_clusters y trending_topics — última actividad ────────────
sep('C — TRENDING_TOPICS / TREND_CLUSTERS — última actividad');
{
  const { rows: [tt] } = await q(`
    SELECT
      COUNT(*) as total,
      MAX(updated_at) as last_update,
      MAX(last_seen_at) as last_seen,
      COUNT(*) FILTER (WHERE updated_at > NOW()-INTERVAL '1 hour') as last_hour,
      COUNT(*) FILTER (WHERE updated_at > NOW()-INTERVAL '24 hours') as last_day
    FROM trending_topics
  `);
  console.log('trending_topics:', JSON.stringify(tt));

  const { rows: [tc] } = await q(`
    SELECT COUNT(*) as total, MAX(updated_at) as last_update
    FROM trend_clusters
  `).catch(() => ({ rows: [{ total: 'tabla N/A' }] }));
  console.log('trend_clusters:', JSON.stringify(tc));

  // Last 5 trend_clusters
  const { rows: tclast } = await q(`
    SELECT id, status, mention_count, source_count, first_seen, last_seen, updated_at
    FROM trend_clusters ORDER BY updated_at DESC LIMIT 5
  `).catch(() => ({ rows: [] }));
  console.log('\nÚltimos 5 trend_clusters:');
  tclast.forEach(r => console.log('  ', JSON.stringify(r)));
}

// ── SECCIÓN D: event_clusters y story_clusters ────────────────────────────────
sep('D — EVENT_CLUSTERS / STORY_CLUSTERS — última actividad');
{
  const { rows: [ec] } = await q(`
    SELECT COUNT(*) as total,
      MAX(updated_at) as last_update,
      COUNT(*) FILTER (WHERE status='active') as active,
      COUNT(*) FILTER (WHERE status='stale') as stale
    FROM event_clusters
  `);
  console.log('event_clusters:', JSON.stringify(ec));

  const { rows: [sc] } = await q(`
    SELECT COUNT(*) as total, MAX(updated_at) as last_update
    FROM story_clusters
  `).catch(() => ({ rows: [{ total: 'N/A' }] }));
  console.log('story_clusters:', JSON.stringify(sc));
}

// ── SECCIÓN E: SIMULACIÓN RSS — fetch en vivo de 3 fuentes ───────────────────
sep('E — SIMULACIÓN RSS (fetch en vivo, sin escritura en DB)');

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}
function parseRssItems(xml) {
  const items = []; const re = /<item>([\s\S]*?)<\/item>/g; let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    items.push({ title: extractTag(raw,'title'), link: extractTag(raw,'link')||extractTag(raw,'guid'), pubDate: extractTag(raw,'pubDate'), guid: extractTag(raw,'guid') });
  }
  return items;
}
function parseNewsSitemap(xml) {
  const items = []; const re = /<url>([\s\S]*?)<\/url>/g; let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1]; const loc = extractTag(b,'loc');
    if (!loc?.startsWith('http')) continue;
    const title = extractTag(b,'news:title') || extractTag(b,'title');
    if (!title) continue;
    items.push({ title, link: loc, pubDate: extractTag(b,'news:publication_date')||extractTag(b,'lastmod'), guid: loc });
  }
  return items;
}

const { rows: testSources } = await q(`
  SELECT id, name, rss_url, last_format_detected FROM tracked_sources
  WHERE enabled=true ORDER BY RANDOM() LIMIT 4
`);

for (const src of testSources) {
  console.log(`\n>>> Fuente: "${src.name}" — ${src.rss_url}`);
  const t0 = Date.now();
  try {
    const res = await fetch(src.rss_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Panorama-Monitor/2.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    const ms = Date.now() - t0;
    console.log(`    HTTP: ${res.status} | Time: ${ms}ms | Content-Type: ${res.headers.get('content-type')?.slice(0,50)}`);

    if (!res.ok) { console.log(`    FALLO: HTTP ${res.status}`); continue; }

    const xml = await res.text();
    console.log(`    Body length: ${xml.length} chars`);

    const format = xml.includes('<sitemapindex') ? 'sitemap-index'
      : xml.includes('xmlns:news') ? 'news-sitemap'
      : xml.includes('<urlset') ? 'urlset'
      : xml.includes('<rss') || xml.includes('<channel') ? 'rss' : 'rss';
    console.log(`    Formato detectado: ${format} (DB dice: ${src.last_format_detected})`);

    let items = [];
    if (format === 'news-sitemap') items = parseNewsSitemap(xml);
    else if (format === 'rss') items = parseRssItems(xml);
    else if (format === 'sitemap-index') {
      const locRe = /<loc>([\s\S]*?)<\/loc>/g; let m2; const childUrls = [];
      while ((m2 = locRe.exec(xml)) !== null) { const u=m2[1].trim(); if(u.startsWith('http')) childUrls.push(u); }
      const toCheck = childUrls.slice(-2);
      console.log(`    Sitemap-index: ${childUrls.length} children, checking last ${toCheck.length}`);
      for (const cu of toCheck) {
        try {
          const cr = await fetch(cu, { headers: { 'User-Agent': 'Panorama-Monitor/2.0' }, signal: AbortSignal.timeout(8000) });
          if (!cr.ok) { console.log(`    Child HTTP ${cr.status}: ${cu.slice(0,70)}`); continue; }
          const cxml = await cr.text();
          const cfmt = cxml.includes('xmlns:news') ? 'news-sitemap' : 'urlset';
          const citems = cfmt === 'news-sitemap' ? parseNewsSitemap(cxml) : parseRssItems(cxml);
          console.log(`    Child (${cfmt}): ${citems.length} items — ${cu.slice(0,70)}`);
          items.push(...citems);
        } catch(e2) { console.log(`    Child error: ${e2.message}`); }
      }
    }

    console.log(`    Items parseados: ${items.length}`);
    if (items.length > 0) {
      console.log(`    Items con título+link: ${items.filter(i=>i.title&&i.link).length}`);
      // Check how many are new vs already in monitored_articles
      const urls = items.filter(i=>i.link).map(i=>i.link.trim().toLowerCase());
      if (urls.length > 0) {
        const hashFn = url => { const {createHash}=require('crypto'); return createHash('sha256').update(url).digest('hex'); };
        // Can't use require in ESM - just check count
        const { rows: existing } = await q(`
          SELECT COUNT(*) as cnt FROM monitored_articles
          WHERE url = ANY($1::text[])
        `, [urls.slice(0,30)]);
        console.log(`    Primeras 30 URLs: ${existing.rows?.[0]?.cnt ?? '?'} ya existen en monitored_articles`);
      }
      // Show 3 most recent
      const recent = items.filter(i=>i.title).slice(0,3);
      recent.forEach((i,n) => console.log(`    [${n+1}] "${i.title?.slice(0,80)}" | ${i.pubDate?.slice(0,25)}`));
    }
  } catch(e) {
    const ms = Date.now() - t0;
    console.log(`    ERROR (${ms}ms): ${e.message}`);
  }
}

// ── SECCIÓN F: comparación último artículo vs RSS disponible ─────────────────
sep('F — COMPARACIÓN: último artículo en DB vs RSS disponible HOY');
{
  const { rows: [lastArt] } = await q(`SELECT title, created_at, origin FROM articles ORDER BY created_at DESC LIMIT 1`);
  console.log(`Último artículo en articles: ${lastArt?.created_at?.toISOString?.()?.slice(0,19)} | "${lastArt?.title?.slice(0,70)}" | origin=${lastArt?.origin}`);

  // Check monitored_articles for the most recent date
  const colsQuery = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='monitored_articles'`);
  const colNames = colsQuery.rows.map(c=>c.column_name);
  const tsCol = colNames.find(c=>['ingested_at','created_at'].includes(c));
  if (tsCol) {
    const { rows: [lastMon] } = await q(`SELECT title, ${tsCol} FROM monitored_articles ORDER BY ${tsCol} DESC LIMIT 1`);
    console.log(`Último monitored_article: ${lastMon?.[tsCol]?.toISOString?.()?.slice(0,19)} | "${lastMon?.title?.slice(0,70)}"`);
  }

  // Count articles by origin
  const { rows: byOrigin } = await q(`SELECT origin, COUNT(*) as cnt, MAX(created_at) as last FROM articles GROUP BY origin ORDER BY last DESC`);
  console.log('\nArtículos por origen:');
  byOrigin.forEach(r => console.log(`  origin=${r.origin || 'NULL'}: ${r.cnt} artículos, último: ${r.last?.toISOString?.()?.slice(0,19)}`));
}

// ── SECCIÓN G: ¿Cuándo paró realmente el monitor? ────────────────────────────
sep('G — TIMELINE EXACTA DEL ÚLTIMO CICLO DEL MONITOR');
{
  // trending_topics updated_at timeline
  const { rows } = await q(`
    SELECT DATE_TRUNC('hour', updated_at) as hora, COUNT(*) as actualizaciones
    FROM trending_topics
    WHERE updated_at > NOW() - INTERVAL '7 days'
    GROUP BY hora ORDER BY hora DESC LIMIT 20
  `);
  console.log('Actividad de trending_topics por hora (últimos 7 días):');
  rows.forEach(r => console.log(`  ${r.hora?.toISOString?.()?.slice(0,16)} → ${r.actualizaciones} updates`));

  // monitored_articles timeline
  const colsQuery = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='monitored_articles'`);
  const tsCol = colsQuery.rows.map(c=>c.column_name).find(c=>['ingested_at','created_at'].includes(c));
  if (tsCol) {
    const { rows: timeline } = await q(`
      SELECT DATE_TRUNC('hour', ${tsCol}) as hora, COUNT(*) as articulos
      FROM monitored_articles
      WHERE ${tsCol} > NOW() - INTERVAL '7 days'
      GROUP BY hora ORDER BY hora DESC LIMIT 20
    `);
    console.log(`\nActividad de monitored_articles (${tsCol}) por hora:`);
    timeline.forEach(r => console.log(`  ${r.hora?.toISOString?.()?.slice(0,16)} → ${r.articulos} artículos`));
  }
}

// ── SECCIÓN H: pipeline — ¿dónde se corta? ───────────────────────────────────
sep('H — PIPELINE COMPLETO: ¿en qué etapa se corta?');
{
  const colsQuery = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='monitored_articles'`);
  const tsCol = colsQuery.rows.map(c=>c.column_name).find(c=>['ingested_at','created_at'].includes(c));

  const stages = [
    { label: 'monitored_articles (ingesta RSS)', query: `SELECT COUNT(*) as cnt, MAX(${tsCol||'published_at'}) as last FROM monitored_articles` },
    { label: 'article_entity_matches (NER)', query: `SELECT COUNT(*) as cnt, MAX(created_at) as last FROM article_entity_matches` },
    { label: 'trending_topics (trending)', query: `SELECT COUNT(*) as cnt, MAX(updated_at) as last FROM trending_topics` },
    { label: 'trend_clusters (clustering)', query: `SELECT COUNT(*) as cnt, MAX(updated_at) as last FROM trend_clusters` },
    { label: 'event_clusters (AI eventos)', query: `SELECT COUNT(*) as cnt, MAX(updated_at) as last FROM event_clusters` },
    { label: 'story_clusters (AI historias)', query: `SELECT COUNT(*) as cnt, MAX(updated_at) as last FROM story_clusters` },
    { label: 'editorial_opportunities', query: `SELECT COUNT(*) as cnt, MAX(updated_at) as last FROM editorial_opportunities` },
    { label: 'articles (publicados)', query: `SELECT COUNT(*) as cnt, MAX(created_at) as last FROM articles` },
  ];

  console.log(`${'Etapa'.padEnd(40)} ${'Registros'.padEnd(12)} Último registro`);
  console.log('─'.repeat(75));
  for (const s of stages) {
    try {
      const { rows: [r] } = await q(s.query);
      const last = r.last?.toISOString?.()?.slice(0,19) ?? r.last ?? 'n/a';
      console.log(`${s.label.slice(0,39).padEnd(40)} ${String(r.cnt).padEnd(12)} ${last}`);
    } catch(e) {
      console.log(`${s.label.slice(0,39).padEnd(40)} ERROR: ${e.message.split('\n')[0]}`);
    }
  }
}

// ── SECCIÓN I: Evidencia de AI — ai_generation_logs ──────────────────────────
sep('I — AI GENERATION LOGS (últimas llamadas IA)');
{
  const { rows: cols } = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='ai_generation_logs' ORDER BY ordinal_position`);
  console.log('Columnas ai_generation_logs:', cols.map(c=>c.column_name).join(', '));

  const { rows: [aicnt] } = await q(`SELECT COUNT(*) as total, MAX(created_at) as last FROM ai_generation_logs`);
  console.log(`Total: ${aicnt.total} | Último: ${aicnt.last?.toISOString?.()?.slice(0,19)}`);

  const { rows: ailast } = await q(`SELECT * FROM ai_generation_logs ORDER BY created_at DESC LIMIT 10`);
  console.log('Últimos 10:');
  ailast.forEach(r => console.log(`  ${r.created_at?.toISOString?.()?.slice(0,19)} | ${JSON.stringify(r).slice(0,150)}`));
}

console.log(`\n✅ Auditoría completada: ${new Date().toISOString()}`);
await pool.end();
