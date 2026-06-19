// Social Clustering 2.0 — full rebuild
// Usage: node scripts/rebuild_social_clusters.mjs
//
// 1. Add detected_category column (idempotent)
// 2. Delete all social_cluster_posts and social_clusters
// 3. Re-process social_posts from last 30 days in chronological order
//    using the new 3-gate algorithm (Category → Specific-keyword → Jaccard)
// 4. Recalculate metrics for all rebuilt clusters

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ── Constants (must match socialMonitor.js) ──────────────────────────────────

const REBUILD_DAYS = 30;

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra',
  'bien','solo','debe','hace','sido','cada','otro','otra','todo','toda','algo',
  'poco','nada','aqui','alla','caso','vida','dias','anos','hora','hizo','tuvo',
  'sera','dice','dijo','dado','otro','cabe','unas','unos','cual','cuya',
]);

const SOCIAL_GENERIC_TERMS = new Set([
  'argentina', 'estados', 'unidos', 'buenos', 'aires',
  'mundial', 'mundo',
  'pais', 'ciudad', 'nacion', 'publica',
  'nuevo', 'nueva',
]);

const SOCIAL_CATEGORY_PATTERNS = {
  sports: [
    /\bgol\b/, /\bpartido\b/, /\bliga\b/, /\bcopa\b/, /\bequipo\b/,
    /\bseleccion\b/, /\bfutbol\b/, /\brugby\b/, /\btenis\b/,
    /\bbasket\b/, /\bdeport/, /\bcancha\b/, /\btorneo\b/,
    /\bcampeon\b/, /\bfixture\b/, /\bclasico\b/, /\bsuperliga\b/,
    /\bpremier\b/, /\bchampions\b/, /\briver\b/, /\bboca\b/,
    /\bfichaje\b/, /\brefuerzo\b/, /\btransferencia\b/, /\bjugador\b/,
    /\bentrenador\b/, /\bdirector.*tecnico\b/, /\bpase\b/,
    /\bformacion\b/, /\bconvocado\b/, /\barbitro\b/, /\boffsid/,
  ],
  international: [
    /\birak\b/, /\bisrael\b/, /\bgaza\b/, /\bucrania\b/,
    /\biran\b/, /\beeuu\b/, /\bestados.*unidos\b/,
    /\brusia\b/, /\bchina\b/, /\beuropa\b/,
    /\botan\b/, /\bonu\b/, /\bguerra\b/, /\bbomba\b/,
    /\bmisil\b/, /\bdiplom/, /\bcancilleria\b/, /\bembajad/,
    /\bnuclear\b/, /\bconflicto.*internaci/, /\bsancion\b/,
    /\bgeopolit/, /\bbloqueo\b/, /\bgolpe.*estado/,
  ],
  politics: [
    /\bmilei\b/, /\bkirchn/, /\bmacri\b/, /\bmassa\b/,
    /\bcongreso\b/, /\bsenado\b/, /\bdiputado\b/, /\bministro\b/,
    /\bdecreto\b/, /\bveto\b/, /\beleccion\b/, /\bvotacion\b/,
    /\boficialismo\b/, /\boposicion\b/, /\bcoalicion\b/,
    /\bcasarosada\b/, /\bpresidenta\b/, /\bgobernador\b/,
    /\bintendente\b/, /\blegislatura\b/, /\bpartido.*politico/,
  ],
  economy: [
    /\bdolar\b/, /\binflacion\b/, /\breservas\b/, /\bfmi\b/,
    /\bdeuda\b/, /\bbolsa\b/, /\beconomia\b/, /\brecesion\b/,
    /\bimpuesto\b/, /\barancel\b/, /\bpresupuesto\b/,
    /\bbanco.*central\b/, /\bpbi\b/, /\bpib\b/, /\bfinancier/,
    /\bcriptomoneda\b/, /\bbitcoin\b/, /\bmercado.*financ/,
    /\bdevalua/, /\bcepo\b/, /\bsubsidio\b/,
  ],
  security: [
    /\bcrimen\b/, /\bhomicidio\b/, /\basesinato\b/, /\brobo\b/, /\basalto\b/,
    /\btiroteo\b/, /\bbalacera\b/, /\bsecuestro\b/,
    /\bincendio\b/, /\bexplosion\b/, /\bmuertos\b/, /\bvictima/,
    /\bdetenido\b/, /\boperativo\b/, /\bpolicial\b/,
    /\bnarcotrafic/, /\baccidente.*vial\b/, /\bsiniestro\b/,
    /\bherido\b/, /\bfalleci/, /\batropell/,
  ],
  entertainment: [
    /\bactor\b/, /\bactriz\b/, /\bcantante\b/, /\bmusica\b/, /\bshow\b/,
    /\bconcierto\b/, /\bfestival\b/, /\bpelicula\b/, /\bserie\b/, /\bnetflix\b/,
    /\btelevision\b/, /\bcelebrid/, /\bfamoso\b/, /\bescandalo\b/,
    /\bespectaculo\b/, /\bcine\b/, /\bteatro\b/, /\bstreaming\b/,
    /\bchisme\b/, /\binfluencer\b/, /\btiktok\b/, /\binstagram\b/,
  ],
  society: [
    /\beducacion\b/, /\bsalud\b/, /\bderechos\b/, /\bprotesta\b/, /\bhuelga\b/,
    /\bvivienda\b/, /\bpobreza\b/, /\bdiscriminacion\b/, /\bfeminismo\b/,
    /\bclima\b/, /\becologia\b/, /\bmedioambiente\b/, /\breligion\b/,
    /\bciencia\b/, /\btecnologia\b/, /\binnovacion\b/, /\bcomunidad\b/,
  ],
};

const SOCIAL_CATEGORY_PRECEDENCE = [
  'security', 'international', 'politics', 'economy',
  'sports', 'entertainment', 'society',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectSocialCategory(title) {
  const t = (title || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const scores = {};
  for (const [cat, patterns] of Object.entries(SOCIAL_CATEGORY_PATTERNS)) {
    scores[cat] = patterns.filter(p => p.test(t)).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'general';
  return SOCIAL_CATEGORY_PRECEDENCE.find(cat => scores[cat] === maxScore) || 'general';
}

function extractWords(title) {
  if (!title) return [];
  return [...new Set(
    title.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !/^\d+$/.test(w) && !STOP_WORDS.has(w))
  )];
}

// ── Phases ───────────────────────────────────────────────────────────────────

async function phase1_schema() {
  console.log('Phase 1: Schema migration…');
  await query(`ALTER TABLE social_clusters ADD COLUMN IF NOT EXISTS detected_category VARCHAR(30) DEFAULT 'general'`).catch(() => {});
  console.log('   ✓ detected_category column ensured\n');
}

async function phase2_clean() {
  console.log('Phase 2: Clearing existing clusters…');
  const { rowCount: posts } = await query(`DELETE FROM social_cluster_posts`);
  const { rowCount: clusters } = await query(`DELETE FROM social_clusters`);
  console.log(`   ✓ Deleted ${posts} social_cluster_posts`);
  console.log(`   ✓ Deleted ${clusters} social_clusters\n`);
}

async function phase3_rebuild() {
  console.log(`Phase 3: Rebuilding from last ${REBUILD_DAYS} days…`);

  const { rows: posts } = await query(`
    SELECT id, title, views, source_id, captured_at
    FROM social_posts
    WHERE captured_at > now() - interval '${REBUILD_DAYS} days'
    ORDER BY captured_at ASC
  `);

  console.log(`   ${posts.length} posts to process`);

  // In-memory cluster signatures — same structure as runtime
  const activeClusters = [];
  let created = 0, joined = 0;

  for (const post of posts) {
    const words = extractWords(post.title);
    if (words.length < 2) continue;

    const postCategory = detectSocialCategory(post.title);
    const specificWords = words.filter(w => !SOCIAL_GENERIC_TERMS.has(w));

    let bestClusterId = null;
    let bestScore     = 0;

    for (const cluster of activeClusters) {
      // Gate 1: category
      const clusterCat = cluster.detected_category;
      if (postCategory !== 'general' && clusterCat !== 'general' && postCategory !== clusterCat) {
        continue;
      }

      const cWords    = extractWords(cluster.title);
      const cSpecific = cWords.filter(w => !SOCIAL_GENERIC_TERMS.has(w));

      let jaccard;

      if (specificWords.length > 0 && cSpecific.length > 0) {
        // Gate 2: at least 1 specific word shared
        const specificIntersection = specificWords.filter(w => cSpecific.includes(w));
        if (specificIntersection.length === 0) continue;
        // Gate 3: Jaccard on specific words ≥ 0.15
        const specificUnion = new Set([...specificWords, ...cSpecific]).size;
        jaccard = specificIntersection.length / specificUnion;
        if (jaccard < 0.15) continue;
      } else {
        // Both sides vague: fall back to all-word Jaccard ≥ 0.20
        const allIntersection = words.filter(w => cWords.includes(w));
        if (allIntersection.length < 2) continue;
        const allUnion = new Set([...words, ...cWords]).size;
        jaccard = allIntersection.length / allUnion;
        if (jaccard < 0.20) continue;
      }

      if (jaccard > bestScore) {
        bestScore     = jaccard;
        bestClusterId = cluster.id;
      }
    }

    if (bestClusterId) {
      await query(
        `INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [bestClusterId, post.id]
      );
      joined++;
    } else {
      const topWords = words.slice(0, 8);
      const views = post.views || 0;
      const { rows: [nc] } = await query(`
        INSERT INTO social_clusters
          (title, keywords, detected_category, post_count, source_count, sources_count,
           total_views, total_likes, total_engagement,
           engagement_score, viral_score, status, first_seen, last_seen)
        VALUES ($1, $2, $3, 1, 1, 1, $4::bigint, 0, $4::bigint, $4::float,
                LEAST(GREATEST(($4::float / 500)::int, 5), 30),
                'active', now(), now())
        RETURNING id
      `, [post.title.slice(0, 200), JSON.stringify(topWords), postCategory, views]);
      await query(
        `INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [nc.id, post.id]
      );
      activeClusters.push({ id: nc.id, title: post.title, detected_category: postCategory });
      created++;
    }

    if ((created + joined) % 200 === 0 && created + joined > 0) {
      process.stdout.write(`   Progress: ${created + joined}/${posts.length}…\r`);
    }
  }

  console.log(`   ✓ Created ${created} new clusters`);
  console.log(`   ✓ Joined ${joined} posts to existing clusters\n`);

  return activeClusters.map(c => c.id);
}

async function phase4_metrics(clusterIds) {
  if (!clusterIds.length) return;
  console.log(`Phase 4: Recalculating metrics for ${clusterIds.length} clusters…`);

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

  console.log('   ✓ Metrics updated\n');
}

async function report() {
  const { rows: [totals] } = await query(`
    SELECT COUNT(*) AS clusters, SUM(post_count) AS posts FROM social_clusters
  `);
  const { rows: catDist } = await query(`
    SELECT COALESCE(detected_category, 'general') AS cat, COUNT(*) AS cnt
    FROM social_clusters
    GROUP BY cat ORDER BY cnt DESC
  `);

  console.log('=== Final State ===');
  console.log(`Clusters : ${totals.clusters}`);
  console.log(`Posts    : ${totals.posts}`);
  console.log('\nCategory distribution:');
  for (const { cat, cnt } of catDist) {
    console.log(`  ${(cat || 'general').padEnd(15)} ${cnt}`);
  }
}

async function main() {
  console.log('=== Social Clustering 2.0 — Full Rebuild ===\n');
  const t0 = Date.now();

  await phase1_schema();
  await phase2_clean();
  const clusterIds = await phase3_rebuild();
  await phase4_metrics(clusterIds);
  await report();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Rebuild complete in ${elapsed}s`);
  await pool.end();
}

main().catch(err => {
  console.error('\nRebuild failed:', err.message);
  pool.end();
  process.exit(1);
});
