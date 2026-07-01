#!/usr/bin/env node

/**
 * INVESTIGACIÓN V2: Usando home URL correcta
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
  console.log(`║  INVESTIGACIÓN V2: Usando RSS URL como base                   ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    const { rows } = await pool.query(`
      SELECT id, name, rss_url
      FROM rss_sources
      WHERE name = 'Diario Formosa'
    `);

    const source = rows[0];
    console.log(`Source: ${source.name}`);
    console.log(`RSS URL: ${source.rss_url}`);

    // Extract homepage from RSS URL
    const rssUrl = new URL(source.rss_url);
    const homeUrl = rssUrl.origin; // Just protocol + hostname

    console.log(`Derived Home URL: ${homeUrl}`);
    console.log(`\n=== Attempting Playwright Discovery ===\n`);

    let browser;
    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();

      console.log(`Navigating to ${homeUrl}...`);
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(500);

      console.log(`✅ Page loaded\n`);

      // Discover URLs
      const urlData = await page.evaluate(() => {
        const urls = new Set();
        const links = document.querySelectorAll('a[href]');

        links.forEach((link) => {
          const href = link.getAttribute('href');
          if (!href) return;

          let full;
          if (href.startsWith('http')) {
            full = href;
          } else {
            const path = href.startsWith('/') ? href : '/' + href;
            full = window.location.origin + path;
          }

          // Score
          let score = 0;
          const slug = full.split('/').pop();

          if (slug && slug.length > 30) score += 50;
          if (slug && slug.length > 20) score += 30;
          if (/\/\d{4}\/\d{2}\/\d{2}/i.test(full)) score += 40;
          if ((slug?.match(/-/g) || []).length > 3) score += 30;
          if (/\d{4,}/.test(slug)) score += 20;
          if (!full.endsWith('/')) score += 15;

          if (/\/(rss|feed|sitemap|login|search|contacto|privacy|about|terms|autor|author|category|tag|page)\/?$/i.test(full)) score -= 100;
          if (/\?.*?(page|cat|author|tag|search)=/i.test(full)) score -= 80;

          score = Math.max(0, score);
          if (score >= 30) urls.add(full);
        });

        return {
          allLinks: links.length,
          scoredUrls: Array.from(urls).slice(0, 20)
        };
      });

      console.log(`Found ${urlData.allLinks} links, ${urlData.scoredUrls.length} candidates\n`);

      if (urlData.scoredUrls.length === 0) {
        console.log(`❌ STOP: No candidate URLs found`);
        await page.close();
        await browser.close();
        return;
      }

      console.log(`Sample URLs to extract:`);
      urlData.scoredUrls.slice(0, 5).forEach(url => {
        console.log(`  - ${url.substring(0, 80)}`);
      });
      console.log(`\n=== Extracting Metadata ===\n`);

      let passed = 0;
      let failed = 0;
      let reasons = {};

      for (const url of urlData.scoredUrls) {
        try {
          const metaPage = await browser.newPage();
          await metaPage.goto(url, { waitUntil: 'load', timeout: 25_000 });
          await metaPage.waitForTimeout(1500);

          const metadata = await metaPage.evaluate(() => {
            let title = null;
            const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            const h1 = document.querySelector('h1')?.textContent?.trim();
            const docTitle = document.title;

            if (og) title = og;
            else if (h1) title = h1;
            else if (docTitle) title = docTitle;

            const words = document.body.innerText.split(/\s+/).length;
            return { title, words, bodyLength: document.body.innerText.length };
          });

          let status = 'OK';
          if (!metadata.title || metadata.title.length < 20) {
            status = 'FAIL: title_too_short';
            reasons['title_too_short'] = (reasons['title_too_short'] || 0) + 1;
            failed++;
          } else if (metadata.words < 120) {
            status = 'FAIL: content_too_short';
            reasons['content_too_short'] = (reasons['content_too_short'] || 0) + 1;
            failed++;
          } else {
            reasons['passed'] = (reasons['passed'] || 0) + 1;
            passed++;
          }

          const titlePreview = metadata.title ? metadata.title.substring(0, 50) : '(no title)';
          console.log(`${status}: "${titlePreview}" (${metadata.words} words)`);

          await metaPage.close();
        } catch (e) {
          console.log(`ERROR: ${e.message.substring(0, 50)}`);
          reasons['extraction_error'] = (reasons['extraction_error'] || 0) + 1;
          failed++;
        }
      }

      console.log(`\n=== RESULT ===`);
      console.log(`Passed: ${passed}`);
      console.log(`Failed: ${failed}`);
      console.log(`Reasons:`, reasons);

      if (passed === 0) {
        console.log(`\n❌ DIAGNOSIS: All URLs rejected by validateArticle()`);
        console.log(`   This explains why Diario Formosa has 0 articles`);
      } else {
        console.log(`\n✅ DIAGNOSIS: Should discover ${passed} articles`);
        console.log(`   If DB shows 0, there's a bug in insertion logic`);
      }

      await page.close();
    } catch (e) {
      console.error(`❌ Playwright: ${e.message}`);
    } finally {
      if (browser) await browser.close();
    }

  } catch (e) {
    console.error(`❌ ERROR: ${e.message}`);
  } finally {
    await pool.end();
  }
}

investigate();
