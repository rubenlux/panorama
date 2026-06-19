// Sprint Cost Killer 3 — algorithmic_summary backfill + schema migration
// Usage: node scripts/migrate_cost_killer3.mjs
//
// 1. Add algorithmic_summary column to story_clusters
// 2. Generate algorithmic summaries for all active stories
// 3. Regenerate algorithmic opportunities with category-based templates

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// Pure: detect category from title/type
function detectCategory(title, storyType) {
  const t = (title || '').toLowerCase();
  if (storyType === 'sports' || /\b(gol|partido|liga|copa|equipo|selecci[oó]n|f[uú]tbol|deport|torneo|campe[oó]n)\b/.test(t)) return 'sports';
  if (storyType === 'politics' || /\b(elecci[oó]n|presidente|congreso|gobierno|ministro|senado|pol[ií]tica|electoral|candidato)\b/.test(t)) return 'politics';
  if (/\b(econom[ií]a|econ[oó]mico|d[oó]lar|inflaci[oó]n|precio|banco|mercado|deuda|moneda|pbi)\b/.test(t)) return 'economy';
  if (/\b(accidente|choque|muert|falleci|muri[oó]|herido|incendio|explosi[oó]n|v[ií]ctima|crash)\b/.test(t)) return 'incident';
  if (/\b(crimen|delito|robo|asesinato|violencia|detenci[oó]n|arresto|fiscal|juicio|sentencia|narco)\b/.test(t)) return 'crime';
  return 'general';
}

// Pure: build algorithmic summary
function buildSummary(story, entities = []) {
  const arts = story.article_count;
  const srcs = story.source_count;
  const artW = arts === 1 ? 'artículo' : 'artículos';
  const srcW = srcs === 1 ? 'fuente' : 'fuentes';
  const verb = story.coverage_status === 'breaking' ? 'reportan en tiempo real'
             : story.coverage_status === 'growing'  ? 'siguen de cerca'
             : 'informan sobre';
  let s = `${arts} ${artW} de ${srcs} ${srcW} ${verb} "${story.title}".`;
  if (entities.length > 0) s += ` Involucra a: ${entities.slice(0, 3).join(', ')}.`;
  return s;
}

async function main() {
  console.log('=== Cost Killer 3 Migration ===\n');

  // 1. Add algorithmic_summary column
  console.log('1. Adding algorithmic_summary column to story_clusters…');
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS algorithmic_summary TEXT`);
  console.log('   ✓ Done\n');

  // 2. Ensure trigger column exists (from Cost Killer 2)
  await query(`ALTER TABLE story_opportunities ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) DEFAULT 'ai'`).catch(() => {});

  // 3. Generate summaries for all active stories missing them
  console.log('2. Generating algorithmic summaries for active stories…');
  const { rows: stories } = await query(`
    SELECT sc.id, sc.title, sc.story_type, sc.article_count, sc.source_count,
           sc.coverage_status, sc.importance_score,
           (SELECT json_agg(ke.name ORDER BY ke.name)
            FROM story_entities se
            JOIN knowledge_entities ke ON ke.id = se.entity_id
            WHERE se.story_id = sc.id LIMIT 5) AS entities
    FROM story_clusters sc
    WHERE sc.status IN ('active','ready','followed')
      AND sc.is_recurring = false
      AND (sc.algorithmic_summary IS NULL OR sc.summary IS NULL)
    ORDER BY sc.source_count DESC, sc.article_count DESC
  `);

  let summariesWritten = 0;
  for (const story of stories) {
    const entities = Array.isArray(story.entities) ? story.entities.filter(Boolean) : [];
    const summary = buildSummary(story, entities);
    await query(
      `UPDATE story_clusters SET algorithmic_summary = $1 WHERE id = $2`,
      [summary, story.id]
    );
    summariesWritten++;
  }
  console.log(`   ✓ ${summariesWritten} summaries generated\n`);

  // 4. Regenerate algorithmic opportunities with new category templates
  console.log('3. Regenerating algorithmic opportunities with category templates…');
  const { rows: activeStories } = await query(`
    SELECT sc.id, sc.title, sc.story_type, sc.article_count, sc.source_count,
           sc.coverage_status, sc.importance_score,
           (SELECT json_agg(DISTINCT ts.name)
            FROM story_cluster_articles sca2
            JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
            JOIN tracked_sources ts ON ts.id = ma2.source_id
            WHERE sca2.story_id = sc.id) AS sources,
           (SELECT COUNT(*)::int FROM story_opportunities
            WHERE story_cluster_id = sc.id AND status='pending' AND "trigger"='algorithmic') AS existing
    FROM story_clusters sc
    WHERE sc.status IN ('active','ready')
      AND sc.is_recurring = false
    ORDER BY sc.importance_score DESC NULLS LAST
  `);

  let oppsCreated = 0;

  for (const story of activeStories) {
    if ((story.existing || 0) > 0) continue;

    const sourceList = Array.isArray(story.sources) ? story.sources : [];
    const firstSrc   = sourceList[0] || 'una fuente';
    const arts       = story.article_count;
    const srcs       = story.source_count;
    const srcW       = srcs === 1 ? 'fuente' : 'fuentes';
    const title      = story.title || 'Esta historia';
    const category   = detectCategory(story.title, story.story_type);

    const templates = [];

    if (category === 'incident') {
      if (story.coverage_status === 'breaking') {
        templates.push({ type: 'LIVE_COVERAGE',
          title: `Cronología del incidente: qué se sabe hasta ahora sobre "${title}"`,
          desc: `${arts} artículos de ${srcs} ${srcW}. Cobertura en tiempo real.`,
          urgency: 95, editorial: 88, traffic: 85, seo: 65 });
      }
      if (srcs >= 2) {
        templates.push({ type: 'ANALYSIS',
          title: `Quiénes están involucrados y qué pasó: "${title}"`,
          desc: `Síntesis de ${arts} artículos en ${srcs} medios para una reconstrucción cronológica.`,
          urgency: 80, editorial: 85, traffic: 75, seo: 70 });
      }
      templates.push({ type: 'NEWS',
        title: `Qué se sabe hasta ahora: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 75, editorial: 80, traffic: 72, seo: 68 });
    } else if (category === 'politics') {
      templates.push({ type: 'ANALYSIS',
        title: `Qué cambia para los ciudadanos: "${title}"`,
        desc: `${arts} artículos de ${srcs} medios. Análisis de impacto.`,
        urgency: 65, editorial: 85, traffic: 70, seo: 75 });
      if (srcs >= 3) {
        templates.push({ type: 'ANALYSIS',
          title: `Quiénes apoyan y quiénes rechazan: "${title}"`,
          desc: `${srcs} fuentes con distintos ángulos. Mapa de posiciones.`,
          urgency: 60, editorial: 80, traffic: 65, seo: 72 });
      }
    } else if (category === 'sports') {
      templates.push({ type: 'NEWS',
        title: `Cobertura completa: "${title}"`,
        desc: `${arts} artículos en ${srcs} medios deportivos.`,
        urgency: 75, editorial: 70, traffic: 85, seo: 65 });
      if (srcs >= 3) {
        templates.push({ type: 'ANALYSIS',
          title: `Impacto en tabla de posiciones: "${title}"`,
          desc: `${srcs} fuentes cubren las consecuencias para el torneo.`,
          urgency: 55, editorial: 65, traffic: 80, seo: 70 });
      }
    } else if (category === 'economy') {
      templates.push({ type: 'EXPLAINER',
        title: `Qué significa para los ciudadanos: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 60, editorial: 82, traffic: 68, seo: 78 });
      templates.push({ type: 'ANALYSIS',
        title: `Impacto económico: "${title}"`,
        desc: `Análisis de consecuencias. Base: ${arts} artículos.`,
        urgency: 58, editorial: 85, traffic: 65, seo: 75 });
    } else if (category === 'crime') {
      if (story.coverage_status === 'breaking') {
        templates.push({ type: 'LIVE_COVERAGE',
          title: `Última hora: "${title}"`,
          desc: `Hecho de seguridad con actividad creciente. ${srcs} ${srcW}.`,
          urgency: 90, editorial: 80, traffic: 85, seo: 60 });
      }
      templates.push({ type: 'ANALYSIS',
        title: `Contexto y antecedentes: "${title}"`,
        desc: `${arts} artículos para investigación editorial. ${srcs} ${srcW}.`,
        urgency: 65, editorial: 75, traffic: 70, seo: 72 });
    } else {
      // general
      if (story.coverage_status === 'breaking') {
        templates.push({ type: 'LIVE_COVERAGE',
          title: `Cobertura en vivo: "${title}"`,
          desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW} en la última hora.`,
          urgency: 95, editorial: 85, traffic: 90, seo: 70 });
      }
      if (story.coverage_status === 'growing' && srcs >= 2) {
        templates.push({ type: 'NEWS',
          title: `Historia en crecimiento: "${title}"`,
          desc: `${arts} artículos de ${srcs} ${srcW}. Ganando tracción editorial.`,
          urgency: 70, editorial: 70, traffic: 75, seo: 60 });
      }
      if (srcs >= 4 && arts >= 8) {
        templates.push({ type: 'ANALYSIS',
          title: `Análisis en profundidad: "${title}"`,
          desc: `${arts} artículos de ${srcs} medios. Material para pieza extensa.`,
          urgency: 55, editorial: 75, traffic: 65, seo: 70 });
      }
    }

    // Cross-category structural rules
    if (srcs === 1 && (story.importance_score || 0) >= 5) {
      templates.push({ type: 'NEWS',
        title: `Ventana de exclusiva: solo "${firstSrc}" cubre este tema`,
        desc: `${arts} artículos, una sola fuente. Oportunidad para ser segundo medio.`,
        urgency: 85, editorial: 80, traffic: 60, seo: 50 });
    }
    if (arts >= 6 && srcs <= 2) {
      templates.push({ type: 'NEWS',
        title: `Cobertura concentrada: "${title}"`,
        desc: `${arts} artículos pero solo ${srcs} ${srcW}. Oportunidad para diversificar.`,
        urgency: 60, editorial: 65, traffic: 55, seo: 50 });
    }

    for (const opp of templates) {
      const composite = parseFloat((opp.editorial * 0.4 + opp.traffic * 0.3 + opp.seo * 0.2 + opp.urgency * 0.1).toFixed(2));
      await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'algorithmic')
      `, [story.id, opp.title, opp.desc || '', opp.type,
          opp.traffic, opp.seo, opp.urgency, opp.editorial, composite]).catch(() => {});
      oppsCreated++;
    }
  }
  console.log(`   ✓ ${oppsCreated} algorithmic opportunities created\n`);

  // Final stats
  const { rows: [stats] } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM story_clusters WHERE status IN ('active','ready') AND is_recurring=false) AS active_stories,
      (SELECT COUNT(*)::int FROM story_clusters WHERE algorithmic_summary IS NOT NULL) AS with_algo_summary,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE "trigger"='algorithmic' AND status='pending') AS algo_opps_pending,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE status='pending') AS total_opps_pending
  `);

  console.log('=== Migration Complete ===');
  console.log(`Active stories:              ${stats.active_stories}`);
  console.log(`Stories with algo summary:   ${stats.with_algo_summary}`);
  console.log(`Algo opportunities (pending):${stats.algo_opps_pending}`);
  console.log(`Total opportunities (pending):${stats.total_opps_pending}`);

  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
