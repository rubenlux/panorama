import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { query } from '../routes/db.js';
import { logEvent } from './workerUtils.js';

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

// ── Content archiver ──────────────────────────────────────────────────────────
// Runs as a separate pass after all sources are processed.
// Fetches up to CONTENT_BATCH articles per cycle that have no content yet.
// All new items eventually get archived — no slice cutoff.

const CONTENT_BATCH = parseInt(process.env.COVERAGE_CONTENT_BATCH || '20', 10);

async function fetchArticleContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

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
    return text.slice(0, 5000) || null;
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
    const content = await fetchArticleContent(item.url);
    if (content) {
      await query(
        `UPDATE tracked_articles SET content_text = $2 WHERE id = $1 AND content_text IS NULL`,
        [item.id, content]
      );
      archived++;
    }
  }
  return archived;
}

// ── Page scraper ──────────────────────────────────────────────────────────────

async function scrapeLinks(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 30000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const baseDomain = new URL(url).hostname.split('.').slice(-2).join('.');
    const seen = new Set();
    const links = [];

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

      if (seen.has(absUrl)) return;
      seen.add(absUrl);
      links.push({ url: absUrl, title, position: links.length + 1 });
    });

    // Hash includes titles so any title change triggers the comparison pass
    const fingerprint = links.map(l => `${l.url}::${l.title}`).join('\n');
    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');

    return { links, hash };
  } catch (e) {
    console.error(`[Coverage] Scrape failed for ${url}: ${e.message}`);
    return null;
  }
}

// ── Core: detect changes for one source ──────────────────────────────────────

export async function processTrackedSource(source) {
  const result = await scrapeLinks(source.url);
  if (!result) return { changes: 0, newItems: 0 };

  const { links, hash } = result;

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
    // All articles without content eventually get archived over successive cycles.
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
