/**
 * Sprint 8.0A — Validación de Transcripts
 * Auditoría completa: cobertura, calidad, IA, costos, rendimiento
 * Ejecutar: node scripts/audit_sprint8.js
 */
import 'dotenv/config';
import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { fetchYouTubeTranscript } from '../src/connectors/social/transcripts.js';

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const q = (sql, params) => pool.query(sql, params);

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
// Haiku pricing (2025): $0.80/M input tokens, $4.00/M output tokens
const HAIKU_IN_PER_TOK  = 0.80  / 1_000_000;
const HAIKU_OUT_PER_TOK = 4.00  / 1_000_000;

function usd(cents) { return `$${cents.toFixed(4)}`; }
function sep(title) { console.log(`\n${'═'.repeat(60)}\n${title}\n${'─'.repeat(60)}`); }

// ── PASO 0: Asegurar schema ───────────────────────────────────────────────────

async function ensureSchema() {
  sep('PASO 0 — Schema migration');
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS transcript_available BOOLEAN`).catch(() => {});
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS transcript_fetched_at TIMESTAMP`).catch(() => {});
  await q(`
    CREATE TABLE IF NOT EXISTS video_transcripts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id          UUID REFERENCES social_posts(id) ON DELETE CASCADE,
      transcript_text  TEXT,
      transcript_language VARCHAR(20),
      transcript_source   VARCHAR(20),
      transcript_length   INTEGER,
      fetched_at       TIMESTAMP DEFAULT NOW(),
      UNIQUE (post_id)
    )
  `).catch(() => {});
  await q(`
    CREATE TABLE IF NOT EXISTS transcript_analysis (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id          UUID REFERENCES social_posts(id) ON DELETE CASCADE,
      summary          TEXT,
      entities_people  JSONB DEFAULT '[]',
      entities_places  JSONB DEFAULT '[]',
      entities_orgs    JSONB DEFAULT '[]',
      main_topics      JSONB DEFAULT '[]',
      quotes           JSONB DEFAULT '[]',
      keywords         JSONB DEFAULT '[]',
      generated_at     TIMESTAMP DEFAULT NOW(),
      UNIQUE (post_id)
    )
  `).catch(() => {});
  console.log('✅ Schema OK');
}

// ── AUDITORÍA 1: Cobertura ────────────────────────────────────────────────────

async function auditoria1() {
  sep('AUDITORÍA 1 — COBERTURA REAL');

  // Totales globales
  const { rows: [totals] } = await q(`
    SELECT
      COUNT(*) FILTER (WHERE ss.content_type = 'videos')  AS total_videos,
      COUNT(*) FILTER (WHERE ss.content_type = 'shorts')  AS total_shorts,
      COUNT(*) FILTER (WHERE ss.content_type = 'posts')   AS total_community,
      COUNT(*) FILTER (WHERE sp.transcript_available = true)  AS with_transcript,
      COUNT(*) FILTER (WHERE sp.transcript_available = false) AS without_transcript,
      COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL AND ss.content_type IN ('videos','shorts')) AS pending
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube'
  `);

  const eligible = parseInt(totals.total_videos) + parseInt(totals.total_shorts);
  const checked  = parseInt(totals.with_transcript) + parseInt(totals.without_transcript);
  const coverage = checked > 0
    ? ((parseInt(totals.with_transcript) / checked) * 100).toFixed(1)
    : 0;

  console.log(`
Total videos YouTube : ${totals.total_videos}
Total shorts YouTube : ${totals.total_shorts}
Posts comunidad      : ${totals.total_community} (no aplica transcript)
─────────────────────────
Elegibles (vid+short): ${eligible}
  Con transcript     : ${totals.with_transcript}
  Sin transcript     : ${totals.without_transcript}
  Pendientes (nuevo) : ${totals.pending}
─────────────────────────
COBERTURA REAL       : ${coverage}%`);

  // Por fuente
  console.log('\nDesglose por fuente:');
  const { rows: bySource } = await q(`
    SELECT
      ss.name,
      ss.content_type,
      COUNT(sp.id)                                           AS total,
      COUNT(*) FILTER (WHERE sp.transcript_available = true)  AS con_transcript,
      COUNT(*) FILTER (WHERE sp.transcript_available = false) AS sin_transcript,
      COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL) AS no_verificado
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube' AND ss.content_type IN ('videos','shorts')
    GROUP BY ss.name, ss.content_type
    ORDER BY ss.name, ss.content_type
  `);

  const headerFmt = (n) => n.padEnd(28);
  console.log(`${headerFmt('Fuente')} ${'Type'.padEnd(8)} ${'Total'.padEnd(7)} ${'✓'.padEnd(6)} ${'✗'.padEnd(6)} ${'Pend'.padEnd(6)}`);
  console.log('─'.repeat(65));
  for (const r of bySource) {
    const pct = (parseInt(r.con_transcript) + parseInt(r.sin_transcript)) > 0
      ? ` (${((r.con_transcript/(parseInt(r.con_transcript)+parseInt(r.sin_transcript)))*100).toFixed(0)}%)`
      : ' (no ver.)';
    console.log(
      `${r.name.slice(0,27).padEnd(28)} ${r.content_type.padEnd(8)} ${String(r.total).padEnd(7)} ${String(r.con_transcript).padEnd(6)} ${String(r.sin_transcript).padEnd(6)} ${String(r.no_verificado).padEnd(6)}${pct}`
    );
  }

  return totals;
}

// ── FETCH manual: obtener transcripts para la auditoría ───────────────────────

async function fetchSampleTranscripts(limit = 20) {
  sep(`FETCH — Obteniendo ${limit} transcripts de muestra`);

  const { rows: pending } = await q(`
    SELECT sp.id, sp.url, sp.title, ss.name AS source_name, ss.content_type
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube'
      AND ss.content_type IN ('videos','shorts')
      AND sp.url IS NOT NULL
      AND sp.transcript_fetched_at IS NULL
    ORDER BY RANDOM()
    LIMIT $1
  `, [limit]);

  if (!pending.length) {
    console.log('✓ No hay videos pendientes — todos ya verificados.');
    return;
  }

  console.log(`Procesando ${pending.length} videos...`);
  let found = 0, notFound = 0, errors = 0;

  for (const post of pending) {
    const t0 = Date.now();
    const result = await fetchYouTubeTranscript(post.url);
    const ms = Date.now() - t0;

    if (result === null) {
      console.log(`  ❓ ERROR     ${post.source_name} — ${post.title?.slice(0,50)} (${ms}ms)`);
      errors++;
      continue;
    }

    if (result.available) {
      await q(`
        INSERT INTO video_transcripts (post_id, transcript_text, transcript_language, transcript_source, transcript_length)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (post_id) DO UPDATE SET
          transcript_text=$2, transcript_language=$3, transcript_source=$4, transcript_length=$5, fetched_at=NOW()
      `, [post.id, result.text, result.language, result.source, result.text.length]);
      await q(`UPDATE social_posts SET transcript_available=true,  transcript_fetched_at=NOW() WHERE id=$1`, [post.id]);
      console.log(`  ✅ FOUND     [${result.language}/${result.source}] ${post.source_name} — ${post.title?.slice(0,45)} (${result.text.length} chars, ${ms}ms)`);
      found++;
    } else {
      await q(`UPDATE social_posts SET transcript_available=false, transcript_fetched_at=NOW() WHERE id=$1`, [post.id]);
      console.log(`  ✗  NOT FOUND [${result.reason}] ${post.source_name} — ${post.title?.slice(0,45)} (${ms}ms)`);
      notFound++;
    }
  }

  console.log(`\nResultado fetch: ✅ ${found} con transcript · ✗ ${notFound} sin transcript · ❓ ${errors} errores`);
}

// ── AUDITORÍA 2: Calidad de transcript ───────────────────────────────────────

async function auditoria2() {
  sep('AUDITORÍA 2 — CALIDAD DE TRANSCRIPT (muestra)');

  for (const contentType of ['videos', 'shorts']) {
    console.log(`\n── ${contentType.toUpperCase()} (muestra aleatoria de hasta 10) ──`);

    const { rows } = await q(`
      SELECT sp.title, ss.name AS source_name, ss.content_type,
             vt.transcript_language, vt.transcript_source, vt.transcript_length,
             vt.transcript_text, vt.fetched_at
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.content_type = $1
      ORDER BY RANDOM()
      LIMIT 10
    `, [contentType]);

    if (!rows.length) {
      console.log('  (sin datos aún)');
      continue;
    }

    for (const [i, r] of rows.entries()) {
      const preview = (r.transcript_text || '').slice(0, 300).replace(/\n/g, ' ');
      const words   = (r.transcript_text || '').split(/\s+/).length;

      console.log(`
  ${i+1}. ${r.source_name} — "${r.title?.slice(0,60)}"
     Idioma: ${r.transcript_language} | Fuente: ${r.transcript_source} | Largo: ${r.transcript_length?.toLocaleString()} chars / ~${words} palabras
     Preview: "${preview}${preview.length === 300 ? '…' : ''}"`);

      // Flag potential issues
      const issues = [];
      if ((r.transcript_text || '').split(/\s+/).length < 20)      issues.push('⚠ MUY CORTO (<20 palabras)');
      if ((r.transcript_text || '').match(/(.{10,})\1{3,}/))       issues.push('⚠ TEXTO REPETIDO');
      if (r.transcript_language !== 'es' && !r.transcript_language?.startsWith('es')) issues.push(`⚠ IDIOMA NO ES (${r.transcript_language})`);
      if (issues.length) console.log(`     ${issues.join(' | ')}`);
    }
  }
}

// ── AUDITORÍA 3: Calidad del resumen IA ──────────────────────────────────────

async function auditoria3() {
  sep('AUDITORÍA 3 — CALIDAD DEL RESUMEN IA');

  const costs = { input: 0, output: 0 };
  const timings = [];

  // Obtener 5 periodísticos + 5 deportivos
  const { rows: samples } = await q(`
    (
      SELECT sp.id, sp.title, ss.name AS source_name, vt.transcript_text, 'periodístico' AS tipo
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.content_type = 'videos' AND vt.transcript_length > 500
        AND ss.name NOT ILIKE '%sports%' AND ss.name NOT ILIKE '%tyc%'
        AND ss.name NOT ILIKE '%tnt%' AND ss.name NOT ILIKE '%espn%'
      ORDER BY RANDOM() LIMIT 5
    )
    UNION ALL
    (
      SELECT sp.id, sp.title, ss.name AS source_name, vt.transcript_text, 'deportivo' AS tipo
      FROM video_transcripts vt
      JOIN social_posts sp ON sp.id = vt.post_id
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.content_type = 'videos' AND vt.transcript_length > 500
        AND (ss.name ILIKE '%sports%' OR ss.name ILIKE '%tyc%'
          OR ss.name ILIKE '%tnt%'   OR ss.name ILIKE '%espn%')
      ORDER BY RANDOM() LIMIT 5
    )
  `);

  if (!samples.length) {
    console.log('Sin videos suficientes para análisis IA. Necesitás más transcripts (>500 chars).');
    return { costs, timings };
  }

  console.log(`Analizando ${samples.length} videos con Claude Haiku…\n`);

  for (const [i, sample] of samples.entries()) {
    const prompt = `Eres un analista periodístico. Analiza esta transcripción de video y extrae la información clave.

Video: "${sample.title}"
Canal: ${sample.source_name}

Transcripción:
${sample.transcript_text.slice(0, 8000)}

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "summary": "resumen ejecutivo en 100-150 palabras",
  "entities_people": ["persona1"],
  "entities_orgs": ["org1"],
  "entities_places": ["lugar1"],
  "main_topics": ["tema1","tema2"],
  "quotes": ["cita1"],
  "keywords": ["kw1","kw2","kw3"]
}`;

    const t0 = Date.now();
    let analysis = null;
    let error    = null;

    try {
      const msg = await client.messages.create({
        model: HAIKU_MODEL, max_tokens: 1000, temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });
      const ms = Date.now() - t0;
      timings.push(ms);

      const raw = msg.content[0].text;
      costs.input  += (msg.usage.input_tokens  || 0) * HAIKU_IN_PER_TOK;
      costs.output += (msg.usage.output_tokens || 0) * HAIKU_OUT_PER_TOK;

      const jsonMatch = raw.match(/\{[\s\S]+\}/);
      analysis = JSON.parse(jsonMatch?.[0] ?? raw);

      // Persist
      await q(`
        INSERT INTO transcript_analysis
          (post_id, summary, entities_people, entities_places, entities_orgs, main_topics, quotes, keywords)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (post_id) DO UPDATE SET
          summary=$2, entities_people=$3, entities_places=$4, entities_orgs=$5,
          main_topics=$6, quotes=$7, keywords=$8, generated_at=NOW()
      `, [
        sample.id, analysis.summary,
        JSON.stringify(analysis.entities_people || []),
        JSON.stringify(analysis.entities_places || []),
        JSON.stringify(analysis.entities_orgs   || []),
        JSON.stringify(analysis.main_topics     || []),
        JSON.stringify(analysis.quotes          || []),
        JSON.stringify(analysis.keywords        || []),
      ]);

      console.log(`${i+1}. [${sample.tipo}] ${sample.source_name} — "${sample.title?.slice(0,55)}" (${ms}ms)
   RESUMEN: ${analysis.summary?.slice(0,180)}…
   PERSONAS: ${(analysis.entities_people||[]).join(', ') || '—'}
   ORGS:     ${(analysis.entities_orgs   ||[]).join(', ') || '—'}
   LUGARES:  ${(analysis.entities_places ||[]).join(', ') || '—'}
   CITAS:    ${(analysis.quotes||[]).map(q => `"${q.slice(0,80)}"`).join(' | ') || '—'}
   KEYWORDS: ${(analysis.keywords||[]).join(', ')}`);

    } catch (e) {
      error = e.message;
      console.log(`${i+1}. [ERROR] ${sample.title?.slice(0,55)}: ${error}`);
    }
    console.log('');
  }

  return { costs, timings };
}

// ── AUDITORÍA 4: Borradores periodísticos ────────────────────────────────────

async function auditoria4() {
  sep('AUDITORÍA 4 — BORRADORES PERIODÍSTICOS (10 muestras)');

  const costs = { input: 0, output: 0 };
  const timings = [];

  // Videos con análisis ya generado (prioriza los más ricos)
  const { rows: samples } = await q(`
    SELECT sp.id, sp.title, sp.url, sp.published_at, ss.name AS source_name,
           vt.transcript_text, vt.transcript_length
    FROM transcript_analysis ta
    JOIN video_transcripts vt  ON vt.post_id  = ta.post_id
    JOIN social_posts sp       ON sp.id        = vt.post_id
    JOIN social_sources ss     ON ss.id        = sp.source_id
    WHERE vt.transcript_length > 300
    ORDER BY vt.transcript_length DESC
    LIMIT 10
  `);

  if (!samples.length) {
    console.log('Sin transcripts con análisis. Ejecutar Auditoría 3 primero.');
    return { costs, timings };
  }

  console.log(`Generando ${samples.length} borradores con Claude Haiku…\n`);

  for (const [i, s] of samples.entries()) {
    const date = s.published_at
      ? new Date(s.published_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'fecha desconocida';

    const prompt = `Eres un periodista profesional. Escribe un BORRADOR PERIODÍSTICO basado EXCLUSIVAMENTE en la transcripción.

REGLAS OBLIGATORIAS:
1. Solo información EXPLÍCITAMENTE presente en la transcripción
2. No inventar datos ni inferir hechos no mencionados
3. Citar la fuente: video de ${s.source_name} (${s.url})
4. Incluir advertencia editorial al inicio

Video: "${s.title}" — ${s.source_name} — ${date}

Transcripción:
${s.transcript_text.slice(0, 6000)}

Escribe en español con formato periodístico (titular, bajada, cuerpo, ~300-400 palabras):`;

    const t0 = Date.now();
    try {
      const msg = await client.messages.create({
        model: HAIKU_MODEL, max_tokens: 1500, temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      });
      const ms     = Date.now() - t0;
      const draft  = msg.content[0].text;
      const words  = draft.split(/\s+/).length;
      timings.push(ms);

      costs.input  += (msg.usage.input_tokens  || 0) * HAIKU_IN_PER_TOK;
      costs.output += (msg.usage.output_tokens || 0) * HAIKU_OUT_PER_TOK;

      // Check for hallucination patterns
      const hasFuente = draft.includes(s.source_name) || draft.includes('Fuente:') || draft.includes('según');
      const hasAdviso = draft.includes('BORRADOR') || draft.includes('revisión') || draft.includes('borrador');
      const firstPara = draft.split('\n').filter(l => l.trim()).slice(0,3).join(' ');

      console.log(`${i+1}. "${s.title?.slice(0,55)}"
   Canal: ${s.source_name} | Transcript: ${s.transcript_length?.toLocaleString()} chars
   Borrador: ${words} palabras | Tiempo: ${ms}ms
   ✓ Cita fuente: ${hasFuente ? 'SÍ' : '⚠ NO'}  |  ✓ Advertencia editorial: ${hasAdviso ? 'SÍ' : '⚠ NO'}
   Apertura: "${firstPara.slice(0,180)}…"
`);
    } catch (e) {
      console.log(`${i+1}. [ERROR] ${s.title?.slice(0,50)}: ${e.message}\n`);
    }
  }

  return { costs, timings };
}

// ── AUDITORÍA 5+6: Costos y rendimiento ──────────────────────────────────────

function auditoria56(analysisResult, draftResult, fetchTimings) {
  sep('AUDITORÍA 5 — COSTOS (Claude Haiku)');

  const totalCost = (analysisResult.costs.input + analysisResult.costs.output)
                  + (draftResult.costs.input + draftResult.costs.output);

  const analyses = analysisResult.timings.length;
  const drafts   = draftResult.timings.length;

  console.log(`
Haiku pricing: $0.80/M tokens in · $4.00/M tokens out

Auditoría 3 (Análisis IA):
  Input cost  : ${usd(analysisResult.costs.input)}
  Output cost : ${usd(analysisResult.costs.output)}
  Total       : ${usd(analysisResult.costs.input + analysisResult.costs.output)}
  Costo/análisis: ${analyses ? usd((analysisResult.costs.input + analysisResult.costs.output)/analyses) : 'n/a'}

Auditoría 4 (Borradores):
  Input cost  : ${usd(draftResult.costs.input)}
  Output cost : ${usd(draftResult.costs.output)}
  Total       : ${usd(draftResult.costs.input + draftResult.costs.output)}
  Costo/borrador: ${drafts ? usd((draftResult.costs.input + draftResult.costs.output)/drafts) : 'n/a'}

TOTAL AUDITORÍA: ${usd(totalCost)}

Proyección a escala:
  100 análisis/día : ${usd((analysisResult.costs.input + analysisResult.costs.output)/Math.max(analyses,1) * 100)}/día
  100 borradores/día: ${usd((draftResult.costs.input + draftResult.costs.output)/Math.max(drafts,1) * 100)}/día`);

  sep('AUDITORÍA 6 — RENDIMIENTO');

  const avg = (arr) => arr.length ? (arr.reduce((a,b) => a+b, 0) / arr.length / 1000).toFixed(1) : 'n/a';

  console.log(`
Fetch transcripts:
  Muestras : ${fetchTimings.length}
  Promedio : ${avg(fetchTimings)}s
  Min/Max  : ${fetchTimings.length ? (Math.min(...fetchTimings)/1000).toFixed(1) : 'n/a'}s / ${fetchTimings.length ? (Math.max(...fetchTimings)/1000).toFixed(1) : 'n/a'}s

Análisis IA (Haiku):
  Muestras : ${analyses}
  Promedio : ${avg(analysisResult.timings)}s

Borradores (Haiku):
  Muestras : ${drafts}
  Promedio : ${avg(draftResult.timings)}s

Capacidad estimada por ciclo de 30min:
  Transcripts: ${fetchTimings.length ? Math.floor(1800 / (fetchTimings.reduce((a,b)=>a+b,0)/fetchTimings.length/1000)) : '?'} videos
  (limitado por TRANSCRIPT_BATCH=8 por ciclo, no por velocidad)`);
}

// ── RESULTADO FINAL ───────────────────────────────────────────────────────────

async function resultadoFinal() {
  sep('RESULTADO FINAL — DIAGNÓSTICO SPRINT 8.0A');

  const { rows: [cov] } = await q(`
    SELECT
      COUNT(*) FILTER (WHERE sp.transcript_available = true)   AS con,
      COUNT(*) FILTER (WHERE sp.transcript_available = false)  AS sin,
      COUNT(*) FILTER (WHERE sp.transcript_fetched_at IS NULL
        AND sp.platform = 'youtube') AS pendientes
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE ss.content_type IN ('videos','shorts')
  `);

  const { rows: [an] } = await q(`SELECT COUNT(*) AS total FROM transcript_analysis`).catch(() => ({ rows: [{ total: 0 }] }));
  const totalChecked = parseInt(cov.con) + parseInt(cov.sin);
  const pct = totalChecked > 0 ? ((cov.con / totalChecked) * 100).toFixed(1) : 0;

  console.log(`
COBERTURA
  Total verificados  : ${totalChecked}
  Con transcript     : ${cov.con} (${pct}%)
  Sin transcript     : ${cov.sin}
  Pendientes         : ${cov.pendientes}
  Análisis generados : ${an.total}

RECOMENDACIÓN SPRINT 8.1
  [Ver sección de recomendaciones al final del output]`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 SPRINT 8.0A — AUDITORÍA DE TRANSCRIPTS\n' + '═'.repeat(60));
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`AI: ${HAIKU_MODEL}`);
  console.log(`Inicio: ${new Date().toLocaleString('es-AR')}`);

  const fetchTimings = [];

  try {
    // Paso 0: Schema
    await ensureSchema();

    // Auditoría 1: Cobertura actual
    await auditoria1();

    // Fetch transcripts si faltan (para tener datos reales en auditorías 2–4)
    const { rows: [pendCount] } = await q(`
      SELECT COUNT(*) AS cnt FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE sp.platform='youtube' AND ss.content_type IN ('videos','shorts')
        AND sp.transcript_fetched_at IS NULL AND sp.url IS NOT NULL
    `);

    if (parseInt(pendCount.cnt) > 0) {
      sep(`Hay ${pendCount.cnt} videos sin verificar — fetching muestra de hasta 30`);
      const t0 = Date.now();

      const { rows: toFetch } = await q(`
        SELECT sp.id, sp.url, sp.title, ss.name AS source_name, ss.content_type
        FROM social_posts sp
        JOIN social_sources ss ON ss.id = sp.source_id
        WHERE sp.platform='youtube' AND ss.content_type IN ('videos','shorts')
          AND sp.transcript_fetched_at IS NULL AND sp.url IS NOT NULL
        ORDER BY RANDOM() LIMIT 30
      `);

      for (const post of toFetch) {
        const t1 = Date.now();
        const result = await fetchYouTubeTranscript(post.url);
        const ms = Date.now() - t1;
        fetchTimings.push(ms);

        if (result === null) {
          console.log(`  ❓ ${post.source_name} — ${post.title?.slice(0,45)} (${ms}ms)`);
          continue;
        }
        if (result.available) {
          await q(`
            INSERT INTO video_transcripts (post_id, transcript_text, transcript_language, transcript_source, transcript_length)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (post_id) DO UPDATE SET
              transcript_text=$2, transcript_language=$3, transcript_source=$4, transcript_length=$5, fetched_at=NOW()
          `, [post.id, result.text, result.language, result.source, result.text.length]);
          await q(`UPDATE social_posts SET transcript_available=true,  transcript_fetched_at=NOW() WHERE id=$1`, [post.id]);
          console.log(`  ✅ [${result.language}/${result.source}] ${post.source_name} — ${post.title?.slice(0,40)} (${result.text.length} ch, ${ms}ms)`);
        } else {
          await q(`UPDATE social_posts SET transcript_available=false, transcript_fetched_at=NOW() WHERE id=$1`, [post.id]);
          console.log(`  ✗  [${result.reason}] ${post.source_name} — ${post.title?.slice(0,40)} (${ms}ms)`);
        }
      }
      console.log(`\nFetch completado en ${((Date.now()-t0)/1000).toFixed(1)}s`);
    } else {
      console.log('\n(Todos los videos ya verificados — usando datos existentes)');
    }

    // Auditoría 1 actualizada post-fetch
    console.log('\n── Cobertura actualizada post-fetch ──');
    await auditoria1();

    // Auditoría 2: Calidad transcript
    await auditoria2();

    // Auditoría 3: IA
    const analysisResult = process.env.ANTHROPIC_API_KEY
      ? await auditoria3()
      : { costs: { input: 0, output: 0 }, timings: [] };

    // Auditoría 4: Borradores
    const draftResult = process.env.ANTHROPIC_API_KEY
      ? await auditoria4()
      : { costs: { input: 0, output: 0 }, timings: [] };

    // Auditoría 5+6: Costos y rendimiento
    auditoria56(analysisResult, draftResult, fetchTimings);

    // Resultado final
    await resultadoFinal();

    console.log(`\n✅ Auditoría completada: ${new Date().toLocaleString('es-AR')}\n`);

  } catch (e) {
    console.error('\n❌ Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
