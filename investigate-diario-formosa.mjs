#!/usr/bin/env node

/**
 * INVESTIGACIÓN PROFUNDA: DIARIO FORMOSA
 *
 * Ejecuta el pipeline de Playwright Discovery manualmente
 * para ver EXACTAMENTE por qué descubre 0 artículos.
 *
 * NO modifica código, solo recolecta observabilidad.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function investigate() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  INVESTIGACIÓN PROFUNDA: DIARIO FORMOSA                        ║`);
  console.log(`║  Propósito: Entender por qué descubre 0 artículos              ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // PASO 1: Obtener source
    const { rows } = await pool.query(`
      SELECT id, name, rss_url, sitemap_url, home_url, last_format_detected
      FROM rss_sources
      WHERE name = 'Diario Formosa'
    `);

    const source = rows[0];
    if (!source) {
      console.log('❌ Diario Formosa not found');
      return;
    }

    console.log(`\n=== STEP 1: Source Config ===`);
    console.log(`Name: ${source.name}`);
    console.log(`RSS URL: ${source.rss_url}`);
    console.log(`Sitemap: ${source.sitemap_url || 'N/A'}`);
    console.log(`Home: ${source.home_url || 'N/A'}`);
    console.log(`Last format detected: ${source.last_format_detected}`);

    // PASO 2: Probar RSS
    console.log(`\n=== STEP 2: Try RSS ===`);
    let xml = null;
    try {
      const res = await fetch(source.rss_url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        console.log(`HTTP ${res.status}, Content-Type: ${ct}`);
        if (ct.includes('html')) {
          console.log('⚠️  RSS URL returns HTML, not XML');
          xml = null;
        } else {
          xml = await res.text();
          const itemCount = (xml.match(/<item>/g) || []).length;
          console.log(`✅ Got XML with ${itemCount} items`);
        }
      } else {
        console.log(`❌ HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`❌ Fetch error: ${e.message}`);
    }

    if (!xml || xml.length === 0) {
      console.log(`⚠️  RSS failed → should use Playwright Discovery`);
    }

    // PASO 3: Playwright Discovery
    console.log(`\n=== STEP 3: Playwright Discovery ===`);

    let homeUrl = source.home_url;
    if (!homeUrl || !homeUrl.startsWith('http')) {
      homeUrl = `https://${source.name.split(/\s+/)[0].toLowerCase()}.com`;
    }
    console.log(`Home URL: ${homeUrl}`);

    let browser;
    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();

      // PASO 3a: Discover URLs
      console.log(`\nStage 3a: Discovering URLs from homepage...`);
      try {
        await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`❌ Navigation failed: ${e.message}`);
        await page.close();
        await browser.close();
        return;
      }

      const urlData = await page.evaluate(() => {
        const urls = new Set();
        const links = document.querySelectorAll('a[href]');
        console.log(`[page.evaluate] Found ${links.length} links`);

        links.forEach((link, idx) => {
          const href = link.getAttribute('href');
          if (!href) return;

          let full;
          if (href.startsWith('http')) {
            full = href;
          } else {
            const path = href.startsWith('/') ? href : '/' + href;
            full = window.location.origin + path;
          }

          // Score based on discovery.js scoreUrl logic
          let score = 0;
          const slug = full.split('/').pop();

          // Positive patterns
          if (slug && slug.length > 30) score += 50;
          if (slug && slug.length > 20) score += 30;
          if (/\/\d{4}\/\d{2}\/\d{2}/i.test(full)) score += 40;
          if ((slug?.match(/-/g) || []).length > 3) score += 30;
          if (/\d{4,}/.test(slug)) score += 20;
          if (!full.endsWith('/')) score += 15;

          // Negative patterns
          if (/\/(rss|feed|sitemap|login|search|contacto|privacy|about|terms|autor|author|category|tag|page)\/?$/i.test(full)) score -= 100;
          if (/\?.*?(page|cat|author|tag|search)=/i.test(full)) score -= 80;

          score = Math.max(0, score);
          if (score >= 30) {
            urls.add(full);
          }
        });

        return {
          allLinks: links.length,
          scoredUrls: Array.from(urls),
          homeUrl: window.location.href
        };
      });

      console.log(`[RESULT] Found ${urlData.allLinks} links on page`);
      console.log(`[RESULT] After scoring: ${urlData.scoredUrls.length} candidate URLs\n`);

      if (urlData.scoredUrls.length === 0) {
        console.log(`❌ CRITICAL: Playwright found 0 URLs to extract`);
        console.log(`   This explains 0 articles — no URLs to validate`);
        await page.close();
        await browser.close();
        return;
      }

      // PASO 3b: Extract metadata from top URLs
      console.log(`Stage 3b: Extracting metadata from top ${Math.min(20, urlData.scoredUrls.length)} URLs...`);

      const urlsToExtract = urlData.scoredUrls.slice(0, 20);
      let extracted = 0;
      let skipped = 0;
      let skipReasons = {};

      for (const url of urlsToExtract) {
        try {
          const metaPage = await browser.newPage();
          await metaPage.goto(url, { waitUntil: 'load', timeout: 25_000 });
          await metaPage.waitForTimeout(1500);

          const metadata = await metaPage.evaluate((urlParam) => {
            let title = null;
            const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            const h1 = document.querySelector('h1')?.textContent?.trim();
            const doc = document.title;

            if (og) title = og;
            else if (h1) title = h1;
            else if (doc) title = doc;

            const wordCount = document.body.innerText.split(/\s+/).length;

            return {
              title,
              wordCount,
              hasContent: document.body.innerText.length > 100
            };
          }, url);

          // Check validation
          let skip = null;
          if (!metadata.title || metadata.title.length < 20) {
            skip = 'title_too_short';
          } else if (metadata.wordCount < 120) {
            skip = 'content_too_short';
          }

          if (skip) {
            skipped++;
            skipReasons[skip] = (skipReasons[skip] || 0) + 1;
            console.log(`  ⏭️  SKIP: ${skip} | ${url.substring(0, 70)}`);
          } else {
            extracted++;
            console.log(`  ✅ VALID: ${metadata.title?.substring(0, 50)}`);
          }

          await metaPage.close();
        } catch (e) {
          skipped++;
          skipReasons['extraction_error'] = (skipReasons['extraction_error'] || 0) + 1;
          console.log(`  ❌ ERROR: ${e.message.substring(0, 50)} | ${url.substring(0, 50)}`);
        }
      }

      console.log(`\n=== STEP 3b RESULT ===`);
      console.log(`Extracted: ${extracted} valid articles`);
      console.log(`Skipped: ${skipped} articles`);
      console.log(`Skip reasons:`, skipReasons);

      if (extracted === 0) {
        console.log(`\n❌ DIAGNOSIS: Playwright found ${urlData.scoredUrls.length} URLs but validateArticle() rejected ALL`);
        console.log(`   Root cause: ${Object.entries(skipReasons).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }

      await page.close();
    } catch (e) {
      console.error(`❌ Playwright error: ${e.message}`);
    } finally {
      if (browser) await browser.close();
    }

  } catch (e) {
    console.error(`❌ ERROR: ${e.message}`);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

investigate();
