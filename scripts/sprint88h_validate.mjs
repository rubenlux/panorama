/**
 * Sprint 8.8H — Validación con datos limpios
 * Replica exactamente lo que hace POST /social/sources/:id/check para cada fuente FB
 * Ejecutar: node scripts/sprint88h_validate.mjs
 */

import pg from 'pg';
import 'dotenv/config';
import { SocialFetcherGraphApiFacebook } from '../src/connectors/social/fetchers.js';
import { clusterNewPosts, recalcClusterMetrics, recalcGapScores } from '../src/jobs/socialMonitor.js';

const TIMESTAMP_INICIO = '2026-06-14T14:27:05.398Z';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p = []) => pool.query(sql, p).then(r => r.rows);

const FB_SOURCES = [
  { id: 'f2e4f5d4-55b4-46a0-a368-4e98397c8e42', name: 'Diario Olé' },
  { id: '7980ecee-aa0a-4eb6-854f-a978c4c22735', name: 'TN' },
  { id: '67d3b0ee-372e-4b94-906a-494b2b01786d', name: 'Noticias Formosa' },
  { id: '330ef26b-b027-47bb-888e-79e62539ce1f', name: 'TyC Sports FB' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSourceRow(id) {
  const rows = await q(`SELECT * FROM social_sources WHERE id = $1`, [id]);
  return rows[0];
}

async function upsertPosts(source, items) {
  let newIds = [];
  for (const item of items) {
    const { rows } = await pool.query(`
      INSERT INTO social_posts
        (source_id, platform, external_id, url, published_at,
         title, content, thumbnail_url,
         views, likes, comments, shares, engagement_score, keywords)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (platform, external_id) DO UPDATE SET
        views            = GREATEST(social_posts.views, EXCLUDED.views),
        likes            = GREATEST(social_posts.likes, EXCLUDED.likes),
        engagement_score = EXCLUDED.engagement_score,
        title            = EXCLUDED.title,
        thumbnail_url    = CASE WHEN EXCLUDED.thumbnail_url <> '' THEN EXCLUDED.thumbnail_url ELSE social_posts.thumbnail_url END
      RETURNING id, (xmax = 0) AS is_new
    `, [
      source.id, source.platform, item.external_id,
      item.url || '', item.published_at || new Date().toISOString(),
      (item.title || '').slice(0, 500), item.content || '', item.thumbnail_url || '',
      item.views || 0, item.likes || 0, item.comments || 0, item.shares || 0,
      item.engagement_score || 0, JSON.stringify(item.keywords || []),
    ]);
    if (rows[0]?.is_new) newIds.push(rows[0].id);
  }
  return newIds;
}

// ── FASE 2: Ejecutar Probar en cada fuente ────────────────────────────────────

async function probarFuente(sourceDef) {
  console.log(`\n━━━ ▶ Probar: ${sourceDef.name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const source = await getSourceRow(sourceDef.id);
  if (!source) { console.log('  ERROR: fuente no encontrada'); return null; }

  let items = [];
  try {
    const fetcher = new SocialFetcherGraphApiFacebook(source);
    items = await fetcher.fetchLatest();
    console.log(`  Scraped: ${items.length} items`);
  } catch (e) {
    console.log(`  ERROR scraping: ${e.message}`);
    return null;
  }

  if (!items.length) { console.log('  Sin resultados'); return { fetched: 0, new_posts: 0, clusters_created: 0, clusters_joined: 0 }; }

  const newIds = await upsertPosts(source, items);
  console.log(`  new_posts: ${newIds.length} / fetched: ${items.length}`);

  let clusters_created = 0, clusters_joined = 0;
  if (newIds.length) {
    const r = await clusterNewPosts(newIds);
    clusters_created = r.created;
    clusters_joined = r.joined;
    if (r.clusterIds.length) {
      await recalcClusterMetrics(r.clusterIds);
      await recalcGapScores();
    }
  }

  console.log(`  clusters_created: ${clusters_created}  clusters_joined: ${clusters_joined}`);
  return { fetched: items.length, new_posts: newIds.length, clusters_created, clusters_joined };
}

// ── FASE 3: Verificar persistencia ───────────────────────────────────────────

async function auditPersistencia() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 3 — PERSISTENCIA');
  console.log('════════════════════════════════════════════════════════\n');

  const rows = await q(`
    SELECT ss.name, COUNT(*) AS posts
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'facebook'
      AND sp.captured_at > $1
    GROUP BY ss.name ORDER BY ss.name
  `, [TIMESTAMP_INICIO]);

  if (!rows.length) { console.log('  ⚠ No hay posts nuevos después del timestamp de inicio'); return; }

  for (const r of rows) console.log(`  ${r.name}: ${r.posts} posts nuevos`);

  // Colisiones external_id
  const collisions = await q(`
    SELECT external_id, COUNT(*) AS n
    FROM social_posts
    WHERE platform = 'facebook' AND captured_at > $1
    GROUP BY external_id HAVING COUNT(*) > 1
  `, [TIMESTAMP_INICIO]);

  console.log(`\n  Colisiones external_id: ${collisions.length === 0 ? '✅ NINGUNA' : '❌ ' + collisions.length}`);
}

// ── FASE 4: Auditoría editorial de clusters nuevos ───────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra'
]);
function extractWords(title) {
  if (!title) return [];
  return [...new Set(
    title.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 4 && !STOP_WORDS.has(w))
  )];
}

async function auditClusters() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 4 + 5 — CLUSTERS Y HUÉRFANOS (datos post-fix)');
  console.log('════════════════════════════════════════════════════════\n');

  // Clusters que tienen al menos 1 post FB nuevo
  const clusters = await q(`
    SELECT DISTINCT sc.id, sc.title, sc.post_count,
      ARRAY_AGG(DISTINCT ss.platform) FILTER (WHERE ss.platform IS NOT NULL) AS platforms
    FROM social_cluster_posts scp
    JOIN social_posts sp ON sp.id = scp.post_id
    JOIN social_clusters sc ON sc.id = scp.cluster_id
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'facebook'
      AND sp.captured_at > $1
      AND sc.status = 'active'
    GROUP BY sc.id, sc.title, sc.post_count
    ORDER BY sc.post_count DESC
    LIMIT 30
  `, [TIMESTAMP_INICIO]);

  console.log(`Clusters con posts FB nuevos: ${clusters.length}\n`);

  let correctos = 0, parciales = 0, incorrectos = 0;
  let orphans = [], partialList = [];

  for (const cluster of clusters) {
    const cWords = extractWords(cluster.title);
    const platforms = (cluster.platforms || []).join('+');

    const posts = await q(`
      SELECT sp.title, ss.platform, ss.name AS source_name, sp.captured_at
      FROM social_cluster_posts scp
      JOIN social_posts sp ON sp.id = scp.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE scp.cluster_id = $1 AND sp.platform = 'facebook' AND sp.captured_at > $2
    `, [cluster.id, TIMESTAMP_INICIO]);

    let clusterCorrect = true, clusterPartial = false;
    const fbOrphansHere = [];

    for (const p of posts) {
      const pWords = extractWords(p.title);
      const shared = pWords.filter(w => cWords.includes(w));
      if (shared.length === 0) {
        fbOrphansHere.push({ post: p.title, shared, cluster: cluster.title });
        clusterCorrect = false;
      } else if (shared.length === 1) {
        partialList.push({ post: p.title.slice(0, 80), shared, cluster: cluster.title.slice(0, 60) });
        clusterPartial = true;
      }
    }

    orphans.push(...fbOrphansHere);

    if (fbOrphansHere.length > 0) incorrectos++;
    else if (clusterPartial) parciales++;
    else correctos++;

    // Print cluster summary
    const verdict = fbOrphansHere.length > 0 ? '❌ INCORRECTO' : clusterPartial ? '⚠ PARCIAL' : '✅ CORRECTO';
    console.log(`  ${verdict} [${platforms}] "${cluster.title.slice(0, 70)}"`);
    for (const p of posts) {
      const pWords = extractWords(p.title);
      const shared = pWords.filter(w => cWords.includes(w));
      const icon = shared.length >= 2 ? '    ✓' : shared.length === 1 ? '    ~' : '    ✗';
      console.log(`${icon} [FB/${p.source_name}] shared=[${shared.join(',')}]`);
      console.log(`       "${p.title.slice(0, 80)}"`);
    }
  }

  const total = correctos + parciales + incorrectos;
  console.log(`\n── RESUMEN EDITORIAL ────────────────────────────────────`);
  console.log(`  CORRECTOS:   ${correctos} (${pct(correctos, total)}%)`);
  console.log(`  PARCIALES:   ${parciales} (${pct(parciales, total)}%)`);
  console.log(`  INCORRECTOS: ${incorrectos} (${pct(incorrectos, total)}%)`);

  console.log(`\n── FASE 5: HUÉRFANOS (shared_words = 0) ────────────────`);
  if (orphans.length === 0) {
    console.log('  ✅ 0 huérfanos nuevos');
  } else {
    console.log(`  ❌ ${orphans.length} huérfanos:`);
    for (const o of orphans) {
      console.log(`  Cluster: "${o.cluster.slice(0, 60)}"`);
      console.log(`  Post:    "${o.post.slice(0, 80)}"`);
    }
  }

  if (partialList.length) {
    console.log(`\n── PARCIALES (1 palabra compartida) ────────────────────`);
    for (const p of partialList) {
      console.log(`  shared=[${p.shared.join(',')}]  cluster="${p.cluster}"`);
      console.log(`           post="${p.post}"`);
    }
  }
}

// ── FASE 6: Thumbnails ────────────────────────────────────────────────────────

async function auditThumbnails() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 6 — THUMBNAILS');
  console.log('════════════════════════════════════════════════════════\n');

  const rows = await q(`
    SELECT ss.name, sp.thumbnail_url
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'facebook'
      AND sp.captured_at > $1
    ORDER BY sp.captured_at DESC
    LIMIT 30
  `, [TIMESTAMP_INICIO]);

  if (!rows.length) { console.log('  Sin posts nuevos para auditar'); return; }

  let ok = 0, noThumb = 0, emoji = 0, rsrc = 0;

  for (const r of rows) {
    const t = r.thumbnail_url;
    if (!t) { noThumb++; continue; }
    if (t.includes('emoji.php')) { emoji++; console.log(`  ❌ EMOJI  [${r.name}] ${t.slice(0, 80)}`); continue; }
    if (t.includes('rsrc.php'))  { rsrc++;  console.log(`  ❌ RSRC   [${r.name}] ${t.slice(0, 80)}`); continue; }
    ok++;
  }

  console.log(`  Total muestra: ${rows.length}`);
  console.log(`  ✅ OK (thumbnail real): ${ok}`);
  console.log(`  ⚪ Sin thumbnail:       ${noThumb}`);
  console.log(`  ❌ emoji.php:           ${emoji}`);
  console.log(`  ❌ rsrc.php:            ${rsrc}`);
  console.log(`\n  Veredicto: ${emoji + rsrc === 0 ? '✅ LIMPIO' : '❌ CONTAMINADO'}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

function pct(n, total) { return total > 0 ? Math.round(n / total * 100) : 0; }

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('SPRINT 8.8H — VALIDACIÓN FACEBOOK CON DATOS LIMPIOS');
  console.log(`TIMESTAMP_INICIO: ${TIMESTAMP_INICIO}`);
  console.log('════════════════════════════════════════════════════════');

  // FASE 2
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 2 — EJECUTAR ▶ PROBAR EN 4 FUENTES');
  console.log('════════════════════════════════════════════════════════');

  const results = {};
  for (const src of FB_SOURCES) {
    results[src.name] = await probarFuente(src);
  }

  // FASE 3
  await auditPersistencia();

  // FASE 4 + 5
  await auditClusters();

  // FASE 6
  await auditThumbnails();

  // FASE 7 — Conclusión
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 7 — RESUMEN EJECUTIVO');
  console.log('════════════════════════════════════════════════════════\n');

  const totalNew = await q(`
    SELECT COUNT(*) AS n FROM social_posts
    WHERE platform = 'facebook' AND captured_at > $1
  `, [TIMESTAMP_INICIO]);

  const totalClusters = await q(`
    SELECT COUNT(DISTINCT scp.cluster_id) AS n
    FROM social_cluster_posts scp
    JOIN social_posts sp ON sp.id = scp.post_id
    WHERE sp.platform = 'facebook' AND sp.captured_at > $1
  `, [TIMESTAMP_INICIO]);

  console.log(`Posts nuevos capturados:   ${totalNew[0].n}`);
  console.log(`Clusters involucrados:     ${totalClusters[0].n}`);

  let totalFetch = 0, totalNuevos = 0;
  for (const [name, r] of Object.entries(results)) {
    if (r) {
      totalFetch += r.fetched || 0;
      totalNuevos += r.new_posts || 0;
      console.log(`  ${name}: fetched=${r.fetched} new=${r.new_posts} created=${r.clusters_created} joined=${r.clusters_joined}`);
    }
  }
}

main()
  .catch(e => { console.error('\nERROR FATAL:', e.message); process.exit(1); })
  .finally(() => pool.end());
