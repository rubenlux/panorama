/**
 * Discovery Module: Discovering articles from sources using various strategies
 * Handles: RSS, Sitemaps, Playwright-based discovery
 * Status: Orchestrator and DB persistence only
 */

import { query } from '../../routes/db.js';
import { DiscoveryFactory } from '../../services/DiscoveryFactory.js';
import { hashUrl } from './shared.js';

/**
 * Discover articles for a source using the configured strategy
 * Handles error classification and metrics update
 */
export async function discoverArticlesForSource(source) {
  let articles = [];
  let status = 'OK';
  let errorMessage = null;
  let format = null;
  const startTime = Date.now();

  try {
    const discoveryType = source.discovery_type || 'RSS';
    const strategy = DiscoveryFactory.get(discoveryType);
    const result = await strategy.execute(source);
    articles = result.articles;
    format = result.format;

    if (articles.length === 0) {
      status = 'EMPTY';
    } else {
      status = 'OK';
    }

  } catch (error) {
    const classification = DiscoveryFactory.classifyError(error);
    status = classification.status;
    errorMessage = classification.error;
    articles = [];
  }

  const durationMs = Date.now() - startTime;

  // Update discovery status and metrics in database
  try {
    await query(
      `UPDATE rss_sources
       SET last_discovery_status = $1,
           last_discovery_error = $2,
           last_discovery_duration_ms = $3,
           last_articles_found = $4,
           last_discovery_at = NOW()
       WHERE id = $5`,
      [status, errorMessage, durationMs, articles.length, source.id]
    );
  } catch (dbError) {
    console.error(`[Monitor] Failed to update discovery status for "${source.name}": ${dbError.message}`);
  }

  return { articles, status, errorMessage, format };
}

/**
 * Process a single source: discover articles and persist to DB
 */
export async function processSource(source) {
  const newIds = [];
  let format = null;
  let items = [];
  let discoveryStatus = 'OK';

  try {
    const discovery = await discoverArticlesForSource(source);
    items = discovery.articles;
    discoveryStatus = discovery.status;
    format = discovery.format;

    if (discoveryStatus === 'OK' || discoveryStatus === 'EMPTY') {
      console.log(`[Monitor] "${source.name}" (${source.discovery_type}): ${items.length} items found`);
    } else {
      console.log(`[Monitor] "${source.name}" discovery failed: ${discoveryStatus} - ${discovery.errorMessage || 'unknown error'}`);
    }

    // Insert discovered items into DB
    const isTraceSource = source.name === 'Guau Formosa';
    if (isTraceSource) console.log(`\n[TRACE] Insertando ${items.length} items...\n`);

    for (const item of items) {
      const url = item.link;
      if (!url || !item.title) continue;

      let pubDate = null;
      if (item.pubDate) {
        const d = new Date(item.pubDate);
        pubDate = isNaN(d.getTime()) ? null : d;
      }

      const { rows } = await query(
        `INSERT INTO monitored_articles (source_id, external_id, title, url, summary, published_at, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (hash) DO NOTHING
         RETURNING id`,
        [source.id, item.guid || null, item.title, url,
         item.description || null, pubDate, hashUrl(url)]
      );
      if (rows[0]) {
        newIds.push(rows[0].id);
        if (isTraceSource) {
          console.log(`  ✅ INSERT: ${rows[0].id.substring(0, 8)}... "${item.title.substring(0, 40)}..."`);
        }
      } else {
        if (isTraceSource) {
          console.log(`  ⚠️  DUPLICATE: "${item.title.substring(0, 40)}..."`);
        }
      }
    }

    if (isTraceSource) {
      console.log(`\n[TRACE] IDs realmente insertados (${newIds.length}):`);
      newIds.forEach((id, i) => {
        console.log(`  ${i+1}. ${id}`);
      });
      console.log();
    }

    if (format) {
      await query(
        `UPDATE rss_sources SET last_checked = now(), last_format_detected = $2 WHERE id = $1`,
        [source.id, format]
      );
    }
    if (items.length > 0)
      console.log(`[Monitor] "${source.name}" (${format}): ${items.length} items → ${newIds.length} new`);
  } catch (e) {
    console.error(`[Monitor] Source "${source.name}" failed: ${e.message}`);
  }
  return newIds;
}
