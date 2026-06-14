/**
 * recluster_all.js — Re-clustering completo de social_posts
 *
 * Orden de operaciones:
 * 1. Limpiar posts con títulos basura (Más acciones, Short, etc.)
 * 2. Resetear todos los clusters y asociaciones
 * 3. Reclusterizar TODOS los posts con el mismo algoritmo del worker
 * 4. Recalcular viral_score, gap_score, opportunity_score
 * 5. Mostrar evidencia de cobertura final
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5435/newsdb' });
const query = (sql, params) => pool.query(sql, params);

// ── Configuración ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra'
]);

const BANNED_TITLES = new Set([
  '', 'short', 'sin título', 'sin titulo', 'untitled', 'más acciones', 'mas acciones'
]);

function extractWords(title) {
  if (!title) return [];
  return title.toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOP_WORDS.has(w));
}

// ── FASE 1: Limpiar basura ─────────────────────────────────────────────────────

async function cleanBadPosts() {
  console.log('\n═══ FASE 1: Limpieza de posts con títulos inválidos ═══');

  const banned = [...BANNED_TITLES].filter(t => t.length > 0);
  const { rows: preview } = await query(`
    SELECT lower(trim(title)) as title, count(*) as n
    FROM social_posts
    WHERE lower(trim(title)) = ANY($1::text[])
    GROUP BY lower(trim(title))
  `, [banned]);

  if (!preview.length) {
    console.log('  Sin posts con títulos inválidos. Nada que limpiar.');
    return 0;
  }

  console.log('  Posts a eliminar:');
  preview.forEach(r => console.log(`    "${r.title}" → ${r.n} posts`));

  const { rowCount } = await query(`
    DELETE FROM social_posts
    WHERE lower(trim(title)) = ANY($1::text[])
  `, [banned]);

  console.log(`  Eliminados: ${rowCount} posts`);
  return rowCount;
}

// ── FASE 2: Reset de clusters ──────────────────────────────────────────────────

async function resetClusters() {
  console.log('\n═══ FASE 2: Reset completo de clusters ═══');

  const { rows: [{ cnt }] } = await query(`SELECT count(*) as cnt FROM social_clusters`);
  const { rows: [{ lnk }] } = await query(`SELECT count(*) as lnk FROM social_cluster_posts`);

  console.log(`  Clusters actuales: ${cnt}`);
  console.log(`  Asociaciones actuales: ${lnk}`);

  await query(`DELETE FROM social_cluster_posts`);
  await query(`DELETE FROM social_clusters`);

  console.log('  Reset completo.');
}

// ── FASE 3: Reclusterización ───────────────────────────────────────────────────

async function reclusterAll() {
  console.log('\n═══ FASE 3: Reclusterización de todos los posts ═══');

  const { rows: posts } = await query(`
    SELECT id, title, views, likes, source_id
    FROM social_posts
    WHERE lower(trim(title)) != ''
      AND lower(trim(title)) != ANY($1::text[])
    ORDER BY captured_at ASC
  `, [[...BANNED_TITLES].filter(t => t.length > 0)]);

  console.log(`  Posts a clusterizar: ${posts.length}`);

  const activeClusters = []; // { id, title, words }
  let created = 0, joined = 0, skipped = 0;

  for (const post of posts) {
    const words = extractWords(post.title);
    if (words.length < 2) { skipped++; continue; }

    let matchedClusterId = null;
    let bestMatch = 0;

    for (const cluster of activeClusters) {
      const intersection = words.filter(w => cluster.words.includes(w));
      if (intersection.length >= 2 && intersection.length > bestMatch) {
        bestMatch = intersection.length;
        matchedClusterId = cluster.id;
      }
    }

    if (matchedClusterId) {
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [matchedClusterId, post.id]);
      joined++;
    } else {
      const topWords = words.slice(0, 8);
      const views = post.views || 0;
      const { rows: [nc] } = await query(`
        INSERT INTO social_clusters
          (title, keywords, post_count, source_count, sources_count,
           total_views, total_likes, total_engagement,
           engagement_score, viral_score, status, first_seen, last_seen)
        VALUES ($1, $2, 1, 1, 1, $3::bigint, 0, $3::bigint, $3::float,
                LEAST(GREATEST(($3::float / 500)::int, 5), 30),
                'active', now(), now())
        RETURNING id
      `, [post.title.slice(0, 200), JSON.stringify(topWords), views]);

      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [nc.id, post.id]);

      activeClusters.push({ id: nc.id, title: post.title, words: topWords });
      created++;
    }
  }

  console.log(`  Resultado: clusters_creados=${created} posts_unidos=${joined} posts_sin_keywords=${skipped}`);
  return { created, joined, skipped, total: posts.length };
}

// ── FASE 4: Recalcular métricas ───────────────────────────────────────────────

async function recalcAllMetrics() {
  console.log('\n═══ FASE 4: Recálculo de métricas ═══');

  const { rows: allClusters } = await query(`SELECT id FROM social_clusters`);
  const clusterIds = allClusters.map(r => r.id);

  if (!clusterIds.length) { console.log('  Sin clusters para recalcular.'); return; }

  await query(`
    UPDATE social_clusters sc
    SET
      post_count       = stats.post_count,
      source_count     = stats.source_count,
      sources_count    = stats.source_count,
      total_views      = stats.total_views,
      total_likes      = stats.total_likes,
      total_engagement = stats.total_engagement,
      engagement_score = stats.engagement_score,
      viral_score      = LEAST(
        (stats.total_engagement / 1000 + stats.source_count * 10)::int,
        100
      ),
      last_seen        = now(),
      updated_at       = now()
    FROM (
      SELECT
        scp.cluster_id,
        COUNT(*)                                 AS post_count,
        COUNT(DISTINCT p.source_id)              AS source_count,
        COALESCE(SUM(p.views), 0)                AS total_views,
        COALESCE(SUM(p.likes), 0)                AS total_likes,
        COALESCE(SUM(p.views + p.likes), 0)      AS total_engagement,
        COALESCE(AVG(p.engagement_score), 0)     AS engagement_score
      FROM social_cluster_posts scp
      JOIN social_posts p ON p.id = scp.post_id
      WHERE scp.cluster_id = ANY($1::uuid[])
      GROUP BY scp.cluster_id
    ) stats
    WHERE sc.id = stats.cluster_id
  `, [clusterIds]);

  console.log(`  Métricas recalculadas para ${clusterIds.length} clusters.`);
}

// ── FASE 5: Recalcular gap_score y opportunity_score ─────────────────────────

async function recalcGapAndOpportunity() {
  console.log('\n═══ FASE 5: gap_score + opportunity_score ═══');

  // Asegurar columna opportunity_score
  await query(`ALTER TABLE social_clusters ADD COLUMN IF NOT EXISTS opportunity_score FLOAT DEFAULT 0`).catch(() => {});

  const { rows: socialClusters } = await query(`
    SELECT id, keywords, viral_score FROM social_clusters WHERE status = 'active' AND keywords IS NOT NULL
  `);

  const { rows: storyClusters } = await query(`
    SELECT keywords FROM story_clusters
    WHERE status IN ('active','ready','growing','breaking') AND keywords IS NOT NULL
    LIMIT 1000
  `).catch(() => ({ rows: [] }));

  let updated = 0;

  if (!storyClusters.length) {
    console.log('  AVISO: sin story_clusters para comparar. gap_score = 1.0 (asumido como brecha total).');
    await query(`
      UPDATE social_clusters
      SET gap_score = 1.0,
          opportunity_score = round((viral_score * 1.0)::numeric, 1)
      WHERE status = 'active'
    `);
    const { rows: [{ cnt }] } = await query(`SELECT count(*) as cnt FROM social_clusters WHERE status='active'`);
    console.log(`  Actualizados (sin story_clusters): ${cnt}`);
    return;
  }

  for (const sc of socialClusters) {
    const kA = Array.isArray(sc.keywords) ? sc.keywords : [];
    const setA = new Set(kA.map(k => String(k).toLowerCase()));
    if (!setA.size) continue;

    let maxJaccard = 0;
    for (const st of storyClusters) {
      const kB = Array.isArray(st.keywords) ? st.keywords : [];
      const setB = new Set(kB.map(k => String(k).toLowerCase()));
      if (!setB.size) continue;
      const inter = [...setA].filter(k => setB.has(k)).length;
      const union = new Set([...setA, ...setB]).size;
      const j = union > 0 ? inter / union : 0;
      if (j > maxJaccard) maxJaccard = j;
    }

    const gap_score = Math.round((1 - maxJaccard) * 100) / 100;
    const opportunity_score = Math.round(gap_score * (sc.viral_score || 0) * 10) / 10;

    await query(
      `UPDATE social_clusters SET gap_score = $1, opportunity_score = $2 WHERE id = $3`,
      [gap_score, opportunity_score, sc.id]
    );
    updated++;
  }

  console.log(`  gap_score + opportunity_score calculados: ${updated} clusters`);
}

// ── FASE 6: Informe final ─────────────────────────────────────────────────────

async function finalReport() {
  console.log('\n═══ FASE 6: Evidencia final ═══');

  const totals = await query(`
    SELECT
      (SELECT count(*) FROM social_posts) as total_posts,
      (SELECT count(*) FROM social_cluster_posts) as posts_clusterizados,
      (SELECT count(*) FROM social_posts WHERE id NOT IN (SELECT post_id FROM social_cluster_posts)) as sin_cluster,
      (SELECT count(*) FROM social_clusters WHERE status='active') as clusters_activos
  `);
  const t = totals.rows[0];
  const cobertura = ((parseInt(t.posts_clusterizados) / parseInt(t.total_posts)) * 100).toFixed(1);

  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log(`  │ Total posts en DB:       ${t.total_posts.toString().padStart(5)}           │`);
  console.log(`  │ Posts clusterizados:     ${t.posts_clusterizados.toString().padStart(5)}           │`);
  console.log(`  │ Posts SIN cluster:       ${t.sin_cluster.toString().padStart(5)}           │`);
  console.log(`  │ Cobertura:              ${cobertura.toString().padStart(5)}%           │`);
  console.log(`  │ Clusters activos:        ${t.clusters_activos.toString().padStart(5)}           │`);
  console.log('  └─────────────────────────────────────────┘');

  // Top 10 oportunidades
  const opps = await query(`
    SELECT left(title,60) as title, viral_score, round(gap_score::numeric,2) as gap,
      round(opportunity_score::numeric,1) as opp,
      CASE WHEN opportunity_score >= 70 THEN 'MUY_ALTA'
           WHEN opportunity_score >= 40 THEN 'MEDIA'
           ELSE 'BAJA' END as prioridad
    FROM social_clusters WHERE status='active' AND opportunity_score > 0
    ORDER BY opportunity_score DESC LIMIT 10
  `);

  console.log('\n  Top 10 oportunidades editoriales:');
  opps.rows.forEach(r =>
    console.log(`  [${r.prioridad.padEnd(8)}] opp=${String(r.opp).padStart(5)} v=${r.viral_score} g=${r.gap}  ${r.title}`)
  );

  // Cobertura por tipo de contenido
  const byType = await query(`
    SELECT p.keywords::text as tipo, count(*) as total,
      count(*) FILTER (WHERE scp.post_id IS NOT NULL) as clusterizados
    FROM social_posts p
    LEFT JOIN social_cluster_posts scp ON scp.post_id = p.id
    GROUP BY p.keywords::text
  `);

  console.log('\n  Cobertura por tipo:');
  byType.rows.forEach(r => {
    const pct = ((parseInt(r.clusterizados) / parseInt(r.total)) * 100).toFixed(0);
    console.log(`    ${r.tipo.padEnd(18)} ${r.clusterizados}/${r.total} (${pct}%)`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  RECLUSTER_ALL — Sprint 7.4 P0                       ');
  console.log('══════════════════════════════════════════════════════');

  try {
    const deleted = await cleanBadPosts();
    await resetClusters();
    const { created, joined, skipped, total } = await reclusterAll();
    await recalcAllMetrics();
    await recalcGapAndOpportunity();
    await finalReport();

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  COMPLETADO');
    console.log(`  Posts eliminados (basura): ${deleted}`);
    console.log(`  Posts procesados:          ${total}`);
    console.log(`  Clusters creados:          ${created}`);
    console.log(`  Posts unidos a clusters:   ${joined}`);
    console.log(`  Posts con pocas keywords:  ${skipped}`);
    console.log('══════════════════════════════════════════════════════\n');
  } catch (e) {
    console.error('\n  ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
