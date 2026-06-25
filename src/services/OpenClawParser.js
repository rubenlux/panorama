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
  // What's happening today - more tolerant regex for verb conjugations
  if (lowerText.match(/qué está pasando|qué pas[ao]|what.s happening|breaking news|novedades|últimas noticias|hoy|qué hay|qué sucede|sucediendo/i)) {
    return 'what_happening';
  }

  // Trends
  if (lowerText.match(/tendencias|trending|viral|qué es viral|creciendo|subiendo|top|ranking/i)) {
    return 'trends';
  }

  // Opportunities
  if (lowerText.match(/oportunidades|qué escribir|qué puedo publicar|editorial|coberturas|stories/i)) {
    return 'opportunities';
  }

  // Coverage changes
  if (lowerText.match(/cambió|qué cambió|coverage|cobertura|updated|modificad|cambios/i)) {
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
  // Captura hasta la próxima palabra clave (hoy, ayer, esta, aquí, etc)
  let match = lowerText.match(/(?:qué pasó con|what happened to|what's up with|sobre)\s+([a-záéíóúñ\s]+?)(?:\s+(?:hoy|ayer|esta|aquí|ahora|en\s|y\s|\?)|$)/i);
  if (match) {
    const entity = match[1].trim();
    if (entity && entity.length > 1) return entity;
  }

  // Pattern: "en X" (followed by a boundary)
  match = lowerText.match(/\ben\s+([a-záéíóúñ\s]+?)(?:\s+(?:hoy|ayer|esta|ahora|\?)|$)/i);
  if (match) {
    const entity = match[1].trim();
    if (entity && entity.length > 1) return entity;
  }

  // Pattern: "sobre X"
  match = lowerText.match(/sobre\s+([a-záéíóúñ\s]+?)(?:\s+(?:hoy|ayer|esta|ahora|\?)|$)/i);
  if (match) {
    const entity = match[1].trim();
    if (entity && entity.length > 1) return entity;
  }

  // Common entity queries: look for single, well-formed words
  const commonEntities = [
    'boca juniors', 'river plate', 'boca', 'river', 'messi', 'milei', 'argentina',
    'formosa', 'brasil', 'economía', 'política', 'deportes', 'tecnología', 'salud', 'córdoba'
  ];

  for (const entity of commonEntities) {
    if (lowerText.includes(entity)) {
      // Capitalize properly
      return entity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
