/**
 * Sprint 5.5 pre-implementation audit.
 * Analyzes last 500 MONITOR entities + their article clusters
 * to classify editorial quality and expose story-vs-noise patterns.
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('\n=== SPRINT 5.5 — STORY INTELLIGENCE PRE-AUDIT ===\n');

  // ── 1. Raw entity quality distribution ──────────────────────────────────────
  const { rows: entityStats } = await query(`
    SELECT
      ke.name,
      ke.entity_type,
      ke.mention_count,
      COUNT(DISTINCT aem.article_id)::int            AS article_count,
      COUNT(DISTINCT ma.source_id)::int              AS source_count,
      MIN(ma.detected_at)::date                      AS first_seen,
      MAX(ma.detected_at)::date                      AS last_seen,
      ARRAY_AGG(DISTINCT ts.name ORDER BY ts.name)   AS sources
    FROM knowledge_entities ke
    JOIN article_entity_matches aem ON aem.entity_id = ke.id
    JOIN monitored_articles ma      ON ma.id = aem.article_id
    JOIN tracked_sources ts         ON ts.id = ma.source_id
    WHERE ke.entity_origin = 'MONITOR'
    GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
    ORDER BY article_count DESC, source_count DESC
    LIMIT 500
  `);

  console.log(`Total MONITOR entities with articles: ${entityStats.length}`);

  // ── 2. Classify each entity ─────────────────────────────────────────────────
  const NOISE_WORDS = new Set([
    'video', 'foto', 'imagen', 'galeria', 'audio', 'nota',
    'gobierno', 'pais', 'mundo', 'nacion', 'pueblo', 'sociedad',
    'salud', 'economia', 'politica', 'cultura', 'deporte', 'tecnologia',
    'hoy', 'ayer', 'mañana', 'semana', 'mes', 'año',
    'nuevo', 'nueva', 'gran', 'importante',
    'argentina', 'buenos aires',   // too generic unless linked to specific event
    'mundial', 'copa',
  ]);

  const GENERIC_PATTERNS = [
    /^\d+$/, // pure numbers
    /^[A-Z]{1,2}$/, // single letters
    /^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i,
    /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i,
  ];

  function classify(e) {
    const nameLower = e.name.toLowerCase();
    if (NOISE_WORDS.has(nameLower)) return 'NOISE';
    if (GENERIC_PATTERNS.some(p => p.test(e.name))) return 'NOISE';
    if (e.name.length <= 2) return 'NOISE';

    // High-quality: multi-source, specific name
    if (e.source_count >= 3 || e.article_count >= 5) return 'EDITORIAL_VALUE';
    if (e.source_count >= 2) return 'WATCH';

    // Single source, single mention → borderline
    if (e.article_count === 1 && e.source_count === 1) return 'LOW_SIGNAL';

    return 'WATCH';
  }

  const classified = entityStats.map(e => ({ ...e, classification: classify(e) }));

  const groups = {
    EDITORIAL_VALUE: classified.filter(e => e.classification === 'EDITORIAL_VALUE'),
    WATCH:           classified.filter(e => e.classification === 'WATCH'),
    LOW_SIGNAL:      classified.filter(e => e.classification === 'LOW_SIGNAL'),
    NOISE:           classified.filter(e => e.classification === 'NOISE'),
  };

  console.log('\n── CLASSIFICATION SUMMARY ──────────────────────────────────────');
  for (const [k, v] of Object.entries(groups)) {
    console.log(`  ${k.padEnd(18)}: ${String(v.length).padStart(3)} entities`);
  }

  // ── 3. Editorial value entities (top stories) ───────────────────────────────
  console.log('\n── TOP EDITORIAL VALUE ENTITIES ────────────────────────────────');
  for (const e of groups.EDITORIAL_VALUE.slice(0, 20)) {
    console.log(`  [${e.source_count}src / ${e.article_count}art] ${e.name.padEnd(35)} → ${e.sources.slice(0, 3).join(', ')}${e.sources.length > 3 ? ` +${e.sources.length - 3}` : ''}`);
  }

  // ── 4. Noise entities ────────────────────────────────────────────────────────
  console.log('\n── NOISE ENTITIES (sample) ─────────────────────────────────────');
  for (const e of groups.NOISE.slice(0, 20)) {
    console.log(`  [${e.source_count}src / ${e.article_count}art] ${e.name}`);
  }

  // ── 5. Co-occurrence analysis: which entities appear together? ───────────────
  // This reveals "proto-stories" — groups of entities that travel together
  console.log('\n── CO-OCCURRENCE CLUSTERS (proto-stories) ──────────────────────');
  const { rows: coOcc } = await query(`
    WITH article_entities AS (
      SELECT
        aem.article_id,
        ARRAY_AGG(ke.name ORDER BY ke.name) AS entities,
        COUNT(*)::int AS entity_count
      FROM article_entity_matches aem
      JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE ke.entity_origin = 'MONITOR'
        AND ke.mention_count >= 2
      GROUP BY aem.article_id
      HAVING COUNT(*) >= 2
    )
    SELECT
      entities,
      COUNT(*)::int AS article_count,
      MIN(ma.detected_at) AS first_seen,
      MAX(ma.detected_at) AS last_seen
    FROM article_entities ae
    JOIN monitored_articles ma ON ma.id = ae.article_id
    GROUP BY entities
    HAVING COUNT(*) >= 2
    ORDER BY article_count DESC
    LIMIT 20
  `);

  if (coOcc.length > 0) {
    for (const c of coOcc) {
      const age = Math.round((Date.now() - new Date(c.last_seen)) / 3600000);
      console.log(`  [${c.article_count}art] {${c.entities.join(' + ')}} — last: ${age}h ago`);
    }
  } else {
    console.log('  No co-occurrences found (need more monitor data)');
  }

  // ── 6. Title similarity clusters — group by keyword overlap ─────────────────
  console.log('\n── RECENT ARTICLES (last 24h) BY KEYWORD CLUSTERS ─────────────');
  const { rows: recentArticles } = await query(`
    SELECT
      ma.id,
      ma.title,
      ts.name AS source_name,
      ma.detected_at
    FROM monitored_articles ma
    JOIN tracked_sources ts ON ts.id = ma.source_id
    WHERE ma.detected_at > now() - interval '24 hours'
    ORDER BY ma.detected_at DESC
    LIMIT 200
  `);

  const TITLE_STOPWORDS = new Set([
    'el','la','los','las','un','una','de','del','en','al','por','con',
    'sin','para','sobre','y','o','que','se','su','sus','es','son','ha',
    'han','no','si','más','ya','pero','como','cuando','donde','cual',
    'este','esta','estos','estas','fue','era','ser','con','entre',
    'the','of','is','in','and','or','to','for','at','by','on','a',
    'argentina','buenos','aires', // high-frequency noise for this dataset
  ]);

  function titleKeywords(title) {
    return title.toLowerCase()
      .replace(/[¿¡«»:,;!?()[\]{}"']/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !TITLE_STOPWORDS.has(w) && !/^\d+$/.test(w));
  }

  function jaccardSim(setA, setB) {
    const a = new Set(setA), b = new Set(setB);
    const intersection = [...a].filter(x => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
  }

  // Group articles by keyword overlap (greedy clustering)
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < recentArticles.length; i++) {
    if (assigned.has(i)) continue;
    const kwI = titleKeywords(recentArticles[i].title);
    if (kwI.length < 2) continue;

    const cluster = [i];
    assigned.add(i);

    for (let j = i + 1; j < recentArticles.length; j++) {
      if (assigned.has(j)) continue;
      const kwJ = titleKeywords(recentArticles[j].title);
      if (kwJ.length < 2) continue;
      if (jaccardSim(kwI, kwJ) >= 0.25) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    if (cluster.length >= 2) {
      clusters.push(cluster);
    }
  }

  clusters.sort((a, b) => b.length - a.length);

  let shownClusters = 0;
  for (const clusterIdxs of clusters.slice(0, 15)) {
    const articles = clusterIdxs.map(i => recentArticles[i]);
    const sources  = [...new Set(articles.map(a => a.source_name))];
    if (articles.length < 2) continue;
    shownClusters++;
    const age = Math.round((Date.now() - new Date(articles[0].detected_at)) / 3600000);
    console.log(`\n  PROTO-STORY [${articles.length} arts / ${sources.length} srcs] — ${age}h ago`);
    console.log(`  Fuentes: ${sources.join(', ')}`);
    for (const a of articles.slice(0, 4)) {
      console.log(`    • ${a.title.slice(0, 90)}`);
    }
    if (articles.length > 4) console.log(`    … +${articles.length - 4} más`);
  }

  if (shownClusters === 0) {
    console.log('  No proto-stories detected in last 24h (may need more articles)');
  }

  // ── 7. Structural diagnosis ─────────────────────────────────────────────────
  console.log('\n── STRUCTURAL DIAGNOSIS ────────────────────────────────────────');

  const totalEntities = classified.length;
  const noiseRatio    = groups.NOISE.length / Math.max(totalEntities, 1);
  const signalRatio   = groups.EDITORIAL_VALUE.length / Math.max(totalEntities, 1);

  console.log(`  Total entities analyzed:   ${totalEntities}`);
  console.log(`  Noise ratio:               ${(noiseRatio * 100).toFixed(1)}%`);
  console.log(`  Editorial value ratio:     ${(signalRatio * 100).toFixed(1)}%`);
  console.log(`  Recent articles (24h):     ${recentArticles.length}`);
  console.log(`  Proto-stories detected:    ${shownClusters}`);

  if (noiseRatio > 0.3) {
    console.log('\n  ⚠  HIGH NOISE: >30% of entities are editorial noise.');
    console.log('     Story-level clustering is the correct solution.');
  }
  if (recentArticles.length < 10) {
    console.log('\n  ⚠  LOW DATA: fewer than 10 articles in last 24h.');
    console.log('     Monitor may not be running or sources need enabling.');
  }
  if (shownClusters > 0) {
    console.log(`\n  ✓  ${shownClusters} proto-stories detectable via keyword similarity alone.`);
    console.log('     Hybrid clustering will significantly improve editorial signal.');
  }

  console.log('\n=== AUDIT COMPLETE ===\n');
  process.exit(0);
}

run().catch(err => {
  console.error('AUDIT FAILED:', err.message);
  process.exit(1);
});
