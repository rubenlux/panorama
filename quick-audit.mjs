#!/usr/bin/env node

/**
 * QUICK AUDIT: Examina el estado actual SIN ejecutar el monitor
 * Solo muestra datos de la BD
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TRACE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';

async function quickAudit() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  QUICK AUDIT: Estado actual sin ejecutar monitor               ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    // 1. ¿Cuántos artículos sin procesar hay?
    console.log(`[1] ARTÍCULOS PENDING (extraction_method IS NULL)\n`);
    const { rows: pending } = await pool.query(`
      SELECT COUNT(*) as count FROM monitored_articles WHERE extraction_method IS NULL
    `);
    console.log(`    Total: ${pending[0].count} artículos sin procesar`);
    console.log(`    Límite por ciclo: 20`);
    console.log(`    Ciclos necesarios: ~${Math.ceil(pending[0].count / 20)}\n`);

    // 2. ¿Dónde está nuestro artículo en la cola?
    console.log(`[2] POSICIÓN DE NUESTRO ARTÍCULO EN LA COLA\n`);
    const { rows: posRows } = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            (EXISTS(
              SELECT 1 FROM story_cluster_articles sca
              JOIN story_clusters sc ON sc.id = sca.story_id
              WHERE sca.article_id = ma.id
                AND sc.status IN ('active','summarizing','ready','followed')
                AND sc.last_seen > now() - interval '24 hours'
            ))::int DESC,
            (ma.detected_at > now() - interval '24 hours')::int DESC,
            (ma.detected_at > now() - interval '72 hours')::int DESC,
            ma.detected_at DESC
        ) as position,
        id,
        title,
        extraction_method,
        content_words
      FROM monitored_articles ma
      WHERE ma.extraction_method IS NULL
        AND id = $1
    `, [TRACE_ID]);

    if (posRows.length > 0) {
      const row = posRows[0];
      console.log(`    Artículo: ${row.id.substring(0, 8)}...`);
      console.log(`    Título: "${row.title.substring(0, 50)}..."`);
      console.log(`    Posición en cola: #${row.position} de ${pending[0].count}`);
      console.log(`    extraction_method: ${row.extraction_method || 'NULL'}`);
      console.log(`    content_words: ${row.content_words || '0'}`);
      console.log(`\n    Status: ${row.position <= 20 ? '✅ DEBERÍA HABER SIDO PROCESADO' : `❌ POSICIÓN #${row.position} (fuera de límite 20)`}\n`);
    } else {
      console.log(`    ❌ Artículo NO encontrado en pending queue\n`);
    }

    // 3. ¿Está en story_cluster_articles?
    console.log(`[3] ¿FUE CLUSTERIZADO?\n`);
    const { rows: clusters } = await pool.query(`
      SELECT COUNT(*) as count FROM story_cluster_articles WHERE article_id = $1
    `, [TRACE_ID]);

    if (clusters[0].count > 0) {
      console.log(`    ✅ SÍ - Encontrado en ${clusters[0].count} historia(s)\n`);
    } else {
      console.log(`    ❌ NO - Nunca fue clusterizado\n`);
    }

    // 4. CONCLUSIÓN
    console.log(`[4] CONCLUSIÓN\n`);

    if (posRows.length > 0 && clusters[0].count === 0) {
      const row = posRows[0];
      console.log(`    Artículo está PENDING (extraction_method=${row.extraction_method})`);
      console.log(`    Posición: #${row.position} de ${pending[0].count}`);
      console.log(`\n    → fetchPendingArticleContent() solo procesa primeros 20`);
      console.log(`    → detectStories() recibe artículos que NO fueron procesados`);
      console.log(`    → El artículo fue clusterizado SIN CONTENIDO`);
      console.log(`\n    🎯 RESPUESTA A LA PREGUNTA:`);
      console.log(`       fetchPendingArticleContent() procesa una COLA GLOBAL, NO solo allNewIds`);
      console.log(`       detectStories() recibe allNewIds (puede incluir artículos sin procesar)`);
    }

  } catch (e) {
    console.error(`❌ ERROR:`, e.message);
  } finally {
    await pool.end();
  }
}

quickAudit();
