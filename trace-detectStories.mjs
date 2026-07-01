#!/usr/bin/env node

/**
 * TRACE: detectStories() para un único artículo
 *
 * Objetivo: Rastrear el artículo d36fc24b-d390-4998-8d70-9781d8510066
 * a través del pipeline de clustering hasta encontrar dónde desaparece
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function traceDetectStories() {
  const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE: detectStories() para un único artículo                 ║`);
  console.log(`║  Article ID: ${TRACE_ARTICLE_ID}`);
  console.log(`║  Objetivo: Rastrear cada etapa del clustering                  ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // PASO 1: Verificar que el artículo existe
    console.log(`[PASO 1] Verificando existencia del artículo...`);

    const { rows: articleRows } = await pool.query(`
      SELECT id, title, source_id, detected_at, extraction_method, content_words
      FROM monitored_articles
      WHERE id = $1
    `, [TRACE_ARTICLE_ID]);

    if (articleRows.length === 0) {
      console.log(`❌ FATAL: Artículo NO encontrado en monitored_articles`);
      process.exit(1);
    }

    const article = articleRows[0];
    console.log(`✅ Artículo encontrado:`);
    console.log(`   Title: "${article.title.substring(0, 70)}..."`);
    console.log(`   Source ID: ${article.source_id}`);
    console.log(`   Detected at: ${article.detected_at}`);
    console.log(`   Method: ${article.extraction_method}`);
    console.log(`   Words: ${article.content_words}`);

    // PASO 2: Buscar en story_cluster_articles
    console.log(`\n[PASO 2] Buscando en story_cluster_articles...`);

    const { rows: clusterArticleRows } = await pool.query(`
      SELECT sca.story_id, sca.relevance_score, sca.matching_reason,
             sc.title as story_title, sc.detected_category
      FROM story_cluster_articles sca
      LEFT JOIN story_clusters sc ON sc.id = sca.story_id
      WHERE sca.article_id = $1
    `, [TRACE_ARTICLE_ID]);

    if (clusterArticleRows.length > 0) {
      console.log(`✅ Artículo FOUND en story_cluster_articles:`);
      clusterArticleRows.forEach((row, idx) => {
        console.log(`   Match ${idx + 1}:`);
        console.log(`      Story ID: ${row.story_id}`);
        console.log(`      Story: "${row.story_title?.substring(0, 50) || 'N/A'}..."`);
        console.log(`      Category: ${row.detected_category}`);
        console.log(`      Match reason: ${row.matching_reason}`);
        console.log(`      Relevance: ${row.relevance_score}`);
      });
    } else {
      console.log(`❌ CRITICAL: Artículo NOT FOUND en story_cluster_articles`);
      console.log(`   → Artículo existe en monitored_articles pero no en story_cluster_articles`);
      console.log(`   → detectStories() lo eliminó o nunca lo procesó`);
    }

    // PASO 3: Contar historias activas en categoría del artículo
    console.log(`\n[PASO 3] Analizando historias activas...`);

    // Simulamos detectStoryCategory (aproximación simple por keywords)
    const titleWords = article.title.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    console.log(`   Keywords del artículo: [${titleWords.slice(0, 10).join(', ')}]...`);

    // Buscar historias activas
    const { rows: activeStories } = await pool.query(`
      SELECT
        sc.id,
        sc.title,
        sc.detected_category,
        COUNT(sca.article_id) as article_count
      FROM story_clusters sc
      LEFT JOIN story_cluster_articles sca ON sca.story_id = sc.id
      WHERE sc.status IN ('active','summarizing','ready')
        AND sc.is_recurring = false
        AND sc.last_seen > now() - interval '24 hours'
      GROUP BY sc.id, sc.title, sc.detected_category
      ORDER BY article_count DESC
      LIMIT 20
    `);

    console.log(`✅ Total historias activas (últimas 24h): ${activeStories.length}`);
    if (activeStories.length > 0) {
      console.log(`   Top 5:`);
      activeStories.slice(0, 5).forEach((s, i) => {
        console.log(`   ${i+1}. "${s.title.substring(0, 50)}..." [${s.detected_category}] (${s.article_count} arts)`);
      });
    }

    // RESUMEN
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║  RESUMEN DEL ANÁLISIS                                          ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const found = clusterArticleRows.length > 0;
    const status = found ? '✅ FOUND' : '❌ MISSING';

    console.log(`Artículo en monitored_articles: ✅ SÍ`);
    console.log(`Artículo en story_cluster_articles: ${status}`);

    if (!found) {
      console.log(`\n⚠️  CONCLUSIÓN: detectStories() NO agrupó este artículo`);
      console.log(`   Razones posibles:`);
      console.log(`   1. Artículo filtrado por < 2 keywords`);
      console.log(`   2. Categoría no matcheó con ninguna historia`);
      console.log(`   3. Entity gate rechazó el artículo`);
      console.log(`   4. Keyword Jaccard < threshold`);
      console.log(`   5. No hay historias activas en su categoría`);
      console.log(`\n💡 PRÓXIMO PASO: Ejecutar monitor con logging instrumental`);
      console.log(`   para ver exactamente cuál condición lo rechazó`);
    } else {
      console.log(`\n✅ Artículo fue clusterizado correctamente`);
    }

  } catch (e) {
    console.error(`❌ ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

traceDetectStories();
