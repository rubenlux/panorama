/**
 * OpenClaw Routes
 * Editorial intelligence engine
 * - Conversational interface to Panorama
 * - Uses Sonnet (NOT Haiku) for synthesis
 * - Simple, direct pipeline: Parse → Context → Sonnet → Response
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { parseQuestion } from '../services/OpenClawParser.js';
import ContextBuilder from '../services/ContextBuilder.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const claude = new Anthropic();

// FORCE Sonnet for editorial reasoning
const MODEL = 'claude-sonnet-4-6';

// Session memory (10 min TTL)
const sessionMemory = new Map();

function getSession(userId) {
  let session = sessionMemory.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    session = {
      lastEntity: null,
      expiresAt: Date.now() + 600000 // 10 minutes
    };
    sessionMemory.set(userId, session);
  }
  return session;
}

/**
 * POST /openclaw/ask
 * Simple pipeline: Question → Parse → Context → Sonnet → Response
 */
router.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.body;
    const userId = req.user.sub;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question required' });
    }

    console.log('\n=== OPENCLAW ===');
    console.log('Question:', question);

    const session = getSession(userId);
    const parsed = parseQuestion(question);
    console.log('Parsed intent:', parsed.intent, 'entity:', parsed.entity);

    // Use last entity from session if available
    if (!parsed.entity && session.lastEntity) {
      parsed.entity = session.lastEntity;
      console.log('Using session entity:', parsed.entity);
    }

    // Save entity to session
    if (parsed.entity) {
      session.lastEntity = parsed.entity;
    }

    const startTime = Date.now();
    let context = {};

    // Build context based on intent
    try {
      console.log('Building context for intent:', parsed.intent);

      switch (parsed.intent) {
        case 'what_happening':
          const wh = await ContextBuilder.buildWhatsHappening();
          context = wh.context;
          break;

        case 'trends':
          const tr = await ContextBuilder.buildTrends();
          context = tr.context;
          break;

        case 'opportunities':
          const op = await ContextBuilder.buildOpportunities();
          context = op.context;
          break;

        case 'coverage_changes':
          const cc = await ContextBuilder.buildCoverageChanges();
          context = cc.context;
          break;

        case 'entity_update':
          if (parsed.entity) {
            const ec = await ContextBuilder.buildEntityContext(parsed.entity);
            context = ec.context;
          }
          break;

        default:
          if (parsed.entity) {
            const ec = await ContextBuilder.buildEntityContext(parsed.entity);
            context = ec.context;
          } else {
            const wh = await ContextBuilder.buildWhatsHappening();
            context = wh.context;
          }
      }
    } catch (error) {
      console.error('Context Builder error:', error.message);
    }

    // Log what context was retrieved
    const contextKeys = Object.keys(context);
    const contextSample = {};
    contextKeys.forEach(key => {
      const val = context[key];
      if (Array.isArray(val)) contextSample[key] = `${val.length} items`;
      else if (val?.items) contextSample[key] = `${val.items.length} items`;
      else if (typeof val === 'object') contextSample[key] = 'object';
      else contextSample[key] = typeof val;
    });
    console.log('Context retrieved:', contextSample);

    // Call Sonnet with context
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

    console.log('Calling Sonnet...');

    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const answer = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('Sonnet response received, length:', answer.length);

    return res.json({
      answer,
      context,
      elapsed: Date.now() - startTime,
      sources: Object.values(context).reduce((sum, val) => {
        if (Array.isArray(val)) return sum + val.length;
        if (val?.items) return sum + val.items.length;
        return sum;
      }, 0),
      model: MODEL
    });

  } catch (error) {
    console.error('[OpenClaw] Error:', error.message);
    next(error);
  }
});

/**
 * GET /openclaw/debug
 * Debug endpoint to inspect the pipeline step-by-step
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

    return res.json({
      step_1_parse: parsed,
      step_2_context: {
        keys: Object.keys(context),
        sample: Object.entries(context).reduce((acc, [k, v]) => {
          if (Array.isArray(v)) acc[k] = `${v.length} items`;
          else if (v?.items) acc[k] = `${v.items.length} items`;
          else acc[k] = typeof v;
          return acc;
        }, {})
      },
      step_3_model: MODEL
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

export default router;
