#!/usr/bin/env node

/**
 * TEST DIRECTO: Llamar detectStories() con el artículo específico
 *
 * Esto nos permite ver el logging instrumental sin esperar el siguiente ciclo
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Crear pool
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Importar las funciones del newsMonitor
// Porque es un ESM module, necesitamos cargar el código
import { readFileSync } from 'fs';

const newsMonitorCode = readFileSync(join(__dirname, 'src/jobs/newsMonitor.js'), 'utf8');

// Ejecutar el código en contexto (no el ideal, pero lo hacemos para el logging)
console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
console.log(`║  TEST DIRECTO: detectStories()                                  ║`);
console.log(`║  Article ID: d36fc24b-d390-4998-8d70-9781d8510066               ║`);
console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result;
}

// Minimal implementations of helper functions
function isRecurringContent(title) {
  const RECURRING_PATTERNS = [
    /cotización del d[óo]lar/i,
    /clima|pronóstico|temperatura|lluvia/i,
    /horóscopo|astrología/i,
    /virus corona|covid/i,
  ];
  return RECURRING_PATTERNS.some(p => p.test(title));
}

function generateStorySlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function extractStoryKeywords(title) {
  const STOPWORDS = new Set([
    'de', 'en', 'por', 'para', 'con', 'la', 'el', 'los', 'las',
    'es', 'son', 'fue', 'es', 'a', 'y', 'o', 'e', 'u',
    'que', 'este', 'este', 'ese', 'otro', 'cual', 'quien',
    'el', 'la', 'un', 'una', 'unos', 'unas',
    'una', 'más', 'muy', 'menos', 'poco', 'todo', 'nada',
    'al', 'del', 'sobre', 'bajo', 'ante', 'tras'
  ]);

  if (!title) return [];
  const words = title.toLowerCase().split(/\W+/);
  return words.filter(w => w.length > 3 && !STOPWORDS.has(w)).slice(0, 10);
}

function jaccardSim(arr1, arr2) {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

function jaccardShared(arr1, arr2) {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  return [...set1].filter(x => set2.has(x));
}

function detectStoryCategory(title, storyType = null, entities = new Set()) {
  // Simplificado para el test
  if (!title) return { category: 'unknown', confidence: 0 };

  const text = (title + ' ' + Array.from(entities).join(' ')).toLowerCase();

  const categories = {
    sports: /futbol|fútbol|rugby|tenis|basquet|atletismo|natación|voley|golf|automovilismo|copa|liga|campeonato|mundial|olimpiada|equipo|jugador|técnico|entrenador/i,
    politics: /elección|voto|diputado|senador|minister|gobierno|congreso|legislativo|partido político|votación|candidat/i,
    economy: /dólar|moneda|inflación|bolsa|valores|banco|préstamo|mercado|economía|salario|jubilación|cotización/i,
    society: /crimen|asesinato|robo|justicia|tribunal|juzgado|fiscal|abogado|policía|seguridad|accidente|fallecimiento|muert/i,
    entertainment: /cine|película|serie|actor|actriz|música|canción|concierto|televisión|artista|famoso|celebrity|estrella/i,
    international: /eeuu|estados unidos|china|rusia|europa|unión europea|guerra|conflicto|embajador|diplomacia|tratado/i,
    health: /covid|virus|vacuna|hospital|doctor|médico|enfermedad|salud|medicamento|fármaco|pandemia/i,
    technology: /tecnología|software|hardware|inteligencia artificial|ia|robot|aplicación|sistema|programa|computadora|internet/i,
  };

  let detected = 'unknown';
  let maxMatches = 0;

  for (const [cat, regex] of Object.entries(categories)) {
    const matches = (text.match(regex) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detected = cat;
    }
  }

  return { category: detected, confidence: maxMatches > 0 ? Math.min(0.9, maxMatches * 0.1) : 0 };
}

async function detectStories(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';
  const isTracing = newArticleIds.includes(TRACE_ARTICLE_ID);
  if (isTracing) console.log(`\n[TRACE] Starting detectStories() for article ${TRACE_ARTICLE_ID}`);

  const { rows: articles } = await query(
    `SELECT id, title, source_id, detected_at FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  if (isTracing) {
    const found = articles.find(a => a.id === TRACE_ARTICLE_ID);
    if (found) {
      console.log(`[TRACE] ✅ Article found in SELECT: title="${found.title}"`);
    } else {
      console.log(`[TRACE] ❌ Article NOT found in SELECT (CRITICAL BUG)`);
      return;
    }
  }

  // Separate recurring content
  const storyArticles = articles.filter(a => !isRecurringContent(a.title));
  const recurringOnes = articles.filter(a =>  isRecurringContent(a.title));

  if (isTracing) {
    const inRecurring = recurringOnes.find(a => a.id === TRACE_ARTICLE_ID);
    if (inRecurring) {
      console.log(`[TRACE] ⚠️  Article is RECURRING CONTENT (will be handled separately)`);
      return;
    } else if (storyArticles.find(a => a.id === TRACE_ARTICLE_ID)) {
      console.log(`[TRACE] ✅ Article passed recurring filter, will be processed`);
    } else {
      console.log(`[TRACE] ❌ Article disappeared after filtering (BUG in filter logic)`);
      return;
    }
  }

  if (storyArticles.length === 0) return;

  // Load active stories
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
      AND sc.last_seen > now() - interval '24 hours'
    GROUP BY sc.id, sc.title, sc.story_type, sc.detected_category
    ORDER BY sc.last_seen DESC
    LIMIT 100
  `);

  // Load article entities
  const { rows: artEntityRows } = await query(`
    SELECT aem.article_id::text AS article_id, lower(ke.name) AS entity_name
    FROM article_entity_matches aem
    JOIN knowledge_entities ke ON ke.id = aem.entity_id
    WHERE aem.article_id = ANY($1::uuid[])
      AND ke.entity_origin = 'MONITOR'
  `, [newArticleIds]);

  const artEntityMap = new Map();
  for (const row of artEntityRows) {
    if (!artEntityMap.has(row.article_id)) artEntityMap.set(row.article_id, new Set());
    artEntityMap.get(row.article_id).add(row.entity_name);
  }

  const signatures = activeStories.map(s => {
    const catResult = s.detected_category ? { category: s.detected_category } : detectStoryCategory(s.title, s.story_type);
    const category = catResult.category;
    return {
      id:       s.id,
      category,
      keywords: extractStoryKeywords(s.title),
      entities: s.entity_names || [],
    };
  });

  const affectedIds = new Set();
  const STORY_ENTITY_GATE_MIN_STORY = 3;
  const STORY_ENTITY_GATE_MIN_ARTICLE = 1;
  const STORY_MATCH_THRESHOLD = 0.20;

  for (const article of storyArticles) {
    const isArticleTrace = isTracing && article.id === TRACE_ARTICLE_ID;

    const artKw = extractStoryKeywords(article.title);

    if (isArticleTrace) {
      console.log(`[TRACE] Processing article "${article.title.substring(0, 60)}..."`);
      console.log(`[TRACE] Keywords extracted: [${artKw.join(', ')}] (${artKw.length} keywords)`);
    }

    if (artKw.length < 2) {
      if (isArticleTrace) console.log(`[TRACE] ❌ GATE FAIL: Keywords < 2 (${artKw.length} found) — SKIPPED`);
      continue;
    }

    const artEntities = artEntityMap.get(article.id) || new Set();
    const artCatResult = detectStoryCategory(article.title, null, artEntities);
    const artCategory = artCatResult.category;

    if (isArticleTrace) {
      console.log(`[TRACE] Category detected: "${artCategory}"`);
      console.log(`[TRACE] Entities found: [${Array.from(artEntities).join(', ')}] (${artEntities.size} entities)`);
      console.log(`[TRACE] Active stories to match: ${signatures.length}`);
    }

    let bestId = null;
    let bestComposite = 0;
    let gateEvalCount = 0;

    for (const sig of signatures) {
      if (sig.category !== artCategory) {
        if (isArticleTrace) console.log(`[TRACE]   Story [${sig.id}] "${sig.category}" ≠ "${artCategory}" — GATE 1 FAIL`);
        continue;
      }

      gateEvalCount++;

      const sharedEntities = sig.entities.filter(e => artEntities.has(e));
      const gate2Active = (
        sig.entities.length >= STORY_ENTITY_GATE_MIN_STORY &&
        artEntities.size >= STORY_ENTITY_GATE_MIN_ARTICLE
      );

      if (gate2Active && sharedEntities.length === 0) {
        if (isArticleTrace) {
          console.log(`[TRACE]   Story [${sig.id}] GATE 2 FAIL: ${sig.entities.length} entities in story, ${artEntities.size} in article, 0 shared`);
        }
        continue;
      }

      const kwScore = jaccardSim(artKw, sig.keywords);
      if (kwScore < STORY_MATCH_THRESHOLD) {
        if (isArticleTrace) {
          const sharedKw = jaccardShared(artKw, sig.keywords);
          console.log(`[TRACE]   Story [${sig.id}] GATE 3 FAIL: kwScore=${kwScore.toFixed(3)} < ${STORY_MATCH_THRESHOLD} (shared: [${sharedKw.join(', ')}])`);
        }
        continue;
      }

      const entityScore = sig.entities.length > 0 ? sharedEntities.length / sig.entities.length : 0.5;
      const composite = parseFloat((kwScore * 0.6 + entityScore * 0.4).toFixed(3));

      if (isArticleTrace) {
        console.log(`[TRACE]   Story [${sig.id}] ALL GATES PASS: composite=${composite.toFixed(3)}`);
      }

      if (composite > bestComposite) {
        bestComposite = composite;
        bestId = sig.id;
        if (isArticleTrace) console.log(`[TRACE]      ✅ NEW BEST MATCH`);
      }
    }

    if (isArticleTrace) {
      if (bestId) {
        console.log(`[TRACE] ✅ ASSIGNED to story ${bestId}`);
      } else {
        console.log(`[TRACE] ❌ NO MATCH FOUND (${gateEvalCount} stories passed Gate 1)`);
      }
    }

    affectedIds.add(bestId || 'new');
  }

  console.log(`\n[TRACE] detectStories() completed`);
}

async function main() {
  try {
    const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';
    console.log(`[TEST] Calling detectStories with article ID: ${TRACE_ARTICLE_ID}\n`);
    await detectStories([TRACE_ARTICLE_ID]);
  } catch (e) {
    console.error(`[ERROR]`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
