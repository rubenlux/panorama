/**
 * Intelligence — Story Clustering & Detection
 * Story Clustering 2.0: Three-layer gate architecture (Category → Entity → Keyword)
 * All story-related functions: detection, quality scoring, contamination detection
 * Cost Killer 1+2: Algorithmic summaries (no AI)
 */

import { query } from '../../../routes/db.js';
import { AiService } from '../../../services/AiService.js';
import { MONITOR_STOPWORDS } from './entities.js';

const ai = new AiService();

// ── Story Clustering Constants ───────────────────────────────────────────────

// Cluster is "active" for 6 hours — articles within that window belong together
export const CLUSTER_WINDOW_HOURS = 6;
// Thresholds to trigger AI summary generation
export const CLUSTER_SUMMARY_MIN_ARTICLES = 3;
export const CLUSTER_SUMMARY_MIN_SOURCES = 2;

// Story Intelligence thresholds
export const STORY_WINDOW_HOURS = 24;
export const STORY_MATCH_THRESHOLD = 0.20;
export const STORY_SUMMARY_MIN_ARTICLES = 3;
export const STORY_SUMMARY_MIN_SOURCES = 2;
export const ENRICHMENT_GATE_COVERAGE = 0.70; // min fraction of articles with full text before AI runs
export const RELEVANCE_FILTER_THRESHOLD = 0.30; // articles below this score excluded from AI context

// Story entity matching gates
export const STORY_ENTITY_GATE_MIN_STORY = 3; // min story entities to activate gate
export const STORY_ENTITY_GATE_MIN_ARTICLE = 1; // min article entities to activate gate

// Aggressive stopwords for keyword-similarity matching — NOT for NER
// Merged from the (dead) newsMonitor.js copy, which had evolved further —
// this copy was missing both later base-list additions and FIX 1 below.
export const STORY_STOPWORDS = new Set([
  'como','hoy','ayer','para','sobre','ante','bajo','desde','hacia','hasta','tras','entre',
  'por','con','sin','después','durante',
  'dice','dijo','señaló','afirmó','confirmó','anunció','aseguró','reveló','explicó',
  'según','informó','contó','mostró','realizó','dio','pidió','encontró',
  'se','es','ya','han','fue','sido','haber','estaba','sería','será','está','están',
  'hace','hizo','debe','puede','tiene','tuvo','sera','seria',
  'nuevo','nueva','nuevos','nuevas','primer','primera','primero','últimas','último',
  'gran','grande','grandes','solo','sólo','también','además','muy','bien','mal',
  'todo','toda','todos','todas','esto','eso','este','esta','estos','estas',
  'lunes','martes','miercoles','jueves','viernes','sabado','domingo',
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre',
  'semana','semanas','mes','meses','años','hora','horas','minuto','minutos',
  'cual','cuales','quien','quienes','cuando','donde','cuanto',
  'caso','casos','forma','formas','tipo','tipos','parte','partes','lugar',
  'the','also','from','this','that','with','have','will','been','were',
  'what','when','where','which','they','their','about','after','before',
  // High-frequency Argentine news words that don't define a story
  'pesos','dolares','porcentaje','inflacion','economia',
  // FIX 1 (2026-06-19) — Tournament context words: identify domain (World Cup,
  // Copa) but cannot distinguish between different facts within the same
  // tournament (e.g. "Argentina gana" vs "Brasil eliminado" sharing 'mundial'
  // → false Jaccard match). Named entities ("Copa América") are matched via
  // NER/Gate 2, not Gate 3 keywords. This was documented as fixed in CLAUDE.md
  // but only ever landed in the dead newsMonitor.js copy of this constant —
  // detectStories() here never saw it.
  'copa','mundial','torneo','campeonato','fixture','grupo','fase',
  'final','semifinal','cuartos','octavos','16avos','32avos',
]);

// Templated/recurring content that should never create editorial stories
export const RECURRING_CONTENT_PATTERNS = [
  /hor[oó]scopo\s+\w+\s+de\s+hoy/i,
  /quiniela.*resultado.*sorteo/i,
  /resultado[s]?\s+del\s+sorteo/i,
  /lotería\s+de\s+\w+/i,
  /predicción[es]?\s+de\s+hoy/i,
];

// ── Helper: Extract keywords from text (pure) ────────────────────────────────

/**
 * extractStoryKeywords — Extract story-level keywords from text
 * Excludes stopwords, accents, punctuation; returns ≥4 char words
 * Used by detectStories for Gate 3 (Jaccard) matching
 *
 * @param {string} text — Title or description
 * @returns {string[]} — Filtered keywords
 */
export function extractStoryKeywords(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents for matching
    .replace(/[¿¡«»:,;!?()[\]{}"'\/\\]/g, ' ')
    .split(/\s+/)
    .filter(w =>
      w.length >= 4 &&
      !STORY_STOPWORDS.has(w) &&
      !/^\d+$/.test(w) &&
      !/^[-–—]/.test(w)
    );
}

/**
 * jaccardSim — Jaccard similarity coefficient
 * intersection / union of two sets
 *
 * @param {string[]} arrA
 * @param {string[]} arrB
 * @returns {number} — Similarity [0, 1]
 */
export function jaccardSim(arrA, arrB) {
  const a = new Set(arrA), b = new Set(arrB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * jaccardShared — Extract shared elements between two arrays
 *
 * @param {string[]} arrA
 * @param {string[]} arrB
 * @returns {string[]} — Shared elements (deduplicated)
 */
export function jaccardShared(arrA, arrB) {
  const b = new Set(arrB);
  return [...new Set(arrA)].filter(x => b.has(x));
}

/**
 * isRecurringContent — Check if title matches recurring content pattern
 *
 * @param {string} title
 * @returns {boolean}
 */
export function isRecurringContent(title) {
  return RECURRING_CONTENT_PATTERNS.some(p => p.test(title));
}

/**
 * generateStorySlug — Create URL-safe slug from title
 * Lowercased, accent-stripped, hyphenated, 60 chars max + timestamp
 *
 * @param {string} title
 * @returns {string}
 */
export function generateStorySlug(title) {
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

// ── Category Detection (pure, context-aware) ─────────────────────────────────

/**
 * detectStoryCategory — Classify article/story by category using pattern matching
 * Context-aware: sports/entertainment context reduces irrelevant categories
 * Returns category + confidence + matched rules for auditability
 *
 * Three-tier classification:
 *   1. storyType override (sports/politics)
 *   2. Pattern matching (11 categories)
 *   3. Context awareness (sports club/competition, entertainment context)
 *
 * @param {string} title
 * @param {string} storyType — Optional: 'sports' or 'politics' (overrides)
 * @param {Set|Array} entities — Optional: entity names for context
 * @returns {{category: string, confidence: number, matched_rules: string[]}}
 */
export function detectStoryCategory(title, storyType, entities = new Set()) {
  if (storyType === 'sports')   return { category: 'sports', confidence: 1.0, matched_rules: ['storyType_override'] };
  if (storyType === 'politics') return { category: 'politics', confidence: 1.0, matched_rules: ['storyType_override'] };

  const t = (title || '').toLowerCase();
  const entityNames = new Set([...(entities || [])].map(e => String(e).toLowerCase()));

  // Sports context: clubes argentinos, competiciones, términos de mercado
  const SPORTS_CONTEXT = {
    clubs: new Set(['boca', 'river', 'racing', 'independiente', 'san lorenzo', 'vélez', 'estudiantes', 'quilmes', 'atlético tucumán', 'lanús', 'defensa y justicia', 'talleres', 'colón', 'gimnasia', 'argentinos juniors']),
    competitions: new Set(['mundial', 'copa', 'liga', 'superliga', 'torneo', 'champions', 'libertadores', 'sudamericana']),
    transfer: new Set(['refuerzo', 'fichaje', 'contratación', 'transferencia', 'mercado de pases', 'mercado', 'acuerdo', 'firmará', 'contrato', 'jugador', 'delantero', 'defensor', 'lateral', 'portero', 'centrocampista']),
  };

  // Entertainment context: personas públicas no deportistas
  const ENTERTAINMENT_CONTEXT = new Set(['andrea del boca', 'actor', 'actriz', 'cantante', 'músico', 'artista', 'película', 'serie', 'show', 'gran hermano', 'reality']);

  const PATTERNS = {
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
      /\bprecios\b/, /\bbanco\b/, /\bpodría irse\b/, /\binversi[oó]n\b/,
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

  // Calculate pattern matches
  const scores = {};
  const matched_rules = {};
  for (const [cat, patterns] of Object.entries(PATTERNS)) {
    const matches = patterns.filter(p => p.test(t));
    scores[cat] = matches.length;
    matched_rules[cat] = [];
  }

  // Check entertainment context FIRST — Andrea del Boca should not be sports
  const hasEntertainmentContext = [...ENTERTAINMENT_CONTEXT].some(e => t.includes(e));

  // Check sports context: if any sports context keyword present, prioritize sports
  // BUT: exclude "boca" if "del boca" is in the title (it's a person's name)
  let hasSportsClub = [...SPORTS_CONTEXT.clubs].some(c => {
    if (c === 'boca' && t.includes('del boca')) return false; // Andrea del Boca exclusion
    return t.includes(c);
  });
  const hasSportsCompetition = [...SPORTS_CONTEXT.competitions].some(c => t.includes(c));
  const hasSportsTransfer = [...SPORTS_CONTEXT.transfer].some(c => t.includes(c));

  // Context rule: if sports context detected, health/economy/international keywords become supporting evidence only
  // BUT: skip if entertainment context is strong
  if ((hasSportsClub || hasSportsCompetition || hasSportsTransfer) && !hasEntertainmentContext) {
    const contextRules = [];
    if (hasSportsClub) contextRules.push('sports_club');
    if (hasSportsCompetition) contextRules.push('sports_competition');
    if (hasSportsTransfer) contextRules.push('sports_transfer');

    // Reduce health/economy/international scores if sports context is strong
    if (scores['health'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['health'] = Math.max(0, scores['health'] - 1);
    }
    if (scores['economy'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['economy'] = Math.max(0, scores['economy'] - 1);
    }
    if (scores['international'] > 0 && hasSportsCompetition && !t.includes('guerra') && !t.includes('diplomat')) {
      scores['international'] = Math.max(0, scores['international'] - 1);
    }

    scores['sports'] = (scores['sports'] || 0) + 2; // Boost sports if context detected
    matched_rules['sports'] = contextRules;
  }

  // Entertainment check: if entertainment context detected, prioritize entertainment
  if (hasEntertainmentContext) {
    scores['entertainment'] = Math.max(scores['entertainment'], (scores['sports'] || 0) + 1);
    matched_rules['entertainment'].push('entertainment_context');
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return { category: 'society', confidence: 0.5, matched_rules: ['default'] };

  // When entertainment context is strong, entertainment gets priority
  const PRECEDENCE = hasEntertainmentContext
    ? ['judicial', 'security', 'international', 'politics', 'economy', 'entertainment', 'sports', 'health', 'technology', 'society']
    : ['judicial', 'security', 'international', 'politics', 'economy', 'sports', 'health', 'technology', 'entertainment', 'society'];
  const winner = PRECEDENCE.find(cat => scores[cat] === maxScore) || 'society';
  const confidence = maxScore / (Object.values(scores).reduce((a, b) => a + b, 0) || 1);

  return {
    category: winner,
    confidence: Math.min(1, confidence),
    matched_rules: matched_rules[winner] || []
  };
}

// ── Algorithmic Summary (pure, no AI) ────────────────────────────────────────

/**
 * buildAlgorithmicSummary — Generate summary without AI (Cost Killer 1+2)
 * Pattern-based: "N articles from M sources [verb] [title]."
 *
 * @param {object} story — story_clusters row
 * @param {string[]} entities — Top entity names
 * @returns {string} — Summary sentence
 */
export function buildAlgorithmicSummary(story, entities = []) {
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

// ── Schema Management (idempotent) ───────────────────────────────────────────

/**
 * ensureOpportunityTriggerColumn — Add trigger column if missing
 * Idempotent: safe to call multiple times
 */
export async function ensureOpportunityTriggerColumn() {
  await query(`ALTER TABLE story_opportunities ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) DEFAULT 'ai'`).catch(() => {});
}

/**
 * ensureAlgorithmicSummaryColumn — Add algorithmic_summary column if missing
 * Idempotent: safe to call multiple times
 */
export async function ensureAlgorithmicSummaryColumn() {
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS algorithmic_summary TEXT`).catch(() => {});
}

/**
 * ensureClusteringSchema2 — Add Story Clustering 2.0 columns if missing
 * Idempotent: safe to call multiple times
 */
export async function ensureClusteringSchema2() {
  // Story Clustering 2.0 — category gate + explainable scores
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS detected_category VARCHAR(20)`).catch(() => {});
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS contamination_flag BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_match BOOLEAN DEFAULT TRUE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS entity_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS keyword_score FLOAT DEFAULT 0`).catch(() => {});
}

/**
 * ensureFreshnessSchema — Add freshness_score columns if missing
 * Idempotent: safe to call multiple times
 */
export async function ensureFreshnessSchema() {
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS freshness_score FLOAT DEFAULT 1.0`).catch(() => {});
  await query(`ALTER TABLE event_clusters ADD COLUMN IF NOT EXISTS freshness_score FLOAT DEFAULT 1.0`).catch(() => {});
}

// ── Cluster Detection (Story Clustering 2.0) ────────────────────────────────

/**
 * detectStories — Main story clustering engine
 * Three-layer gate: Category → Entity → Keyword (in order)
 * Creates/assigns articles to story_clusters based on semantic similarity
 * Recalculates quality/confidence metrics for affected stories
 *
 * @param {string[]} newArticleIds — UUIDs of new articles to cluster
 */
export async function detectStories(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const { rows: articles } = await query(
    `SELECT id, title, source_id, detected_at FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  // Separate recurring content — flag them but don't cluster into editorial stories
  const storyArticles = articles.filter(a => !isRecurringContent(a.title));
  const recurringOnes = articles.filter(a =>  isRecurringContent(a.title));

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

  if (storyArticles.length === 0) return;

  // ── Load active stories with FROZEN title keywords + entity names ──────────
  // Signature is built from the cluster TITLE only — never from accumulated
  // article titles. This prevents cascade contamination where one wrong match
  // inflates the keyword pool and attracts more wrong articles.
  const { rows: activeStories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.story_type,
      COALESCE(sc.detected_category, '') AS detected_category,
      COALESCE(
        array_agg(DISTINCT lower(ke.name)) FILTER (WHERE ke.name IS NOT NULL),
        ARRAY[]::text[]
      ) AS entity_names
    FROM story_clusters sc
    LEFT JOIN story_entities se ON se.story_id = sc.id
    LEFT JOIN knowledge_entities ke ON ke.id = se.entity_id AND ke.entity_origin = 'MONITOR'
    WHERE sc.status IN ('active','summarizing','ready')
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '${STORY_WINDOW_HOURS} hours'
    GROUP BY sc.id, sc.title, sc.story_type, sc.detected_category
  `);

  // Pre-compute category for each active story (use stored value when available)
  const signatures = activeStories.map(s => {
    const catResult = s.detected_category ? { category: s.detected_category } : detectStoryCategory(s.title, s.story_type);
    const category = catResult.category;
    return {
      id:       s.id,
      category,
      // FROZEN: title keywords only — never grows during this cycle
      keywords: extractStoryKeywords(s.title),
      entities: s.entity_names || [],
    };
  });

  // ── Load MONITOR entity names for the new articles (one batch query) ───────
  const { rows: artEntityRows } = await query(`
    SELECT aem.article_id::text AS article_id, lower(ke.name) AS entity_name
    FROM article_entity_matches aem
    JOIN knowledge_entities ke ON ke.id = aem.entity_id
    WHERE aem.article_id = ANY($1::uuid[])
      AND ke.entity_origin = 'MONITOR'
  `, [newArticleIds]);

  const artEntityMap = new Map(); // article_id → Set<entity_name>
  for (const row of artEntityRows) {
    if (!artEntityMap.has(row.article_id)) artEntityMap.set(row.article_id, new Set());
    artEntityMap.get(row.article_id).add(row.entity_name);
  }

  const affectedIds = new Set();

  for (const article of storyArticles) {
    const artKw       = extractStoryKeywords(article.title);
    if (artKw.length < 2) continue;

    const artEntities = artEntityMap.get(article.id) || new Set();
    const artCatResult = detectStoryCategory(article.title, null, artEntities);
    const artCategory = artCatResult.category;

    let bestId     = null;
    let bestComposite = 0;
    let bestScores    = null;

    for (const sig of signatures) {
      // ── Gate 1: category must match ──────────────────────────────────────
      if (sig.category !== artCategory) continue;

      // ── Gate 2: entity intersection (only when both sides have enough data)
      const sharedEntities = sig.entities.filter(e => artEntities.has(e));
      if (
        sig.entities.length >= STORY_ENTITY_GATE_MIN_STORY &&
        artEntities.size    >= STORY_ENTITY_GATE_MIN_ARTICLE &&
        sharedEntities.length === 0
      ) continue;

      // ── Gate 3: keyword Jaccard on frozen title signature ─────────────────
      const kwScore = jaccardSim(artKw, sig.keywords);
      if (kwScore < STORY_MATCH_THRESHOLD) continue;

      // Composite score: keyword 60%, entity 40% (entity defaults to 0.5 when no data)
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
      // ── Assign to existing story ──────────────────────────────────────────
      const { kwScore, entityScore, sharedEntities, sharedKw } = bestScores;
      const storyClusterArticleSql = `
        INSERT INTO story_cluster_articles
          (story_id, article_id, relevance_score, matching_reason,
           shared_keywords, shared_entities, keyword_similarity, title_similarity, entity_similarity,
           category_match, category_score, entity_score, keyword_score)
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::numeric,
          'keyword_jaccard',
          $4::jsonb,
          $5::jsonb,
          $6::numeric,
          $7::numeric,
          $8::numeric,
          true,
          1.0,
          $9::float8,
          $10::float8
        )
        ON CONFLICT DO NOTHING
      `;
      const storyClusterArticleParams = [
        bestId,
        article.id,
        Number(bestComposite.toFixed(3)),
        JSON.stringify(sharedKw),
        JSON.stringify(sharedEntities),
        Number(kwScore.toFixed(3)),
        Number(kwScore.toFixed(3)),
        Number(entityScore.toFixed(3)),
        Number(entityScore.toFixed(3)),
        Number(kwScore.toFixed(3))
      ];
      await query(storyClusterArticleSql, storyClusterArticleParams);
      assignedId = bestId;
      // ── NO sig.keywords.push here — signatures are frozen this cycle ──────
    } else {
      // ── Create new story cluster ──────────────────────────────────────────
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

      // Add this new story to the in-memory signatures for later articles in the batch
      signatures.push({
        id:       assignedId,
        category: artCategory,
        keywords: artKw,       // title keywords of the founding article
        entities: [...artEntities],
      });
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
  }

  // ── Backfill detected_category for existing stories that lack it ───────────
  await query(`
    UPDATE story_clusters
    SET detected_category = 'unknown'
    WHERE detected_category IS NULL AND is_recurring = false
  `).catch(() => {});

  // Run contamination detector on affected stories
  if (affectedIds.size > 0) {
    await detectContaminatedStories([...affectedIds]);
  }

  // Recalculate all quality metrics for affected stories using a single CTE query.
  // story_quality thresholds (score-based, single cap):
  //   <20 → poor | 20-44 → fair | 45-69 → good | ≥70 → excellent
  //   Cap: source_count = 1 AND excellent → good (single-source stories can't be excellent)
  // story_confidence ← source_count corroboration (1 = low, 2-3 = medium, 4+ = high)
  for (const storyId of affectedIds) {
    await query(`
      WITH m AS (
        SELECT
          base.rel_score,
          base.depth_score,
          base.div_score,
          base.cov_score,
          base.cnt_articles,
          base.cnt_sources,
          base.articles_last_1h,
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
          WHEN m.total_score < 20  THEN 'poor'
          WHEN m.total_score < 45  THEN 'fair'
          WHEN m.total_score < 70  THEN 'good'
          WHEN m.cnt_sources <= 1  THEN 'good'
          ELSE 'excellent'
        END,
        story_confidence        = CASE
          WHEN m.cnt_sources >= 4 THEN 'high'
          WHEN m.cnt_sources >= 2 THEN 'medium'
          ELSE 'low'
        END,
        -- [Cost Killer 2] Algorithmic coverage_status — no IA needed
        coverage_status         = CASE
          WHEN m.articles_last_1h >= 3 AND m.cnt_sources >= 2 THEN 'breaking'
          WHEN m.articles_last_1h >= 2                         THEN 'growing'
          WHEN m.cnt_articles > 5 AND m.cnt_sources <= 1       THEN 'cooling'
          ELSE 'monitoring'
        END,
        -- [Cost Killer 2] Algorithmic importance_score — no IA needed
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
  }
}

/**
 * detectContaminatedStories — Detect and flag category contamination
 * A story is contaminated if ≥25% of its articles belong to a different category
 * Only flags stories with ≥4 articles (avoid false positives)
 * Does NOT delete associations — human review first
 *
 * @param {string[]} storyIds — story_clusters UUIDs
 */
export async function detectContaminatedStories(storyIds) {
  if (!storyIds.length) return;
  for (const storyId of storyIds) {
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
    const total     = Number(rows[0].article_count);
    const mismatched = Number(rows[0].mismatched || 0);
    // Flag when ≥25% of articles are from a different category
    const contaminated = total >= 4 && mismatched / total >= 0.25;
    await query(
      `UPDATE story_clusters SET contamination_flag = $1, updated_at = now() WHERE id = $2`,
      [contaminated, storyId]
    );
    if (contaminated) {
      console.log(`[Monitor] Contaminación detectada en story ${storyId}: ${mismatched}/${total} artículos con categoría incorrecta`);
    }
  }
}

/**
 * markStaleStories — Mark inactive stories as stale
 * Stories older than STORY_WINDOW_HOURS or with 0 articles marked as stale
 */
export async function markStaleStories() {
  await query(`
    UPDATE story_clusters SET status = 'stale', updated_at = now()
    WHERE status IN ('active','ready')
      AND last_seen < now() - interval '${STORY_WINDOW_HOURS} hours'
  `);
  // Orphan stories: article_count = 0 should never remain active
  await query(`
    UPDATE story_clusters SET status = 'stale', updated_at = now()
    WHERE article_count = 0
      AND status NOT IN ('stale','followed')
      AND is_recurring = false
  `);
}

/**
 * summarizePendingStories — Generate AI summaries for new stories (Cost Killer 1)
 * CURRENTLY COMMENTED OUT - Called only via explicit user action in /editorial-workflow/dossiers/:id/enrich
 * Requires sufficient article coverage (ENRICHMENT_GATE_COVERAGE) before proceeding
 * Filters articles by RELEVANCE_FILTER_THRESHOLD
 *
 * @deprecated Cost Killer 1: Disabled automatic summarization
 */
export async function summarizePendingStories() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { rows: pending } = await query(`
    SELECT sc.id, sc.title
    FROM story_clusters sc
    WHERE sc.status = 'active'
      AND sc.is_recurring = false
      AND (sc.article_count >= $1 OR sc.source_count >= $2)
      AND sc.last_seen > now() - interval '${STORY_WINDOW_HOURS} hours'
      AND (
        SELECT CASE WHEN COUNT(*) = 0 THEN false
               ELSE (COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright')))::float
                    / COUNT(*) >= $3
               END
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        WHERE sca.story_id = sc.id
      )
    ORDER BY sc.source_count DESC, sc.article_count DESC
    LIMIT 3
  `, [STORY_SUMMARY_MIN_ARTICLES, STORY_SUMMARY_MIN_SOURCES, ENRICHMENT_GATE_COVERAGE]);

  for (const story of pending) {
    await query(
      `UPDATE story_clusters SET status = 'summarizing', updated_at = now() WHERE id = $1`,
      [story.id]
    );

    const [articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
               ma.content_words, ts.name AS source_name
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN tracked_sources    ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1
          AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      `, [story.id]),
      query(`
        SELECT ke.name, ke.entity_type, se.role
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = $1
        LIMIT 12
      `, [story.id]),
    ]);

    // Log AI context for traceability
    query(`
      INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
      VALUES ($1, 'story_summary', $2, $3, $4)
    `, [
      story.id,
      articlesRes.rows.length,
      JSON.stringify(articlesRes.rows.map(a => a.title)),
      articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
    ]).catch(() => {});

    try {
      const result = await ai.generateStorySummary(articlesRes.rows, entitiesRes.rows);
      await query(`
        UPDATE story_clusters SET
          title                   = $1,
          summary                 = $2,
          story_type              = $3,
          importance_score        = $4,
          coverage_status         = $5,
          editorial_opportunities = $6,
          status                  = 'ready',
          updated_at              = now()
        WHERE id = $7
      `, [
        result.headline,
        result.summary,
        result.story_type     || 'news',
        result.importance_score ?? 5,
        result.coverage_status || 'monitoring',
        JSON.stringify(result.editorial_opportunities || []),
        story.id,
      ]);
      console.log(`[Monitor] Story ready: "${result.headline}"`);
    } catch (e) {
      console.error(`[Monitor] Story summarization failed for "${story.title}":`, e.message);
      await query(
        `UPDATE story_clusters SET status = 'active', updated_at = now() WHERE id = $1`,
        [story.id]
      );
    }
  }
}
