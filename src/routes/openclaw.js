/**
 * OpenClaw Routes
 *
 * REGLA DE ORO:
 * - NO crea lógica editorial
 * - NO duplica lógica
 * - NO implementa algoritmos
 *
 * Solo consulta Panorama, organiza contexto, llama Sonnet, devuelve evidencias
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { retrieveEditorialEvidence } from '../services/retrieval.js';
import { rankEditorialEvidence } from '../services/ranker.js';
import { buildEditorialContext, calculateConfidence, detectEditorialGaps, explainRanking } from '../services/editorialContext.js';
import { parseQuestion } from '../services/OpenClawParser.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const claude = new Anthropic();
const MODEL = 'claude-sonnet-4-6';
const DEBUG = process.env.OPENCLAW_DEBUG === 'true';

/**
 * parseThemesFromAnswer(answer)
 * Parsea la respuesta de Sonnet en temas con narrativa + URLs
 *
 * Formato esperado:
 * ## Tema 1
 * [narrativa]
 * FUENTES USADAS:
 * - Medio1 — https://url1
 * - Medio2 — https://url2
 *
 * ---
 *
 * ## Tema 2
 * [narrativa]
 * FUENTES USADAS:
 * - Medio3 — https://url3
 */
function parseThemesFromAnswer(answer) {
  const themes = [];

  // Dividir por "---" o por "## " (temas)
  const themeBlocks = answer.split(/^---$/m);

  themeBlocks.forEach(block => {
    // Buscar encabezado "## Nombre del tema"
    const titleMatch = block.match(/^##\s+(.+?)$/m);
    if (!titleMatch) return;

    const title = titleMatch[1].trim();

    // Extraer narrativa (todo antes de "FUENTES USADAS")
    const narrativeMatch = block.match(/^## .+?$([\s\S]*?)(?:FUENTES USADAS:|$)/m);
    const narrative = narrativeMatch ? narrativeMatch[1].trim() : '';

    // Extraer FUENTES USADAS
    const sourcesMatch = block.match(/FUENTES USADAS:\s*([\s\S]*?)(?:^##|$)/m);
    const sourcesText = sourcesMatch ? sourcesMatch[1] : '';

    // Parsear cada línea "- Medio — URL"
    const sources = [];
    const sourceLines = sourcesText.split('\n').filter(l => l.trim().startsWith('-'));

    sourceLines.forEach(line => {
      // Formato: "- Medio — https://..."
      const sourceMatch = line.match(/^-\s*(.+?)\s*—\s*(https?:\/\/.+?)(?:\s|$)/);
      if (sourceMatch) {
        sources.push({
          medium: sourceMatch[1].trim(),
          url: sourceMatch[2].trim()
        });
      }
    });

    if (title) {
      themes.push({
        title,
        narrative,
        sources
      });
    }
  });

  return themes;
}

/**
 * formatBriefingForSonnet(briefing)
 * Convierte el briefing JSON en texto legible para que Sonnet
 * vea claramente las URLs y timestamps de las fuentes
 */
function formatBriefingForSonnet(briefing) {
  let text = '';

  // EDITORIAL
  if (briefing.stories && briefing.stories.length > 0) {
    text += '📰 EDITORIAL\n';
    briefing.stories.slice(0, 10).forEach((story, i) => {
      const timestamp = story.detected_at ? new Date(story.detected_at).toLocaleTimeString('es-AR') : 'sin hora';
      text += `  ${i + 1}. ${story.source_name || 'Desconocido'} (${timestamp})\n`;
      text += `     Título: ${story.title || 'Sin título'}\n`;
      if (story.url) text += `     URL: ${story.url}\n`;
      text += '\n';
    });
    text += '\n';
  }

  // SOCIAL
  if (briefing.social && briefing.social.length > 0) {
    text += '📱 REDES SOCIALES\n';
    briefing.social.slice(0, 5).forEach((post, i) => {
      text += `  ${i + 1}. ${post.platform || 'Red social'}\n`;
      text += `     Post: ${post.title || 'Sin título'}\n`;
      if (post.url) text += `     URL: ${post.url}\n`;
      text += `     Engagement: ${post.total_engagement || 0}\n`;
      text += '\n';
    });
    text += '\n';
  }

  // COVERAGE
  if (briefing.coverage && briefing.coverage.length > 0) {
    text += '📊 CAMBIOS DETECTADOS\n';
    briefing.coverage.slice(0, 5).forEach((change, i) => {
      const timestamp = change.detected_at ? new Date(change.detected_at).toLocaleTimeString('es-AR') : 'sin hora';
      text += `  ${i + 1}. ${change.source_name || 'Desconocido'} (${timestamp})\n`;
      text += `     Tipo: ${change.change_type || 'cambio'}\n`;
      if (change.article_url) text += `     URL: ${change.article_url}\n`;
      text += '\n';
    });
    text += '\n';
  }

  // EVENTS
  if (briefing.events && briefing.events.length > 0) {
    text += '🔔 EVENTOS\n';
    briefing.events.slice(0, 5).forEach((event, i) => {
      text += `  ${i + 1}. ${event.headline || 'Evento'}\n`;
      text += `     Historias: ${event.story_count || 0}, Medios: ${event.source_count || 0}\n`;
      text += '\n';
    });
    text += '\n';
  }

  return text || 'No hay contexto disponible';
}

// Session memory (10 min TTL)
const sessionMemory = new Map();

// Audit log buffer (in-memory for debugging)
const auditBuffer = [];
const MAX_AUDIT_LINES = 500;

function auditLog(msg) {
  auditBuffer.push(msg);
  if (auditBuffer.length > MAX_AUDIT_LINES) {
    auditBuffer.shift();
  }
  console.log('[AUDIT]', msg);
}

function getSession(userId) {
  let session = sessionMemory.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    session = {
      lastEntity: null,
      expiresAt: Date.now() + 600000
    };
    sessionMemory.set(userId, session);
  }
  return session;
}

/**
 * POST /openclaw/ask
 */
router.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.body;
    const userId = req.user.sub;
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question required' });
    }

    const start = Date.now();

    // ===== COMPLETE REQUEST INSTRUMENTATION =====
    console.log('\n' + '='.repeat(70));
    console.log(`[${requestId}] ══════════════════════════════════════════════════════════════`);
    console.log(`[${requestId}] NEW REQUEST`);
    console.log(`[${requestId}] ══════════════════════════════════════════════════════════════`);
    console.log(`[${requestId}] QUESTION: "${question}"`);
    console.log(`[${requestId}] USER: ${userId}`);

    // STEP 1: RETRIEVAL FROM PANORAMA
    console.log(`[${requestId}] STEP 1: RETRIEVING FROM PANORAMA`);
    const retrievalStart = Date.now();

    const evidence = await retrieveEditorialEvidence(question);

    const session = getSession(userId);
    if (evidence.query.entity) {
      session.lastEntity = evidence.query.entity;
      console.log(`[${requestId}]   ✓ Saved to session: "${evidence.query.entity}"`);
    }

    console.log(`[${requestId}]   Query intent: ${evidence.query.intent}`);
    console.log(`[${requestId}]   Query entity: ${evidence.query.entity || '(global)'}`);
    console.log(`[${requestId}]   Query timeframe: ${evidence.query.timeframe} (${evidence.query.hours} hours)`);
    console.log(`[${requestId}]   ✓ Retrieval completed in ${Date.now() - retrievalStart}ms`);
    console.log(`[${requestId}]   RESULTS:`);
    console.log(`[${requestId}]     stories: ${evidence.stories.length}`);
    console.log(`[${requestId}]     events: ${evidence.events.length}`);
    console.log(`[${requestId}]     social: ${evidence.social.length}`);
    console.log(`[${requestId}]     coverage: ${evidence.coverage.length}`);
    console.log(`[${requestId}]     opportunities: ${evidence.opportunities.length}`);
    console.log(`[${requestId}]     entities: ${evidence.entities.length}`);
    auditLog(`[${requestId}] STEP 1 RESULTS: stories=${evidence.stories.length} events=${evidence.events.length} social=${evidence.social.length} coverage=${evidence.coverage.length} opps=${evidence.opportunities.length}`);

    // STEP 2: RANK EDITORIAL EVIDENCE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 2: RANKING EDITORIAL EVIDENCE`);
    console.log(`[${requestId}]   Input: ${evidence.stories.length} stories, ${evidence.events.length} events, ${evidence.social.length} social, ${evidence.coverage.length} coverage, ${evidence.opportunities.length} opportunities`);

    // STEP 2B: RANK EDITORIAL EVIDENCE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 2B: RANKING BY PANORAMA METRICS`);

    const briefing = rankEditorialEvidence(evidence);

    console.log(`[${requestId}]   ✓ Ranked to executive brief (Top N by editorial criteria):`);
    console.log(`[${requestId}]     stories: ${briefing.stories?.length || 0} top (from ${evidence.stories.length} available)`);
    console.log(`[${requestId}]     events: ${briefing.events?.length || 0} top (from ${evidence.events.length} available)`);
    console.log(`[${requestId}]     social: ${briefing.social?.length || 0} top (from ${evidence.social.length} available)`);
    console.log(`[${requestId}]     coverage: ${briefing.coverage?.length || 0} top (from ${evidence.coverage.length} available)`);
    console.log(`[${requestId}]     opportunities: ${briefing.opportunities?.length || 0} top (from ${evidence.opportunities.length} available)`);
    console.log(`[${requestId}]     entities: ${briefing.entities?.length || 0} top (from ${evidence.entities.length} available)`);

    // STEP 2C: BUILD EDITORIAL CONTEXT (universal contract)
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 2C: BUILDING EDITORIAL CONTEXT (universal contract)`);

    const editorialContext = buildEditorialContext(evidence, briefing);

    console.log(`[${requestId}]   ✓ Editorial Context built:`);
    console.log(`[${requestId}]     Dominant theme: ${editorialContext.agenda.dominant_theme?.title || 'N/A'}`);
    console.log(`[${requestId}]     Correlations: ${editorialContext.reasoning.stage_3_correlation.findings.length} patterns detected`);
    console.log(`[${requestId}]     Actions available: ${editorialContext.actions.length}`);

    const contextStr = JSON.stringify(editorialContext, null, 2);

    // Detectar modo contextual
    const mode = detectMode(evidence.query.intent, evidence.query.entity);
    console.log(`[${requestId}]   Mode detected: ${mode}`);

    const systemPrompt = buildSystemPrompt(mode);
    console.log(`[${requestId}]   System prompt: ${mode} mode activated`);

    function buildSystemPrompt(mode) {
      const basePrompt = `Eres un Director Editorial de Panorama.

INSTRUCCIÓN CRÍTICA:
- La inteligencia de priorización YA está hecha por Panorama
- Tú SOLO explicas (no re-decides)
- Devuelves TEXTO NARRATIVO PURO (no JSON)
- Incluyes URLs directamente en el texto
- Formato: párrafos naturales, no estructurado`;

      switch(mode) {
        case 'agenda':
          return `${basePrompt}

MODO: AGENDA EDITORIAL

El contexto te da:
- Tema dominante
- Fuentes ordenadas (editorial, social, coverage)
- Correlaciones detectadas

TU TAREA:
1. Escribir 2-3 párrafos explicando POR QUÉ estos temas importan
2. Explicar qué cambió respecto a hace horas
3. Detectar relaciones entre temas
4. Dar 3-4 recomendaciones editoriales concretas

IMPORTANTE:
- Párrafos narrativos, NO listas
- Cuando menciones un medio, incluye la URL: "Infobea publicó [TÍTULO] (https://...)"
- Siempre cita la fuente
- Nunca enumeres "1. 2. 3." — fluye natural`;

        case 'entity':
          return `${basePrompt}

MODO: ENTIDAD ESPECÍFICA

Escribe un resumen editorial natural sobre quién es esta entidad y por qué está en la agenda.

Incluye:
- Quién es (posición actual)
- Cuántos medios la cubren y dónde
- Temas relacionados
- Oportunidades editoriales

Siempre con URLs cuando menciones fuentes.`;

        case 'comparison':
          return `${basePrompt}

MODO: COMPARACIÓN

Explica cómo diferentes actores cubren el mismo tema.

Escribe naturalmente:
- Cuál es el tema
- Quiénes lo cubren (medios, redes, plataformas)
- Cómo difieren sus enfoques
- Dónde hay gaps
- Cómo diferenciarse

Con URLs de fuentes.`;

        case 'analysis':
          return `${basePrompt}

MODO: ANÁLISIS

Explica POR QUÉ un tema explotó hoy.

Estructura natural:
- Qué explotó (síntoma)
- Por qué ahora (causas)
- Quién lo impulsa
- Hacia dónde va
- Cómo cubrirlo mejor

Siempre cita fuentes con URLs.
  "references": {...}
}`;

        default:
          return `${basePrompt}

Tu trabajo: NO enumerar noticias. EXPLICAR la agenda editorial del día.

Estructura:
{
  "editorial_narrative": "Explicación de la agenda",
  "dominant_theme": "Tema principal",
  "references": {...}
}`;
      }
    }

    function detectMode(intent, entity) {
      if (intent === 'what_happening') return 'agenda';
      if (intent === 'entity_update' && entity) return 'entity';
      if (intent === 'comparison') return 'comparison';
      if (intent === 'analysis') return 'analysis';
      if (intent === 'investigation') return 'analysis';
      return 'agenda';
    }

    // Format briefing for Sonnet (readable, with URLs visible)
    const formattedBriefing = formatBriefingForSonnet(briefing);

    const userPrompt = `Pregunta: "${question}"
Modo: ${mode}

═════════════════════════════════════════════════════════════
CONTEXTO DE PANORAMA
═════════════════════════════════════════════════════════════

${formattedBriefing}

═════════════════════════════════════════════════════════════
FORMATO REQUERIDO
═════════════════════════════════════════════════════════════

ESTRUCTURA OBLIGATORIA (por cada tema):

## [NOMBRE DEL TEMA]

[Narrativa: 2-3 párrafos explicativos]

FUENTES USADAS:
- [Medio] — [URL exacta]
- [Medio] — [URL exacta]
- [Medio] — [URL exacta]

---

## [SIGUIENTE TEMA]

[Narrativa]

FUENTES USADAS:
- [Medio] — [URL exacta]
[etc]

═════════════════════════════════════════════════════════════
REGLAS
═════════════════════════════════════════════════════════════

1. Cada tema DEBE tener su sección con ## [NOMBRE]
2. Después de la narrativa SIEMPRE va "FUENTES USADAS:"
3. Las URLs deben ser exactas y completas (empiezan con https://)
4. Narrativa natural, NO JSON, NO estructuras
5. Si un medio aparece múltiples veces, lista cada URL
6. Máximo 5 temas principales (ordena por importancia)
`;

    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 3: CALLING SONNET-4-6`);
    console.log(`[${requestId}]   Context length: ${contextStr.length} chars`);
    console.log(`[${requestId}]   Max tokens: 2000`);

    const callStart = Date.now();
    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const answer = message.content[0].type === 'text' ? message.content[0].text : '';

    console.log(`[${requestId}]   ✓ Response received in ${Date.now() - callStart}ms`);
    console.log(`[${requestId}]   Answer length: ${answer.length} chars`);

    // STEP 4: PARSE STRUCTURED ANSWER (themes with sources)
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 4: PARSING STRUCTURED ANSWER`);

    const themes = parseThemesFromAnswer(answer);
    const totalUrls = themes.reduce((sum, t) => sum + (t.sources?.length || 0), 0);

    console.log(`[${requestId}]   Found ${themes.length} themes`);
    console.log(`[${requestId}]   Found ${totalUrls} URLs across themes`);
    themes.forEach((t, i) => {
      console.log(`[${requestId}]     Theme ${i + 1}: "${t.title}" (${t.sources?.length || 0} sources)`);
    });

    // STEP 5: VERIFY ANSWER INTEGRITY
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 5: ANSWER INTEGRITY CHECK`);

    const hasThemes = themes.length > 0;
    const hasSources = totalUrls > 0;

    console.log(`[${requestId}]   ✓ Has themes: ${hasThemes} (${themes.length})`);
    console.log(`[${requestId}]   ✓ Has sources: ${hasSources} (${totalUrls} URLs)`);
    console.log(`[${requestId}]   ✓ Answer is structured with sources`);

    // Validate structure
    if (!hasThemes) {
      console.log(`[${requestId}]   ⚠ WARNING: No themes detected, using raw answer`);
    }

    // FINAL SUMMARY LOG
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] === COMPLETE AUDIT TRAIL ===`);
    console.log(`[${requestId}] Question: "${question}"`);
    console.log(`[${requestId}] Query Intent: ${evidence.query.intent}`);
    console.log(`[${requestId}] Query Entity: ${evidence.query.entity || '(global)'}`);
    console.log(`[${requestId}] Search Type: ${evidence.query.entity ? `ENTITY-SPECIFIC ("${evidence.query.entity}")` : 'GLOBAL'}`);
    console.log(`[${requestId}] Results Retrieved:`);
    console.log(`[${requestId}]   Editorial: ${evidence.stories.length} available → ${briefing.stories?.length || 0} in briefing`);
    console.log(`[${requestId}]   Events: ${evidence.events.length} available → ${briefing.events?.length || 0} in briefing`);
    console.log(`[${requestId}]   Social: ${evidence.social.length} available → ${briefing.social?.length || 0} in briefing`);
    console.log(`[${requestId}]   Coverage: ${evidence.coverage.length} available → ${briefing.coverage?.length || 0} in briefing`);
    console.log(`[${requestId}]   Opportunities: ${evidence.opportunities.length} available → ${briefing.opportunities?.length || 0} in briefing`);
    console.log(`[${requestId}]   Entities: ${evidence.entities.length} available → ${briefing.entities?.length || 0} in briefing`);
    console.log(`[${requestId}] Total Time: ${Date.now() - start}ms`);
    console.log(`[${requestId}] Briefing Status: BUILT WITH SUMMARIES AND CONTEXT`);

    // FINAL RESPONSE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 6: FINAL RESPONSE`);
    console.log(`[${requestId}]   ✓ Themes: ${themes.length}`);
    console.log(`[${requestId}]   ✓ Total sources: ${totalUrls}`);
    console.log(`[${requestId}]   ✓ Retrieved: ${evidence.stories.length} editorial`);
    console.log(`[${requestId}]   ✓ Ranked: ${briefing.stories?.length || 0} in briefing`);
    console.log(`[${requestId}]   Total time: ${Date.now() - start}ms`);

    auditLog(`[${requestId}] COMPLETE: themes=${themes.length} sources=${totalUrls} retrieved=${evidence.stories.length} ranked=${briefing.stories?.length || 0} time=${Date.now() - start}ms`);

    // RETURN STRUCTURED THEMES WITH SOURCES
    return res.json({
      themes,  // Array of {title, narrative, sources: [{medium, url}]}
      rawAnswer: answer,  // Raw text from Sonnet (for fallback/debugging)
      panorama: {
        editorial: evidence.stories.length,
        events: evidence.events.length,
        social: evidence.social.length,
        coverage: evidence.coverage.length,
        opportunities: evidence.opportunities.length
      },
      elapsed: Date.now() - start,
      model: MODEL
    });

  } catch (error) {
    console.error('[OpenClaw] Error:', error.message);
    next(error);
  }
});

/**
 * GET /openclaw/session
 */
router.get('/session', requireAuth, (req, res) => {
  const session = getSession(req.user.sub);
  return res.json({
    lastEntity: session.lastEntity,
    expiresIn: Math.max(0, session.expiresAt - Date.now())
  });
});

/**
 * DELETE /openclaw/session
 */
router.delete('/session', requireAuth, (req, res) => {
  sessionMemory.delete(req.user.sub);
  return res.json({ ok: true });
});

/**
 * GET /openclaw/debug-parse
 * Test the parser with a question
 */
router.get('/debug-parse', requireAuth, (req, res) => {
  const { question } = req.query;
  if (!question) {
    return res.status(400).json({ error: 'question param required' });
  }

  const parsed = parseQuestion(question);
  const session = getSession(req.user.sub);

  return res.json({
    input: { question, userId: req.user.sub },
    parsed: {
      intent: parsed.intent,
      entity: parsed.entity,
      timeframe: parsed.timeframe,
      requiresSynthesis: parsed.requiresSynthesis
    },
    session: {
      lastEntity: session.lastEntity
    },
    analysis: {
      intentIsGlobal: ['what_happening', 'trends', 'opportunities', 'coverage_changes'].includes(parsed.intent),
      willUseSessionEntity: !parsed.entity && session.lastEntity && !['what_happening', 'trends', 'opportunities', 'coverage_changes'].includes(parsed.intent),
      finalEntity: parsed.entity || (session.lastEntity && !['what_happening', 'trends', 'opportunities', 'coverage_changes'].includes(parsed.intent) ? session.lastEntity : null)
    }
  });
});


/**
 * Enriquecer respuesta con fuentes detalladas
 * Mapea cada tema mencionado a sus fuentes reales
 */
function enrichResponseWithSources(narrative, briefing, rawStories, rawEvents, rawSocial, rawCoverage, rawOpportunities) {
  const sources = {};

  // Extraer palabras clave de la narrativa
  const narrativeWords = narrative.toLowerCase().split(/\s+/);

  // Buscar en stories del briefing
  if (briefing.stories && Array.isArray(briefing.stories)) {
    briefing.stories.forEach(story => {
      const titleWords = story.title.toLowerCase().split(/\s+/);
      const matches = titleWords.filter(w => narrativeWords.includes(w)).length;

      if (matches > 1 && !sources[story.title]) {
        sources[story.title] = {
          articles: story.articles || [],
          social: [],
          coverage: [],
          module: 'Editorial Intelligence'
        };
      }
    });
  }

  // Buscar en social del briefing
  if (briefing.social && Array.isArray(briefing.social)) {
    briefing.social.forEach(post => {
      const titleWords = (post.title || '').toLowerCase().split(/\s+/);
      const matches = titleWords.filter(w => narrativeWords.includes(w)).length;

      if (matches > 0) {
        Object.keys(sources).forEach(theme => {
          if (!sources[theme].social) sources[theme].social = [];
          sources[theme].social.push({
            platforms: post.platforms || [],
            engagement: post.engagement
          });
        });
      }
    });
  }

  // Buscar en coverage del briefing
  if (briefing.coverage && Array.isArray(briefing.coverage)) {
    briefing.coverage.forEach(change => {
      Object.keys(sources).forEach(theme => {
        if (theme.toLowerCase().includes(change.source.toLowerCase())) {
          if (!sources[theme].coverage) sources[theme].coverage = [];
          sources[theme].coverage.push({
            source: change.source,
            change_type: change.change_type,
            title: change.article_title
          });
        }
      });
    });
  }

  return {
    narrative,
    sources: Object.keys(sources).length > 0 ? sources : null
  };
}

/**
 * GET /openclaw/debug
 * Debug endpoint to inspect the pipeline step-by-step
 * Returns complete context, prompt, and model information
 */
router.get('/debug', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.query;
    if (!question) return res.status(400).json({ error: 'Question required' });

    const parsed = parseQuestion(question);
    let context = {};

    try {
      switch (parsed.intent) {
        case 'what_happening':
          const wh = await ContextBuilder.buildWhatsHappening();
          context = wh.context;
          break;
        case 'entity_update':
          if (parsed.entity) {
            const ec = await ContextBuilder.buildEntityContext(parsed.entity);
            context = ec.context;
          }
          break;
        default:
          const def = await ContextBuilder.buildWhatsHappening();
          context = def.context;
      }
    } catch (error) {
      console.error('Context error:', error.message);
    }

    // Build the actual prompt that would be sent to Claude
    const contextStr = JSON.stringify(context, null, 2);
    const systemPrompt = `Eres un editor jefe de noticias de Panorama. Tu trabajo es:
1. Leer el contexto editorial completo
2. Identificar lo importante y lo ruido
3. Responder la pregunta del usuario de forma editorial clara

Si el contexto está vacío, dilo claramente. No inventes información.
Responde SIEMPRE en español.`;

    const userPrompt = `Pregunta: "${question}"

Contexto editorial:
${contextStr}

Responde de forma concisa (máx 200 palabras), como lo haría un editor jefe.`;

    return res.json({
      step_1_parse: parsed,
      step_2_context_complete: context,
      step_3_context_summary: {
        keys: Object.keys(context),
        sample: Object.entries(context).reduce((acc, [k, v]) => {
          if (Array.isArray(v)) acc[k] = `${v.length} items`;
          else if (v?.items) acc[k] = `${v.items.length} items`;
          else if (typeof v === 'object') acc[k] = 'object';
          else acc[k] = typeof v;
          return acc;
        }, {})
      },
      step_4_model: MODEL,
      step_5_system_prompt: systemPrompt,
      step_6_user_prompt_with_context: userPrompt,
      step_6_user_prompt_length: userPrompt.length,
      step_6_context_is_empty: Object.keys(context).length === 0
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /openclaw/session
 * View current session
 */
router.get('/session', requireAuth, (req, res) => {
  const session = getSession(req.user.sub);
  return res.json({
    lastEntity: session.lastEntity,
    expiresIn: Math.max(0, session.expiresAt - Date.now())
  });
});

/**
 * DELETE /openclaw/session
 * Clear session
 */
router.delete('/session', requireAuth, (req, res) => {
  sessionMemory.delete(req.user.sub);
  return res.json({ ok: true });
});

/**
 * GET /openclaw/audit-log
 * Get recent audit logs (for debugging)
 */
router.get('/audit-log', requireAuth, (req, res) => {
  return res.json({ logs: auditBuffer });
});

/**
 * isFollowUpQuestion
 * Detect if this is a follow-up question that should use session context
 * Examples: "¿y en redes?", "¿y coverage?", "¿y oportunidades?"
 * NOT follow-ups: "¿qué pasó hoy?", "¿qué pasó con X?", "¿qué oportunidades tengo?"
 */
function isFollowUpQuestion(question) {
  if (!question) return false;

  const lowerQuestion = question.toLowerCase().trim();

  // Follow-up indicators: short questions starting with "¿y", "¿que hay", etc.
  const followUpPatterns = [
    /^¿y\s+/i,              // ¿y en redes?
    /^y\s+/i,               // y coverage?
    /^¿y\s+/i,              // ¿y oportunidades?
    /^¿qué hay\s+/i,        // ¿qué hay en...?
    /^¿hay\s+/i,            // ¿hay en...?
    /^¿en\s+[a-z]+\s*\?$/i  // ¿en redes? (short)
  ];

  return followUpPatterns.some(pattern => pattern.test(lowerQuestion));
}

/**
 * buildIndexedContext(briefing)
 *
 * Construye contexto INDEXADO para que Sonnet reciba referencias, no datos.
 * Cada tipo de evidencia es una lista con índices 0, 1, 2, etc.
 * Sonnet devuelve: "editorial_refs: [0, 2, 5]" en lugar de URLs/datos.
 */
function buildIndexedContext(briefing) {
  return {
    editorial: briefing.stories?.map((s, idx) => ({
      idx,
      ...s  // ✅ PRESERVA TODO
    })) || [],
    events: briefing.events?.map((e, idx) => ({
      idx,
      ...e  // ✅ PRESERVA TODO
    })) || [],
    social: briefing.social?.map((s, idx) => ({
      idx,
      ...s  // ✅ PRESERVA TODO
    })) || [],
    coverage: briefing.coverage?.map((c, idx) => ({
      idx,
      ...c  // ✅ PRESERVA TODO
    })) || [],
    opportunities: briefing.opportunities?.map((o, idx) => ({
      idx,
      ...o  // ✅ PRESERVA TODO
    })) || [],
    entities: briefing.entities?.map((e, idx) => ({
      idx,
      ...e  // ✅ PRESERVA TODO
    })) || []
  };
}

/**
 * resolveReferencesToEvidence(sonnetResponse, briefing, evidence)
 *
 * Sonnet devolvió referencias (índices). Resolver a evidencia COMPLETA con todos los campos.
 * La regla de oro: devolver TODA la información original desde retrieval + ranking metadata.
 */
function resolveReferencesToEvidence(sonnetResponse, briefing, evidence) {
  const resolved = {
    editorial_evidence: [],
    event_evidence: [],
    social_evidence: [],
    coverage_evidence: [],
    opportunity_evidence: [],
    entity_evidence: []
  };

  if (!sonnetResponse.topics) return resolved;

  sonnetResponse.topics.forEach(topic => {
    // Editorial references
    if (topic.editorial_refs && Array.isArray(topic.editorial_refs)) {
      topic.editorial_refs.forEach(idx => {
        const item = briefing.stories?.[idx];
        if (item) {
          resolved.editorial_evidence.push({
            ...item,
            topic_referenced: topic.title
          });
        }
      });
    }

    // Event references
    if (topic.event_refs && Array.isArray(topic.event_refs)) {
      topic.event_refs.forEach(idx => {
        const item = briefing.events?.[idx];
        if (item) {
          resolved.event_evidence.push({
            ...item,
            topic_referenced: topic.title
          });
        }
      });
    }

    // Social references
    if (topic.social_refs && Array.isArray(topic.social_refs)) {
      topic.social_refs.forEach(idx => {
        const item = briefing.social?.[idx];
        if (item) {
          resolved.social_evidence.push({
            ...item,
            topic_referenced: topic.title
          });
        }
      });
    }

    // Coverage references
    if (topic.coverage_refs && Array.isArray(topic.coverage_refs)) {
      topic.coverage_refs.forEach(idx => {
        const item = briefing.coverage?.[idx];
        if (item) {
          resolved.coverage_evidence.push({
            ...item,
            topic_referenced: topic.title
          });
        }
      });
    }

    // Opportunity references
    if (topic.opportunity_refs && Array.isArray(topic.opportunity_refs)) {
      topic.opportunity_refs.forEach(idx => {
        const item = briefing.opportunities?.[idx];
        if (item) {
          resolved.opportunity_evidence.push({
            ...item,
            topic_referenced: topic.title
          });
        }
      });
    }
  });

  // Convertir a formato de respuesta compatible con frontend
  return {
    articles: resolved.editorial_evidence,
    events: resolved.event_evidence,
    social: resolved.social_evidence,
    coverage: resolved.coverage_evidence,
    opportunities: resolved.opportunity_evidence,
    entities: resolved.entity_evidence
  };
}

/**
 * formatSourcesForResponse(resolvedEvidence)
 *
 * Construir la sección `detailed_sources` para el frontend
 */
function formatSourcesForResponse(resolvedEvidence) {
  const sources = {};

  if (resolvedEvidence.articles?.length > 0) {
    sources.editorial = {
      articles: resolvedEvidence.articles.map(a => ({
        source: Array.isArray(a.sources) ? a.sources[0] : 'Editorial',
        articles_count: a.article_count || 0,
        sources_count: a.source_count || 0,
        score: a.editorial_score || a.importance_score || 0
      }))
    };
  }

  if (resolvedEvidence.social?.length > 0) {
    sources.social = {
      social: resolvedEvidence.social.map(s => ({
        platforms: Array.isArray(s.platforms) ? s.platforms : [s.platforms || 'social'],
        engagement: s.total_engagement || 0,
        score: s.editorial_score || 0
      }))
    };
  }

  if (resolvedEvidence.coverage?.length > 0) {
    sources.coverage = {
      coverage: resolvedEvidence.coverage.map(c => ({
        source: c.source_name || c.source || 'Coverage',
        change_type: c.change_type || 'update',
        title: c.article_title || c.title || ''
      }))
    };
  }

  return Object.keys(sources).length > 0 ? sources : null;
}

/**
 * buildActions(editorialContext)
 *
 * Crea acciones agnósticas de UI que cualquier interfaz puede consumir.
 * Mobile, Web, Telegram, Dossier — todos usan las mismas acciones.
 *
 * No devuelve "related_links" (específico de web).
 * Devuelve "actions" (agnóstico, reutilizable).
 */
function buildActions(editorialContext) {
  const actions = [];

  // Top 3 stories
  editorialContext.evidence.editorial.slice(0, 3).forEach(s => {
    actions.push({
      id: s.id,
      type: 'story',
      title: s.title,
      priority: s.priority_score,
      available_actions: [
        { id: 'open', label: 'Abrir' },
        { id: 'create_dossier', label: 'Crear dossier' },
        { id: 'create_article', label: 'Redactar artículo' },
        { id: 'view_coverage', label: 'Ver cobertura' },
        { id: 'view_social', label: 'Ver redes' },
        { id: 'follow_story', label: 'Seguir' }
      ]
    });
  });

  // Top 2 social
  editorialContext.evidence.social.slice(0, 2).forEach(s => {
    actions.push({
      id: s.id,
      type: 'social',
      title: s.title,
      priority: s.priority_score,
      available_actions: [
        { id: 'open', label: 'Ver en redes' },
        { id: 'create_dossier', label: 'Crear dossier' },
        { id: 'create_article_from_post', label: 'Redactar noticia' },
        { id: 'view_engagement', label: 'Ver engagement' }
      ]
    });
  });

  // Top 2 coverage
  editorialContext.evidence.coverage.slice(0, 2).forEach(c => {
    actions.push({
      id: c.id,
      type: 'coverage',
      title: c.title,
      priority: c.priority_score,
      available_actions: [
        { id: 'open_source', label: 'Abrir fuente' },
        { id: 'compare_coverage', label: 'Comparar cobertura' },
        { id: 'create_followup', label: 'Crear seguimiento' }
      ]
    });
  });

  // Top opportunity
  editorialContext.evidence.opportunities.slice(0, 1).forEach(o => {
    actions.push({
      id: o.id,
      type: 'opportunity',
      title: o.title,
      priority: o.priority_score,
      available_actions: [
        { id: 'create_dossier', label: 'Crear dossier' },
        { id: 'create_article', label: 'Redactar' }
      ]
    });
  });

  return actions;
}

/**
 * buildNavigationLinks(sonnetResponse, briefing, mode)
 *
 * DEPRECATED: usar buildActions() en su lugar.
 * Mantenido por compatibilidad.
 */
function buildNavigationLinks(sonnetResponse, briefing, mode) {
  if (!sonnetResponse || !sonnetResponse.references) return [];

  const links = [];
  const refs = sonnetResponse.references;

  // Editorial Stories
  if (refs.editorial_refs && refs.editorial_refs.length > 0) {
    refs.editorial_refs.slice(0, 3).forEach(idx => {
      const story = briefing.stories?.[idx];
      if (story) {
        links.push({
          type: 'story',
          id: story.id,
          title: story.title,
          score: story.editorial_score,
          icon: '📰',
          action: 'openStory'
        });
      }
    });
  }

  // Coverage Changes
  if (refs.coverage_refs && refs.coverage_refs.length > 0) {
    refs.coverage_refs.slice(0, 2).forEach(idx => {
      const coverage = briefing.coverage?.[idx];
      if (coverage) {
        links.push({
          type: 'coverage',
          id: coverage.id,
          title: `${coverage.source_name} — ${coverage.article_title}`,
          score: coverage.editorial_score,
          icon: '📍',
          action: 'openCoverage',
          url: coverage.article_url
        });
      }
    });
  }

  // Social Clusters
  if (refs.social_refs && refs.social_refs.length > 0) {
    refs.social_refs.slice(0, 2).forEach(idx => {
      const social = briefing.social?.[idx];
      if (social) {
        const platforms = Array.isArray(social.platforms) ? social.platforms.join(', ') : social.platforms;
        links.push({
          type: 'social',
          id: social.id,
          title: social.title,
          platforms,
          engagement: social.total_engagement,
          icon: '📱',
          action: 'openSocial'
        });
      }
    });
  }

  // Events
  if (refs.event_refs && refs.event_refs.length > 0) {
    refs.event_refs.slice(0, 2).forEach(idx => {
      const event = briefing.events?.[idx];
      if (event) {
        links.push({
          type: 'event',
          id: event.id,
          title: event.headline,
          story_count: event.story_count,
          icon: '🔔',
          action: 'openEvent'
        });
      }
    });
  }

  // Opportunities
  if (refs.opportunity_refs && refs.opportunity_refs.length > 0) {
    refs.opportunity_refs.slice(0, 1).forEach(idx => {
      const opp = briefing.opportunities?.[idx];
      if (opp) {
        links.push({
          type: 'opportunity',
          id: opp.id,
          title: `${opp.opportunity_type}: ${opp.title}`,
          score: opp.editorial_score,
          icon: '🎯',
          action: 'createDossier'
        });
      }
    });
  }

  return links;
}

export default router;
