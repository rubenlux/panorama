/**
 * OpenClaw Routes
 * Conversational interface to editorial intelligence
 * - POST /openclaw/ask — answer natural language questions
 * - Calls services directly (no HTTP, no auth issues)
 * - Optional LLM synthesis for complex queries
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { parseQuestion } from '../services/OpenClawParser.js';
import ContextBuilder from '../services/ContextBuilder.js';
import NarrativeBuilder from '../services/NarrativeBuilder.js';
import PanoramaBuilder from '../services/PanoramaBuilder.js';

const router = express.Router();

// Session memory (in-memory, per-user, 10min TTL)
const sessionMemory = new Map();

function getSession(userId) {
  let session = sessionMemory.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    session = {
      lastEntity: null,
      lastContext: {},
      conversationHistory: [],
      expiresAt: Date.now() + 600000 // 10 minutes
    };
    sessionMemory.set(userId, session);
  }
  return session;
}

/**
 * Format context as readable text (not JSON)
 */
function formatContextAsText(context, intent) {
  if (intent === 'what_happening') {
    let text = '🔥 **Hoy**\n\n';

    if (context.stories?.items?.length) {
      text += '**Historias principales:**\n';
      context.stories.items.slice(0, 3).forEach((s, i) => {
        text += `${i + 1}. ${s.title}\n`;
        text += `   📰 ${s.article_count} artículos • 🔗 ${s.source_count} medios\n`;
        text += `   ${s.coverage_status || 'monitoring'}\n\n`;
      });
    }

    if (context.events?.items?.length) {
      text += '**Eventos creciendo:**\n';
      context.events.items.forEach(e => {
        text += `• ${e.headline} (${e.coverage_status})\n`;
      });
      text += '\n';
    }

    if (context.opportunities?.items?.length) {
      text += '**Oportunidades:**\n';
      context.opportunities.items.slice(0, 3).forEach(o => {
        text += `• ${o.title} (score: ${o.composite_score?.toFixed(0) || '—'})\n`;
      });
    }

    return text;
  }

  if (intent === 'entity_update') {
    const entity = context.entity || 'Entidad';
    let text = `📊 **${entity}**\n\n`;

    // Editorial: Historias + Eventos
    if (context.stories?.length || context.events?.length) {
      text += '**Editorial**\n';

      if (context.stories?.length) {
        text += `📰 ${context.stories.length} historia${context.stories.length > 1 ? 's' : ''}\n`;
        context.stories.slice(0, 2).forEach(s => {
          text += `  • ${s.title}\n`;
          text += `    ${s.article_count} artículos • ${s.source_count} medios\n`;
        });
      }

      if (context.events?.length) {
        text += `📌 ${context.events.length} evento${context.events.length > 1 ? 's' : ''}\n`;
        context.events.slice(0, 2).forEach(e => {
          text += `  • ${e.headline}\n`;
        });
      }
      text += '\n';
    }

    // Social Intelligence
    if (context.social?.length) {
      text += `**Redes**\n`;
      text += `📱 ${context.social.length} cluster${context.social.length > 1 ? 's' : ''}\n`;
      context.social.slice(0, 2).forEach(s => {
        text += `  • ${s.title}\n`;
        text += `    ${s.total_engagement?.toLocaleString() || '0'} engagement\n`;
      });
      text += '\n';
    }

    // Trend Analysis
    if (context.trend_analysis && context.trend_analysis.trend) {
      text += `**Tendencia**\n`;
      text += `${context.trend_analysis.trend === 'CRECIENDO' ? '📈' : context.trend_analysis.trend === 'ESTABLE' ? '➡️' : '📉'} ${context.trend_analysis.trend}\n`;
      text += `${context.trend_analysis.article_count_today || 0} artículos hoy • ${context.trend_analysis.source_count || 0} medios\n\n`;
    }

    // Coverage gaps
    if (context.coverage?.length) {
      text += `**Coverage**\n`;
      text += `🔍 ${context.coverage.length} cambio${context.coverage.length > 1 ? 's' : ''} recientes\n`;
      context.coverage.slice(0, 2).forEach(c => {
        text += `  • ${c.source_name}: ${c.change_type}\n`;
      });
      text += '\n';
    }

    // Uncovered opportunities
    if (context.opportunities?.length) {
      text += `**Oportunidades sin cubrir**\n`;
      context.opportunities.slice(0, 2).forEach(o => {
        text += `  💡 ${o.title}\n`;
      });
      text += '\n';
    }

    // Knowledge graph
    if (context.profile) {
      text += `**Perfil**\n`;
      text += `${context.profile.entity_type || '—'}\n`;
    }

    return text;
  }

  if (intent === 'coverage_changes') {
    let text = '📊 **Cambios en Coverage**\n\n';

    if (context.changes?.length) {
      const bySource = {};
      context.changes.forEach(c => {
        if (!bySource[c.source_name]) bySource[c.source_name] = { adds: 0, changes: 0 };
        if (c.change_type === 'link_added') bySource[c.source_name].adds++;
        else bySource[c.source_name].changes++;
      });

      Object.entries(bySource).forEach(([source, stats]) => {
        if (stats.adds) text += `• **${source}:** +${stats.adds} artículos\n`;
        if (stats.changes) text += `  └─ ${stats.changes} cambios\n`;
      });
    }

    return text;
  }

  if (intent === 'opportunities') {
    let text = '🎯 **Oportunidades por prioridad**\n\n';

    if (context.opportunities?.length) {
      context.opportunities.slice(0, 5).forEach((o, i) => {
        text += `${i + 1}. ${o.title}\n`;
        text += `   Score: ${o.composite_score?.toFixed(0) || '—'}\n\n`;
      });
    }

    return text;
  }

  // Fallback: simple text summary
  return Object.entries(context)
    .filter(([k, v]) => v && (Array.isArray(v) || Object.keys(v || {}).length > 0))
    .map(([k, v]) => {
      if (Array.isArray(v)) return `**${k}**: ${v.length} items`;
      if (v?.items) return `**${k}**: ${v.items.length} items`;
      return `**${k}**: found`;
    })
    .join('\n');
}

/**
 * POST /openclaw/ask
 * Input: { question: string }
 * Output: { answer, context, elapsed, sources, synthesized }
 *
 * Architecture: No HTTP internal calls, calls services directly via ContextBuilder
 */
router.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.body;
    const userId = req.user.sub;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question required' });
    }

    const session = getSession(userId);
    const parsed = parseQuestion(question);

    // If no entity detected, use last entity from session
    if (!parsed.entity && session.lastEntity) {
      parsed.entity = session.lastEntity;
    }

    let context = {};
    const startTime = Date.now();

    // Route to appropriate handler based on intent
    try {
      switch (parsed.intent) {
        case 'what_happening':
          const whatsHappening = await ContextBuilder.buildWhatsHappening();
          context = whatsHappening.context;
          break;

        case 'trends':
          const trends = await ContextBuilder.buildTrends();
          context = trends.context;
          break;

        case 'opportunities':
          const opps = await ContextBuilder.buildOpportunities();
          context = opps.context;
          break;

        case 'coverage_changes':
          const coverage = await ContextBuilder.buildCoverageChanges();
          context = coverage.context;
          break;

        case 'entity_update':
          if (parsed.entity) {
            const entity = await ContextBuilder.buildEntityContext(parsed.entity);
            context = entity.context;
          }
          break;

        default:
          // Try entity-specific if entity exists
          if (parsed.entity) {
            const entity = await ContextBuilder.buildEntityContext(parsed.entity);
            context = entity.context;
          } else {
            const whatsHappening = await ContextBuilder.buildWhatsHappening();
            context = whatsHappening.context;
          }
      }
    } catch (error) {
      console.warn('OpenClaw context error:', error.message);
      // Graceful degradation: respond with partial context
    }

    // Update session
    if (parsed.entity) {
      session.lastEntity = parsed.entity;
    }
    session.lastContext = context;

    const elapsed = Date.now() - startTime;

    // Build complete panorama for context-rich synthesis
    let panorama = null;
    if (parsed.intent === 'what_happening' || !parsed.entity) {
      try {
        panorama = await PanoramaBuilder.buildDailyPanorama();
      } catch (e) {
        console.warn('PanoramaBuilder error:', e.message);
      }
    }

    // ALWAYS synthesize with NarrativeBuilder (OpenClaw is an editor, not a data dump)
    try {
      let narrative = '';
      let summary = null;

      switch (parsed.intent) {
        case 'what_happening':
          const dayResult = await NarrativeBuilder.buildDayNarrative(panorama || context);
          narrative = dayResult.narrative;
          if (panorama) summary = PanoramaBuilder.formatExecutiveSummary(panorama);
          break;

        case 'entity_update':
          if (parsed.entity) {
            const entityResult = await NarrativeBuilder.buildEntityNarrative(parsed.entity, context);
            narrative = entityResult.narrative;
          } else if (panorama) {
            const dayResult2 = await NarrativeBuilder.buildDayNarrative(panorama);
            narrative = dayResult2.narrative;
            summary = PanoramaBuilder.formatExecutiveSummary(panorama);
          }
          break;

        case 'opportunities':
          const oppResult = await NarrativeBuilder.buildOpportunityNarrative(panorama || context);
          narrative = oppResult.narrative;
          break;

        case 'trends':
          const trendResult = await NarrativeBuilder.buildTrendsNarrative(panorama || context);
          narrative = trendResult.narrative;
          break;

        case 'coverage_changes':
          const dayResult3 = await NarrativeBuilder.buildDayNarrative(panorama || context);
          narrative = dayResult3.narrative;
          break;

        default:
          const dayResult4 = await NarrativeBuilder.buildDayNarrative(panorama || context);
          narrative = dayResult4.narrative;
      }

      const sourcesCount = Object.values(context).reduce((sum, val) => {
        if (Array.isArray(val)) return sum + val.length;
        if (val?.items && Array.isArray(val.items)) return sum + val.items.length;
        return sum;
      }, 0);

      // Two-level response: summary + full narrative
      return res.json({
        answer: narrative,
        summary: summary, // Executive summary (for quick view)
        panorama: panorama, // Full panorama data (for expandable details)
        context,
        elapsed: Date.now() - startTime,
        sources: sourcesCount,
        synthesized: true
      });
    } catch (error) {
      console.error('OpenClaw synthesis error:', error.message, error.stack);
      // If synthesis fails, return error message, NOT raw data dump
      return res.json({
        answer: `Error procesando tu pregunta: ${error.message}. Intenta de nuevo.`,
        context: {},
        elapsed: Date.now() - startTime,
        sources: 0,
        synthesized: false,
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /openclaw/session
 * Get current session context (for debugging)
 */
router.get('/session', requireAuth, (req, res) => {
  const session = getSession(req.user.sub);
  return res.json({
    lastEntity: session.lastEntity,
    contextKeys: Object.keys(session.lastContext),
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
