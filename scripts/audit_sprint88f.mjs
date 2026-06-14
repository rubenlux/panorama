/**
 * Sprint 8.8F — Diagnóstico de clustering y URLs Facebook
 * Ejecutar: node scripts/audit_sprint88f.mjs
 */

import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p=[]) => pool.query(sql, p).then(r => r.rows);

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra'
]);

function extractWords(title) {
  if (!title) return [];
  return title.toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOP_WORDS.has(w));
}

// ── PARTE 1: Clustering — top 15 clusters, por qué fueron agrupados ──────────

async function auditClustering() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('PARTE 1 — AUDITORÍA DE CLUSTERING');
  console.log('════════════════════════════════════════════════════════\n');

  const clusters = await q(`
    SELECT sc.id, sc.title, sc.post_count, sc.keywords,
      ARRAY_AGG(DISTINCT ss.platform) FILTER (WHERE ss.platform IS NOT NULL) AS platforms
    FROM social_clusters sc
    JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
    JOIN social_posts sp ON sp.id = scp.post_id
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sc.status = 'active'
    GROUP BY sc.id, sc.title, sc.post_count, sc.keywords
    ORDER BY sc.total_engagement DESC
    LIMIT 15
  `);

  for (const cluster of clusters) {
    const cWords = extractWords(cluster.title);
    const platforms = (cluster.platforms || []).join('+');

    // Get all posts in this cluster
    const posts = await q(`
      SELECT sp.title, ss.platform, ss.name AS source_name
      FROM social_cluster_posts scp
      JOIN social_posts sp ON sp.id = scp.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE scp.cluster_id = $1
      ORDER BY sp.captured_at ASC
    `, [cluster.id]);

    console.log(`━━━ CLUSTER: "${cluster.title.slice(0, 80)}"`);
    console.log(`    Plataformas: [${platforms}] | Posts: ${cluster.post_count}`);
    console.log(`    Palabras clave del cluster: [${cWords.join(', ')}]`);

    for (const post of posts) {
      const pWords = extractWords(post.title);
      const shared = pWords.filter(w => cWords.includes(w));
      const verdict = shared.length >= 2 ? '✓ MATCH' : (shared.length === 1 ? '~ PARCIAL' : '✗ SIN MATCH (heredado)');
      const isFB = post.platform === 'facebook' ? ' [FB]' : '';
      console.log(`    ${verdict}${isFB} [${post.platform}/${post.source_name}]`);
      if (shared.length > 0) {
        console.log(`          Palabras compartidas: [${shared.join(', ')}]`);
      }
      console.log(`          "${post.title.slice(0, 90)}"`);
    }
    console.log('');
  }
}

// ── PARTE 2: URLs Facebook ────────────────────────────────────────────────────

async function auditUrls() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('PARTE 2 — AUDITORÍA DE URLs FACEBOOK');
  console.log('════════════════════════════════════════════════════════\n');

  const summary = await q(`
    SELECT
      COUNT(*) AS total_fb_posts,
      COUNT(*) FILTER (WHERE url ~ '/posts/|/reel/|/videos/') AS posts_con_permalink,
      COUNT(*) FILTER (WHERE url NOT LIKE '%/posts/%' AND url NOT LIKE '%/reel/%' AND url NOT LIKE '%/videos/%') AS posts_sin_permalink
    FROM social_posts
    WHERE platform = 'facebook'
  `);

  const s = summary[0];
  const pct = s.total_fb_posts > 0
    ? Math.round((s.posts_sin_permalink / s.total_fb_posts) * 100)
    : 0;

  console.log(`Total posts Facebook: ${s.total_fb_posts}`);
  console.log(`Con permalink real:   ${s.posts_con_permalink} (${100 - pct}%)`);
  console.log(`Con URL de página:    ${s.posts_sin_permalink} (${pct}%)`);

  const bySource = await q(`
    SELECT
      ss.name AS source,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE p.url ~ '/posts/|/reel/|/videos/') AS con_permalink,
      COUNT(*) FILTER (WHERE p.url NOT LIKE '%/posts/%' AND p.url NOT LIKE '%/reel/%' AND p.url NOT LIKE '%/videos/%') AS sin_permalink
    FROM social_posts p
    JOIN social_sources ss ON ss.id = p.source_id
    WHERE p.platform = 'facebook'
    GROUP BY ss.name
    ORDER BY total DESC
  `);

  console.log('\nPor fuente:');
  for (const row of bySource) {
    const pct2 = row.total > 0 ? Math.round((row.sin_permalink / row.total) * 100) : 0;
    console.log(`  ${row.source}: ${row.total} posts — permalink: ${row.con_permalink} | fallback: ${row.sin_permalink} (${pct2}%)`);
  }

  // Sample of the "wrong" URLs
  const wrongSamples = await q(`
    SELECT p.url, ss.name AS source, p.title
    FROM social_posts p
    JOIN social_sources ss ON ss.id = p.source_id
    WHERE p.platform = 'facebook'
      AND p.url NOT LIKE '%/posts/%'
      AND p.url NOT LIKE '%/reel/%'
      AND p.url NOT LIKE '%/videos/%'
    LIMIT 5
  `);

  if (wrongSamples.length > 0) {
    console.log('\nEjemplos de URLs fallback:');
    for (const r of wrongSamples) {
      console.log(`  [${r.source}] ${r.url}`);
      console.log(`    "${r.title.slice(0, 70)}"`);
    }
  }
}

// ── PARTE 3: Falsos positivos de clustering ───────────────────────────────────

async function auditFalsePositives() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('PARTE 3 — FALSOS POSITIVOS: CLUSTERS MIXTOS YT+FB');
  console.log('════════════════════════════════════════════════════════\n');

  const mixed = await q(`
    SELECT sc.id, sc.title, sc.post_count,
      COUNT(DISTINCT ss.platform) AS platform_count,
      ARRAY_AGG(DISTINCT ss.platform) AS platforms
    FROM social_clusters sc
    JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
    JOIN social_posts sp ON sp.id = scp.post_id
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sc.status = 'active'
    GROUP BY sc.id, sc.title, sc.post_count
    HAVING COUNT(DISTINCT ss.platform) > 1
    ORDER BY sc.total_engagement DESC
    LIMIT 10
  `);

  console.log(`Clusters con mix de plataformas: ${mixed.length}`);
  for (const c of mixed) {
    const platforms = (c.platforms || []).join('+');
    console.log(`\n  [${platforms}] "${c.title.slice(0, 80)}" (${c.post_count} posts)`);

    // Show what words caused each platform post to join
    const fbPosts = await q(`
      SELECT sp.title
      FROM social_cluster_posts scp
      JOIN social_posts sp ON sp.id = scp.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE scp.cluster_id = $1 AND ss.platform = 'facebook'
    `, [c.id]);

    if (fbPosts.length > 0) {
      const cWords = extractWords(c.title);
      for (const p of fbPosts) {
        const pWords = extractWords(p.title);
        const shared = pWords.filter(w => cWords.includes(w));
        console.log(`  → FB: "${p.title.slice(0, 80)}"`);
        console.log(`       Palabras compartidas: [${shared.join(', ')}]`);
      }
    }
  }
}

async function main() {
  try {
    await auditClustering();
    await auditUrls();
    await auditFalsePositives();
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
