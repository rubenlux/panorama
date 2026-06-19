// Sprint Cost Killer 2 — backfill migration
// Usage: node scripts/migrate_cost_killer2.mjs
//
// 1. Adds trigger column to story_opportunities
// 2. Recalculates importance_score + coverage_status for all active stories
// 3. Generates algorithmic opportunities for stories without recent ones

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

async function main() {
  console.log('=== Cost Killer 2 Backfill Migration ===\n');

  // 1. trigger column
  console.log('1. Adding trigger column to story_opportunities…');
  await query(`ALTER TABLE story_opportunities ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) DEFAULT 'ai'`);
  console.log('   ✓ Done\n');

  // 2. Recalculate importance_score + coverage_status for all active stories
  console.log('2. Recalculating importance_score + coverage_status for active stories…');
  const { rowCount: updated } = await query(`
    UPDATE story_clusters sc
    SET
      importance_score = LEAST(10, GREATEST(1, (
        LEAST(sc.source_count * 2.5, 5.0)
        + LEAST(sc.article_count * 0.5, 3.0)
      )::integer)),
      coverage_status = CASE
        WHEN sc.article_count > 5 AND sc.source_count <= 1 THEN 'cooling'
        ELSE 'monitoring'
      END,
      updated_at = now()
    WHERE sc.status IN ('active', 'ready')
      AND sc.is_recurring = false
  `);
  console.log(`   ✓ ${updated} stories recalculated\n`);

  // 3. Generate algorithmic opportunities for active stories without recent ones
  console.log('3. Generating algorithmic opportunities…');

  const { rows: stories } = await query(`
    SELECT sc.id, sc.title, sc.article_count, sc.source_count,
           sc.coverage_status, sc.importance_score,
           (SELECT json_agg(DISTINCT ts.name)
            FROM story_cluster_articles sca2
            JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
            JOIN tracked_sources ts ON ts.id = ma2.source_id
            WHERE sca2.story_id = sc.id) AS sources,
           (SELECT COUNT(*)::int FROM story_opportunities
            WHERE story_cluster_id = sc.id AND status = 'pending'
              AND "trigger" = 'algorithmic') AS existing_algo_opps
    FROM story_clusters sc
    WHERE sc.status IN ('active', 'ready')
      AND sc.is_recurring = false
    ORDER BY sc.source_count DESC, sc.article_count DESC
  `);

  let oppsCreated = 0;
  let storiesSkipped = 0;

  for (const story of stories) {
    if ((story.existing_algo_opps || 0) > 0) {
      storiesSkipped++;
      continue;
    }

    const sourceList = Array.isArray(story.sources) ? story.sources : [];
    const firstSource = sourceList[0] || 'una fuente';
    const oppsToInsert = [];

    if (story.source_count === 1 && (story.importance_score || 0) >= 5) {
      oppsToInsert.push({
        type: 'NEWS',
        title: `Ventana de exclusiva: solo "${firstSource}" cubre este tema`,
        desc: `Historia con ${story.article_count} artículos cubierta por una sola fuente.`,
        urgency: 85, editorial: 80, traffic: 60, seo: 50,
      });
    }
    if (story.coverage_status === 'breaking') {
      oppsToInsert.push({
        type: 'LIVE_COVERAGE',
        title: `Breaking: actividad inusual en "${story.title}"`,
        desc: `3+ artículos en la última hora de ${story.source_count} fuentes distintas.`,
        urgency: 95, editorial: 85, traffic: 90, seo: 70,
      });
    }
    if (story.coverage_status === 'growing' && story.source_count >= 2) {
      oppsToInsert.push({
        type: 'NEWS',
        title: `Historia en crecimiento: "${story.title}"`,
        desc: `Nuevos artículos en las últimas horas de ${story.source_count} fuentes.`,
        urgency: 70, editorial: 70, traffic: 75, seo: 60,
      });
    }
    if (story.source_count >= 4 && story.article_count >= 8) {
      oppsToInsert.push({
        type: 'ANALYSIS',
        title: `Análisis: "${story.title}"`,
        desc: `${story.article_count} artículos en ${story.source_count} medios.`,
        urgency: 55, editorial: 75, traffic: 65, seo: 70,
      });
    }
    if (story.article_count >= 6 && story.source_count <= 2) {
      oppsToInsert.push({
        type: 'NEWS',
        title: `Cobertura concentrada: "${story.title}"`,
        desc: `${story.article_count} artículos pero solo ${story.source_count} fuentes.`,
        urgency: 60, editorial: 65, traffic: 55, seo: 50,
      });
    }

    for (const opp of oppsToInsert) {
      const composite = parseFloat(
        (opp.editorial * 0.4 + opp.traffic * 0.3 + opp.seo * 0.2 + opp.urgency * 0.1).toFixed(2)
      );
      await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'algorithmic')
      `, [story.id, opp.title, opp.desc, opp.type,
          opp.traffic, opp.seo, opp.urgency, opp.editorial, composite]).catch(() => {});
      oppsCreated++;
    }
  }

  console.log(`   ✓ ${oppsCreated} algorithmic opportunities created`);
  console.log(`   ✓ ${storiesSkipped} stories skipped (already had algorithmic opps)\n`);

  // Summary
  const { rows: [stats] } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM story_clusters WHERE status IN ('active','ready') AND is_recurring=false) AS active_stories,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE "trigger"='algorithmic') AS algo_opps_total,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE "trigger"='ai') AS ai_opps_total
  `);

  console.log('=== Migration Complete ===');
  console.log(`Active stories:              ${stats.active_stories}`);
  console.log(`Algo opportunities (total):  ${stats.algo_opps_total}`);
  console.log(`AI opportunities (total):    ${stats.ai_opps_total}`);

  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
