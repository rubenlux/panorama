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
import { parseQuestion } from '../services/OpenClawParser.js';
import {
  getActiveStories,
  getActiveEvents,
  getActiveSocialClusters,
  getCoverageChanges,
  getOpportunities,
  getEntityProfile
} from '../queries.js';
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

    // STEP 1: Parse
    const parsed = parseQuestion(question);

    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 1: PARSER OUTPUT`);
    console.log(`[${requestId}]   intent: ${parsed.intent}`);
    console.log(`[${requestId}]   entity: ${parsed.entity || '(null)'}`);
    console.log(`[${requestId}]   timeframe: ${parsed.timeframe}`);

    // STEP 2: Session check
    const session = getSession(userId);
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 2: SESSION STATE`);
    console.log(`[${requestId}]   session.lastEntity: ${session.lastEntity || '(null)'}`);

    // STEP 3: Explicit Retrieval Planning
    // NO session contamination for global intents - this is absolute

    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 3: RETRIEVAL PLANNER`);
    console.log(`[${requestId}]   Parsed: intent="${parsed.intent}", entity="${parsed.entity || '(null)'}", session="${session.lastEntity || '(none)'}"`);
    auditLog(`[${requestId}] STEP 3 INPUT: question="${question}" intent="${parsed.intent}" parsed.entity="${parsed.entity || '(null)'}" session.lastEntity="${session.lastEntity || '(none)'}"`);

    // ABSOLUTE RULE: Global intents NEVER use session context
    const GLOBAL_INTENTS = new Set(['what_happening', 'trends', 'opportunities', 'coverage_changes']);
    const isGlobalIntent = GLOBAL_INTENTS.has(parsed.intent);

    let retrievalEntity;

    // Decision tree (no fallthrough):
    if (isGlobalIntent) {
      // GLOBAL INTENTS: Always search globally, NEVER use session
      retrievalEntity = null;
      console.log(`[${requestId}]   → GLOBAL INTENT: Ignoring session, using global search`);
      auditLog(`[${requestId}] STEP 3 DECISION: GLOBAL INTENT - retrievalEntity set to NULL`);
    } else if (parsed.intent === 'entity_update' && parsed.entity) {
      // Entity-specific question
      retrievalEntity = parsed.entity;
      console.log(`[${requestId}]   → ENTITY UPDATE: Using "${retrievalEntity}"`);
      auditLog(`[${requestId}] STEP 3 DECISION: ENTITY UPDATE - retrievalEntity set to "${retrievalEntity}"`);
    } else if (isFollowUpQuestion(parsed.originalQuestion) && session.lastEntity) {
      // Follow-up question: use session
      retrievalEntity = session.lastEntity;
      console.log(`[${requestId}]   → FOLLOW-UP: Using session "${retrievalEntity}"`);
      auditLog(`[${requestId}] STEP 3 DECISION: FOLLOW-UP - retrievalEntity set to "${retrievalEntity}" from session`);
    } else {
      // Default: use parsed entity or global
      retrievalEntity = parsed.entity || null;
      console.log(`[${requestId}]   → DEFAULT: Entity="${retrievalEntity || "(global)"}"`);
      auditLog(`[${requestId}] STEP 3 DECISION: DEFAULT - retrievalEntity set to "${retrievalEntity || "(global)"}"`);
    }

    // Update parsed for downstream branching
    parsed.entity = retrievalEntity;
    auditLog(`[${requestId}] STEP 3 OUTPUT: parsed.entity="${parsed.entity || '(null)'}"`);

    // Persist to session: ONLY for entity_update, NOT for global intents
    if (parsed.intent === 'entity_update' && retrievalEntity) {
      session.lastEntity = retrievalEntity;
      console.log(`[${requestId}]   ✓ Saved to session: "${retrievalEntity}"`);
    }

    console.log(`[${requestId}] `);
    console.log(`[${requestId}] FINAL STATE BEFORE RETRIEVAL`);
    console.log(`[${requestId}]   intent: ${parsed.intent}`);
    console.log(`[${requestId}]   retrievalEntity: ${retrievalEntity || '(global)'}`);
    console.log(`[${requestId}]   searchType: ${retrievalEntity ? `entity-specific ("${retrievalEntity}")` : 'global (no filter)'}`);
    console.log(`[${requestId}]   parsed.entity (will branch on this): ${parsed.entity || '(null)'}`);
    console.log(`[${requestId}] ══════════════════════════════════════════════════════════════`);

    // STEP 4: RETRIEVAL FROM PANORAMA
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 4: RETRIEVING FROM PANORAMA`);
    console.log(`[${requestId}]   Search type: ${parsed.entity ? `ENTITY-SPECIFIC ("${parsed.entity}")` : 'GLOBAL (no entity)'}`);

    let filteredStories = [];
    let filteredEvents = [];
    let filteredSocial = [];
    let filteredCoverage = [];
    let filteredOpportunities = [];
    let knowledge = [];

    const retrievalStart = Date.now();

    console.log(`[${requestId}] STEP 4 BRANCH DECISION: parsed.entity="${parsed.entity || '(null)'}", entering ${parsed.entity ? 'ENTITY-SPECIFIC branch' : 'GLOBAL branch'}`);
    auditLog(`[${requestId}] STEP 4 BRANCH: parsed.entity="${parsed.entity || '(null)'}" → ${parsed.entity ? 'ENTITY-SPECIFIC' : 'GLOBAL'}`);

    if (parsed.entity) {
      // Búsqueda específica por entidad
      const entity = parsed.entity.toLowerCase();
      console.log(`[${requestId}]   [ENTITY-SPECIFIC] Entity to filter by: "${entity}"`);
      auditLog(`[${requestId}] STEP 4 BRANCH: Entering ENTITY-SPECIFIC with entity="${entity}"`);

      // Búsqueda paralela en todas las fuentes
      const [storiesRes, eventsRes, socialRes, coverageRes, opportunitiesRes, knowledgeRes] = await Promise.allSettled([
        getActiveStories({ limit: 200, hours: 24, sort: 'score' }),
        getActiveEvents({ limit: 100, hours: 24, sort: 'score' }),
        getActiveSocialClusters({ limit: 100, hours: 24, sort: 'score' }),
        getCoverageChanges({ limit: 200, hours: 24 }),
        getOpportunities({ limit: 200, status: 'pending', sort: 'score' }),
        getEntityProfile(parsed.entity)
      ]);

      const allStories = unwrap(storiesRes, { items: [] }).items || [];
      const allEvents = unwrap(eventsRes, { items: [] }).items || [];
      const allSocial = unwrap(socialRes, { items: [] }).items || [];
      const allCoverage = unwrap(coverageRes, { items: [] }).items || [];
      const allOpportunities = unwrap(opportunitiesRes, { items: [] }).items || [];

      console.log(`[${requestId}]   [ENTITY-SPECIFIC] Retrieved: ${allStories.length} stories, ${allEvents.length} events, ${allSocial.length} social, ${allCoverage.length} coverage, ${allOpportunities.length} opportunities`);

      // Filtrar por entidad en TODAS las fuentes
      filteredStories = allStories.filter(s =>
        s.title?.toLowerCase().includes(entity) ||
        s.entities?.some(e => e.toLowerCase().includes(entity)) ||
        s.summary?.toLowerCase().includes(entity)
      ).sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));

      console.log(`[${requestId}]   [ENTITY FILTER] Stories: ${allStories.length} → ${filteredStories.length} (filtered by "${entity}")`);

      filteredEvents = allEvents.filter(e =>
        e.headline?.toLowerCase().includes(entity) ||
        e.summary?.toLowerCase().includes(entity)
      ).sort((a, b) => (b.editorial_score || 0) - (a.editorial_score || 0));

      console.log(`[${requestId}]   [ENTITY FILTER] Events: ${allEvents.length} → ${filteredEvents.length} (filtered by "${entity}")`);

      filteredSocial = allSocial.filter(s =>
        s.title?.toLowerCase().includes(entity)
      ).sort((a, b) => (b.total_engagement || 0) - (a.total_engagement || 0));

      console.log(`[${requestId}]   [ENTITY FILTER] Social: ${allSocial.length} → ${filteredSocial.length} (filtered by "${entity}")`);

      filteredCoverage = allCoverage.filter(c =>
        c.source_name?.toLowerCase().includes(entity) ||
        c.article_title?.toLowerCase().includes(entity)
      ).sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));

      console.log(`[${requestId}]   [ENTITY FILTER] Coverage: ${allCoverage.length} → ${filteredCoverage.length} (filtered by "${entity}")`);

      filteredOpportunities = allOpportunities.filter(o =>
        o.title?.toLowerCase().includes(entity) ||
        o.story_title?.toLowerCase().includes(entity)
      ).sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

      console.log(`[${requestId}]   [ENTITY FILTER] Opportunities: ${allOpportunities.length} → ${filteredOpportunities.length} (filtered by "${entity}"`);

      knowledge = unwrap(knowledgeRes, []);

      console.log(`[${requestId}]   ✓ Retrieval completed in ${Date.now() - retrievalStart}ms`);
      console.log(`[${requestId}]   RESULTS FOR ENTITY "${parsed.entity}":`);
      console.log(`[${requestId}]     stories: ${filteredStories.length}`);
      console.log(`[${requestId}]     events: ${filteredEvents.length}`);
      console.log(`[${requestId}]     social: ${filteredSocial.length}`);
      console.log(`[${requestId}]     coverage: ${filteredCoverage.length}`);
      console.log(`[${requestId}]     opportunities: ${filteredOpportunities.length}`);
      console.log(`[${requestId}]     entities: ${knowledge.length}`);
      auditLog(`[${requestId}] STEP 4 ENTITY RESULTS: stories=${filteredStories.length} events=${filteredEvents.length} social=${filteredSocial.length} coverage=${filteredCoverage.length}`);

    } else {
      // Búsqueda general (sin entidad)
      console.log(`[${requestId}]   [GLOBAL SEARCH] No entity filter - requesting top 100/50 stories/events`);
      auditLog(`[${requestId}] STEP 4 BRANCH: Entering GLOBAL SEARCH (no entity filter)`);
      const [storiesRes, eventsRes, socialRes, coverageRes, opportunitiesRes] = await Promise.allSettled([
        getActiveStories({ limit: 100, hours: 24, sort: 'score' }),
        getActiveEvents({ limit: 50, hours: 24, sort: 'score' }),
        getActiveSocialClusters({ limit: 50, hours: 24, sort: 'score' }),
        getCoverageChanges({ limit: 50, hours: 24 }),
        getOpportunities({ limit: 50, status: 'pending', sort: 'score' })
      ]);

      filteredStories = unwrap(storiesRes, { items: [] }).items || [];
      filteredEvents = unwrap(eventsRes, { items: [] }).items || [];
      filteredSocial = unwrap(socialRes, { items: [] }).items || [];
      filteredCoverage = unwrap(coverageRes, { items: [] }).items || [];
      filteredOpportunities = unwrap(opportunitiesRes, { items: [] }).items || [];

      console.log(`[${requestId}]   [GLOBAL SEARCH RESULTS] Stories: ${filteredStories.length}, Events: ${filteredEvents.length}, Social: ${filteredSocial.length}, Coverage: ${filteredCoverage.length}, Opps: ${filteredOpportunities.length}`);
      auditLog(`[${requestId}] STEP 4 GLOBAL RESULTS: stories=${filteredStories.length} events=${filteredEvents.length} social=${filteredSocial.length} coverage=${filteredCoverage.length}`);

      console.log(`[${requestId}]   ✓ Retrieval completed in ${Date.now() - retrievalStart}ms`);
      console.log(`[${requestId}]   RESULTS (GLOBAL SEARCH):`);
      console.log(`[${requestId}]     stories: ${filteredStories.length}`);
      console.log(`[${requestId}]     events: ${filteredEvents.length}`);
      console.log(`[${requestId}]     social: ${filteredSocial.length}`);
      console.log(`[${requestId}]     coverage: ${filteredCoverage.length}`);
      console.log(`[${requestId}]     opportunities: ${filteredOpportunities.length}`);
    }

    // STEP 5: BUILD EDITORIAL BRIEFING
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 5: BUILDING EDITORIAL BRIEFING`);
    console.log(`[${requestId}]   Input: ${filteredStories.length} stories, ${filteredEvents.length} events, ${filteredSocial.length} social, ${filteredCoverage.length} coverage, ${filteredOpportunities.length} opportunities`);

    const briefing = buildEditorialBriefing({
      stories: filteredStories,
      events: filteredEvents,
      social: filteredSocial,
      coverage: filteredCoverage,
      opportunities: filteredOpportunities,
      entities: knowledge,
      entity: parsed.entity || null
    });

    console.log(`[${requestId}]   ✓ Briefing constructed (SELECTION RULES: max 5 stories, 3 events, 3 social, 3 coverage, 3 opportunities):`);
    console.log(`[${requestId}]     stories: ${briefing.stories?.length || 0} selected (from ${filteredStories.length} available)`);
    console.log(`[${requestId}]     events: ${briefing.events?.length || 0} selected (from ${filteredEvents.length} available)`);
    console.log(`[${requestId}]     social: ${briefing.social?.length || 0} selected (from ${filteredSocial.length} available)`);
    console.log(`[${requestId}]     coverage: ${briefing.coverage?.length || 0} selected (from ${filteredCoverage.length} available)`);
    console.log(`[${requestId}]     opportunities: ${briefing.opportunities?.length || 0} selected (from ${filteredOpportunities.length} available)`);
    console.log(`[${requestId}]     entities: ${briefing.entities?.length || 0} selected (from ${knowledge.length} available)`);

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
    console.log(`[${requestId}] STEP 6: CALLING SONNET-4-6`);
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

    // STEP 7: ENRICH RESPONSE
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 7: ENRICHING RESPONSE WITH SOURCES`);

    const enrichedResponse = enrichResponseWithSources(answer, briefing, filteredStories, filteredEvents, filteredSocial, filteredCoverage, filteredOpportunities);

    console.log(`[${requestId}]   ✓ Sources mapped: ${Object.keys(enrichedResponse.sources || {}).length} themes found`);

    // FINAL SUMMARY LOG
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] === COMPLETE AUDIT TRAIL ===`);
    console.log(`[${requestId}] Question: "${question}"`);
    console.log(`[${requestId}] Parsed Intent: ${parsed.intent}`);
    console.log(`[${requestId}] Parsed Entity: ${parsed.entity || '(null)'}`);
    console.log(`[${requestId}] Final Search Type: ${parsed.entity ? `ENTITY-SPECIFIC ("${parsed.entity}")` : 'GLOBAL'}`);
    console.log(`[${requestId}] Results Retrieved:`);
    console.log(`[${requestId}]   Editorial: ${filteredStories.length} available → ${briefing.stories?.length || 0} in briefing`);
    console.log(`[${requestId}]   Events: ${filteredEvents.length} available → ${briefing.events?.length || 0} in briefing`);
    console.log(`[${requestId}]   Social: ${filteredSocial.length} available → ${briefing.social?.length || 0} in briefing`);
    console.log(`[${requestId}]   Coverage: ${filteredCoverage.length} available → ${briefing.coverage?.length || 0} in briefing`);
    console.log(`[${requestId}]   Opportunities: ${filteredOpportunities.length} available → ${briefing.opportunities?.length || 0} in briefing`);
    console.log(`[${requestId}]   Entities: ${knowledge.length} available → ${briefing.entities?.length || 0} in briefing`);
    console.log(`[${requestId}] Total Time: ${Date.now() - start}ms`);
    console.log(`[${requestId}] Briefing Status: REBUILT FROM ZERO (no cache)`);

    // Construir evidencia estructurada
    console.log(`[${requestId}] `);
    console.log(`[${requestId}] STEP 8: FINAL NUMBERS FOR RESPONSE`);
    console.log(`[${requestId}]   Will report: ${filteredStories.length} editorial, ${filteredEvents.length} events, ${filteredSocial.length} social, ${filteredCoverage.length} coverage, ${filteredOpportunities.length} opportunities`);
    auditLog(`[${requestId}] STEP 8 FINAL: Will return Editorial=${filteredStories.length} Events=${filteredEvents.length} Social=${filteredSocial.length} Coverage=${filteredCoverage.length}`);

    const evidence = {
      articles: filteredStories.map(s => ({
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
      events: filteredEvents.map(e => ({
        id: e.id,
        headline: e.headline,
        score: e.editorial_score,
        story_count: e.story_count,
        internal_link: `/events/${e.id}`
      })),
      social: filteredSocial.map(s => ({
        id: s.id,
        title: s.title,
        engagement: s.total_engagement,
        posts: s.post_count,
        platforms: s.platforms || [],
        internal_link: `/social/clusters/${s.id}`
      })),
      coverage: filteredCoverage.map(c => ({
        id: c.id,
        source: c.source_name,
        change_type: c.change_type,
        title: c.article_title,
        detected_at: c.detected_at,
        internal_link: `/coverage/${c.id}`
      })),
      opportunities: filteredOpportunities.map(o => ({
        id: o.id,
        title: o.title,
        type: o.opportunity_type,
        score: o.composite_score,
        trigger: o.trigger,
        internal_link: `/opportunities/${o.id}`
      })),
      entities: knowledge.map(k => ({
        id: k.id,
        name: k.name,
        type: k.entity_type,
        internal_link: `/knowledge-graph/entities/${k.id}`
      }))
    };

    return res.json({
      answer: enrichedResponse.narrative,
      detailed_sources: enrichedResponse.sources,
      evidence,
      modules_count: {
        articles: filteredStories.length,
        events: filteredEvents.length,
        social: filteredSocial.length,
        coverage: filteredCoverage.length,
        opportunities: filteredOpportunities.length,
        entities: knowledge.length
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

function unwrap(settled, fallback) {
  return settled.status === 'fulfilled' ? settled.value : fallback;
}

/**
 * Construir briefing editorial de alta calidad
 * Transforma contexto crudo en evidencia periodística
 */
function buildEditorialBriefing(rawContext) {
  const briefing = {};

  // STORIES: Top 5 por score, con sus artículos
  if (rawContext.stories && rawContext.stories.length > 0) {
    briefing.stories = rawContext.stories.slice(0, 5).map(story => ({
      title: story.title,
      score: story.importance_score,
      coverage_status: story.coverage_status,
      article_count: story.article_count,
      source_count: story.source_count,
      articles: story.sources ? story.sources.slice(0, 5).map(source => ({
        source: source,
        score: story.importance_score
      })) : [],
      internal_link: `/stories/${story.id}`
    }));
  }

  // EVENTS: Top 3
  if (rawContext.events && rawContext.events.length > 0) {
    briefing.events = rawContext.events.slice(0, 3).map(event => ({
      headline: event.headline,
      score: event.editorial_score,
      story_count: event.story_count,
      article_count: event.article_count,
      internal_link: `/events/${event.id}`
    }));
  }

  // SOCIAL: Top 3 posts, con detalles completos
  if (rawContext.social && rawContext.social.length > 0) {
    briefing.social = rawContext.social.slice(0, 3).map(post => ({
      title: post.title,
      platforms: post.platforms || [],
      engagement: post.total_engagement,
      posts_count: post.post_count,
      viral_score: post.viral_score,
      internal_link: `/social/clusters/${post.id}`
    }));
  }

  // COVERAGE: Top 3 cambios, con detalles
  if (rawContext.coverage && rawContext.coverage.length > 0) {
    briefing.coverage = rawContext.coverage.slice(0, 3).map(change => ({
      source: change.source_name,
      change_type: change.change_type,
      article_title: change.article_title,
      detected_at: change.detected_at,
      internal_link: `/coverage/${change.id}`
    }));
  }

  // OPPORTUNITIES: Top 3
  if (rawContext.opportunities && rawContext.opportunities.length > 0) {
    briefing.opportunities = rawContext.opportunities.slice(0, 3).map(opp => ({
      title: opp.title,
      type: opp.opportunity_type,
      score: opp.composite_score,
      trigger: opp.trigger,
      internal_link: `/opportunities/${opp.id}`
    }));
  }

  // ENTITIES: Top 8
  if (rawContext.entities && rawContext.entities.length > 0) {
    briefing.entities = rawContext.entities.slice(0, 8).map(entity => ({
      name: entity.name,
      type: entity.entity_type,
      internal_link: `/knowledge-graph/entities/${entity.id}`
    }));
  }

  // SUMMARY: resumen de qué hay disponible
  briefing.summary = {
    total_stories: rawContext.stories?.length || 0,
    total_events: rawContext.events?.length || 0,
    total_social_clusters: rawContext.social?.length || 0,
    total_coverage_changes: rawContext.coverage?.length || 0,
    total_opportunities: rawContext.opportunities?.length || 0,
    total_entities: rawContext.entities?.length || 0,
    search_query: rawContext.entity || 'general'
  };

  return briefing;
}

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
