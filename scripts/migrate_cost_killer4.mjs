// Sprint Cost Killer 4 — expand category system from 5 to 10 categories
// Usage: node scripts/migrate_cost_killer4.mjs
//
// 1. Archive stale algorithmic opportunities (built with old 5-category templates)
// 2. Re-run algorithmic opportunity generation with new 10-category templates
// 3. Report stats

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ── Category detection (10 categories, scoring-based) ────────────────────────

const CATEGORY_PATTERNS = {
  judicial:      [
    /\bjuicio\b/, /\bsentenci[ao]\b/, /\bcondena\b/, /\bfall[oó]\b/,
    /\bveredicto\b/, /\btribunal\b/, /\bjuzgad[ao]\b/, /\bprocesad[ao]\b/,
    /\bimputad[ao]\b/, /\bacusad[ao]\b/, /\bfiscal\b/, /\bextradici[oó]n\b/,
    /\bjuez[ao]?\b/, /\bquerella\b/, /\bamparo\b/, /\bperitaje\b/,
    /\bindagatori/, /\bc[aá]mara.*penal/, /\bdelitos.*econ/,
  ],
  security:      [
    /\bcrimen\b/, /\brobo\b/, /\basalto\b/, /\basesinato\b/, /\bhomicidio\b/,
    /\bmatan\b/, /\bmat[oó] a\b/, /\bsecuestro\b/, /\bbalacera\b/, /\btiroteo\b/,
    /\bnarco[^s]/, /\baccidente\b/, /\bincendio\b/, /\bexplosi[oó]n\b/,
    /\bv[ií]ctima/, /\bcolisi[oó]n\b/, /\bderrumb/, /\bmuertos\b/,
    /\bheridos\b/, /\bfalleci/, /\batropell/, /\boperativo.*polici/,
  ],
  international: [
    /\binternacional\b/, /\bmundial\b/, /\bglobal\b/, /\bonu\b/,
    /\beeuu\b/, /\bestados unidos\b/, /\beuropa\b/, /\bchina\b/,
    /\brusia\b/, /\bbrasil\b/, /\bguerra\b/, /\bdiplom[aá]tic/,
    /\bcanciller[ií]a\b/, /\bembajad/, /\bcumbre.*internaci/, /\bmigrante\b/,
    /\brefugiado\b/, /\bucrania\b/, /\bisrael\b/, /\bgaza\b/,
    /\botan\b/, /\bg7\b/, /\bg20\b/,
  ],
  politics:      [
    /\belecci[oó]n\b/, /\bpresidente\b/, /\bcongreso\b/, /\bgobierno\b/,
    /\bministr[ao]\b/, /\bsenad[ao]\b/, /\bdiputad[ao]\b/, /\bpol[ií]tic[ao]\b/,
    /\belectoral\b/, /\bvotaci[oó]n\b/, /\bcandidato\b/, /\blegisla/,
    /\bgobernador\b/, /\bintendente\b/, /\bdecreto\b/, /\bveto\b/,
    /\bsesi[oó]n\b/, /\boficialismo\b/, /\boposici[oó]n\b/,
  ],
  economy:       [
    /\beconom[ií]a\b/, /\becon[oó]mic[ao]\b/, /\bd[oó]lar\b/, /\binflaci[oó]n\b/,
    /\bprecios\b/, /\bbanco\b/, /\bmercado\b/, /\binversi[oó]n\b/,
    /\bdeuda\b/, /\bmoneda\b/, /\bpbi\b/, /\bpib\b/, /\bbolsa\b/,
    /\bexportaci[oó]n\b/, /\bimportaci[oó]n\b/, /\bimpuesto\b/,
    /\barancel\b/, /\bpresupuesto\b/, /\breservas\b/, /\bfinanci[ae]r/,
    /\bd[eé]ficit\b/, /\bsuperh[aá]vit\b/,
  ],
  health:        [
    /\bsalud\b/, /\benfermedad\b/, /\bpandemia\b/, /\bepidemia\b/,
    /\bvacun[ao]\b/, /\bhospital\b/, /\bm[eé]dic[ao]\b/, /\bcl[ií]nica\b/,
    /\bvirus\b/, /\bbacteria\b/, /\bbrote\b/, /\bcontagio\b/,
    /\bc[aá]ncer\b/, /\bdiabetes\b/, /\bcard[ií]ac/, /\bcirug[ií]a\b/,
    /\bf[aá]rmaco\b/, /\bmedicamento\b/, /\boms\b/, /\bterapia\b/,
    /\bpaciente\b/, /\bsanitari[ao]\b/,
  ],
  technology:    [
    /\btecnolog[ií]a\b/, /\bdigital\b/, /\binteligencia artificial\b/,
    /\bsoftware\b/, /\binternet\b/, /\bstartup\b/, /\binnovaci[oó]n\b/,
    /\bciberseguridad\b/, /\bhackeo\b/, /\bhacker\b/, /\bredes sociales\b/,
    /\bcriptomoneda\b/, /\bbitcoin\b/, /\bopenai\b/, /\bchatgpt\b/,
    /\b5g\b/, /\bdrone\b/, /\bblockchain\b/, /\bapp\b/,
  ],
  sports:        [
    /\bgol\b/, /\bpartido\b/, /\bliga\b/, /\bcopa\b/, /\bequipo\b/,
    /\bselecci[oó]n\b/, /\bf[uú]tbol\b/, /\brugby\b/, /\btenis\b/,
    /\bbasket\b/, /\bdeport/, /\bcancha\b/, /\btorneo\b/,
    /\bcampe[oó]n\b/, /\bfixture\b/, /\bcl[aá]sico\b/, /\bsuperliga\b/,
    /\bpremier\b/, /\bchampions\b/, /\briver\b/, /\bboca\b/,
  ],
  entertainment: [
    /\bespect[aá]culo\b/, /\bcine\b/, /\bm[uú]sica\b/, /\bartista\b/,
    /\bactor\b/, /\bactriz\b/, /\bcantante\b/, /\bshow\b/, /\bconcierto\b/,
    /\bfestival\b/, /\bserie\b/, /\bpel[ií]cula\b/, /\bstreaming\b/,
    /\bnetflix\b/, /\btelevisi[oó]n\b/, /\bfamoso\b/, /\bcelebridad\b/,
    /\breality\b/, /\bteatro\b/, /\bgrammy\b/, /\bemmy\b/, /\boscar\b/,
  ],
  society:       [
    /\beducaci[oó]n\b/, /\bescuela\b/, /\buniversidad\b/, /\bdocente\b/,
    /\bcultura\b/, /\bderechos\b/, /\bg[eé]nero\b/, /\bpobreza\b/,
    /\bvivienda\b/, /\bfamilia\b/, /\binfancia\b/, /\bdiscapacidad\b/,
    /\breligi[oó]n\b/, /\becolog[ií]a\b/, /\binundaci[oó]n\b/,
    /\bhuelga\b/, /\bprotesta\b/, /\bmarcha\b/, /\bbarrio\b/,
    /\bcomunidad\b/, /\bambiente\b/, /\bclim[aá]tic/,
  ],
};

const PRECEDENCE = ['judicial', 'security', 'international', 'politics', 'economy', 'health', 'technology', 'sports', 'entertainment', 'society'];

function detectCategory(title, storyType) {
  if (storyType === 'sports')   return 'sports';
  if (storyType === 'politics') return 'politics';
  const t = (title || '').toLowerCase();
  const scores = {};
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    scores[cat] = patterns.filter(p => p.test(t)).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'society';
  return PRECEDENCE.find(cat => scores[cat] === maxScore) || 'society';
}

// ── Templates (10 categories) ─────────────────────────────────────────────────

function getTemplates(story, category, sourceList) {
  const title    = story.title || 'Esta historia';
  const arts     = story.article_count;
  const srcs     = story.source_count;
  const firstSrc = (sourceList || [])[0] || 'una fuente';
  const srcW     = srcs === 1 ? 'fuente' : 'fuentes';
  const t        = [];

  if (category === 'judicial') {
    if (story.coverage_status === 'breaking')
      t.push({ type:'LIVE_COVERAGE', title:`En vivo: audiencia del caso "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Cobertura de la audiencia en curso.`, urgency:92, editorial:90, traffic:82, seo:68 });
    t.push({ type:'ANALYSIS',   title:`Qué se decidió y por qué importa: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Análisis del fallo o resolución judicial.`, urgency:78, editorial:92, traffic:72, seo:78 });
    t.push({ type:'EXPLAINER',  title:`Cronología del caso: de la denuncia a hoy — "${title}"`, desc:`Contexto completo para lectores que llegaron tarde al caso. Base: ${arts} artículos.`, urgency:55, editorial:85, traffic:75, seo:82 });
    t.push({ type:'NEWS',       title:`Cuáles son los próximos pasos judiciales: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Pieza de seguimiento de la causa.`, urgency:65, editorial:80, traffic:68, seo:70 });
  }
  if (category === 'security') {
    if (story.coverage_status === 'breaking')
      t.push({ type:'LIVE_COVERAGE', title:`Última hora: "${title}" — lo que se sabe`, desc:`Alta actividad: ${arts} artículos de ${srcs} ${srcW} en la última hora.`, urgency:95, editorial:85, traffic:88, seo:62 });
    t.push({ type:'NEWS', title:`Qué pasó: cronología de "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Reconstrucción del hecho para lectores.`, urgency:80, editorial:82, traffic:78, seo:68 });
    if (srcs >= 2)
      t.push({ type:'ANALYSIS', title:`Contexto y antecedentes: "${title}"`, desc:`${srcs} fuentes informan. Pieza de profundidad sobre el hecho y su entorno.`, urgency:65, editorial:78, traffic:70, seo:72 });
  }
  if (category === 'international') {
    t.push({ type:'ANALYSIS',  title:`Qué significa para Argentina: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Análisis del impacto local de un hecho global.`, urgency:60, editorial:88, traffic:72, seo:80 });
    t.push({ type:'EXPLAINER', title:`Explicado: quiénes son los actores y qué disputan en "${title}"`, desc:`Pieza de contexto para lectores no especializados. ${arts} artículos disponibles.`, urgency:55, editorial:85, traffic:75, seo:82 });
    if (srcs >= 3)
      t.push({ type:'NEWS', title:`Estado de situación: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Resumen del estado actual del conflicto o evento.`, urgency:70, editorial:78, traffic:70, seo:72 });
    t.push({ type:'SEO', title:`Preguntas clave sobre "${title}": guía de contexto`, desc:`Alta búsqueda en eventos internacionales. ${arts} artículos como fuente.`, urgency:45, editorial:65, traffic:78, seo:88 });
  }
  if (category === 'politics') {
    t.push({ type:'ANALYSIS',  title:`Qué cambia para los ciudadanos: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Análisis de impacto concreto en la población.`, urgency:65, editorial:88, traffic:72, seo:78 });
    if (srcs >= 3)
      t.push({ type:'ANALYSIS', title:`Quiénes apoyan y quiénes rechazan: "${title}"`, desc:`${srcs} fuentes con distintos ángulos. Mapa de posiciones políticas.`, urgency:60, editorial:82, traffic:68, seo:74 });
    t.push({ type:'EXPLAINER', title:`Explicado en simple: "${title}"`, desc:`Pieza de contexto para lectores no especializados. Base: ${arts} artículos.`, urgency:55, editorial:80, traffic:70, seo:82 });
    t.push({ type:'SEO',       title:`Claves y posiciones: "${title}"`, desc:`Alta búsqueda en hitos políticos. ${arts} artículos como fuente.`, urgency:45, editorial:65, traffic:75, seo:85 });
  }
  if (category === 'economy') {
    t.push({ type:'EXPLAINER', title:`Qué significa para el bolsillo: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Explicación accesible del hecho económico.`, urgency:62, editorial:85, traffic:72, seo:80 });
    t.push({ type:'ANALYSIS',  title:`Impacto económico: "${title}"`, desc:`Análisis de consecuencias a corto y mediano plazo. Base: ${arts} artículos.`, urgency:58, editorial:88, traffic:68, seo:76 });
    if (srcs >= 3)
      t.push({ type:'ANALYSIS', title:`Qué dicen los economistas sobre "${title}"`, desc:`${srcs} fuentes con distintas visiones. Síntesis de opiniones expertas.`, urgency:52, editorial:82, traffic:65, seo:75 });
    t.push({ type:'SEO', title:`Precio, datos y proyecciones: "${title}"`, desc:`Alta intención de búsqueda en temas económicos. Base: ${arts} artículos.`, urgency:48, editorial:62, traffic:80, seo:88 });
  }
  if (category === 'health') {
    t.push({ type:'EXPLAINER', title:`Qué hay que saber: síntomas, riesgos y prevención — "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Pieza informativa de salud pública.`, urgency:68, editorial:86, traffic:78, seo:88 });
    t.push({ type:'NEWS',      title:`Estado de situación: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Actualización del cuadro sanitario.`, urgency:72, editorial:80, traffic:72, seo:70 });
    t.push({ type:'ANALYSIS',  title:`Qué dice la ciencia sobre "${title}"`, desc:`Pieza de contexto científico. Base: ${arts} artículos de ${srcs} ${srcW}.`, urgency:50, editorial:88, traffic:68, seo:82 });
    t.push({ type:'SEO',       title:`Preguntas frecuentes sobre "${title}"`, desc:`Altísima intención de búsqueda en salud. ${arts} artículos disponibles.`, urgency:45, editorial:65, traffic:82, seo:92 });
  }
  if (category === 'technology') {
    t.push({ type:'NEWS',      title:`Qué anunció y qué cambia: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Resumen del anuncio y sus implicaciones.`, urgency:70, editorial:78, traffic:80, seo:72 });
    t.push({ type:'ANALYSIS',  title:`Qué significa para los usuarios: "${title}"`, desc:`Pieza de impacto para audiencia general. Base: ${arts} artículos.`, urgency:58, editorial:82, traffic:75, seo:78 });
    t.push({ type:'SEO',       title:`Cómo funciona y para qué sirve: "${title}"`, desc:`Alta intención de búsqueda en tecnología. ${arts} artículos como fuente.`, urgency:42, editorial:65, traffic:85, seo:90 });
    if (srcs >= 2)
      t.push({ type:'EXPLAINER', title:`Guía para no especializados: "${title}"`, desc:`${srcs} fuentes cubren el tema. Pieza accesible para audiencia masiva.`, urgency:48, editorial:78, traffic:78, seo:82 });
  }
  if (category === 'sports') {
    if (story.coverage_status === 'breaking')
      t.push({ type:'LIVE_COVERAGE', title:`En vivo: "${title}"`, desc:`Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`, urgency:92, editorial:75, traffic:90, seo:65 });
    t.push({ type:'NEWS', title:`Cobertura completa: "${title}"`, desc:`${arts} artículos en ${srcs} medios deportivos. Resumen del hecho para fans.`, urgency:75, editorial:72, traffic:88, seo:68 });
    if (srcs >= 3)
      t.push({ type:'ANALYSIS', title:`Impacto en la tabla y el torneo: "${title}"`, desc:`${srcs} fuentes cubren las consecuencias para la competencia.`, urgency:55, editorial:68, traffic:82, seo:72 });
    t.push({ type:'SEO', title:`Estadísticas, figuras y datos del encuentro: "${title}"`, desc:`Datos concretos con alto potencial de búsqueda. Base: ${arts} artículos.`, urgency:48, editorial:60, traffic:85, seo:88 });
  }
  if (category === 'entertainment') {
    t.push({ type:'NEWS', title:`Todo sobre "${title}": lo que hay que saber`, desc:`${arts} artículos de ${srcs} ${srcW}. Cobertura completa del hecho de espectáculos.`, urgency:68, editorial:68, traffic:85, seo:72 });
    t.push({ type:'SEO',  title:`Quién es, qué dijo y por qué es tendencia: "${title}"`, desc:`Alta intención de búsqueda en espectáculos. Base: ${arts} artículos.`, urgency:45, editorial:58, traffic:88, seo:90 });
    if (srcs >= 2)
      t.push({ type:'ANALYSIS', title:`Por qué "${title}" genera tanta repercusión`, desc:`${srcs} fuentes cubren el fenómeno. Pieza de análisis cultural.`, urgency:50, editorial:72, traffic:80, seo:75 });
  }
  if (category === 'society' || t.length === 0) {
    t.push({ type:'ANALYSIS',  title:`Por qué importa: "${title}" en contexto`, desc:`${arts} artículos de ${srcs} ${srcW}. Pieza de profundidad sobre el impacto social.`, urgency:55, editorial:80, traffic:68, seo:72 });
    t.push({ type:'NEWS',      title:`Qué pasó y quiénes se ven afectados: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. Resumen del hecho y sus protagonistas.`, urgency:65, editorial:75, traffic:72, seo:68 });
    t.push({ type:'EXPLAINER', title:`Explicado: "${title}" y su impacto en la comunidad`, desc:`Pieza accesible para audiencia general. Base: ${arts} artículos.`, urgency:50, editorial:78, traffic:65, seo:75 });
    if (story.coverage_status === 'breaking')
      t.push({ type:'LIVE_COVERAGE', title:`Cobertura en vivo: "${title}"`, desc:`Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`, urgency:95, editorial:82, traffic:88, seo:68 });
    if (story.coverage_status === 'growing' && srcs >= 2)
      t.push({ type:'NEWS', title:`Historia en crecimiento: "${title}"`, desc:`${arts} artículos de ${srcs} ${srcW}. La cobertura está aumentando.`, urgency:70, editorial:70, traffic:75, seo:62 });
  }
  // Cross-category rules
  if (srcs === 1 && (story.importance_score || 0) >= 5)
    t.push({ type:'NEWS', title:`Ventana de exclusiva: solo "${firstSrc}" cubre este tema`, desc:`${arts} artículos de una sola fuente. Oportunidad de ser el segundo medio.`, urgency:85, editorial:80, traffic:62, seo:52 });
  if (arts >= 6 && srcs <= 2)
    t.push({ type:'NEWS', title:`Cobertura concentrada: "${title}"`, desc:`${arts} artículos pero solo ${srcs} ${srcW}. Oportunidad para diversificar el ángulo.`, urgency:60, editorial:66, traffic:58, seo:52 });

  return t;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Cost Killer 4 — Category Expansion Migration ===\n');

  // 1. Archive all existing algorithmic pending opportunities
  console.log('1. Archiving stale algorithmic opportunities…');
  const { rowCount: archived } = await query(`
    UPDATE story_opportunities so
    SET status = 'archived'
    FROM story_clusters sc
    WHERE so.story_cluster_id = sc.id
      AND so."trigger" = 'algorithmic'
      AND so.status = 'pending'
      AND sc.status IN ('active','ready')
      AND sc.is_recurring = false
  `);
  console.log(`   ✓ ${archived} opportunities archived\n`);

  // 2. Load active stories with sources
  console.log('2. Loading active stories…');
  const { rows: stories } = await query(`
    SELECT
      sc.id, sc.title, sc.story_type, sc.article_count, sc.source_count,
      sc.coverage_status, sc.importance_score,
      (SELECT json_agg(DISTINCT ts.name)
       FROM story_cluster_articles sca2
       JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
       JOIN tracked_sources ts ON ts.id = ma2.source_id
       WHERE sca2.story_id = sc.id) AS sources
    FROM story_clusters sc
    WHERE sc.status IN ('active','ready')
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '7 days'
    ORDER BY sc.importance_score DESC NULLS LAST, sc.source_count DESC
  `);
  console.log(`   ✓ ${stories.length} active stories loaded\n`);

  // 3. Regenerate with new 10-category templates
  console.log('3. Generating opportunities with 10-category templates…');

  const categoryCount = {};
  let oppsCreated = 0;

  for (const story of stories) {
    const sourceList = Array.isArray(story.sources) ? story.sources.filter(Boolean) : [];
    const category   = detectCategory(story.title, story.story_type);
    const templates  = getTemplates(story, category, sourceList);

    categoryCount[category] = (categoryCount[category] || 0) + 1;

    for (const opp of templates) {
      const composite = parseFloat(
        (opp.editorial * 0.4 + opp.traffic * 0.3 + opp.seo * 0.2 + opp.urgency * 0.1).toFixed(2)
      );
      await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'algorithmic')
      `, [
        story.id, opp.title, opp.desc || '', opp.type,
        opp.traffic, opp.seo, opp.urgency, opp.editorial, composite,
      ]).catch(() => {});
      oppsCreated++;
    }
  }
  console.log(`   ✓ ${oppsCreated} opportunities created\n`);

  // 4. Category breakdown
  console.log('4. Category breakdown:');
  for (const cat of ['judicial','security','international','politics','economy','health','technology','sports','entertainment','society']) {
    const n = categoryCount[cat] || 0;
    if (n > 0) console.log(`   ${cat.padEnd(15)} ${n} stories`);
  }

  // 5. Final stats
  const { rows: [stats] } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM story_opportunities WHERE "trigger"='algorithmic' AND status='pending') AS algo_pending,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE status='pending') AS total_pending,
      (SELECT COUNT(*)::int FROM story_opportunities WHERE status='archived') AS total_archived
  `);

  console.log(`\n=== Migration Complete ===`);
  console.log(`Algorithmic opportunities (pending): ${stats.algo_pending}`);
  console.log(`Total opportunities (pending):       ${stats.total_pending}`);
  console.log(`Total archived:                      ${stats.total_archived}`);

  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
