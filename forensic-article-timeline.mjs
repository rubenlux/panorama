#!/usr/bin/env node

/**
 * FORENSIC: Línea de tiempo completa de un artículo
 *
 * Objetivo: Reconstruir CADA evento que ocurrió con este artículo
 * Usando SOLO lo que está en la BD
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function forensicTimeline() {
  const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ANÁLISIS FORENSE: Línea de tiempo del artículo                ║`);
  console.log(`║  Article ID: ${TRACE_ARTICLE_ID.substring(0, 20)}...`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // PASO 1: Estado actual del artículo
    console.log(`[ESTADO ACTUAL EN BD]\n`);

    const { rows: current } = await pool.query(`
      SELECT
        id,
        title,
        url,
        source_id,
        detected_at,
        extraction_method,
        content_words,
        content_text,
        hash
      FROM monitored_articles
      WHERE id = $1
    `, [TRACE_ARTICLE_ID]);

    if (current.length === 0) {
      console.log(`❌ Artículo NO encontrado en BD`);
      process.exit(1);
    }

    const article = current[0];

    console.log(`Title: "${article.title.substring(0, 70)}..."`);
    console.log(`URL: ${article.url}`);
    console.log(`Source ID: ${article.source_id}`);
    console.log(`Hash: ${article.hash}`);
    console.log(`\nTimestamps:`);
    console.log(`  detected_at: ${article.detected_at}`);
    console.log(`\nExtracción:`);
    console.log(`  extraction_method: ${article.extraction_method || '(NULL)'}`);
    console.log(`  content_words: ${article.content_words || '(NULL)'}`);
    console.log(`  content_text length: ${article.content_text?.length || 0} chars`);

    // PASO 2: ¿Está en story_cluster_articles?
    console.log(`\n[¿FUE CLUSTERIZADO?]\n`);

    const { rows: clusters } = await pool.query(`
      SELECT
        sca.story_id,
        sca.matching_reason,
        sca.relevance_score,
        sc.title,
        sc.detected_category,
        sc.created_at as cluster_created_at
      FROM story_cluster_articles sca
      LEFT JOIN story_clusters sc ON sc.id = sca.story_id
      WHERE sca.article_id = $1
    `, [TRACE_ARTICLE_ID]);

    if (clusters.length > 0) {
      console.log(`✅ SÍ - Clusterizado en ${clusters.length} historia(s):`);
      clusters.forEach(c => {
        console.log(`\n  Story ID: ${c.story_id}`);
        console.log(`  Title: "${c.title?.substring(0, 50)}..."`);
        console.log(`  Category: ${c.detected_category}`);
        console.log(`  Match: ${c.matching_reason} (score: ${c.relevance_score})`);
        console.log(`  Created at: ${c.cluster_created_at}`);
      });
    } else {
      console.log(`❌ NO - Nunca fue clusterizado`);
    }

    // PASO 3: ¿Hay entidades extraídas?
    console.log(`\n[ENTIDADES EXTRAÍDAS]\n`);

    const { rows: entities } = await pool.query(`
      SELECT
        ke.id,
        ke.name,
        ke.entity_type,
        ke.entity_origin,
        aem.created_at
      FROM article_entity_matches aem
      JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE aem.article_id = $1
      ORDER BY aem.created_at DESC
    `, [TRACE_ARTICLE_ID]);

    if (entities.length > 0) {
      console.log(`✅ Encontradas ${entities.length} entidades:`);
      entities.slice(0, 10).forEach(e => {
        console.log(`  - "${e.name}" [${e.entity_type}] (origin: ${e.entity_origin})`);
      });
      if (entities.length > 10) {
        console.log(`  ... y ${entities.length - 10} más`);
      }
    } else {
      console.log(`❌ Sin entidades`);
    }

    // PASO 4: Timeline reconstruida
    console.log(`\n[LÍNEA DE TIEMPO RECONSTRUIDA]\n`);

    const timeline = [];

    // Evento 1: Descubrimiento
    timeline.push({
      time: article.detected_at,
      event: 'DISCOVERED',
      details: `Artículo detectado/validado y INSERT en monitored_articles`
    });

    // Evento 2: Extracción (si ocurrió)
    if (article.extraction_method) {
      timeline.push({
        time: article.detected_at, // aproximado, no tenemos timestamp exacto
        event: 'EXTRACTED',
        details: `extraction_method = '${article.extraction_method}', content_words = ${article.content_words || 0}`
      });
    } else {
      timeline.push({
        time: null,
        event: 'NOT_EXTRACTED',
        details: `extraction_method = NULL (nunca se ejecutó fetchPendingArticleContent o falló)`
      });
    }

    // Evento 3: Clustering (si ocurrió)
    if (clusters.length > 0) {
      timeline.push({
        time: clusters[0].cluster_created_at,
        event: 'CLUSTERED',
        details: `Insertado en story_cluster_articles`
      });
    } else {
      timeline.push({
        time: null,
        event: 'NOT_CLUSTERED',
        details: `Nunca entró en detectStories o fue rechazado por los gates`
      });
    }

    // Evento 4: NER (si hay entidades)
    if (entities.length > 0) {
      timeline.push({
        time: entities[0].created_at,
        event: 'NER_MATCHED',
        details: `${entities.length} entidades extraídas`
      });
    } else {
      timeline.push({
        time: null,
        event: 'NO_NER',
        details: `Sin entidades (posiblemente sin contenido)`
      });
    }

    // Imprimir timeline
    timeline.forEach((item, idx) => {
      const timeStr = item.time ? new Date(item.time).toISOString().slice(11, 23) : 'UNKNOWN';
      console.log(`${(idx + 1).toString().padStart(2)}.`);
      console.log(`    Time:  ${timeStr}`);
      console.log(`    Event: ${item.event}`);
      console.log(`    Info:  ${item.details}\n`);
    });

    // ANÁLISIS FINAL
    console.log(`[ANÁLISIS]\n`);

    const hasContent = article.extraction_method && article.content_words && article.content_words > 0;
    const wasClusterized = clusters.length > 0;
    const hasEntities = entities.length > 0;

    console.log(`Estado actual:`);
    console.log(`  Extraction: ${hasContent ? `✅ YES (${article.extraction_method}, ${article.content_words} words)` : `❌ NO (extraction_method=${article.extraction_method})`}`);
    console.log(`  Clustering: ${wasClusterized ? `✅ YES (${clusters.length} historias)` : `❌ NO`}`);
    console.log(`  Entities:   ${hasEntities ? `✅ YES (${entities.length} entidades)` : `❌ NO`}`);

    console.log(`\nPosibilidades:`);

    if (!hasContent && !wasClusterized) {
      console.log(`→ El artículo NUNCA fue extraído Y NUNCA fue clusterizado`);
      console.log(`  Hipótesis A: detectStories() lo vio sin contenido y lo rechazó (Gate 3 falló)`);
      console.log(`  Hipótesis B: El artículo está en posición > 20 en la cola pending`);
      console.log(`  → ORDEN DEL PIPELINE: INSERT → detectStories() → fetchPendingArticleContent()`);
      console.log(`  → ESTO ES INCORRECTO`);
    } else if (hasContent && !wasClusterized) {
      console.log(`→ El artículo FUE extraído PERO NO clusterizado`);
      console.log(`  Hipótesis: detectStories() lo rechazó incluso con contenido (Gates fallaron)`);
      console.log(`  → Pipeline CORRECTO (fetch antes de detect), pero gates son muy restrictivos`);
    } else if (!hasContent && wasClusterized) {
      console.log(`→ El artículo fue clusterizado SIN CONTENIDO`);
      console.log(`  Hipótesis: detectStories() corrió antes de fetchPendingArticleContent()`);
      console.log(`  → ORDEN DEL PIPELINE: INSERT → detectStories() → fetchPendingArticleContent()`);
      console.log(`  → PIPELINE ESTÁ DESORDENADO`);
    } else {
      console.log(`→ El artículo FUE extraído Y clusterizado`);
      console.log(`  → Pipeline CORRECTO`);
    }

  } catch (e) {
    console.error(`❌ ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

forensicTimeline();
