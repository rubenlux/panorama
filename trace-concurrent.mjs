#!/usr/bin/env node

/**
 * TRACE CON CONCURRENCIA
 *
 * Simula EXACTAMENTE lo que hace extractArticlesWithConcurrency()
 * con 5 workers en paralelo
 *
 * Busca race conditions que causen pérdida de artículos
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createHash } from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TRACE_ID = `CONCURRENT-${Date.now()}-${Math.random().toString(36).substring(7)}`;

function log(msg, level = 'INFO') {
  const symbol = level === 'OK' ? '✅' : level === 'FAIL' ? '❌' : '⏳';
  console.log(`[${TRACE_ID}] ${symbol} ${msg}`);
}

async function traceWithConcurrency() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE CON CONCURRENCIA (5 workers)                            ║`);
  console.log(`║  Objetivo: Simular extractArticlesWithConcurrency()             ║`);
  console.log(`║  TraceID: ${TRACE_ID}`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    log('Obteniendo Diario Formosa');

    const { rows } = await pool.query(`
      SELECT id, name, rss_url FROM rss_sources WHERE name = 'Diario Formosa'
    `);

    const source = rows[0];
    log(`Source found: ${source.name}`);

    // PASO 1: Discovery (una sola vez, secuencial)
    log('Iniciando Discovery...');

    let browser;
    let urlsToExtract = [];

    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();

      const homeUrl = new URL(source.rss_url).origin;
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(500);

      log(`Discovery en ${homeUrl}`);

      const allUrls = await page.evaluate(() => {
        const urls = [];
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
          if (score >= 30) urls.push(full);
        });

        return urls;
      });

      // Filtrar para solo del medio
      urlsToExtract = allUrls
        .filter(u => u.includes('diarioformosa.net') && !u.includes('facebook.com'))
        .slice(0, 20);

      log(`Discovery encontró ${urlsToExtract.length} URLs del medio (de ${allUrls.length} totales)`);

      if (urlsToExtract.length === 0) {
        log(`ERROR: No hay URLs del medio, solo redes sociales`, 'FAIL');
        await page.close();
        await browser.close();
        return;
      }

      await page.close();

      // PASO 2: Extraction CON CONCURRENCIA (5 workers)
      log(`Extrayendo ${urlsToExtract.length} URLs con 5 workers...`);

      const articles = [];
      const queue = [...urlsToExtract];
      const workers = [];
      let extractedCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      const worker = async (workerId) => {
        log(`Worker ${workerId} iniciado`);

        while (queue.length > 0) {
          const url = queue.shift();
          if (!url) break;

          const page = await browser.newPage();
          try {
            await page.goto(url, { waitUntil: 'load', timeout: 25_000 });
            await page.waitForTimeout(1500);

            const metadata = await page.evaluate(() => {
              let title = null;
              const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
              const h1 = document.querySelector('h1')?.textContent?.trim();
              const docTitle = document.title;

              if (og) title = og;
              else if (h1) title = h1;
              else if (docTitle) title = docTitle;

              const words = document.body.innerText.split(/\s+/).filter(w => w.length > 0).length;
              return { title, wordCount: words };
            });

            // Validar
            let skip = false;
            if (!metadata.title || metadata.title.length < 20) {
              skip = true;
              skipCount++;
            } else if (metadata.wordCount < 120) {
              skip = true;
              skipCount++;
            }

            if (!skip) {
              articles.push({
                title: metadata.title,
                link: url,
                description: metadata.title,
                pubDate: new Date().toISOString(),
                guid: url,
                wordCount: metadata.wordCount
              });
              extractedCount++;
              log(`Worker ${workerId}: ✅ ${metadata.title.substring(0, 40)}`);
            } else {
              log(`Worker ${workerId}: ⏭️  SKIP (${metadata.wordCount} words)`);
            }
          } catch (e) {
            errorCount++;
            log(`Worker ${workerId}: ❌ ERROR ${e.message.substring(0, 40)}`);
          } finally {
            await page.close();
          }
        }

        log(`Worker ${workerId} terminado`);
      };

      // Lanzar 5 workers
      for (let i = 0; i < 5; i++) {
        workers.push(worker(i));
      }

      await Promise.all(workers);

      log(`Extracción completada`);
      log(`Resultados: ${extractedCount} válidos, ${skipCount} skipped, ${errorCount} errores`);

      // PASO 3: Insertar
      log(`Insertando ${articles.length} artículos...`);

      for (const article of articles) {
        const result = await pool.query(`
          INSERT INTO monitored_articles (source_id, title, url, summary, hash)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (hash) DO NOTHING
          RETURNING id
        `, [
          source.id,
          article.title,
          article.link,
          article.description,
          createHash('sha256').update(article.link.trim().toLowerCase()).digest('hex')
        ]);

        if (result.rows.length > 0) {
          log(`INSERT: ${article.link.substring(0, 60)}`);
        }
      }

      log(`Inserción completada`, 'OK');

      // PASO 4: Verificar
      log(`Verificando en BD...`);

      const { rows: verify } = await pool.query(`
        SELECT COUNT(*) as count FROM monitored_articles WHERE source_id = $1
      `, [source.id]);

      log(`Total artículos para ${source.name}: ${verify[0].count}`, verify[0].count > 0 ? 'OK' : 'FAIL');

      await browser.close();

    } catch (e) {
      log(`ERROR: ${e.message}`, 'FAIL');
      if (browser) await browser.close();
      console.error(e.stack);
    }

  } catch (e) {
    log(`FATAL: ${e.message}`, 'FAIL');
  } finally {
    await pool.end();
  }
}

traceWithConcurrency();
