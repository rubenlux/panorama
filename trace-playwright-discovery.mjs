#!/usr/bin/env node

/**
 * TRACE: discoverArticlesViaPlaywright() para Guau Formosa y Vía País
 *
 * Por cada URL descubierta:
 * - URL
 * - Score
 * - Motivo si descartada
 * - extractArticleMetadata() resultado
 * - validateArticle() resultado
 * - INSERT resultado
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createHash } from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Helper: extractTag (copiado de newsMonitor.js)
function extractTag(xml, tag) {
  const re = new RegExp(`<([\\w-]+\\:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/([\\w-]+\\:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[2].trim() : '';
}

async function tracePlaywrightDiscovery() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE: discoverArticlesViaPlaywright()                         ║`);
  console.log(`║  Medios: Guau Formosa, Vía País                                 ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  let browser;
  try {
    // Obtener Guau Formosa y Vía País
    const { rows: sources } = await pool.query(`
      SELECT id, name, rss_url FROM rss_sources
      WHERE name IN ('Guau Formosa', 'Vía País')
      ORDER BY name
    `);

    console.log(`[SOURCES] Encontrados: ${sources.length} medios\n`);

    for (const source of sources) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`MEDIO: ${source.name}`);
      console.log(`RSS URL: ${source.rss_url}`);
      console.log(`${'='.repeat(70)}\n`);

      const baseUrl = new URL(source.rss_url).origin;
      console.log(`[DISCOVERY] Conectando a ${baseUrl}\n`);

      if (!browser) {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      }

      const page = await browser.newPage();

      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

        // Descubrir URLs
        const urls = await page.evaluate(() => {
          const result = [];
          document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            let full;
            if (href.startsWith('http')) {
              full = href;
            } else {
              const path = href.startsWith('/') ? href : '/' + href;
              full = window.location.origin + path;
            }

            result.push(full);
          });
          return result;
        });

        console.log(`[STEP 1] Descubrimiento: ${urls.length} URLs encontradas\n`);

        // Scoring de URLs (scoreUrl logic)
        const scoredUrls = urls.map(url => {
          let score = 0;
          const slug = url.split('/').pop();

          if (slug && slug.length > 30) score += 50;
          if (slug && slug.length > 20) score += 30;
          if (/\/\d{4}\/\d{2}\/\d{2}/i.test(url)) score += 40;
          if ((slug?.match(/-/g) || []).length > 3) score += 30;
          if (/\d{4,}/.test(slug)) score += 20;
          if (!url.endsWith('/')) score += 15;

          if (/\/(rss|feed|sitemap|login|search|contacto|privacy|about|terms|autor|author|category|tag|page)\/?$/i.test(url)) score -= 100;
          if (/\?.*?(page|cat|author|tag|search)=/i.test(url)) score -= 80;

          score = Math.max(0, score);
          return { url, score };
        });

        // Filtrar por score >= 30
        const candidates = scoredUrls
          .filter(u => u.score >= 30)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);

        console.log(`[STEP 2] Scoring: ${candidates.length} URLs con score >= 30\n`);

        if (candidates.length === 0) {
          console.log(`❌ RESULTADO: 0 URLs candidatas (todas descartadas por score)\n`);
          await page.close();
          continue;
        }

        // Procesamiento de cada URL
        let processed = 0;
        let inserted = 0;
        let skipped = 0;

        for (const candidate of candidates) {
          processed++;
          console.log(`[URL ${processed}/${candidates.length}]`);
          console.log(`  URL:   ${candidate.url}`);
          console.log(`  Score: ${candidate.score}`);

          try {
            const metaPage = await browser.newPage();
            await metaPage.goto(candidate.url, { waitUntil: 'load', timeout: 25_000 });
            await metaPage.waitForTimeout(1500);

            // extractArticleMetadata()
            const metadata = await metaPage.evaluate(() => {
              let title = null;
              const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
              const h1 = document.querySelector('h1')?.textContent?.trim();
              const docTitle = document.title;

              if (og) title = og;
              else if (h1) title = h1;
              else if (docTitle) title = docTitle;

              const bodyText = document.body.innerText;
              const words = bodyText.split(/\s+/).filter(w => w.length > 0).length;

              return {
                title: title || null,
                wordCount: words,
                titleSource: og ? 'og:title' : h1 ? 'h1' : 'document.title'
              };
            });

            console.log(`  [EXTRACT]`);
            console.log(`    Title:    "${metadata.title?.substring(0, 50) || '(NULL)'}..."`);
            console.log(`    Words:    ${metadata.wordCount}`);
            console.log(`    Source:   ${metadata.titleSource}`);

            // validateArticle()
            let skipReason = null;

            if (!metadata.title || metadata.title.length < 20) {
              skipReason = `title_too_short (${metadata.title?.length || 0} chars)`;
            } else if (metadata.wordCount < 120) {
              skipReason = `content_too_short (${metadata.wordCount} words)`;
            } else if (['Article', 'Read more', 'Leer más', 'Untitled', 'Sin título'].includes(metadata.title)) {
              skipReason = 'generic_title';
            }

            console.log(`  [VALIDATE]`);
            if (skipReason) {
              console.log(`    ❌ RECHAZADO: ${skipReason}`);
              skipped++;
            } else {
              console.log(`    ✅ PASÓ validación`);

              // INSERT
              const hash = createHash('sha256').update(candidate.url.trim().toLowerCase()).digest('hex');
              const { rows: insertResult } = await pool.query(`
                INSERT INTO monitored_articles (source_id, title, url, summary, hash)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (hash) DO NOTHING
                RETURNING id
              `, [
                source.id,
                metadata.title,
                candidate.url,
                metadata.title,
                hash
              ]);

              console.log(`  [INSERT]`);
              if (insertResult.length > 0) {
                console.log(`    ✅ INSERTADO: id=${insertResult[0].id.substring(0, 8)}...`);
                inserted++;
              } else {
                console.log(`    ⚠️  DUPLICATE: URL ya existe`);
              }
            }

            await metaPage.close();

          } catch (e) {
            console.log(`  [ERROR] ${e.message.substring(0, 60)}`);
            skipped++;
          }

          console.log();
        }

        console.log(`[RESUMEN] ${source.name}:`);
        console.log(`  Procesadas: ${processed} URLs`);
        console.log(`  Insertadas: ${inserted}`);
        console.log(`  Descartadas: ${skipped}`);

      } catch (e) {
        console.log(`❌ ERROR en Playwright: ${e.message}`);
      } finally {
        await page.close();
      }
    }

    if (browser) await browser.close();

  } catch (e) {
    console.error(`❌ FATAL ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

tracePlaywrightDiscovery();
