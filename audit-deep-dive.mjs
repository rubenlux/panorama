#!/usr/bin/env node

/**
 * AUDITORÍA PROFUNDA: ANÁLISIS DE FALLOS
 *
 * Investiga:
 * 1. Medios con 0 artículos (¿por qué?)
 * 2. Medios con RSS only (¿HTTP fallback?)
 * 3. Análisis de métodos de extracción
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
  log('║  AUDITORÍA PROFUNDA: ANÁLISIS DE FALLOS ESPECÍFICOS            ║');
  log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // PARTE 1: Medios con 0 artículos
    log('\n=== PARTE 1: MEDIOS SIN ARTÍCULOS (Diagnosis) ===\n');
    const { rows: dead } = await pool.query(`
      SELECT
        rs.id,
        rs.name,
        rs.rss_url,
        rs.sitemap_url,
        rs.home_url,
        rs.last_checked,
        rs.last_format_detected,
        COUNT(ma.id) as articles_count,
        MAX(ma.detected_at) as last_article_date
      FROM rss_sources rs
      LEFT JOIN monitored_articles ma ON ma.source_id = rs.id AND ma.detected_at > now() - interval '7 days'
      WHERE rs.enabled = true
      GROUP BY rs.id, rs.name, rs.rss_url, rs.sitemap_url, rs.home_url, rs.last_checked, rs.last_format_detected
      HAVING COUNT(ma.id) = 0 OR MAX(ma.detected_at) IS NULL
      ORDER BY rs.name
    `);

    if (dead.length > 0) {
      log(`❌ ${dead.length} medios sin artículos en 7 días:\n`);
      for (const m of dead) {
        log(`   ${m.name}`);
        log(`      RSS: ${m.rss_url ? '✓' : '✗'}`);
        log(`      Sitemap: ${m.sitemap_url ? '✓' : '✗'}`);
        log(`      Home: ${m.home_url ? '✓' : '✗'}`);
        log(`      Last checked: ${m.last_checked ? new Date(m.last_checked).toISOString() : 'NUNCA'}`);
        log(`      Last format: ${m.last_format_detected || 'DESCONOCIDO'}\n`);
      }
    } else {
      log('✅ Todos los medios habilitados descubren artículos\n');
    }

    // PARTE 2: Medios con 100% RSS only
    log('\n=== PARTE 2: MEDIOS CON RSS ONLY (HTTP Fallback) ===\n');
    const { rows: rssOnly } = await pool.query(`
      SELECT
        rs.name,
        COUNT(CASE WHEN ma.extraction_method = 'fetch' THEN 1 END) as fetch_count,
        COUNT(CASE WHEN ma.extraction_method = 'playwright' THEN 1 END) as playwright_count,
        COUNT(CASE WHEN ma.extraction_method = 'rss_only' THEN 1 END) as rss_only_count,
        COUNT(CASE WHEN ma.extraction_method = 'paywall' THEN 1 END) as paywall_count,
        COUNT(CASE WHEN ma.extraction_method IS NULL THEN 1 END) as pending_count,
        COUNT(*) as total
      FROM rss_sources rs
      LEFT JOIN monitored_articles ma ON ma.source_id = rs.id AND ma.detected_at > now() - interval '7 days'
      WHERE rs.enabled = true
      GROUP BY rs.id, rs.name
      ORDER BY rss_only_count DESC
    `);

    for (const m of rssOnly) {
      if (m.rss_only_count > 0) {
        const pct = Math.round((m.rss_only_count / m.total) * 100);
        log(`⚠️  ${m.name}: ${m.rss_only_count}/${m.total} RSS only (${pct}%)`);
        if (m.fetch_count === 0 && m.rss_only_count > 50) {
          log(`    ⚡ ISSUE: 100% HTTP fallback → suggests fetch failures or timeout`);
        }
        log('');
      }
    }

    // PARTE 3: Análisis de extracción por method
    log('\n=== PARTE 3: ANÁLISIS DE EXTRACCIÓN POR MÉTODO ===\n');
    const { rows: methods } = await pool.query(`
      SELECT
        extraction_method,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE content_words IS NOT NULL) as with_content,
        COUNT(*) FILTER (WHERE content_words IS NULL) as without_content,
        AVG(COALESCE(content_words, 0))::int as avg_words,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY content_words) as median_words
      FROM monitored_articles
      WHERE detected_at > now() - interval '7 days'
      GROUP BY extraction_method
      ORDER BY count DESC
    `);

    for (const m of methods) {
      log(`${m.extraction_method || 'pending'}:`);
      log(`  Total: ${m.count}`);
      log(`  With content: ${m.with_content} (${Math.round((m.with_content/m.count)*100)}%)`);
      log(`  Avg words: ${m.avg_words}, Median: ${m.median_words}`);
      log('');
    }

    // PARTE 4: Clustering analysis - ¿qué historias se detectan?
    log('\n=== PARTE 4: CLUSTERING RESULTADOS (Historias detectadas) ===\n');
    const { rows: clustering } = await pool.query(`
      SELECT
        COUNT(DISTINCT sc.id) as total_stories,
        COUNT(DISTINCT CASE WHEN sc.status = 'active' THEN sc.id END) as active_stories,
        COUNT(DISTINCT CASE WHEN sc.is_recurring = true THEN sc.id END) as recurring,
        AVG(sc.importance_score)::int as avg_importance,
        AVG(sca.article_count)::int as avg_articles_per_story,
        MAX(sca.article_count)::int as max_articles_in_story
      FROM story_clusters sc
      LEFT JOIN (
        SELECT story_id, COUNT(*) as article_count
        FROM story_cluster_articles
        GROUP BY story_id
      ) sca ON sca.story_id = sc.id
      WHERE sc.created_at > now() - interval '7 days'
    `);

    if (clustering.length > 0) {
      const c = clustering[0];
      log(`Total historias (7 días): ${c.total_stories}`);
      log(`Activas: ${c.active_stories}`);
      log(`Recurrentes: ${c.recurring}`);
      log(`Promedio artículos/historia: ${c.avg_articles_per_story}`);
      log(`Máximo en una historia: ${c.max_articles_in_story}`);
      log(`Importancia promedio: ${c.avg_importance}\n`);
    }

    // PARTE 5: Validation gates - cuántos artículos rechazan validación?
    log('\n=== PARTE 5: VALIDATION GATES (Hypothesis) ===\n');
    log('NOTA: La table monitored_articles NO almacena _skipReason.');
    log('Los rechazos ocurren en extractArticlesWithConcurrency() → validateArticle()');
    log('Solo en pipeline de Playwright Discovery.\n');

    log('Inferencia de rechazo:');
    const { rows: skipped } = await pool.query(`
      SELECT
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE content_words IS NULL) as no_content,
        COUNT(*) FILTER (WHERE content_words < 120) as below_120_words,
        COUNT(*) FILTER (WHERE title IS NULL OR title = '') as no_title
      FROM monitored_articles
      WHERE detected_at > now() - interval '7 days'
    `);

    if (skipped.length > 0) {
      const s = skipped[0];
      log(`Total artículos: ${s.total_articles}`);
      log(`Sin contenido (extraction_method IS NULL): ${s.no_content} (${Math.round((s.no_content/s.total_articles)*100)}%)`);
      log(`Contenido < 120 words: ${s.below_120_words} (${Math.round((s.below_120_words/s.total_articles)*100)}%)`);
      log(`Sin título: ${s.no_title} (${Math.round((s.no_title/s.total_articles)*100)}%)\n`);
    }

    // PARTE 6: Discovery mechanism - RSS vs Sitemap vs Playwright
    log('\n=== PARTE 6: DISCOVERY MECHANISM (por fuente) ===\n');
    const { rows: discovery } = await pool.query(`
      SELECT
        rs.name,
        rs.last_format_detected,
        COUNT(ma.id) as articles,
        COUNT(ma.id) FILTER (WHERE ma.extraction_method IN ('fetch', 'playwright')) as with_content_extraction
      FROM rss_sources rs
      LEFT JOIN monitored_articles ma ON ma.source_id = rs.id AND ma.detected_at > now() - interval '7 days'
      WHERE rs.enabled = true
      GROUP BY rs.id, rs.name, rs.last_format_detected
      HAVING COUNT(ma.id) > 0
      ORDER BY articles DESC
      LIMIT 15
    `);

    for (const d of discovery) {
      log(`${d.name}`);
      log(`  Format: ${d.last_format_detected || 'unknown'}`);
      log(`  Articles: ${d.articles}`);
      log(`  Content extracted: ${d.with_content_extraction}\n`);
    }

  } catch (e) {
    log(`\n❌ ERROR: ${e.message}`);
    log(e.stack);
  } finally {
    await pool.end();
  }

  // SAVE REPORT
  const filename = `audit-deep-${new Date().toISOString().split('T')[0]}.log`;
  fs.writeFileSync(filename, report.join('\n'));
  console.log(`\n📁 Informe guardado en: ${filename}`);
}

audit();
