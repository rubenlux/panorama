// Story Clustering 2.0 — full rebuild migration
// Usage: node scripts/migrate_story_clustering_2.mjs
//
// Phase 1: Add schema columns (detected_category, contamination_flag,
//           category_match, category_score, entity_score, keyword_score)
// Phase 2: Clear all non-recurring story data
//           (story_cluster_articles, story_opportunities, story_entities,
//            event_cluster_stories, story_clusters)
// Phase 3: Re-process monitored_articles from last 7 days in chronological
//           order through the 3-layer gate (Category → Entity → Keyword)
// Phase 4: Recalculate quality metrics for all rebuilt stories
// Phase 5: Detect contamination on all rebuilt stories

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ── Constants (must match newsMonitor.js) ────────────────────────────────────

const STORY_WINDOW_HOURS    = 24;
const STORY_MATCH_THRESHOLD = 0.20;
const REBUILD_DAYS          = 7;

const STORY_ENTITY_GATE_MIN_STORY   = 3;
const STORY_ENTITY_GATE_MIN_ARTICLE = 1;

const STORY_STOPWORDS = new Set([
  'como','hoy','ayer','para','sobre','ante','bajo','desde','hacia','hasta','tras','entre',
  'dice','dijo','señaló','afirmó','confirmó','anunció','aseguró','reveló','explicó',
  'nuevo','nueva','nuevos','nuevas','primer','primera','primero','últimas','último',
  'gran','grande','grandes','solo','sólo','también','además','muy','bien','mal',
  'todo','toda','todos','todas','esto','eso','este','esta','estos','estas',
  'lunes','martes','miercoles','jueves','viernes','sabado','domingo',
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre',
  'semana','semanas','mes','meses','años','hora','horas','minuto','minutos',
  'cual','cuales','quien','quienes','como','cuando','donde','cuanto',
  'caso','casos','forma','formas','tipo','tipos','parte','partes','lugar',
  'hace','hizo','debe','puede','tiene','tuvo','sera','seria',
  'the','also','from','this','that','with','have','will','been','were',
  'what','when','where','which','they','their','about','after','before',
  'pesos','dolares','porcentaje','inflacion','economia',
]);

const RECURRING_CONTENT_PATTERNS = [
  /hor[oó]scopo\s+\w+\s+de\s+hoy/i,
  /quiniela.*resultado.*sorteo/i,
  /resultado.*quiniela/i,
  /quiniela.*(nocturna|vespertina|primera|matutina)/i,
  /loter[ií]a.*resultado/i,
  /resultado.*loter[ií]a/i,
  /n[uú]mero.*ganador/i,
  /sorteo.*loto/i,
];

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

const CATEGORY_PRECEDENCE = [
  'judicial','security','international','politics','economy',
  'health','technology','sports','entertainment','society',
];

// ── Pure helpers ─────────────────────────────────────────────────────────────

function extractStoryKeywords(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡«»:,;!?()[\]{}"'\/\\]/g, ' ')
    .split(/\s+/)
    .filter(w =>
      w.length >= 4 &&
      !STORY_STOPWORDS.has(w) &&
      !/^\d+$/.test(w) &&
      !/^[-–—]/.test(w)
    );
}

function jaccardSim(arrA, arrB) {
  const a = new Set(arrA), b = new Set(arrB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function jaccardShared(arrA, arrB) {
  const b = new Set(arrB);
  return [...new Set(arrA)].filter(x => b.has(x));
}

function isRecurringContent(title) {
  return RECURRING_CONTENT_PATTERNS.some(p => p.test(title));
}

function generateStorySlug(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  const ts = Date.now().toString(36).slice(-5);
  return `${base}-${ts}`;
}

function detectStoryCategory(title, storyType) {
  if (storyType === 'sports')   return 'sports';
  if (storyType === 'politics') return 'politics';
  const t = (title || '').toLowerCase();
  const scores = {};
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    scores[cat] = patterns.filter(p => p.test(t)).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'society';
  return CATEGORY_PRECEDENCE.find(cat => scores[cat] === maxScore) || 'society';
}

// ── Phases ───────────────────────────────────────────────────────────────────

async function phase1_schema() {
  console.log('Phase 1: Schema migration…');
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS detected_category VARCHAR(20)`).catch(() => {});
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS contamination_flag BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_match BOOLEAN DEFAULT TRUE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS entity_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS keyword_score FLOAT DEFAULT 0`).catch(() => {});
  console.log('   ✓ Columns added (idempotent)\n');
}

async function phase2_clean() {
  console.log('Phase 2: Clearing non-recurring story data…');

  const { rows: ids } = await query(`
    SELECT id FROM story_clusters WHERE is_recurring = false
  `);
  const nonRecurringIds = ids.map(r => r.id);
  console.log(`   Found ${nonRecurringIds.length} non-recurring story clusters to clear`);

  if (nonRecurringIds.length > 0) {
    const idList = `(${nonRecurringIds.map((_, i) => `$${i + 1}`).join(',')})`;

    const { rowCount: opps } = await query(
      `DELETE FROM story_opportunities WHERE story_cluster_id = ANY($1::uuid[])`,
      [nonRecurringIds]
    );
    console.log(`   ✓ Deleted ${opps} story_opportunities`);

    const { rowCount: evts } = await query(
      `DELETE FROM event_cluster_stories WHERE story_cluster_id = ANY($1::uuid[])`,
      [nonRecurringIds]
    ).catch(() => ({ rowCount: 0 }));
    console.log(`   ✓ Deleted ${evts} event_cluster_stories`);

    const { rowCount: ents } = await query(
      `DELETE FROM story_entities WHERE story_id = ANY($1::uuid[])`,
      [nonRecurringIds]
    );
    console.log(`   ✓ Deleted ${ents} story_entities`);

    const { rowCount: arts } = await query(
      `DELETE FROM story_cluster_articles WHERE story_id = ANY($1::uuid[])`,
      [nonRecurringIds]
    );
    console.log(`   ✓ Deleted ${arts} story_cluster_articles`);

    const { rowCount: clusters } = await query(
      `DELETE FROM story_clusters WHERE id = ANY($1::uuid[])`,
      [nonRecurringIds]
    );
    console.log(`   ✓ Deleted ${clusters} story_clusters\n`);
  } else {
    console.log('   Nothing to clear\n');
  }
}

async function phase3_rebuild() {
  console.log('Phase 3: Rebuilding clusters from last 7 days…');

  const { rows: articles } = await query(`
    SELECT id, title, source_id, detected_at
    FROM monitored_articles
    WHERE detected_at > now() - interval '${REBUILD_DAYS} days'
    ORDER BY detected_at ASC
  `);

  console.log(`   ${articles.length} articles to process`);

  const storyArticles = articles.filter(a => !isRecurringContent(a.title));
  const recurringOnes = articles.filter(a =>  isRecurringContent(a.title));

  console.log(`   ${recurringOnes.length} recurring (handled separately)`);
  console.log(`   ${storyArticles.length} non-recurring to cluster`);

  // Re-create recurring clusters
  for (const a of recurringOnes) {
    const slug = generateStorySlug(a.title);
    const { rows } = await query(`
      INSERT INTO story_clusters (title, slug, is_recurring, story_type)
      VALUES ($1, $2, true, 'news')
      ON CONFLICT (slug) DO UPDATE SET last_seen = now(), updated_at = now()
      RETURNING id
    `, [a.title, slug]);
    if (rows[0]) {
      await query(
        `INSERT INTO story_cluster_articles (story_id, article_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, a.id]
      );
    }
  }

  if (storyArticles.length === 0) {
    console.log('   No non-recurring articles — skipping clustering\n');
    return new Set();
  }

  // Batch-load all article entities at once
  const allArticleIds = storyArticles.map(a => a.id);
  const { rows: artEntityRows } = await query(`
    SELECT aem.article_id::text AS article_id, lower(ke.name) AS entity_name
    FROM article_entity_matches aem
    JOIN knowledge_entities ke ON ke.id = aem.entity_id
    WHERE aem.article_id = ANY($1::uuid[])
      AND ke.entity_origin = 'MONITOR'
  `, [allArticleIds]);

  const artEntityMap = new Map();
  for (const row of artEntityRows) {
    if (!artEntityMap.has(row.article_id)) artEntityMap.set(row.article_id, new Set());
    artEntityMap.get(row.article_id).add(row.entity_name);
  }

  // Signatures grow as new clusters are created (same logic as detectStories)
  const signatures = [];
  const affectedIds = new Set();
  let assigned = 0, created = 0;

  for (const article of storyArticles) {
    const artKw = extractStoryKeywords(article.title);
    if (artKw.length < 2) continue;

    const artCategory = detectStoryCategory(article.title, null);
    const artEntities = artEntityMap.get(article.id) || new Set();

    let bestId        = null;
    let bestComposite = 0;
    let bestScores    = null;

    for (const sig of signatures) {
      if (sig.category !== artCategory) continue;

      const sharedEntities = sig.entities.filter(e => artEntities.has(e));
      if (
        sig.entities.length >= STORY_ENTITY_GATE_MIN_STORY &&
        artEntities.size    >= STORY_ENTITY_GATE_MIN_ARTICLE &&
        sharedEntities.length === 0
      ) continue;

      const kwScore = jaccardSim(artKw, sig.keywords);
      if (kwScore < STORY_MATCH_THRESHOLD) continue;

      const entityScore = sig.entities.length > 0
        ? sharedEntities.length / sig.entities.length
        : 0.5;
      const composite = parseFloat((kwScore * 0.6 + entityScore * 0.4).toFixed(3));

      if (composite > bestComposite) {
        bestComposite = composite;
        bestId        = sig.id;
        bestScores    = { kwScore, entityScore, sharedEntities, sharedKw: jaccardShared(artKw, sig.keywords) };
      }
    }

    let assignedId;

    if (bestId) {
      const { kwScore, entityScore, sharedEntities, sharedKw } = bestScores;
      await query(`
        INSERT INTO story_cluster_articles
          (story_id, article_id, relevance_score, matching_reason,
           shared_keywords, shared_entities, keyword_similarity, title_similarity, entity_similarity,
           category_match, category_score, entity_score, keyword_score)
        VALUES ($1,$2,$3,'keyword_jaccard',$4,$5,$6,$6,$7,true,1.0,$7,$6)
        ON CONFLICT DO NOTHING
      `, [
        bestId, article.id, bestComposite,
        JSON.stringify(sharedKw),
        JSON.stringify(sharedEntities),
        parseFloat(kwScore.toFixed(3)),
        parseFloat(entityScore.toFixed(3)),
      ]);
      assignedId = bestId;
      assigned++;
    } else {
      const slug = generateStorySlug(article.title);
      const { rows } = await query(`
        INSERT INTO story_clusters (title, slug, keywords, is_recurring, detected_category)
        VALUES ($1, $2, $3, false, $4) RETURNING id
      `, [article.title, slug, JSON.stringify(artKw), artCategory]);
      assignedId = rows[0].id;

      await query(`
        INSERT INTO story_cluster_articles
          (story_id, article_id, relevance_score, matching_reason,
           shared_keywords, keyword_similarity, title_similarity, entity_similarity,
           category_match, category_score, entity_score, keyword_score)
        VALUES ($1,$2,1.0,'story_seed',$3,1.0,1.0,1.0,true,1.0,1.0,1.0)
        ON CONFLICT DO NOTHING
      `, [assignedId, article.id, JSON.stringify(artKw)]);

      signatures.push({
        id:       assignedId,
        category: artCategory,
        keywords: artKw,
        entities: [...artEntities],
      });
      created++;
    }

    affectedIds.add(assignedId);

    // Link article's MONITOR entities to the story
    await query(`
      INSERT INTO story_entities (story_id, entity_id)
      SELECT $1, aem.entity_id
      FROM article_entity_matches aem
      JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE aem.article_id = $2
        AND ke.entity_origin = 'MONITOR'
      ON CONFLICT DO NOTHING
    `, [assignedId, article.id]);

    if ((assigned + created) % 100 === 0) {
      process.stdout.write(`   Progress: ${assigned + created}/${storyArticles.length} articles…\r`);
    }
  }

  console.log(`   ✓ Created ${created} new story clusters`);
  console.log(`   ✓ Assigned ${assigned} articles to existing clusters`);
  console.log(`   ✓ ${affectedIds.size} stories affected\n`);

  return affectedIds;
}

async function phase4_metrics(affectedIds) {
  console.log(`Phase 4: Recalculating quality metrics for ${affectedIds.size} stories…`);
  let done = 0;
  for (const storyId of affectedIds) {
    await query(`
      WITH m AS (
        SELECT
          base.cnt_articles, base.cnt_sources, base.articles_last_1h,
          base.rel_score, base.depth_score, base.div_score, base.cov_score,
          LEAST(100, base.rel_score + base.depth_score + base.div_score + base.cov_score) AS total_score
        FROM (
          SELECT
            ROUND(COALESCE(AVG(sca.relevance_score), 0) * 35)::integer                        AS rel_score,
            ROUND(LEAST(COALESCE(SUM(ma.content_words), 0)::float / 5000, 1.0) * 25)::integer AS depth_score,
            ROUND(LEAST(COUNT(DISTINCT ma.source_id)::float / 5, 1.0) * 15)::integer           AS div_score,
            ROUND(COALESCE(
              COUNT(ma.id) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::float
              / NULLIF(COUNT(ma.id), 0), 0
            ) * 25)::integer                                                                   AS cov_score,
            COUNT(sca.article_id)::integer                                                     AS cnt_articles,
            COUNT(DISTINCT ma.source_id)::integer                                               AS cnt_sources,
            COUNT(sca.article_id) FILTER (WHERE ma.detected_at > now() - interval '1 hour')::integer AS articles_last_1h
          FROM story_cluster_articles sca
          LEFT JOIN monitored_articles ma ON ma.id = sca.article_id
          WHERE sca.story_id = $1
        ) base
      )
      UPDATE story_clusters sc
      SET
        article_count           = m.cnt_articles,
        source_count            = m.cnt_sources,
        avg_relevance           = (SELECT AVG(relevance_score) FROM story_cluster_articles WHERE story_id = $1),
        context_relevance_score = m.rel_score,
        context_depth_score     = m.depth_score,
        context_diversity_score = m.div_score,
        context_coverage_score  = m.cov_score,
        story_context_score     = m.total_score,
        story_quality           = CASE
          WHEN m.total_score < 20 THEN 'poor'
          WHEN m.total_score < 45 THEN 'fair'
          WHEN m.total_score < 70 THEN 'good'
          WHEN m.cnt_sources <= 1 THEN 'good'
          ELSE 'excellent'
        END,
        story_confidence        = CASE
          WHEN m.cnt_sources >= 4 THEN 'high'
          WHEN m.cnt_sources >= 2 THEN 'medium'
          ELSE 'low'
        END,
        coverage_status         = CASE
          WHEN m.articles_last_1h >= 3 AND m.cnt_sources >= 2 THEN 'breaking'
          WHEN m.articles_last_1h >= 2                         THEN 'growing'
          WHEN m.cnt_articles > 5 AND m.cnt_sources <= 1       THEN 'cooling'
          ELSE 'monitoring'
        END,
        importance_score        = LEAST(10, GREATEST(1, (
          LEAST(m.cnt_sources * 2.5, 5.0)
          + LEAST(m.cnt_articles * 0.5, 3.0)
          + CASE
              WHEN m.articles_last_1h >= 3 AND m.cnt_sources >= 2 THEN 2
              WHEN m.articles_last_1h >= 2                         THEN 1
              ELSE 0
            END
        )::integer)),
        last_seen  = now(),
        updated_at = now()
      FROM m
      WHERE sc.id = $1
    `, [storyId]);
    done++;
    if (done % 50 === 0) process.stdout.write(`   Progress: ${done}/${affectedIds.size}…\r`);
  }
  console.log(`   ✓ Metrics recalculated for ${done} stories\n`);
}

async function phase5_contamination(affectedIds) {
  console.log(`Phase 5: Contamination detection on ${affectedIds.size} stories…`);
  let flagged = 0;
  for (const storyId of affectedIds) {
    const { rows } = await query(`
      SELECT
        sc.detected_category,
        sc.article_count,
        COUNT(sca.article_id) FILTER (WHERE sca.category_match = false) AS mismatched
      FROM story_clusters sc
      LEFT JOIN story_cluster_articles sca ON sca.story_id = sc.id
      WHERE sc.id = $1
      GROUP BY sc.id, sc.detected_category, sc.article_count
    `, [storyId]);

    if (!rows[0] || !rows[0].article_count) continue;
    const total      = Number(rows[0].article_count);
    const mismatched = Number(rows[0].mismatched || 0);
    const contaminated = total >= 4 && mismatched / total >= 0.25;
    await query(
      `UPDATE story_clusters SET contamination_flag = $1, updated_at = now() WHERE id = $2`,
      [contaminated, storyId]
    );
    if (contaminated) {
      flagged++;
      console.log(`   [CONTAMINATED] story ${storyId}: ${mismatched}/${total} artículos fuera de categoría`);
    }
  }
  console.log(`   ✓ ${flagged} stories flagged as contaminated\n`);
}

// ── Report ───────────────────────────────────────────────────────────────────

async function report() {
  const { rows: [totals] } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_recurring = false) AS non_recurring,
      COUNT(*) FILTER (WHERE is_recurring = true)  AS recurring,
      COUNT(*) FILTER (WHERE contamination_flag = true) AS contaminated
    FROM story_clusters
  `);
  const { rows: [artTotals] } = await query(`
    SELECT COUNT(*) AS total FROM story_cluster_articles
  `);
  const { rows: catDist } = await query(`
    SELECT detected_category, COUNT(*) AS cnt
    FROM story_clusters
    WHERE is_recurring = false AND detected_category IS NOT NULL
    GROUP BY detected_category
    ORDER BY cnt DESC
  `);

  console.log('=== Final State ===');
  console.log(`Non-recurring stories : ${totals.non_recurring}`);
  console.log(`Recurring stories     : ${totals.recurring}`);
  console.log(`Contaminated stories  : ${totals.contaminated}`);
  console.log(`story_cluster_articles: ${artTotals.total}`);
  console.log('\nCategory distribution:');
  for (const { detected_category, cnt } of catDist) {
    console.log(`  ${(detected_category || 'null').padEnd(15)} ${cnt}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Story Clustering 2.0 — Full Rebuild Migration ===\n');
  const t0 = Date.now();

  await phase1_schema();
  await phase2_clean();
  const affectedIds = await phase3_rebuild();
  await phase4_metrics(affectedIds);
  await phase5_contamination(affectedIds);
  await report();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Migration complete in ${elapsed}s`);
  await pool.end();
}

main().catch(err => {
  console.error('\nMigration failed:', err.message);
  pool.end();
  process.exit(1);
});
