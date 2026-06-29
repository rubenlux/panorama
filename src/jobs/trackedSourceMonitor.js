import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { query } from '../routes/db.js';
import { logEvent } from './workerUtils.js';
import { scrapeWithPlaywright } from '../connectors/playwright.js';

let isRunning = false;

// ── URL helpers ───────────────────────────────────────────────────────────────

function normalizeUrl(href, baseUrl) {
  try {
    const abs = new URL(href, baseUrl);
    abs.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(p =>
      abs.searchParams.delete(p)
    );
    return abs.toString();
  } catch {
    return null;
  }
}

// ── Editorial link filter (Coverage V2.1) ────────────────────────────────────
//
// Three levels applied in scrapeLinks() before any link enters tracked_articles.
//
// Level 1 — institutional blacklist: stats, reels, authors, legal pages, mediakit
// Level 2 — URL shape: must be a multi-segment path with a long editorial slug (≥30 chars)
// Level 3 — section relevance: first path segment must match the monitored topic
//
// Design note: TyC Sports renders ~114 nav/category links server-side on every
// section page. Without this filter, 92% of captured links are navigation noise.

const BLACKLIST_FIRST_SEGMENTS = new Set([
  'estadisticas', 'reels', 'autor', 'author', 'periodista',
]);

const BLACKLIST_PATH_PREFIXES = [
  '/politica-de-privacidad', '/privacy', '/sitemap',
  '/contacto', '/contact', '/terminos', '/cookies',
];

const BLACKLIST_DOMAINS = ['mediakit.'];

// An editorial article slug on TyC Sports is ≥30 chars (e.g. "cavani-se-va-de-boca-rescindira-su-contrato-id736810.html" = 57 chars).
// Subcategory pages have short last segments: "liga-mx.html"=12, "austria.html"=12, "seleccion-argentina.html"=24.
const SLUG_MIN_LENGTH = 30;

// Maps source section name → allowed first-path-segments for its articles.
// Needed when articles live under a path different from the source page's filename.
// Example: Los Pumas source is /los-pumas.html but its articles are under /rugby/...
const SECTION_MAP = {
  'los-pumas':           ['los-pumas', 'rugby'],
  'seleccion-argentina': ['seleccion-argentina', 'mundial'],
};

function getSectionPrefixes(sourceUrl) {
  try {
    const segs = new URL(sourceUrl).pathname.replace(/\.html$/, '').split('/').filter(Boolean);
    const section = segs[segs.length - 1];
    return SECTION_MAP[section] || [section];
  } catch {
    return [];
  }
}

function isEditorialLink(url, sectionPrefixes) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const segments = pathname.split('/').filter(Boolean);

  // Level 1 — institutional blacklist
  for (const bl of BLACKLIST_DOMAINS) {
    if (hostname.includes(bl)) return false;
  }
  for (const prefix of BLACKLIST_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return false;
  }
  const firstSeg = segments[0] || '';
  if (BLACKLIST_FIRST_SEGMENTS.has(firstSeg)) return false;

  // Level 2 — must be a deep editorial slug
  if (segments.length < 2) return false;
  const lastSeg = segments[segments.length - 1];
  if (lastSeg.length < SLUG_MIN_LENGTH || !lastSeg.includes('-')) return false;

  // Level 3 — must belong to the source's section
  if (sectionPrefixes.length > 0 && !sectionPrefixes.includes(firstSeg)) return false;

  return true;
}

// ── Schema: published_at and modified_at columns ────────────────────────────

async function ensurePublishedAtColumn() {
  await query(`
    ALTER TABLE tracked_articles
      ADD COLUMN IF NOT EXISTS published_at timestamptz
  `);
}

async function ensureModifiedAtColumn() {
  await query(`
    ALTER TABLE tracked_articles
      ADD COLUMN IF NOT EXISTS modified_at timestamptz
  `);
}

// ── Content archiver ──────────────────────────────────────────────────────────
// Runs as a separate pass after all sources are processed.
// Fetches up to CONTENT_BATCH articles per cycle that have no content yet.

const CONTENT_BATCH = parseInt(process.env.COVERAGE_CONTENT_BATCH || '20', 10);

// Returns { text, publishedAt } or null on fetch failure.
async function fetchArticleContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract published and modified dates before stripping elements.
    // Try multiple meta tag patterns: Open Graph, schema.org, generic datePublished
    let publishedAt = null;
    let modifiedAt = null;

    const metaPubDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="article:published_time"]').attr('content') ||
      $('meta[property="datePublished"]').attr('content') ||
      $('meta[name="datePublished"]').attr('content') ||
      $('meta[property="date"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('meta[itemprop="datePublished"]').attr('content');
    if (metaPubDate) {
      const d = new Date(metaPubDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    const metaModDate =
      $('meta[property="article:modified_time"]').attr('content') ||
      $('meta[name="article:modified_time"]').attr('content') ||
      $('meta[property="dateModified"]').attr('content') ||
      $('meta[name="dateModified"]').attr('content') ||
      $('meta[itemprop="dateModified"]').attr('content');
    if (metaModDate) {
      const d = new Date(metaModDate);
      if (!isNaN(d.getTime())) modifiedAt = d;
    }

    if (!publishedAt || !modifiedAt) {
      try {
        const jsonLd = $('script[type="application/ld+json"]').first().text();
        if (jsonLd) {
          const data = JSON.parse(jsonLd);
          const dp = data.datePublished || (Array.isArray(data) && data[0]?.datePublished);
          const dm = data.dateModified || (Array.isArray(data) && data[0]?.dateModified);
          if (dp && !publishedAt) {
            const d = new Date(dp);
            if (!isNaN(d.getTime())) publishedAt = d;
          }
          if (dm && !modifiedAt) {
            const d = new Date(dm);
            if (!isNaN(d.getTime())) modifiedAt = d;
          }
        }
      } catch {}
    }

    // Remove noise before text extraction.
    // noscript must be removed first: its content is parsed as text nodes by Cheerio,
    // so tracking pixel <img> tags inside it appear literally in body.text().
    $('noscript').remove();
    $('script, style, nav, header, footer, aside, iframe, [class*="menu"], [class*="sidebar"], [class*="ad-"], [id*="ad-"]').remove();

    const candidates = [
      'article', '[role="main"]', 'main',
      '.article-body', '.article__body', '.nota-cuerpo', '.news-body',
      '.post-content', '.entry-content', '.content-body',
    ];
    let text = '';
    for (const sel of candidates) {
      const el = $(sel).first();
      if (el.length) {
        text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 300) break;
      }
    }
    if (text.length < 300) {
      text = $('body').text().replace(/\s+/g, ' ').trim();
    }

    return { text: text.slice(0, 5000) || null, publishedAt, modifiedAt };
  } catch {
    return null;
  }
}

async function fetchPendingContent() {
  const { rows: pending } = await query(`
    SELECT id, url FROM tracked_articles
    WHERE content_text IS NULL
      AND is_active = true
      AND first_detected_at > now() - interval '7 days'
    ORDER BY first_detected_at DESC
    LIMIT ${CONTENT_BATCH}
  `);

  if (pending.length === 0) return 0;

  let archived = 0;
  for (const item of pending) {
    const result = await fetchArticleContent(item.url);
    if (result?.text) {
      await query(
        `UPDATE tracked_articles
         SET content_text = $2,
             published_at = COALESCE($3, published_at),
             modified_at = COALESCE($4, modified_at)
         WHERE id = $1 AND content_text IS NULL`,
        [item.id, result.text, result.publishedAt ?? null, result.modifiedAt ?? null]
      );
      archived++;
    }
  }
  return archived;
}

// ── Page scraper ──────────────────────────────────────────────────────────────

async function scrapeLinks(url, usePlaywright = false, isXmlIndex = false) {
  try {
    let html;
    let method = 'HTTP';

    if (!usePlaywright) {
      // Attempt 1: HTTP fetch (fast, common case)
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 30000,
        });
        if (url.includes('sitemap')) {
          console.debug(`[scrapeLinks] HTTP ${res.status} for ${url}`);
        }
        // Accept 2xx status codes, not just res.ok (which doesn't include 202)
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`HTTP ${res.status}`);
        }
        html = await res.text();
        if (url.includes('sitemap') && html.length === 0) {
          console.warn(`[scrapeLinks] Got empty response for ${url} (HTTP ${res.status}) — trying Playwright`);
          throw new Error('Empty response from ' + url);
        }
      } catch (httpError) {
        // Attempt 2: Fallback to Playwright (for Cloudflare, rate-limits, etc)
        const errorMsg = httpError?.message || String(httpError);
        console.warn(`[Coverage] HTTP failed for ${url}: ${errorMsg} — trying Playwright`);

        if (url.includes('sitemap')) {
          console.debug(`[scrapeLinks] Error details: ${errorMsg}`);
        }

        const playwrightHtml = await scrapeWithPlaywright(url);
        if (!playwrightHtml) {
          throw new Error(`Both HTTP and Playwright failed: ${errorMsg}`);
        }
        html = playwrightHtml;
        method = 'Playwright';
      }
    } else {
      // Direct Playwright attempt
      html = await scrapeWithPlaywright(url);
      if (!html) throw new Error('Playwright returned no HTML');
      method = 'Playwright';
    }

    // Check if this is XML (sitemap)
    const isXml = html.trim().startsWith('<?xml');

    // Debug log for first 100 chars and isXml status
    if (url.includes('sitemap')) {
      console.debug(`[scrapeLinks] ${url}: html_len=${html.length}, isXml=${isXml}, first100="${html.trim().substring(0, 100)}"`);
    }

    const $ = cheerio.load(html);
    const baseDomain = new URL(url).hostname.split('.').slice(-2).join('.');
    const sectionPrefixes = getSectionPrefixes(url);
    const seen = new Set();
    const links = [];

    if (isXml) {
      // Handle XML sitemaps (including CDATA content) using regex to avoid cheerio parsing issues
      const locPattern = /<loc>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/loc>/gi;
      let match;

      while ((match = locPattern.exec(html)) !== null) {
        const href = match[1].trim();
        if (!href) continue;

        try {
          const linkDomain = new URL(href).hostname.split('.').slice(-2).join('.');
          if (linkDomain !== baseDomain) continue;
        } catch {
          continue;
        }

        if (seen.has(href)) continue;
        seen.add(href);

        // If this is a sitemap index (contains /sitemap in URL or is itself an index)
        const isSitemapUrl = href.includes('sitemap');
        links.push({ url: href, title: '', position: links.length + 1, isSitemapUrl });
      }
    } else {
      // Handle HTML pages
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (!href || title.length < 5) return;

        const absUrl = normalizeUrl(href, url);
        if (!absUrl) return;

        try {
          const linkDomain = new URL(absUrl).hostname.split('.').slice(-2).join('.');
          if (linkDomain !== baseDomain) return;
        } catch {
          return;
        }

        // Editorial filter: drop nav links, category pages, institutional URLs,
        // and links outside the monitored section.
        if (!isEditorialLink(absUrl, sectionPrefixes)) return;

        if (seen.has(absUrl)) return;
        seen.add(absUrl);
        links.push({ url: absUrl, title, position: links.length + 1 });
      });
    }

    // Hash includes titles so any title change triggers the comparison pass
    const fingerprint = links.map(l => `${l.url}::${l.title}`).join('\n');
    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');

    if (method === 'Playwright') {
      console.info(`[Coverage] Successfully scraped ${url} via Playwright`);
    }

    return { links, hash, method, isXml };
  } catch (e) {
    console.error(`[Coverage] Scrape failed for ${url}: ${e.message}`);
    return null;
  }
}

// ── Handle sitemap indexes recursively ───────────────────────────────────────

async function resolveSitemapLinks(url, maxDepth = 2, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];

  const result = await scrapeLinks(url);
  if (!result) {
    console.warn(`[Coverage] resolveSitemapLinks: ${url} returned null`);
    return [];
  }

  if (!result.isXml) {
    console.warn(`[Coverage] resolveSitemapLinks: ${url} is not XML (isXml=${result.isXml}), got ${result.links.length} links`);
    return [];
  }

  const { links } = result;
  const allLinks = [];

  // Separate sitemap URLs from article URLs
  const sitemapLinks = links.filter(l => l.isSitemapUrl);
  const articleLinks = links.filter(l => !l.isSitemapUrl);

  // Add article links
  allLinks.push(...articleLinks);

  // Recursively follow sitemap links
  for (const sitemapLink of sitemapLinks) {
    const nestedLinks = await resolveSitemapLinks(sitemapLink.url, maxDepth, currentDepth + 1);
    allLinks.push(...nestedLinks);
  }

  return allLinks;
}

// ── Core: detect changes for one source ──────────────────────────────────────

export async function processTrackedSource(source) {
  const result = await scrapeLinks(source.url);
  if (!result) {
    console.warn(`[Coverage] "${source.name}" returned no result`);
    return { changes: 0, newItems: 0 };
  }

  const { links: initialLinks, hash, isXml } = result;
  let links = initialLinks;

  console.info(`[Coverage] "${source.name}": got ${initialLinks.length} initial link(s), isXml=${isXml}`);

  // If this is an XML sitemap, resolve indexes recursively
  if (isXml) {
    console.info(`[Coverage] "${source.name}" is XML sitemap, resolving indexes...`);
    const sitemapLinks = initialLinks.filter(l => l.isSitemapUrl);
    const articleLinks = initialLinks.filter(l => !l.isSitemapUrl);

    console.info(`[Coverage] Found ${sitemapLinks.length} sitemap link(s) and ${articleLinks.length} article link(s) at root`);

    // Follow sitemap links to get actual articles
    for (const sitemapLink of sitemapLinks) {
      console.info(`[Coverage] Following sitemap: ${sitemapLink.url}`);
      const nested = await resolveSitemapLinks(sitemapLink.url, 3);
      console.info(`[Coverage] Got ${nested.length} article(s) from ${sitemapLink.url}`);
      articleLinks.push(...nested);
    }

    links = articleLinks.length > 0 ? articleLinks : initialLinks;
    console.info(`[Coverage] "${source.name}" resolved to ${links.length} article link(s)`);
  }

  // Fast path: nothing changed
  if (hash === source.last_hash) {
    await query(
      `UPDATE tracked_sources SET last_checked = now(), updated_at = now() WHERE id = $1`,
      [source.id]
    );
    return { changes: 0, newItems: 0 };
  }

  // Guard: if the page returned almost no links it probably errored or is loading dynamically.
  // Only skip change detection (not the last_checked update) to avoid stale monitoring.
  if (links.length < 2 && source.last_hash) {
    console.warn(
      `[Coverage] "${source.name}" returned ${links.length} link(s) — skipping change detection`
    );
    await query(
      `UPDATE tracked_sources SET last_checked = now(), updated_at = now() WHERE id = $1`,
      [source.id]
    );
    return { changes: 0, newItems: 0 };
  }

  // Load all known items for this source
  const { rows: knownItems } = await query(
    `SELECT id, url, title, is_active, current_position FROM tracked_articles WHERE tracked_source_id = $1`,
    [source.id]
  );
  const knownByUrl = new Map(knownItems.map(a => [a.url, a]));
  const currentUrls = new Set(links.map(l => l.url));

  const changeRecords = [];
  let newItemCount = 0;

  // ── Evaluate current links ────────────────────────────────────────────────
  for (const link of links) {
    const known = knownByUrl.get(link.url);

    if (!known) {
      // Brand-new URL
      const { rows: [item] } = await query(
        `INSERT INTO tracked_articles
           (tracked_source_id, url, title, current_position, is_active, first_detected_at, last_seen_at)
         VALUES ($1, $2, $3, $4, true, now(), now())
         ON CONFLICT (tracked_source_id, url) DO UPDATE
           SET is_active = true, last_seen_at = now(), current_position = EXCLUDED.current_position
         RETURNING id`,
        [source.id, link.url, link.title, link.position]
      );
      changeRecords.push({
        tracked_article_id: item.id,
        change_type: 'link_added',
        old_value: null,
        new_value: link.title,
      });
      newItemCount++;

    } else if (!known.is_active) {
      // Reappeared after removal
      await query(
        `UPDATE tracked_articles
         SET is_active = true, last_seen_at = now(), current_position = $2, title = $3
         WHERE id = $1`,
        [known.id, link.position, link.title]
      );
      changeRecords.push({
        tracked_article_id: known.id,
        change_type: 'link_added',
        old_value: null,
        new_value: link.title,
      });

    } else {
      // Known active item — check for title change
      if (known.title && link.title && link.title !== known.title) {
        await query(
          `UPDATE tracked_articles SET title = $2, last_seen_at = now(), current_position = $3 WHERE id = $1`,
          [known.id, link.title, link.position]
        );
        changeRecords.push({
          tracked_article_id: known.id,
          change_type: 'title_changed',
          old_value: known.title,
          new_value: link.title,
        });
      } else {
        await query(
          `UPDATE tracked_articles SET last_seen_at = now(), current_position = $2 WHERE id = $1`,
          [known.id, link.position]
        );
      }
    }
  }

  // ── Detect removed items ──────────────────────────────────────────────────
  for (const [url, known] of knownByUrl) {
    if (known.is_active && !currentUrls.has(url)) {
      await query(`UPDATE tracked_articles SET is_active = false WHERE id = $1`, [known.id]);
      changeRecords.push({
        tracked_article_id: known.id,
        change_type: 'link_removed',
        old_value: known.title,
        new_value: null,
      });
    }
  }

  // ── Persist change events ─────────────────────────────────────────────────
  for (const ch of changeRecords) {
    await query(
      `INSERT INTO coverage_changes
         (tracked_source_id, tracked_article_id, change_type, old_value, new_value, detected_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [source.id, ch.tracked_article_id, ch.change_type, ch.old_value, ch.new_value]
    );
  }

  // ── Save snapshot for audit trail ─────────────────────────────────────────
  await query(
    `INSERT INTO tracked_source_snapshots (tracked_source_id, content_hash, links_detected)
     VALUES ($1, $2, $3)`,
    [source.id, hash, JSON.stringify(links)]
  );

  // ── Update source ─────────────────────────────────────────────────────────
  await query(
    `UPDATE tracked_sources SET last_checked = now(), last_hash = $1, updated_at = now() WHERE id = $2`,
    [hash, source.id]
  );

  if (changeRecords.length > 0) {
    await logEvent('coverage_changes_detected', 'coverage_monitor', {
      source_id: source.id,
      source_name: source.name,
      changes: changeRecords.length,
      new_items: newItemCount,
    });
  }

  return { changes: changeRecords.length, newItems: newItemCount };
}

// ── Worker entry point ────────────────────────────────────────────────────────

export async function trackedSourceMonitor() {
  if (isRunning) return;
  isRunning = true;

  try {
    await ensurePublishedAtColumn();
    await ensureModifiedAtColumn();

    const { rows: sources } = await query(`
      SELECT * FROM tracked_sources
      WHERE active = true
        AND (last_checked IS NULL
             OR last_checked < now() - (refresh_interval_seconds || ' seconds')::interval)
      ORDER BY last_checked ASC NULLS FIRST
      LIMIT 10
    `);

    if (sources.length === 0) return;

    console.log(`[Coverage] Checking ${sources.length} source(s)...`);

    let totalChanges = 0;
    let totalNew = 0;

    // Pass 1 — detect changes (fast: scrape + compare + insert events)
    for (const source of sources) {
      const { changes, newItems } = await processTrackedSource(source);
      totalChanges += changes;
      totalNew += newItems;
    }

    // Pass 2 — content archive queue (slow: fetch article text, bounded by CONTENT_BATCH)
    // Runs regardless of whether this cycle had new detections.
    const archived = await fetchPendingContent();

    if (totalChanges > 0 || archived > 0) {
      console.log('\n=== Coverage Monitor Report ===');
      console.log(`Sources checked:     ${sources.length}`);
      console.log(`Changes detected:    ${totalChanges}`);
      console.log(`New items:           ${totalNew}`);
      console.log(`Content archived:    ${archived}`);
      console.log('================================\n');
    }

  } catch (e) {
    console.error('[Coverage] Worker error:', e.message);
  } finally {
    isRunning = false;
  }
}
