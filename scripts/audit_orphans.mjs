/**
 * Sprint 8.8G — Auditoría de posts huérfanos en clusters
 * Posts que están en social_cluster_posts pero cuya intersección de palabras
 * con el título actual del cluster es 0 o 1.
 * Ejecutar: node scripts/audit_orphans.mjs
 */

import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p = []) => pool.query(sql, p).then(r => r.rows);

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra'
]);

function extractWords(title) {
  if (!title) return [];
  return [...new Set(
    title.toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP_WORDS.has(w))
  )];
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('AUDITORÍA DE POSTS HUÉRFANOS EN CLUSTERS');
  console.log('════════════════════════════════════════════════════════\n');

  const rows = await q(`
    SELECT
      scp.cluster_id,
      sc.title AS cluster_title,
      scp.post_id,
      sp.title AS post_title,
      sp.platform,
      ss.name AS source_name
    FROM social_cluster_posts scp
    JOIN social_clusters sc ON sc.id = scp.cluster_id
    JOIN social_posts sp ON sp.id = scp.post_id
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sc.status = 'active'
    ORDER BY sc.total_engagement DESC, sc.id, sp.captured_at
  `);

  console.log(`Total post-cluster links: ${rows.length}\n`);

  const orphans = [];
  const partial = [];

  for (const row of rows) {
    const cWords = extractWords(row.cluster_title);
    const pWords = extractWords(row.post_title);
    const shared = pWords.filter(w => cWords.includes(w));

    if (shared.length === 0) {
      orphans.push({ ...row, shared });
    } else if (shared.length === 1) {
      partial.push({ ...row, shared });
    }
  }

  const total = rows.length;
  console.log(`Posts con 0 palabras compartidas (huérfanos): ${orphans.length} (${pct(orphans.length, total)}%)`);
  console.log(`Posts con 1 palabra compartida (parciales):   ${partial.length} (${pct(partial.length, total)}%)`);
  console.log(`Posts con ≥2 palabras compartidas (correctos): ${total - orphans.length - partial.length} (${pct(total - orphans.length - partial.length, total)}%)`);

  if (orphans.length > 0) {
    console.log('\n── HUÉRFANOS (0 palabras compartidas) ──────────────────\n');
    let prevCluster = null;
    for (const o of orphans) {
      if (o.cluster_id !== prevCluster) {
        console.log(`\nCluster: "${o.cluster_title.slice(0, 80)}"`);
        console.log(`         Palabras del cluster: [${extractWords(o.cluster_title).join(', ')}]`);
        prevCluster = o.cluster_id;
      }
      console.log(`  [${o.platform}/${o.source_name}] "${o.post_title.slice(0, 80)}"`);
      console.log(`         Palabras del post:    [${extractWords(o.post_title).join(', ')}]`);
    }
  }

  if (partial.length > 0) {
    console.log('\n── PARCIALES (1 palabra compartida) ────────────────────\n');
    let prevCluster = null;
    for (const o of partial.slice(0, 30)) {
      if (o.cluster_id !== prevCluster) {
        console.log(`\nCluster: "${o.cluster_title.slice(0, 80)}"`);
        prevCluster = o.cluster_id;
      }
      console.log(`  [${o.platform}] shared=[${o.shared.join(', ')}] "${o.post_title.slice(0, 80)}"`);
    }
    if (partial.length > 30) console.log(`  ... y ${partial.length - 30} más`);
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log('Resumen por plataforma:\n');

  const byPlatform = {};
  for (const row of rows) {
    const plat = row.platform;
    if (!byPlatform[plat]) byPlatform[plat] = { total: 0, orphans: 0, partial: 0 };
    byPlatform[plat].total++;
  }
  for (const o of orphans) byPlatform[o.platform].orphans++;
  for (const o of partial) byPlatform[o.platform].partial++;

  for (const [plat, stats] of Object.entries(byPlatform)) {
    const correct = stats.total - stats.orphans - stats.partial;
    console.log(`  ${plat.padEnd(10)} total=${stats.total} | huérfanos=${stats.orphans} | parciales=${stats.partial} | correctos=${correct}`);
  }
}

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => pool.end());
