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
La inteligencia de priorización YA está hecha por Panorama.
importance_score, editorial_score, viral_score, coverage_status = YA calculados.

TU TRABAJO:
- Explicar (no re-decidir) por qué los temas ordenados importan
- Detectar RELACIONES entre temas
- Contextualizar cambios
- NUNCA vuelvas a rankear. Solo narrativiza lo que ya está rankeado.`;

      switch(mode) {
        case 'agenda':
          return `${basePrompt}

MODO: AGENDA EDITORIAL

Contexto ya contiene:
- dominant_theme (primer item, el que importa más)
- evidence.editorial (ordenado por importance_score)
- evidence.social (ordenado por viral_score × gap_score)
- evidence.coverage (ordenado por recency)
- correlations (patrones detectados)

TU TAREA:
1. Explicar POR QUÉ el tema dominante importa
2. Detectar relaciones (entities comunes, gaps editoriales)
3. Explicar el cambio respecto a hace horas
4. Dar recomendaciones editoriales

ESTRUCTURA:
{
  "editorial_narrative": "2-3 párrafos explicativos. Conecta temas.",
  "dominant_theme": {
    "title": "[el que ya detectamos]",
    "why_matters": "Explicación editorial"
  },
  "relationships": [
    { "theme_a": "X", "theme_b": "Y", "connection": "Cómo se relacionan" }
  ],
  "recommendations": [
    "1. Cobertura en vivo de X (dominante, creciendo)",
    "2. Análisis X-Y (relación que otros no ven)"
  ]
}`;

        case 'entity':
          return `${basePrompt}

Tu trabajo: SUMARIO COMPLETO sobre una entidad específica.

ESTRUCTURA:
- POSICIÓN ACTUAL — ¿Dónde está X en la agenda?
- COBERTURA — ¿Cuántos medios? ¿Qué tono?
- TEMAS RELACIONADOS — ¿Qué otros temas la mencionan?
- OPORTUNIDADES — ¿Qué se puede cubrir mejor?
- RECOMENDACIÓN — ¿Qué debería hacer Panorama?

Estructura:
{
  "entity_summary": "Quién es [entity] y por qué está en la agenda hoy",
  "current_position": "Ranking/importancia actual",
  "coverage_analysis": "Cobertura por medios",
  "related_topics": ["Tema 1", "Tema 2"],
  "opportunities": "Espacios editoriales sin cubrir",
  "recommendation": "Qué debería hacer Panorama",
  "references": {...}
}`;

        case 'comparison':
          return `${basePrompt}

Tu trabajo: COMPARAR cómo diferentes actores (medios, entidades, plataformas) cubren un tema.

ESTRUCTURA:
- TEMA — ¿De qué se trata?
- ACTORES — ¿Quiénes lo cubren? (medios, redes, plataformas)
- DIFERENCIAS — ¿Cómo difieren los enfoques?
- GAPS — ¿Quién no lo cubre? ¿Por qué?
- RECOMENDACIÓN — ¿Cómo diferenciarse?

Estructura:
{
  "comparison_topic": "Tema siendo comparado",
  "actors": [{"name": "Actor", "approach": "Descripción"}],
  "coverage_gaps": "Espacios no cubiertos",
  "differentiation": "Cómo podría diferenciarse Panorama",
  "references": {...}
}`;

        case 'analysis':
          return `${basePrompt}

Tu trabajo: EXPLICAR POR QUÉ un tema explotó. Busca causas, no síntomas.

ESTRUCTURA:
- SÍNTOMA — ¿Qué creció/explotó?
- CAUSAS — ¿Por qué ahora?
- ACTORES — ¿Quiénes lo impulsan?
- TENDENCIA — ¿Esto va a crecer más?
- EDITORIAL — ¿Cómo cubrirlo mejor?

Estructura:
{
  "symptom": "Qué explotó",
  "root_causes": "Por qué sucedió",
  "actors": ["Quién lo impulsa"],
  "trajectory": "Hacia dónde va",
  "editorial_angle": "Ángulos no explorados",
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

    const userPrompt = `Pregunta: "${question}"
Modo: ${mode}

Contexto de Panorama (INDEXADO):
${contextStr}

Responde en JSON según el modo. Solo devuelve referencias (índices), no datos crudos.
Sé verificable. Sé auditable.`;

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

    const rawAnswer = message.content[0].type === 'text' ? message.content[0].text : '';

    console.log(`[${requestId}]   ✓ Response received in ${Date.now() - callStart}ms`);
    console.log(`[${requestId}]   Raw answer length: ${rawAnswer.length} chars`);

    // STEP 4: PARSE SONNET RESPONSE (mode-aware)
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 4: PARSING SONNET RESPONSE (${mode} mode)`);

    let sonnetResponse;
    let answer = rawAnswer;
    try {
      // Parsear JSON de Sonnet
      const jsonMatch = rawAnswer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonnetResponse = JSON.parse(jsonMatch[0]);

        // Extraer narrative según el modo
        switch(mode) {
          case 'agenda':
            answer = sonnetResponse.editorial_narrative ||
                     `${sonnetResponse.dominant_theme || 'Agenda del día'}\n\n${JSON.stringify(sonnetResponse.priorities || [])}`;
            break;
          case 'entity':
            answer = `${sonnetResponse.entity_summary}\n\n${sonnetResponse.recommendation || ''}`;
            break;
          case 'comparison':
            answer = `${sonnetResponse.comparison_topic}\n\n${sonnetResponse.differentiation || ''}`;
            break;
          case 'analysis':
            answer = `${sonnetResponse.symptom}\n\nCausas: ${sonnetResponse.root_causes}\n\n${sonnetResponse.editorial_angle || ''}`;
            break;
          default:
            answer = sonnetResponse.editorial_narrative || rawAnswer;
        }
      }
    } catch (e) {
      console.log(`[${requestId}]   ⚠ Could not parse JSON, using raw text`);
    }

    // STEP 5: RESOLVE REFERENCES TO FULL EVIDENCE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 5: RESOLVING REFERENCES TO FULL EVIDENCE`);

    const resolvedEvidence = sonnetResponse
      ? resolveReferencesToEvidence(sonnetResponse, briefing, evidence)
      : null;

    if (resolvedEvidence) {
      console.log(`[${requestId}]   ✓ Resolved ${Object.keys(resolvedEvidence).length} evidence types`);
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
    console.log(`[${requestId}] STEP 6: BUILDING FINAL RESPONSE`);
    console.log(`[${requestId}]   Retrieved: ${evidence.stories.length} editorial, ${evidence.events.length} events, ${evidence.social.length} social, ${evidence.coverage.length} coverage, ${evidence.opportunities.length} opportunities`);
    console.log(`[${requestId}]   Ranked to briefing: ${briefing.stories?.length || 0}, ${briefing.events?.length || 0}, ${briefing.social?.length || 0}, ${briefing.coverage?.length || 0}, ${briefing.opportunities?.length || 0}`);
    if (resolvedEvidence) {
      console.log(`[${requestId}]   Referenced in answer: editorial=${resolvedEvidence.editorial_evidence?.length || 0}, events=${resolvedEvidence.event_evidence?.length || 0}, social=${resolvedEvidence.social_evidence?.length || 0}`);
    }
    auditLog(`[${requestId}] STEP 6 FINAL: Retrieved=${evidence.stories.length}/${evidence.events.length}/${evidence.social.length} Ranked=${briefing.stories?.length || 0}/${briefing.events?.length || 0}/${briefing.social?.length || 0} Referenced=${resolvedEvidence?.editorial_evidence?.length || 0}/${resolvedEvidence?.event_evidence?.length || 0}/${resolvedEvidence?.social_evidence?.length || 0}`);

    // STEP 7: BUILD ACTIONS (agnóstic UI component)
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 7: BUILDING ACTIONS (UI-agnostic)`);

    const actions = buildActions(editorialContext);
    console.log(`[${requestId}]   Generated ${actions.length} actions`);

    // STEP 8: COMPLETE REASONING PIPELINE (para que el editor VEA cómo se construyó)
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 8: BUILDING REASONING PIPELINE`);

    const reasoningPipeline = {
      stage_1: {
        label: '🔍 RETRIEVAL',
        description: 'Búsqueda en Panorama',
        results: {
          editorial: evidence.stories.length,
          events: evidence.events.length,
          social: evidence.social.length,
          coverage: evidence.coverage.length,
          opportunities: evidence.opportunities.length
        }
      },
      stage_2: {
        label: '⭐ RANKING',
        description: 'Ordenamiento por métricas de Panorama',
        results: {
          editorial: briefing.stories?.length || 0,
          events: briefing.events?.length || 0,
          social: briefing.social?.length || 0,
          coverage: briefing.coverage?.length || 0,
          opportunities: briefing.opportunities?.length || 0
        }
      },
      stage_3: {
        label: '🔗 CORRELATION',
        description: 'Detección de patrones',
        findings: editorialContext.reasoning.stage_3_correlation.findings.length,
        summary: editorialContext.agenda.correlation_summary
      },
      stage_4: {
        label: '✍️ NARRATIVE',
        description: 'Generación de narrativa editorial (Sonnet)',
        status: 'complete'
      }
    };

    console.log(`[${requestId}]   Reasoning pipeline complete`);
    auditLog(`[${requestId}] COMPLETE: answer=${answer.slice(0, 50)}... actions=${actions.length} reasoning_stages=4`);

    // Calcular datos que podrían ser útiles (funciones pequeñas, no "sistema")
    const confidence = editorialContext.agenda.dominant_theme
      ? calculateConfidence(editorialContext.agenda.dominant_theme)
      : null;

    const gaps = detectEditorialGaps(
      editorialContext.evidence.editorial,
      editorialContext.evidence.social
    );

    return res.json({
      answer,
      mode,
      confidence,
      gaps,
      editorial_snapshot: editorialContext,
      reasoning_pipeline: reasoningPipeline,
      modules_count: {
        articles: evidence.stories.length,
        events: evidence.events.length,
        social: evidence.social.length,
        coverage: evidence.coverage.length,
        opportunities: evidence.opportunities.length,
        entities: evidence.entities.length
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
