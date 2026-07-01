#!/usr/bin/env node

/**
 * TRACE TRANSACCIONAL: UNA ÚNICA URL
 *
 * Discovery → Score → Extract → Validate → Dedupe → INSERT → Commit
 *
 * Cada etapa loguea con traceId único
 * Se detiene en el primer ❌
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createHash } from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TRACE_ID = `TRACE-${Date.now()}-${Math.random().toString(36).substring(7)}`;

function log(stage, status, msg) {
  const symbol = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`[${TRACE_ID}] ${symbol} ${stage.padEnd(20)} | ${msg}`);
}

async function traceUrl() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE TRANSACCIONAL: UNA URL                                  ║`);
  console.log(`║  Objetivo: Encontrar DÓNDE desaparece                           ║`);
  console.log(`║  TraceID: ${TRACE_ID}`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // PASO 1: Obtener Diario Formosa
    log('SOURCE_LOOKUP', 'OK', 'Buscando Diario Formosa');

    const { rows } = await pool.query(`
      SELECT id, name, rss_url FROM rss_sources WHERE name = 'Diario Formosa'
    `);

    const source = rows[0];
    if (!source) {
      log('SOURCE_LOOKUP', 'FAIL', 'Diario Formosa no encontrado');
      return;
    }

    log('SOURCE_FOUND', 'OK', `ID: ${source.id}, RSS: ${source.rss_url}`);

    // PASO 2: Discovery manual — obtener UNA URL específica
    log('DISCOVERY_START', 'OK', `Conectando a ${source.rss_url}...`);

    let browser;
    let targetUrl = null;

    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();

      const homeUrl = new URL(source.rss_url).origin;
      log('HOME_URL', 'OK', homeUrl);

      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      log('HOMEPAGE_LOADED', 'OK', 'Page ready');

      // Descubrir URLs — TODAS, con score
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

          // Score (sin cambios)
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

          urls.push({ url: full, score });
        });

        // Ordenar por score y retornar top 5 con score >= 30
        return urls
          .filter(u => u.score >= 30)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      });

      console.log(`\n[Discovery] Found ${allUrls.length} candidate URLs:\n`);
      allUrls.forEach((u, i) => {
        console.log(`  ${i+1}. Score=${u.score.toString().padStart(3)}: ${u.url.substring(0, 70)}`);
      });

      if (allUrls.length === 0) {
        log('DISCOVERY_END', 'FAIL', 'No URLs with score >= 30');
        await page.close();
        await browser.close();
        return;
      }

      // Usar PRIMER URL CON DOMINIO DEL MEDIO (no Facebook)
      let targetUrl = null;
      const mediaUrl = new URL(source.rss_url).origin;

      for (const u of allUrls) {
        if (u.url.includes(mediaUrl.replace('https://', '').replace('http://', ''))) {
          targetUrl = u.url;
          break;
        }
      }

      // Si no hay URL del medio, usar primera
      if (!targetUrl) {
        targetUrl = allUrls[0].url;
        console.log(`\n⚠️  WARNING: Usando URL de dominio externo (no ${mediaUrl})\n`);
      }

      log('DISCOVERY_END', 'OK', `Found ${allUrls.length} candidate URLs`);

      // PASO 3: Extraer metadata
      log('EXTRACT_START', 'OK', 'Navigating to URL...');

      const metaPage = await browser.newPage();
      await metaPage.goto(targetUrl, { waitUntil: 'load', timeout: 25_000 });
      await metaPage.waitForTimeout(1500);

      log('PAGE_LOADED', 'OK', 'Page ready');

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
          title,
          wordCount: words,
          titleSource: og ? 'og' : h1 ? 'h1' : 'document',
          titleLength: title?.length || 0,
          hasContent: bodyText.length > 100,
          bodyLength: bodyText.length
        };
      });

      log('METADATA_EXTRACTED', 'OK', `Title: ${metadata.title?.substring(0, 50)}`);
      log('TITLE_SOURCE', 'OK', `${metadata.titleSource} (length=${metadata.titleLength})`);
      log('WORD_COUNT', 'OK', `${metadata.wordCount} words`);

      // PASO 4: Validar (sin modificar lógica)
      log('VALIDATE_START', 'OK', 'Running validateArticle()...');

      // Simular validateArticle() exactamente
      let skipReason = null;

      if (!metadata.title || metadata.title.length < 20) {
        skipReason = 'title_too_short';
      } else if (metadata.wordCount < 120) {
        skipReason = 'content_too_short';
      } else if (metadata.title === 'Article' || metadata.title === 'Leer más') {
        skipReason = 'generic_title';
      }

      if (skipReason) {
        log('VALIDATE_RESULT', 'FAIL', `Rejected: ${skipReason}`);
        await metaPage.close();
        await browser.close();
        return;
      }

      log('VALIDATE_RESULT', 'OK', 'Passed all checks');

      await metaPage.close();
      await browser.close();

      // PASO 5: Dedupe check
      log('DEDUPE_CHECK', 'OK', 'Checking if URL already exists...');

      const { rows: existing } = await pool.query(`
        SELECT id FROM monitored_articles WHERE url = $1
      `, [targetUrl]);

      if (existing.length > 0) {
        log('DEDUPE_RESULT', 'FAIL', `Already exists (ID: ${existing[0].id})`);
        return;
      }

      log('DEDUPE_RESULT', 'OK', 'URL is new');

      // PASO 6: INSERT
      log('INSERT_START', 'OK', 'Attempting INSERT...');

      const insertResult = await pool.query(`
        INSERT INTO monitored_articles (source_id, title, url, summary, hash)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (hash) DO NOTHING
        RETURNING id
      `, [
        source.id,
        metadata.title,
        targetUrl,
        metadata.title,
        createHash('sha256').update(targetUrl.trim().toLowerCase()).digest('hex')
      ]);

      if (insertResult.rows.length === 0) {
        log('INSERT_RESULT', 'FAIL', 'ON CONFLICT DO NOTHING triggered (duplicate hash)');
        return;
      }

      const articleId = insertResult.rows[0].id;
      log('INSERT_RESULT', 'OK', `Inserted: ID=${articleId}`);

      // PASO 7: Verificar en BD
      log('VERIFY_START', 'OK', 'Verifying insert in DB...');

      const { rows: verify } = await pool.query(`
        SELECT id, title, url, source_id FROM monitored_articles WHERE id = $1
      `, [articleId]);

      if (verify.length === 0) {
        log('VERIFY_RESULT', 'FAIL', 'URL not found in DB after insert!');
        return;
      }

      log('VERIFY_RESULT', 'OK', `Found in DB: ${verify[0].url.substring(0, 70)}`);
      log('SOURCE_ID_VERIFY', 'OK', `source_id=${verify[0].source_id}`);

      // PASO 8: Resumen
      console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
      console.log(`║  RESULTADO FINAL                                               ║`);
      console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
      console.log(`✅ URL TRACEADA EXITOSAMENTE`);
      console.log(`   URL: ${targetUrl}`);
      console.log(`   Article ID: ${articleId}`);
      console.log(`   Source ID: ${source.id}`);
      console.log(`   Title: ${metadata.title}`);
      console.log(`   Words: ${metadata.wordCount}\n`);

    } catch (e) {
      log('ERROR', 'FAIL', e.message);
      if (browser) await browser.close();
    }

  } catch (e) {
    log('FATAL', 'FAIL', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

traceUrl();
