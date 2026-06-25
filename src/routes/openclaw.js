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

    const briefing = rankEditorialEvidence(evidence);

    console.log(`[${requestId}]   ✓ Ranked to executive brief (Top N by editorial criteria):`);
    console.log(`[${requestId}]     stories: ${briefing.stories?.length || 0} top (from ${evidence.stories.length} available)`);
    console.log(`[${requestId}]     events: ${briefing.events?.length || 0} top (from ${evidence.events.length} available)`);
    console.log(`[${requestId}]     social: ${briefing.social?.length || 0} top (from ${evidence.social.length} available)`);
    console.log(`[${requestId}]     coverage: ${briefing.coverage?.length || 0} top (from ${evidence.coverage.length} available)`);
    console.log(`[${requestId}]     opportunities: ${briefing.opportunities?.length || 0} top (from ${evidence.opportunities.length} available)`);
    console.log(`[${requestId}]     entities: ${briefing.entities?.length || 0} top (from ${evidence.entities.length} available)`);

    const contextStr = JSON.stringify(briefing, null, 2);
    const systemPrompt = `Eres un Editor Ejecutivo de Panorama.
Tu trabajo: responder la pregunta del usuario de forma clara, editorializada.

IMPORTANTE: Estructura tu respuesta en TEMAS PRINCIPALES.
Cada tema debe ser una afirmación clara y verificable.
Ejemplo:

TEMA: Boca cerró a Lozano
SOPORTE: 12 artículos, 7 medios, 3 redes sociales

TEMA: Mercado de pases activo
SOPORTE: Coverage de TyC, Olé, ESPN

No escribas párrafos largos. Sé directo y estructurado.`;

    const userPrompt = `Pregunta: "${question}"

Contexto de Panorama:
${contextStr}

Responde identificando los TEMAS PRINCIPALES.
Para cada tema, indica qué datos lo respaldan.
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

    const answer = message.content[0].type === 'text' ? message.content[0].text : '';

    console.log(`[${requestId}]   ✓ Response received in ${Date.now() - callStart}ms`);
    console.log(`[${requestId}]   Answer length: ${answer.length} chars`);

    // STEP 4: ENRICH RESPONSE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 4: ENRICHING RESPONSE WITH SOURCES`);

    const enrichedResponse = enrichResponseWithSources(answer, briefing, evidence.stories, evidence.events, evidence.social, evidence.coverage, evidence.opportunities);

    console.log(`[${requestId}]   ✓ Sources mapped: ${Object.keys(enrichedResponse.sources || {}).length} themes found`);

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

    // Construir evidencia estructurada para respuesta
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 5: FINAL NUMBERS FOR RESPONSE`);
    console.log(`[${requestId}]   Will report: ${evidence.stories.length} editorial, ${evidence.events.length} events, ${evidence.social.length} social, ${evidence.coverage.length} coverage, ${evidence.opportunities.length} opportunities`);
    auditLog(`[${requestId}] STEP 5 FINAL: Will return Editorial=${evidence.stories.length} Events=${evidence.events.length} Social=${evidence.social.length} Coverage=${evidence.coverage.length}`);

    const evidenceForResponse = {
      articles: evidence.stories.map(s => ({
        id: s.id,
        title: s.title,
        type: s.story_type,
        score: s.importance_score,
        article_count: s.article_count,
        source_count: s.source_count,
        coverage_status: s.coverage_status,
        sources: s.sources || [],
        internal_link: `/stories/${s.id}`
      })),
      events: evidence.events.map(e => ({
        id: e.id,
        headline: e.headline,
        score: e.editorial_score,
        story_count: e.story_count,
        internal_link: `/events/${e.id}`
      })),
      social: evidence.social.map(s => ({
        id: s.id,
        title: s.title,
        engagement: s.total_engagement,
        posts: s.post_count,
        platforms: s.platforms || [],
        internal_link: `/social/clusters/${s.id}`
      })),
      coverage: evidence.coverage.map(c => ({
        id: c.id,
        source: c.source_name,
        change_type: c.change_type,
        title: c.article_title,
        detected_at: c.detected_at,
        internal_link: `/coverage/${c.id}`
      })),
      opportunities: evidence.opportunities.map(o => ({
        id: o.id,
        title: o.title,
        type: o.opportunity_type,
        score: o.composite_score,
        trigger: o.trigger,
        internal_link: `/opportunities/${o.id}`
      })),
      entities: evidence.entities.map(k => ({
        id: k.id,
        name: k.name,
        type: k.entity_type,
        internal_link: `/knowledge-graph/entities/${k.id}`
      }))
    };

    return res.json({
      answer: enrichedResponse.narrative,
      detailed_sources: enrichedResponse.sources,
      evidence: evidenceForResponse,
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

export default router;
