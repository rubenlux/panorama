#!/usr/bin/env node

/**
 * ISOLATED DEBUG: Playwright Discovery Pipeline
 *
 * Tests ONLY:
 * - Open homepage
 * - Find all links
 * - Filter by domain
 * - Filter garbage
 * - Deduplicate
 * - Open first 30
 * - Extract title
 * - Show results
 *
 * No DB, no monitor, no workers, no stories, no IA
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Usage: node debug-playwright-discovery.mjs <homepage-url>');
  process.exit(1);
}

const homeUrl = args[0];
console.log(`\n${'═'.repeat(70)}`);
console.log(`DEBUG: Playwright Discovery`);
console.log(`Home: ${homeUrl}`);
console.log(`${'═'.repeat(70)}\n`);

// ─────────────────────────────────────────────────────────────────────────
// Step 1: Open homepage and collect all links
// ─────────────────────────────────────────────────────────────────────────

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log(`Opening ${homeUrl}...`);
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(500);
  console.log(`✓ Home opened\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // DIAGNOSTIC: What did Playwright actually receive?
  // ─────────────────────────────────────────────────────────────────────────

  const diagnostics = {
    url: page.url(),
    title: await page.title(),
    contentLength: (await page.content()).length,
    frames: page.frames().length,
    bodyHtmlLength: await page.evaluate(() => document.body.innerHTML.length),
    aElementCount: await page.evaluate(() => document.querySelectorAll('a').length),
  };

  console.log(`[DIAGNOSTICS]`);
  console.log(`  Current URL: ${diagnostics.url}`);
  console.log(`  Page title: "${diagnostics.title}"`);
  console.log(`  Content length: ${diagnostics.contentLength} chars`);
  console.log(`  Body innerHTML length: ${diagnostics.bodyHtmlLength} chars`);
  console.log(`  <a> elements (DOM): ${diagnostics.aElementCount}`);
  console.log(`  Frames: ${diagnostics.frames}\n`);

  // Show first 3000 chars of page content to detect challenges, redirects, errors
  const pageContent = await page.content();
  if (diagnostics.contentLength > 0) {
    console.log(`[PAGE CONTENT PREVIEW (first 3000 chars)]`);
    console.log(pageContent.substring(0, 3000));
    console.log(`...\n`);
  } else {
    console.log(`[PAGE CONTENT] EMPTY - page.content() returned nothing\n`);
  }

  // Collect all links
  const allUrls = await page.evaluate(() => {
    const urls = new Set();
    const links = document.querySelectorAll('a[href]');

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      let full;
      if (href.startsWith('http')) {
        full = href;
      } else {
        const path = href.startsWith('/') ? href : '/' + href;
        full = window.location.origin + path;
      }

      full = full.split('?')[0].split('#')[0];

      if (full.startsWith(window.location.origin) && full.length > 10) {
        urls.add(full);
      }
    });

    return Array.from(urls);
  });

  console.log(`Links found: ${allUrls.length}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Extract media hostname
  // ─────────────────────────────────────────────────────────────────────────

  const urlObj = new URL(homeUrl);
  const mediaHostname = urlObj.hostname;
  console.log(`Media hostname: ${mediaHostname}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Filter by domain
  // ─────────────────────────────────────────────────────────────────────────

  function belongsToMedia(hostname, media) {
    if (!media) return true;
    const h = hostname.toLowerCase();
    const m = media.toLowerCase();
    if (h === m) return true;
    if (h.endsWith('.' + m)) return true;
    return false;
  }

  const sameDomain = allUrls.filter(url => {
    try {
      const u = new URL(url);
      return belongsToMedia(u.hostname, mediaHostname);
    } catch {
      return false;
    }
  });

  console.log(`Same domain: ${sameDomain.length}`);
  if (sameDomain.length === 0) {
    console.log(`\n❌ PROBLEM: 0 URLs belong to ${mediaHostname}`);
    console.log(`Sample URLs (first 5 from ${allUrls.length}):`);
    allUrls.slice(0, 5).forEach((url, i) => {
      const u = new URL(url);
      console.log(`  ${i + 1}. ${u.hostname} → ${url.substring(0, 60)}`);
    });
    await browser.close();
    process.exit(1);
  }

  console.log('Sample same-domain URLs (first 5):');
  sameDomain.slice(0, 5).forEach((url, i) => {
    console.log(`  ${i + 1}. ${url}`);
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Filter garbage
  // ─────────────────────────────────────────────────────────────────────────

  function isGarbageUrl(url) {
    if (/\.(jpg|png|webp|pdf|gif|doc|docx)$/i.test(url)) return true;
    if (/javascript:|mailto:/.test(url)) return true;
    if (/\?.*?(page|search|q)=/i.test(url)) return true;

    const pathSegments = new URL(url).pathname.split('/').filter(s => s);
    const garbageSegments = ['rss', 'feed', 'sitemap', 'login', 'signin', 'logout', 'search',
                             'contacto', 'contact', 'privacy', 'about', 'terms', 'legal',
                             'help', 'faq', 'suscripci', 'subscribe', 'ads', 'jobs', 'carrera'];

    if (pathSegments.some(seg => garbageSegments.includes(seg.toLowerCase()))) {
      return true;
    }

    return false;
  }

  const notGarbage = sameDomain.filter(url => !isGarbageUrl(url));
  const garbageRemoved = sameDomain.length - notGarbage.length;

  console.log(`After garbage filter: ${notGarbage.length}`);
  if (garbageRemoved > 0) console.log(`  (removed ${garbageRemoved} garbage URLs)`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Deduplicate
  // ─────────────────────────────────────────────────────────────────────────

  const deduped = [];
  const seen = new Set();
  notGarbage.forEach(url => {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  });

  const duplicateCount = notGarbage.length - deduped.length;
  console.log(`After dedup: ${deduped.length}`);
  if (duplicateCount > 0) console.log(`  (removed ${duplicateCount} duplicates)`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Take first 30 candidates
  // ─────────────────────────────────────────────────────────────────────────

  const topUrls = deduped.slice(0, 30);
  console.log(`Final candidates: ${topUrls.length}`);
  console.log(`Opening: ${Math.min(30, topUrls.length)}`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Open each candidate and extract metadata
  // ─────────────────────────────────────────────────────────────────────────

  let metadataOk = 0;
  let titleOk = 0;
  const results = [];

  for (let i = 0; i < topUrls.length; i++) {
    const url = topUrls[i];
    const artPage = await browser.newPage();

    try {
      await artPage.goto(url, { waitUntil: 'load', timeout: 25_000 });
      await artPage.waitForTimeout(1500);

      metadataOk++;

      // Extract title (minimal extraction, no full metadata)
      const metadata = await artPage.evaluate(() => {
        const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
        const h1 = document.querySelector('h1')?.textContent?.trim();
        const docTitle = document.title;

        let title = og || h1 || docTitle || null;
        if (title) title = title.trim().slice(0, 100);

        return {
          title,
          titleSource: og ? 'og:title' : h1 ? 'h1' : 'document.title'
        };
      });

      if (metadata.title && metadata.title.length >= 20) {
        titleOk++;
        results.push({
          url,
          title: metadata.title,
          source: metadata.titleSource,
          status: '✓ ACCEPT'
        });
      } else {
        results.push({
          url,
          title: metadata.title || '(no title)',
          source: metadata.titleSource,
          status: `✗ REJECT (${metadata.title?.length || 0} chars)`
        });
      }
    } catch (e) {
      results.push({
        url,
        title: `(error: ${e.message.slice(0, 30)})`,
        source: 'ERROR',
        status: '✗ ERROR'
      });
    } finally {
      await artPage.close();
    }

    // Progress indicator
    if ((i + 1) % 5 === 0) {
      console.log(`  Progress: ${i + 1}/${topUrls.length}`);
    }
  }

  console.log();
  console.log(`${'═'.repeat(70)}`);
  console.log(`RESULTS`);
  console.log(`${'═'.repeat(70)}\n`);

  console.log(`Opened: ${topUrls.length}`);
  console.log(`Metadata OK: ${metadataOk}/${topUrls.length}`);
  console.log(`Title OK: ${titleOk}/${topUrls.length}\n`);

  // Show detailed results
  console.log(`Detailed breakdown:\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.status}`);
    console.log(`   URL: ${r.url.substring(0, 70)}`);
    console.log(`   Title: "${r.title.substring(0, 60)}..."`);
    console.log(`   Source: ${r.titleSource}\n`);
  });

  // Summary
  console.log(`${'═'.repeat(70)}`);
  if (titleOk === topUrls.length) {
    console.log(`✓ SUCCESS: All ${titleOk} articles validated`);
  } else if (titleOk > 0) {
    console.log(`⚠ PARTIAL: ${titleOk}/${topUrls.length} articles validated`);
  } else {
    console.log(`✗ FAILURE: 0/${topUrls.length} articles validated`);
  }
  console.log(`${'═'.repeat(70)}\n`);

  await browser.close();
} catch (e) {
  console.error(`❌ Fatal error: ${e.message}`);
  if (browser) await browser.close();
  process.exit(1);
}
