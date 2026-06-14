/**
 * Sprint 8.6A — Build entity_relationships
 *
 * Idempotente: usa INSERT … ON CONFLICT DO UPDATE.
 * Fuentes:
 *   - article_entity_matches  → pares que comparten artículos
 *   - story_entities + event_cluster_stories → pares que comparten eventos
 *
 * Ejecución: node scripts/build_entity_relationships.mjs [--dry-run]
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const pool    = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('=== build_entity_relationships ===');
  console.log(`Modo: ${DRY_RUN ? 'DRY RUN (solo estadísticas)' : 'ESCRITURA'}`);

  // ── 1. Pares por artículos compartidos ──────────────────────────────────────
  console.log('\n[1/4] Calculando pares por artículos…');
  const { rows: artPairs } = await pool.query(`
    SELECT
      LEAST(a.entity_id, b.entity_id)::text    AS ea,
      GREATEST(a.entity_id, b.entity_id)::text AS eb,
      COUNT(DISTINCT a.article_id)::int         AS shared_articles
    FROM article_entity_matches a
    JOIN article_entity_matches b
      ON  a.article_id = b.article_id
      AND a.entity_id  < b.entity_id
    GROUP BY LEAST(a.entity_id, b.entity_id), GREATEST(a.entity_id, b.entity_id)
  `);
  console.log(`  → ${artPairs.length} pares con artículos compartidos`);

  // ── 2. Pares por eventos compartidos ────────────────────────────────────────
  console.log('[2/4] Calculando pares por eventos…');
  const { rows: evtPairs } = await pool.query(`
    SELECT
      LEAST(se1.entity_id, se2.entity_id)::text    AS ea,
      GREATEST(se1.entity_id, se2.entity_id)::text AS eb,
      COUNT(DISTINCT ecs.event_id)::int             AS shared_events
    FROM story_entities se1
    JOIN story_entities se2
      ON  se1.story_id  = se2.story_id
      AND se1.entity_id < se2.entity_id
    JOIN event_cluster_stories ecs ON ecs.story_id = se1.story_id
    GROUP BY LEAST(se1.entity_id, se2.entity_id), GREATEST(se1.entity_id, se2.entity_id)
  `);
  console.log(`  → ${evtPairs.length} pares con eventos compartidos`);

  // ── 3. Merge en memoria ──────────────────────────────────────────────────────
  console.log('[3/4] Fusionando…');
  const map = new Map();

  for (const { ea, eb, shared_articles } of artPairs) {
    map.set(`${ea}|${eb}`, { ea, eb, shared_articles, shared_events: 0 });
  }
  for (const { ea, eb, shared_events } of evtPairs) {
    const key = `${ea}|${eb}`;
    if (map.has(key)) {
      map.get(key).shared_events = shared_events;
    } else {
      map.set(key, { ea, eb, shared_articles: 0, shared_events });
    }
  }

  const merged = [...map.values()];
  console.log(`  → ${merged.length} pares totales únicos`);

  const byStrength = merged
    .map(r => ({ ...r, score: r.shared_articles + r.shared_events * 5 }))
    .sort((a, b) => b.score - a.score);

  console.log('  Top 5 pares por strength:');
  for (const p of byStrength.slice(0, 5)) {
    console.log(`    score=${p.score}  articles=${p.shared_articles}  events=${p.shared_events}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No se escribió nada.');
    await pool.end();
    return;
  }

  // ── 4. Upsert por lotes de 500 ────────────────────────────────────────────
  console.log('[4/4] Escribiendo en entity_relationships…');
  const BATCH = 500;
  let inserted = 0, updated = 0;

  for (let i = 0; i < merged.length; i += BATCH) {
    const chunk = merged.slice(i, i + BATCH);

    // Build VALUES list
    const vals   = [];
    const params = [];
    let   p      = 1;
    for (const { ea, eb, shared_articles, shared_events } of chunk) {
      vals.push(`($${p++}::uuid, $${p++}::uuid, $${p++}, $${p++})`);
      params.push(ea, eb, shared_articles, shared_events);
    }

    const { rowCount } = await pool.query(`
      INSERT INTO entity_relationships (entity_a_id, entity_b_id, shared_articles, shared_events)
      VALUES ${vals.join(', ')}
      ON CONFLICT (entity_a_id, entity_b_id) DO UPDATE SET
        shared_articles = EXCLUDED.shared_articles,
        shared_events   = EXCLUDED.shared_events,
        updated_at      = NOW()
    `, params);

    // rowCount = total rows affected (insert + update = same)
    inserted += chunk.length;
    if (i % 2000 === 0 && i > 0) console.log(`  … ${i}/${merged.length}`);
  }

  // Borrar relaciones que ya no existen (limpieza)
  const validKeys = merged.map(r => `'${r.ea}','${r.eb}'`);
  // (No borrar si la tabla estaba vacía antes)
  const { rows: [{ n: existingCount }] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM entity_relationships`
  );

  console.log(`\n✅ entity_relationships: ${existingCount} filas totales`);
  console.log(`   Pares procesados: ${merged.length}`);

  // Stats finales
  const { rows: [stats] } = await pool.query(`
    SELECT
      COUNT(*)::int                              AS total_pairs,
      COUNT(*) FILTER (WHERE shared_events > 0)::int AS with_events,
      ROUND(AVG(strength_score)::numeric, 1)    AS avg_strength,
      MAX(strength_score)::int                  AS max_strength
    FROM entity_relationships
  `);
  console.log('   Estadísticas finales:', stats);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
