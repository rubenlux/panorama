#!/usr/bin/env node

/**
 * TRACE DE processSource() - FLUJO PURO
 *
 * Objetivo: Ver EXACTAMENTE qué ocurre en cada decisión
 *
 * SOURCE
 *   ↓
 * fetchFeedXml()
 *   ↓ Content-Type?
 * detectFeedFormat()
 *   ↓ format
 * parseItems()
 *   ↓ items.length
 * fallback condition
 *   ↓ yes/no
 * INSERT count
 *
 * NO se toca Playwright. Solo se registran las decisiones.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { createHash } from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TRACE_ID = `PROCESS-SOURCE-${Date.now()}`;

function log(stage, status, value) {
  const symbol = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`[${TRACE_ID}] ${symbol} ${stage.padEnd(30)} | ${value}`);
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTag(xml, tag) {
  const re = new RegExp(`<([\\w-]+\\:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/([\\w-]+\\:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[2].trim()) : '';
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    items.push({
      title: extractTag(raw, 'title'),
      link: extractTag(raw, 'link') || extractTag(raw, 'guid'),
      description: extractTag(raw, 'description').replace(/<[^>]*>/g, '').trim().slice(0, 500),
      pubDate: extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date'),
      guid: extractTag(raw, 'guid'),
    });
  }
  return items;
}

function parseNewsSitemapItems(xml) {
  const items = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const block = m[1];
    const loc = extractTag(block, 'loc');
    if (!loc || !loc.startsWith('http')) continue;
    const title = extractTag(block, 'title');
    const pubDate = extractTag(block, 'publication_date') || extractTag(block, 'lastmod');
    if (!title) continue;
    items.push({ title, link: loc, description: '', pubDate, guid: loc });
  }
  return items;
}

function detectFeedFormat(xml) {
  const t = xml.trimStart().slice(0, 2000);
  if (t.includes('<sitemapindex')) return 'sitemap-index';
  if (t.includes('<urlset')) {
    return (t.includes('xmlns:news') || t.includes('news.google.com')) ? 'news-sitemap' : 'urlset';
  }
  if (t.includes('<rss') || t.includes('<channel')) return 'rss';
  if (t.includes('<feed') && t.includes('xmlns')) return 'atom';
  return 'UNKNOWN';
}

async function fetchFeedXml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, contentType: null, xml: null };
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    return { ok: false, status: res.status, contentType: 'text/html', xml: null, isHtml: true };
  }

  const xml = await res.text();
  return { ok: true, status: res.status, contentType: ct, xml, isHtml: false };
}

async function traceSource() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE: processSource() FLOW                                   ║`);
  console.log(`║  Objetivo: Ver EXACTAMENTE cada decisión                       ║`);
  console.log(`║  TraceID: ${TRACE_ID}`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // Obtener Diario Formosa
    log('SOURCE_LOOKUP', 'OK', 'Buscando Diario Formosa');

    const { rows } = await pool.query(`
      SELECT id, name, rss_url, sitemap_url
      FROM rss_sources
      WHERE name = 'Diario Formosa'
    `);

    const source = rows[0];
    if (!source) {
      log('SOURCE_LOOKUP', 'FAIL', 'No encontrado');
      return;
    }

    log('SOURCE_ID', 'OK', source.id);
    log('SOURCE_NAME', 'OK', source.name);
    log('RSS_URL', 'OK', source.rss_url);

    // PASO 1: fetchFeedXml(rss_url)
    console.log(`\n--- PASO 1: fetchFeedXml(${source.rss_url}) ---\n`);

    const fetchResult = await fetchFeedXml(source.rss_url);

    log('HTTP_STATUS', 'OK', `${fetchResult.status}`);
    log('CONTENT_TYPE', 'OK', fetchResult.contentType || 'NONE');
    log('IS_HTML', fetchResult.isHtml ? 'WARN' : 'OK', fetchResult.isHtml ? 'YES (not XML)' : 'NO');

    let items = [];
    let format = null;

    // PASO 2: ¿Hubo XML?
    if (!fetchResult.xml) {
      log('XML_RECEIVED', 'FAIL', 'NO - fetchFeedXml devolvió null');
      log('ITEMS_FROM_RSS', 'OK', '0');
    } else {
      log('XML_RECEIVED', 'OK', `YES (${fetchResult.xml.length} chars)`);

      // PASO 3: detectFeedFormat()
      format = detectFeedFormat(fetchResult.xml);
      log('DETECTED_FORMAT', 'OK', format);

      // PASO 4: parseItems() según format
      if (format === 'news-sitemap') {
        items = parseNewsSitemapItems(fetchResult.xml);
        log('PARSER_USED', 'OK', 'parseNewsSitemapItems()');
      } else if (format === 'rss' || format === 'atom') {
        items = parseRssItems(fetchResult.xml);
        log('PARSER_USED', 'OK', 'parseRssItems()');
      } else if (format === 'UNKNOWN') {
        log('PARSER_USED', 'FAIL', 'No parser para formato desconocido');
        items = [];
      }

      log('ITEMS_PARSED', 'OK', `${items.length} items`);

      if (items.length > 0) {
        log('ITEMS_SAMPLE', 'OK', `"${items[0].title?.substring(0, 50)}..."`);
      }
    }

    // PASO 5: ¿Fallback a Sitemap?
    if (items.length === 0 && source.sitemap_url) {
      console.log(`\n--- FALLBACK 1: fetchFeedXml(${source.sitemap_url}) ---\n`);
      log('TRYING_SITEMAP', 'OK', source.sitemap_url);

      const sitemapResult = await fetchFeedXml(source.sitemap_url);
      log('SITEMAP_STATUS', 'OK', `${sitemapResult.status}`);

      if (sitemapResult.xml) {
        const sitemapFormat = detectFeedFormat(sitemapResult.xml);
        log('SITEMAP_FORMAT', 'OK', sitemapFormat);

        if (sitemapFormat === 'news-sitemap') {
          items = parseNewsSitemapItems(sitemapResult.xml);
          log('SITEMAP_ITEMS', 'OK', `${items.length} items`);
        }
      }
    }

    // PASO 6: ¿Fallback a Playwright?
    if (items.length === 0) {
      console.log(`\n--- FALLBACK 2: discoverArticlesViaPlaywright() ---\n`);
      log('ENTERING_PLAYWRIGHT', 'OK', 'items.length === 0, fallback activated');
      log('PLAYWRIGHT_FALLBACK', 'OK', 'SE EJECUTARÍA aquí (pero no lo instrumentamos)');
      log('NOTE', 'OK', 'En production esto retornaría articles[] o []');
    } else {
      log('SKIP_PLAYWRIGHT', 'OK', `items.length=${items.length} > 0, no fallback`);
    }

    // PASO 7: Loop de inserción
    console.log(`\n--- PASO 7: INSERT LOOP ---\n`);
    log('TOTAL_ITEMS', 'OK', `${items.length}`);

    let insertedCount = 0;
    for (const item of items) {
      const url = item.link;
      if (!url || !item.title) {
        log('ITEM_SKIP', 'OK', 'No URL o title vacío');
        continue;
      }

      const { rows: insertResult } = await pool.query(
        `INSERT INTO monitored_articles (source_id, title, url, summary, hash)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (hash) DO NOTHING
         RETURNING id`,
        [source.id, item.title, url, item.description || null,
         createHash('sha256').update(url.trim().toLowerCase()).digest('hex')]
      );

      if (insertResult.length > 0) {
        insertedCount++;
      }
    }

    log('INSERT_COUNT', 'OK', `${insertedCount} artículos insertados`);

    // PASO 8: Verificar en BD
    console.log(`\n--- PASO 8: VERIFICACIÓN FINAL ---\n`);

    const { rows: verify } = await pool.query(`
      SELECT COUNT(*) as count FROM monitored_articles WHERE source_id = $1
    `, [source.id]);

    log('TOTAL_IN_DB', 'OK', `${verify[0].count} artículos totales`);

    // RESUMEN
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║  RESUMEN DEL FLUJO                                             ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    console.log(`RSS URL Content-Type: ${fetchResult.contentType || 'NONE'}`);
    console.log(`Detected Format: ${format}`);
    console.log(`Items parsed: ${items.length}`);
    console.log(`Entered Playwright fallback: ${items.length === 0 ? 'YES' : 'NO'}`);
    console.log(`Inserted count: ${insertedCount}`);
    console.log(`Total in DB: ${verify[0].count}\n`);

    if (items.length === 0) {
      console.log(`⚠️  HYPOTHESIS: RSS_URL devuelve HTML, NO entra al parser, va directo a fallback.`);
    } else {
      console.log(`⚠️  HYPOTHESIS: RSS_URL devolvió items, Playwright NUNCA corre.`);
    }

  } catch (e) {
    log('ERROR', 'FAIL', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

traceSource();
