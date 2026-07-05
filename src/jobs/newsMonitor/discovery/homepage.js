/**
 * Playwright-based homepage discovery for articles
 * Scrapes links from media homepages and extracts article metadata
 */

import pLimit from 'p-limit';
import {
  isBlockedByChallenge,
  isGarbageUrl,
  belongsToMedia,
  extractArticleMetadata,
  validateArticle,
} from '../extraction/index.js';

const DISCOVERY_LIMIT = 30; // How many URLs to open per homepage

/**
 * Discover article URLs from a media homepage
 * @param {Page} page - Playwright page object
 * @param {string} homeUrl - Homepage URL to scrape
 * @returns {Promise<Array>} Candidate URLs
 */
async function discoverArticleUrlsFromHomepage(page, homeUrl) {

  try {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.warn(`[Discovery] Navigation failed: ${e.message}`);
    return [];
  }

  // Check for Cloudflare or other blocking challenges
  const pageTitle = await page.title();
  const pageContent = await page.content();

  if (isBlockedByChallenge(pageTitle, pageContent)) {
    console.log(`[Discovery] BLOCKED_BY_CLOUDFLARE | source_url=${homeUrl} | title="${pageTitle}"`);
    return [];
  }

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

      // Clean: remove query params and fragments
      full = full.split('?')[0].split('#')[0];

      // Must be same domain
      if (full.startsWith(window.location.origin) && full.length > 10) {
        urls.add(full);
      }
    });

    return Array.from(urls);
  });

  // Extract media hostname from homeUrl for domain verification
  let mediaHostname = '';
  try {
    const urlObj = new URL(homeUrl);
    mediaHostname = urlObj.hostname;
  } catch (e) {
    console.warn(`[Discovery] Could not parse homeUrl: ${e.message}`);
  }

  // Step 1: Filter by domain (must belong to media)
  const sameDomain = allUrls.filter(url => {
    try {
      const urlObj = new URL(url);
      return belongsToMedia(urlObj.hostname, mediaHostname);
    } catch {
      return false;
    }
  });

  // Step 2: Filter by garbage (reject obvious non-articles)
  const notGarbage = sameDomain.filter(url => !isGarbageUrl(url));

  // Step 3: Remove duplicates (keep first occurrence in DOM order)
  const deduped = [];
  const seen = new Set();
  notGarbage.forEach(url => {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  });

  // Step 4: Take first DISCOVERY_LIMIT candidates
  const topUrls = deduped.slice(0, DISCOVERY_LIMIT);

  // Log discovery summary with detailed breakdown
  const externalCount = allUrls.length - sameDomain.length;
  const garbageFiltered = sameDomain.length - notGarbage.length;
  const duplicateCount = notGarbage.length - deduped.length;

  console.log(`\n[Discovery] Summary`);
  console.log(`[Discovery]   Found links ............ ${allUrls.length}`);
  console.log(`[Discovery]   Same domain ........... ${sameDomain.length}`);
  if (externalCount > 0) console.log(`[Discovery]   External domain ....... ${externalCount}`);
  console.log(`[Discovery]   After garbage filter .. ${notGarbage.length}`);
  if (garbageFiltered > 0) console.log(`[Discovery]   Garbage removed ....... ${garbageFiltered}`);
  console.log(`[Discovery]   After dedup ........... ${deduped.length}`);
  if (duplicateCount > 0) console.log(`[Discovery]   Duplicates removed .... ${duplicateCount}`);
  console.log(`[Discovery]   Final candidates ..... ${topUrls.length}`);
  console.log(`[Discovery]   Opening .............. ${Math.min(DISCOVERY_LIMIT, topUrls.length)}`);

  return topUrls;
}

/**
 * Extract article metadata from URLs with concurrency limit
 * @param {Browser} browser - Playwright browser object
 * @param {Array<string>} urls - URLs to extract
 * @param {number} workerCount - Concurrency limit
 * @returns {Promise<Array>} Extracted articles
 */
async function extractArticlesWithConcurrency(browser, urls, workerCount) {

  const articles = [];
  let metadataOk = 0;
  const rejectStats = {
    title_too_short: 0,
    content_too_short: 0,
    generic_title: 0,
    url_is_homepage: 0,
    canonical_is_homepage: 0,
    no_published_date: 0,
    og_type_invalid: 0,
    jsonld_invalid: 0,
    no_url: 0,
    extraction_failed: 0
  };

  const limit = pLimit(workerCount);
  const promises = urls.map(url =>
    limit(async () => {
      const page = await browser.newPage();
      try {
        const metadata = await extractArticleMetadata(page, url);

        if (metadata) {
          metadataOk++;

          // Map extractor output to article fields (title = cleanTitle)
          const article = {
            ...metadata,
            url,
            title: metadata.cleanTitle || metadata.rawTitle,
          };

          if (validateArticle(article)) {
            articles.push({
              title: metadata.title,
              link: url,
              description: metadata.description || '',
              pubDate: metadata.publishedAt || new Date().toISOString(),
              guid: url
            });
          } else if (article._skipReason) {
            const reason = article._skipReason.split(':')[0];
            if (rejectStats.hasOwnProperty(reason)) {
              rejectStats[reason]++;
            }
          }
        } else {
          rejectStats.extraction_failed++;
        }
      } catch (e) {
        rejectStats.extraction_failed++;
      } finally {
        await page.close();
      }
    })
  );

  await Promise.all(promises);

  // Log extraction summary
  console.log(`\n[Extraction] Summary`);
  console.log(`[Extraction]   Opened ............... ${urls.length}`);
  console.log(`[Extraction]   Metadata OK ......... ${metadataOk}`);
  console.log(`[Extraction]   Validate OK ......... ${articles.length}`);

  // Log rejections
  let totalRejected = 0;
  Object.values(rejectStats).forEach(count => totalRejected += count);

  if (totalRejected > 0) {
    console.log(`[Extraction]   Rejected breakdown:`);
    Object.entries(rejectStats).forEach(([reason, count]) => {
      if (count > 0) {
        console.log(`[Extraction]     - ${reason}: ${count}`);
      }
    });
  }

  console.log(`[Extraction]   Accepted ............ ${articles.length}`);

  return articles;
}

/**
 * Discover articles via Playwright for a source
 * Uses homepage scraping when RSS/Sitemaps fail
 * @param {Object} source - Source record from DB
 * @returns {Promise<Array>} Discovered articles
 */
async function discoverArticlesViaPlaywright(source) {
  console.log(`[Playwright Discovery] Starting for: ${source.name}`);
  const isTraceSource = source.name === 'Guau Formosa';

  let browser;
  const { browserPool } = await import('../playwright/BrowserPool.js');
  try {
    browser = await browserPool.acquire();
    const page = await browser.newPage();

    // Determine homepage URL
    let homeUrl = source.home_url || source.rss_url?.replace(/\/rss.*/, '').replace(/\/feed.*/, '');
    if (!homeUrl || !homeUrl.startsWith('http')) {
      homeUrl = `https://${source.name.split(/\s+/)[0].toLowerCase()}.com`;
    }

    // STEP 1: Discover URLs from homepage
    console.log(`[Playwright Discovery] Discovering URLs from ${homeUrl}`);
    const topUrls = await discoverArticleUrlsFromHomepage(page, homeUrl);
    console.log(`[Playwright Discovery] Found ${topUrls.length} candidate URLs from ${source.name}`);

    if (isTraceSource) {
      console.log(`\n[TRACE] URLs descubiertas (${topUrls.length}):`);
      topUrls.slice(0, 25).forEach((url, i) => {
        console.log(`  ${i+1}. ${url}`);
      });
      if (topUrls.length > 25) console.log(`  ... y ${topUrls.length - 25} más`);
    }

    if (topUrls.length === 0) {
      return [];
    }

    // STEP 2: Extract metadata from top URLs with concurrency
    console.log(`[Playwright Discovery] Extracting metadata from ${topUrls.length} URLs`);
    const articles = await extractArticlesWithConcurrency(browser, topUrls.slice(0, 20), 5);
    console.log(`[Playwright Discovery] Extracted ${articles.length} valid articles from ${source.name}`);

    if (isTraceSource) {
      console.log(`\n[TRACE] Artículos aceptados (${articles.length}):`);
      articles.forEach((art, i) => {
        console.log(`  ${i+1}. "${art.title.substring(0, 50)}..." (${art.pubDate})`);
      });
    }

    return articles;
  } catch (err) {
    console.error(`[Playwright Discovery] Error for ${source.name}: ${err.message}`);
    return [];
  } finally {
    if (browser) browserPool.release(browser);
  }
}

export {
  DISCOVERY_LIMIT,
  discoverArticleUrlsFromHomepage,
  extractArticlesWithConcurrency,
  discoverArticlesViaPlaywright,
};
