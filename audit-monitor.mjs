#!/usr/bin/env node

/**
 * AUDITORÍA TÉCNICA DEL MONITOR DE MEDIOS
 *
 * Script read-only que recopila datos del flujo completo:
 * Source → Discovery → Extraction → Validation → DB
 *
 * NO modifica código, solo recopila evidencia.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const report = [];

function log(msg) {
  console.log(msg);
  report.push(msg);
}

async function audit() {
  log('\n╔════════════════════════════════════════════════════════════════╗');
  log('║  AUDITORÍA TÉCNICA: MONITOR DE MEDIOS                          ║');
  log('║  Objetivo: Encontrar por qué algunos medios funcionan/no       ║');
  log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. SOURCES CONFIGURADAS
    log('\n=== PARTE 1: SOURCES CONFIGURADAS ===\n');
    const { rows: sources } = await pool.query(`
      SELECT id, name, enabled, rss_url, sitemap_url, home_url,
             last_checked, last_format_detected, check_interval
      FROM rss_sources
      ORDER BY name
    `);

    log(`Total de fuentes: ${sources.length}`);
    log(`Habilitadas: ${sources.filter(s => s.enabled).length}\n`);

    const sourceMap = new Map();
    for (const source of sources) {
      sourceMap.set(source.id, source);
      const status = source.enabled ? '✅' : '❌';
      log(`${status} ${source.name} (ID: ${source.id})`);
      log(`   RSS: ${source.rss_url ? '✓' : '✗'}`);
      log(`   Sitemap: ${source.sitemap_url ? '✓' : '✗'}`);
      log(`   Home: ${source.home_url ? '✓' : '✗'}`);
      log(`   Last checked: ${source.last_checked ? new Date(source.last_checked).toISOString() : 'NUNCA'}`);
      log(`   Last format: ${source.last_format_detected || 'DESCONOCIDO'}`);
      log(`   Interval: ${source.check_interval}s\n`);
    }

    // 2. ARTÍCULOS DESCUBIERTOS
    log('\n=== PARTE 2: ARTÍCULOS DESCUBIERTOS (ÚLTIMOS 7 DÍAS) ===\n');
    const { rows: articles } = await pool.query(`
      SELECT
        ma.source_id,
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE extraction_method IS NULL) as pending_extraction,
        COUNT(*) FILTER (WHERE extraction_method = 'fetch') as fetched,
        COUNT(*) FILTER (WHERE extraction_method = 'playwright') as playwright_fetched,
        COUNT(*) FILTER (WHERE extraction_method = 'paywall') as paywalled,
        COUNT(*) FILTER (WHERE extraction_method = 'rss_only') as rss_only,
        MAX(detected_at) as last_article
      FROM monitored_articles ma
      WHERE ma.detected_at > now() - interval '7 days'
      GROUP BY ma.source_id
      ORDER BY total_articles DESC
    `);

    log(`Total artículos (últimos 7 días): ${articles.reduce((a,b) => a + b.total_articles, 0)}\n`);

    for (const row of articles) {
      const source = sourceMap.get(row.source_id);
      if (!source) continue;

      log(`📰 ${source.name}`);
      log(`   Total: ${row.total_articles}`);
      log(`   Pendientes: ${row.pending_extraction}`);
      log(`   Fetch (HTTP): ${row.fetched}`);
      log(`   Playwright: ${row.playwright_fetched}`);
      log(`   Paywall: ${row.paywalled}`);
      log(`   RSS only: ${row.rss_only}`);
      log(`   Última: ${row.last_article ? new Date(row.last_article).toISOString() : 'N/A'}\n`);
    }

    // 3. PROBLEMAS DE VALIDACIÓN
    log('\n=== PARTE 3: ANÁLISIS DE VALIDACIÓN ===\n');
    const { rows: stats } = await pool.query(`
      SELECT
        source_id::text,
        COUNT(*) as total,
        AVG(content_words)::int as avg_words,
        MIN(content_words) as min_words,
        MAX(content_words) as max_words,
        SUM(CASE WHEN content_words < 120 THEN 1 ELSE 0 END) as below_threshold
      FROM monitored_articles
      WHERE detected_at > now() - interval '7 days'
      GROUP BY source_id
      ORDER BY total DESC
    `);

    for (const row of stats) {
      if (row.source_id === 0) continue;
      const source = sourceMap.get(row.source_id);
      if (!source) continue;

      const pct = row.below_threshold > 0 ? Math.round((row.below_threshold / row.total) * 100) : 0;
      log(`📊 ${source.name}`);
      log(`   Total: ${row.total}`);
      log(`   Avg words: ${row.avg_words} (min: ${row.min_words}, max: ${row.max_words})`);
      log(`   < 120 words: ${row.below_threshold} (${pct}%)\n`);
    }

    // 4. FALLBACK ANÁLISIS: HTTP vs Playwright
    log('\n=== PARTE 4: ANÁLISIS HTTP → PLAYWRIGHT FALLBACK ===\n');
    const { rows: fallback } = await pool.query(`
      SELECT
        source_id,
        extraction_method,
        COUNT(*) as count,
        AVG(content_words)::int as avg_words
      FROM monitored_articles
      WHERE detected_at > now() - interval '7 days'
      GROUP BY source_id, extraction_method
      ORDER BY source_id,
        CASE extraction_method
          WHEN 'fetch' THEN 1
          WHEN 'playwright' THEN 2
          WHEN 'paywall' THEN 3
          WHEN 'rss_only' THEN 4
          ELSE 5 END
    `);

    const bySource = new Map();
    for (const row of fallback) {
      if (!bySource.has(row.source_id)) bySource.set(row.source_id, []);
      bySource.get(row.source_id).push(row);
    }

    for (const [sourceId, methods] of bySource) {
      const source = sourceMap.get(sourceId);
      if (!source) continue;

      log(`${source.name}:`);
      let total = 0;
      for (const m of methods) {
        total += m.count;
        const pct = methods.reduce((a,b) => a + b.count, 0) > 0
          ? Math.round((m.count / methods.reduce((a,b) => a + b.count, 0)) * 100)
          : 0;
        log(`   ${m.extraction_method || 'null'}: ${m.count} (${pct}%) - promedio: ${m.avg_words} words`);
      }
      log('');
    }

    // 5. CATEGORIZACIÓN DE MEDIOS
    log('\n=== PARTE 5: CATEGORIZACIÓN DE MEDIOS ===\n');
    log('Categoría 1: FUNCIONA (RSS/Sitemap activo, 50+ artículos)');
    log('Categoría 2: PARCIAL (RSS funciona, <50 artículos)');
    log('Categoría 3: FALLBACK (RSS falla, Playwright descubre)');
    log('Categoría 4: ROTO (No descubre, 0 artículos)\n');

    const categories = {
      funciona: [],
      parcial: [],
      fallback: [],
      roto: []
    };

    for (const source of sources) {
      if (!source.enabled) continue;

      const sourceArticles = articles.find(a => a.source_id === source.id);
      const count = sourceArticles?.total_articles || 0;
      const format = source.last_format_detected || 'unknown';

      if (format !== 'playwright-discovery' && count >= 50) {
        categories.funciona.push(source);
      } else if (format !== 'playwright-discovery' && count > 0 && count < 50) {
        categories.parcial.push(source);
      } else if (format === 'playwright-discovery' && count > 0) {
        categories.fallback.push(source);
      } else {
        categories.roto.push(source);
      }
    }

    log(`FUNCIONA (${categories.funciona.length}):`);
    for (const s of categories.funciona) {
      const count = articles.find(a => a.source_id === s.id)?.total_articles || 0;
      log(`  ✅ ${s.name} (${count} artículos, ${s.last_format_detected})`);
    }
    log('');

    log(`PARCIAL (${categories.parcial.length}):`);
    for (const s of categories.parcial) {
      const count = articles.find(a => a.source_id === s.id)?.total_articles || 0;
      log(`  ⚠️  ${s.name} (${count} artículos, ${s.last_format_detected})`);
    }
    log('');

    log(`FALLBACK - Playwright activo (${categories.fallback.length}):`);
    for (const s of categories.fallback) {
      const count = articles.find(a => a.source_id === s.id)?.total_articles || 0;
      log(`  🔄 ${s.name} (${count} artículos, Playwright Discovery)`);
    }
    log('');

    log(`ROTO - No descubre (${categories.roto.length}):`);
    for (const s of categories.roto) {
      log(`  ❌ ${s.name} (0 artículos)`);
    }
    log('');

    // 6. WORKER HEALTH
    log('\n=== PARTE 6: HEALTH DEL WORKER ===\n');
    const { rows: runs } = await pool.query(`
      SELECT
        worker_name,
        status,
        COUNT(*) as runs,
        MAX(started_at) as last_run,
        AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::int as avg_duration_s
      FROM worker_runs
      WHERE started_at > now() - interval '24 hours'
      GROUP BY worker_name, status
      ORDER BY worker_name,
        CASE status WHEN 'success' THEN 1 WHEN 'error' THEN 2 WHEN 'skipped' THEN 3 ELSE 4 END
    `);

    for (const run of runs) {
      const icon = run.status === 'success' ? '✅' : run.status === 'error' ? '❌' : '⏭️';
      log(`${icon} ${run.worker_name} (${run.status}): ${run.runs} runs`);
      log(`   Last: ${new Date(run.last_run).toISOString()}`);
      log(`   Avg duration: ${run.avg_duration_s}s\n`);
    }

  } catch (e) {
    log(`\n❌ ERROR: ${e.message}`);
    log(e.stack);
  } finally {
    await pool.end();
  }

  // SAVE REPORT
  const filename = `audit-${new Date().toISOString().split('T')[0]}.log`;
  fs.writeFileSync(filename, report.join('\n'));
  console.log(`\n📁 Informe guardado en: ${filename}`);
}

audit();
