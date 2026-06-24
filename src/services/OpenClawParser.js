/**
 * OpenClawParser
 * Parses natural language questions to extract intent, entity, and whether LLM is needed
 */

export function parseQuestion(text) {
  if (!text || typeof text !== 'string') {
    return { intent: null, entity: null, timeframe: 'today', requiresSynthesis: false };
  }

  const lowerText = text.toLowerCase().trim();

  // Detect if LLM synthesis is needed
  const synthesisKeywords = ['resumime', 'explicame', 'analizá', 'compará', 'interpretá', 'sintetizá', 'resume', 'explica', 'analiza', 'compara', 'interpreta', 'sintetiza'];
  const requiresSynthesis = synthesisKeywords.some(kw => lowerText.includes(kw));

  // Extract entity (named entity or topic)
  const entity = extractEntity(lowerText);

  // Detect intent
  const intent = detectIntent(lowerText, entity);

  // Extract timeframe
  const timeframe = extractTimeframe(lowerText);

  return {
    intent,
    entity,
    timeframe,
    requiresSynthesis,
    originalQuestion: text
  };
}

/**
 * Detect the intent of the question
 */
function detectIntent(lowerText, entity) {
  // What's happening today
  if (lowerText.match(/qué está pasando|qué pasa|what.s happening|breaking news|novedades|últimas noticias/)) {
    return 'what_happening';
  }

  // Trends
  if (lowerText.match(/tendencias|trending|viral|qué es viral/)) {
    return 'trends';
  }

  // Opportunities
  if (lowerText.match(/oportunidades|qué escribir|editorial|coberturas|stories/)) {
    return 'opportunities';
  }

  // Coverage changes
  if (lowerText.match(/cambió|qué cambió|coverage|cobertura|updated|modificad/)) {
    return 'coverage_changes';
  }

  // Entity-specific (fallback)
  if (entity) {
    return 'entity_update';
  }

  return 'general';
}

/**
 * Extract entity from the question
 * Looks for common patterns like "¿Qué pasó con X?" or "Boca" standalone
 */
function extractEntity(lowerText) {
  // Pattern: "qué pasó con X" or "what happened to X"
  let match = lowerText.match(/(?:qué pasó con|what happened to|what.s up with|sobre)\s+([a-záéíóúñ\s]+?)(?:\?|$|en|y)/i);
  if (match) return match[1].trim();

  // Pattern: "en X" or "with X"
  match = lowerText.match(/\b(?:en|with|sobre)\s+([a-záéíóúñ\s]+?)(?:\?|$)/i);
  if (match) return match[1].trim();

  // Common entity queries: just the name at the start or end
  const commonEntities = ['boca', 'river', 'messi', 'milei', 'argentina', 'economía', 'política', 'deportes', 'tecnología', 'salud'];
  for (const entity of commonEntities) {
    if (lowerText.includes(entity)) {
      return entity.charAt(0).toUpperCase() + entity.slice(1);
    }
  }

  return null;
}

/**
 * Extract timeframe from question
 */
function extractTimeframe(lowerText) {
  if (lowerText.match(/hoy|today|ahora/)) return 'today';
  if (lowerText.match(/esta semana|this week|últimos 7 días/)) return 'week';
  if (lowerText.match(/este mes|this month|últimos 30 días/)) return 'month';
  if (lowerText.match(/siempre|always|todo el tiempo|all time/)) return 'all_time';

  return 'today'; // default
}

export default parseQuestion;
