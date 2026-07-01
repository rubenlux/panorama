#!/usr/bin/env node

/**
 * TRACE CRONOLÓGICO: Línea de tiempo completa de un artículo
 *
 * Objetivo: Ver EXACTAMENTE en qué orden ocurrieron los eventos
 *
 * Busca:
 * - INSERT monitored_articles (cuándo)
 * - fetchPendingArticleContent() (¿sí? ¿cuándo?)
 * - detectStories() (¿sí? ¿cuándo?)
 * - UPDATE extraction_method (¿sí? ¿cuándo?)
 * - UPDATE content_words (¿sí? ¿cuándo?)
 * - INSERT story_cluster_articles (¿sí? ¿cuándo?)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function traceTimeline() {
  const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE CRONOLÓGICO: Línea de tiempo del artículo                ║`);
  console.log(`║  Article ID: ${TRACE_ARTICLE_ID.substring(0, 20)}...`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // Primero: obtener el schema
    console.log(`[PASO 0] Leyendo schema de monitored_articles...`);
    const { rows: schemaRows } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'monitored_articles'
      ORDER BY ordinal_position
    `);

    const columns = schemaRows.map(r => r.column_name);
    console.log(`Columnas disponibles: ${columns.slice(0, 10).join(', ')} ... (${columns.length} total)`);

    // PASO 1: Obtener el artículo actual
    console.log(`\n[PASO 1] Estado actual del artículo en monitored_articles:`);
    console.log(`────────────────────────────────────────────────────────────\n`);

    // Usar solo columnas que sabemos que existen
    const { rows: articleRows } = await pool.query(`
      SELECT
        id,
        title,
        source_id,
        detected_at,
        extraction_method,
        content_words,
        url,
        hash
      FROM monitored_articles
      WHERE id = $1
    `, [TRACE_ARTICLE_ID]);

    if (articleRows.length === 0) {
      console.log(`❌ FATAL: Artículo NO encontrado`);
      process.exit(1);
    }

    const article = articleRows[0];
    console.log(`Title: "${article.title.substring(0, 60)}..."`);
    console.log(`Source ID: ${article.source_id}`);
    console.log(`URL: ${article.url}`);
    console.log(`Hash: ${article.hash}`);
    console.log(`\nTimestamps:`);
    console.log(`  detected_at: ${article.detected_at}`);
    console.log(`\nEstado de extracción:`);
    console.log(`  extraction_method: ${article.extraction_method || '(NULL)'}`);
    console.log(`  content_words: ${article.content_words || '(NULL)'}`);

    // PASO 2: Buscar en story_cluster_articles
    console.log(`\n[PASO 2] ¿Existe en story_cluster_articles?`);
    console.log(`────────────────────────────────────────────────────────────\n`);

    const { rows: clusterRows } = await pool.query(`
      SELECT
        sca.story_id,
        sca.relevance_score,
        sca.matching_reason,
        sca.created_at as cluster_article_created_at,
        sc.title as story_title,
        sc.detected_category
      FROM story_cluster_articles sca
      LEFT JOIN story_clusters sc ON sc.id = sca.story_id
      WHERE sca.article_id = $1
    `, [TRACE_ARTICLE_ID]);

    if (clusterRows.length > 0) {
      console.log(`✅ SÍ, encontrado en story_cluster_articles:`);
      clusterRows.forEach(row => {
        console.log(`  Story ID: ${row.story_id}`);
        console.log(`  Story Title: "${row.story_title?.substring(0, 50)}..."`);
        console.log(`  Category: ${row.detected_category}`);
        console.log(`  Created at: ${row.cluster_article_created_at}`);
        console.log(`  Match reason: ${row.matching_reason}`);
        console.log(`  Relevance: ${row.relevance_score}`);
      });
    } else {
      console.log(`❌ NO encontrado en story_cluster_articles`);
      console.log(`   → El artículo está en monitored_articles pero NO en el clustering`);
    }

    // PASO 3: Buscar en pending_article_content (si existe tabla)
    console.log(`\n[PASO 3] ¿Existe en pending_article_content?`);
    console.log(`────────────────────────────────────────────────────────────\n`);

    let pendingRows = [];
    try {
      const pendingResult = await pool.query(`
        SELECT
          article_id,
          status,
          attempt_count,
          last_attempt_at,
          next_retry_at,
          error_message,
          created_at,
          updated_at
        FROM pending_article_content
        WHERE article_id = $1
        ORDER BY updated_at DESC
      `, [TRACE_ARTICLE_ID]);
      pendingRows = pendingResult.rows;
    } catch (e) {
      if (e.code === '42P01') {
        console.log(`⚠️  Tabla pending_article_content NO existe`);
      } else {
        throw e;
      }
    }

    if (pendingRows.length > 0) {
      console.log(`✅ Artículo está en pending_article_content:`);
      pendingRows.forEach((row, idx) => {
        console.log(`  [${idx + 1}]`);
        console.log(`    Status: ${row.status}`);
        console.log(`    Attempts: ${row.attempt_count}`);
        console.log(`    Last attempt: ${row.last_attempt_at || '(nunca)'}`);
        console.log(`    Next retry: ${row.next_retry_at || '(nunca)'}`);
        console.log(`    Error: ${row.error_message || '(sin error registrado)'}`);
        console.log(`    Created: ${row.created_at}`);
        console.log(`    Updated: ${row.updated_at}`);
      });
    } else {
      console.log(`❌ NO encontrado en pending_article_content`);
      console.log(`   → O nunca fue agregado, o ya fue procesado/eliminado`);
    }

    // PASO 4: Reconstruir la cronología
    console.log(`\n[PASO 4] Línea de tiempo reconstruida`);
    console.log(`────────────────────────────────────────────────────────────\n`);

    const timeline = [];

    timeline.push({
      time: article.detected_at,
      event: 'detected_at (INSERT o descubrimiento)',
      details: `Artículo descubierto y validado`
    });

    if (article.extraction_method) {
      timeline.push({
        time: article.detected_at,  // aproximado
        event: 'SET extraction_method',
        details: `extraction_method = '${article.extraction_method}'`
      });
    } else {
      timeline.push({
        time: null,
        event: 'SET extraction_method',
        details: `❌ NUNCA fue seteado (extraction_method = NULL)`
      });
    }

    if (article.content_words && article.content_words > 0) {
      timeline.push({
        time: article.detected_at,  // aproximado
        event: 'SET content_words',
        details: `content_words = ${article.content_words}`
      });
    } else {
      timeline.push({
        time: null,
        event: 'SET content_words',
        details: `❌ NUNCA fue seteado (content_words = NULL o 0)`
      });
    }

    // Inferenciar cuándo corrió detectStories
    // detectStories corre periódicamente (cada 30 min aprox)
    // Entonces probablemente corrió poco después de detected_at
    timeline.push({
      time: new Date(new Date(article.detected_at).getTime() + 5*60000),
      event: 'PROBABLEMENTE: detectStories() corrió',
      details: `Si el artículo fue detectado a ${article.detected_at} y detectStories() corre cada 30min, corrió entre 0-30min después`
    });

    if (clusterRows.length > 0) {
      timeline.push({
        time: clusterRows[0].cluster_article_created_at,
        event: 'INSERT story_cluster_articles',
        details: `Artículo fue clusterizado (match_reason: ${clusterRows[0].matching_reason})`
      });
    } else {
      timeline.push({
        time: null,
        event: 'INSERT story_cluster_articles',
        details: `❌ NUNCA fue clusterizado`
      });
    }

    // Imprimir timeline ordenada
    timeline.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(a.time) - new Date(b.time);
    });

    timeline.forEach((item, idx) => {
      const timeStr = item.time ? new Date(item.time).toISOString().slice(11, 19) : 'NUNCA';
      console.log(`${(idx + 1).toString().padStart(2, '0')}. ${timeStr}  │  ${item.event}`);
      console.log(`    └─ ${item.details}`);
    });

    // PASO 5: Análisis de orden
    console.log(`\n[PASO 5] Análisis: ¿Cuál fue el orden del pipeline?`);
    console.log(`────────────────────────────────────────────────────────────\n`);

    const hasContent = article.content_words && article.content_words > 0;
    const isClusterized = clusterRows.length > 0;

    if (!article.extraction_method && article.content_words === 0) {
      console.log(`❌ CRÍTICO: El artículo NUNCA fue extraído`);
      console.log(`   extraction_method = NULL`);
      console.log(`   content_words = 0`);
      console.log(`\n   Hipótesis:`);
      console.log(`   A) Nunca entró a fetchPendingArticleContent()`);
      console.log(`   B) Entró pero falló (rollback, error, timeout)`);
      console.log(`   C) Quedó pendiente (pending_article_content status != 'completed')`);
    }

    console.log(`\n✓ ORDEN PROBABLE DEL PIPELINE:`);
    console.log(`\n  1. INSERT monitored_articles`);
    console.log(`     ↓ (${article.created_at})`);

    if (isClusterized && !hasContent) {
      console.log(`  2. detectStories() [ANTES de fetchPendingArticleContent]`);
      console.log(`     ↓ (artículo insertado, sin contenido)`);
      console.log(`     ✓ CLUSTERIZADO (con kwargs de título solamente)`);
      console.log(`     ↓`);
      console.log(`  3. fetchPendingArticleContent() [DESPUÉS de detectStories]`);
      console.log(`     ↓`);
      console.log(`     ✓ Se extrajo contenido (pero detectStories ya pasó)`);
      console.log(`\n  ⚠️  PROBLEMA: Pipeline es detectStories() → fetchPendingArticleContent()`);
      console.log(`      Debería ser: fetchPendingArticleContent() → detectStories()`);
    } else if (!isClusterized && !hasContent) {
      console.log(`  2. detectStories() [SIN contenido disponible]`);
      console.log(`     ↓ (artículo no cumple gates)`);
      console.log(`     ❌ NO CLUSTERIZADO`);
      console.log(`     ↓`);
      console.log(`  3. fetchPendingArticleContent()`);
      console.log(`     ↓ (extrae contenido tarde, detectStories ya pasó)`);
      console.log(`\n  ⚠️  PROBLEMA: detectStories() corre antes de fetchPendingArticleContent()`);
      console.log(`      Entonces clusteriza artículos sin contenido`);
    } else if (isClusterized && hasContent) {
      console.log(`  2. fetchPendingArticleContent()`);
      console.log(`     ↓ (extrae contenido)`);
      console.log(`     ✓ extraction_method = '${article.extraction_method}'`);
      console.log(`     ✓ content_words = ${article.content_words}`);
      console.log(`     ↓`);
      console.log(`  3. detectStories()`);
      console.log(`     ↓ (clusteriza con contenido disponible)`);
      console.log(`     ✓ CLUSTERIZADO`);
      console.log(`\n  ✅ CORRECTO: Pipeline es fetchPendingArticleContent() → detectStories()`);
    } else if (!isClusterized && hasContent) {
      console.log(`  2. fetchPendingArticleContent()`);
      console.log(`     ↓ (extrae contenido)`);
      console.log(`     ✓ extraction_method = '${article.extraction_method}'`);
      console.log(`     ✓ content_words = ${article.content_words}`);
      console.log(`     ↓`);
      console.log(`  3. detectStories()`);
      console.log(`     ↓ (tiene contenido pero no clusteriza)`);
      console.log(`     ❌ NO CLUSTERIZADO (gates rechazaron)`);
      console.log(`\n  ✅ PIPELINE CORRECTO: fetchPendingArticleContent() → detectStories()`);
      console.log(`  ⚠️  PERO: Todavía no clusterizado (problema de gates, no de orden)`);
    }

  } catch (e) {
    console.error(`❌ ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

traceTimeline();
