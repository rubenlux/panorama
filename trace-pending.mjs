#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function tracePending() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACE: Artículos pendientes de extracción                     ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';

    // Total de artículos sin extraction_method
    const { rows: totalPending } = await pool.query(`
      SELECT COUNT(*) as count FROM monitored_articles WHERE extraction_method IS NULL
    `);

    console.log(`[STATS] Artículos sin procesar (extraction_method IS NULL): ${totalPending[0].count}`);
    console.log(`[STATS] Límite de procesamiento por ciclo: 20`);
    console.log(`[STATS] Ciclos necesarios para procesar todos: ~${Math.ceil(totalPending[0].count / 20)}`);

    // Posición de nuestro artículo en la cola
    console.log(`\n[POSICIÓN] Nuestro artículo en la cola de prioridad:`);

    const { rows: posRows } = await pool.query(`
      SELECT
        ma.id,
        ma.title,
        ma.detected_at,
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
        ) as position
      FROM monitored_articles ma
      WHERE ma.extraction_method IS NULL
      ORDER BY position
    `);

    // Encontrar nuestro artículo
    const ourArticle = posRows.find(r => r.id === TRACE_ARTICLE_ID);

    if (ourArticle) {
      console.log(`✅ Artículo encontrado en posición #${ourArticle.position} de ${posRows.length}`);
      console.log(`   Title: "${ourArticle.title.substring(0, 50)}..."`);
      console.log(`   Detected at: ${ourArticle.detected_at}`);
      console.log(`\n   Status: ${ourArticle.position <= 20 ? '✅ DEBERÍA HABER SIDO PROCESADO' : `❌ FUERA DEL LÍMITE (posición #${ourArticle.position}, solo se procesan primeras 20)`}`);
    } else {
      console.log(`❌ Artículo NO encontrado en pending queue`);
      console.log(`   (Significa que ya fue procesado o fue descartado)`);
    }

    // Top 20 por procesar
    console.log(`\n[TOP 20] Artículos siguientes a procesar (orden de prioridad):`);
    posRows.slice(0, 20).forEach((row, idx) => {
      const mark = row.id === TRACE_ARTICLE_ID ? ' ← NUESTRO ARTÍCULO' : '';
      console.log(`  ${(idx + 1).toString().padStart(2)}/20. "${row.title.substring(0, 40)}..."${mark}`);
    });

    if (posRows.length > 20) {
      console.log(`  ...\n  ${posRows.length - 20} artículos más sin procesar`);
    }

  } catch (e) {
    console.error(`❌ ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

tracePending();
