/**
 * retrieveEditorialEvidence(question)
 *
 * Función única de retrieval para OpenClaw.
 *
 * Responsabilidades:
 * 1. Parsear intent, entity, timeframe UNA SOLA VEZ
 * 2. Construir queries SEGÚN la intención (no Top100+filtro)
 * 3. Resolver timeframe una sola vez, aplicar a todos los módulos
 * 4. Devolver evidencia unificada que Sonnet consulte
 *
 * Devuelve:
 * {
 *   query: { intent, entity, timeframe, hours },
 *   stories: [],
 *   events: [],
 *   social: [],
 *   coverage: [],
 *   opportunities: [],
 *   entities: [],
 *   metadata: { totalRetrieved, totalRelevant, retrievedAt }
 * }
 */

import {
  getActiveStories,
  getActiveEvents,
  getActiveSocialClusters,
  getCoverageChanges,
  getOpportunities,
  getEntityProfile
} from '../queries.js';
import { parseQuestion } from './OpenClawParser.js';

export async function retrieveEditorialEvidence(question, options = {}) {
  const retrieved = {
    query: {},
    stories: [],
    events: [],
    social: [],
    coverage: [],
    opportunities: [],
    entities: [],
    metadata: { retrievedAt: new Date().toISOString() }
  };

  // STEP 0: Parse la pregunta UNA SOLA VEZ
  const parsed = parseQuestion(question);
  const entity = parsed.entity?.toLowerCase() || null;
  const intent = parsed.intent || 'general';
  const timeframe = parsed.timeframe || 'today';

  // Mapear timeframe a horas (resolver aquí, una sola vez)
  const hoursMap = {
    today: 24,
    week: 7 * 24,
    month: 30 * 24,
    all_time: null // sin límite
  };
  const hours = hoursMap[timeframe] || 24;

  // Guardar el query en metadata
  retrieved.query = {
    intent,
    entity,
    timeframe,
    hours,
    originalQuestion: question
  };

  // STEP 1: Sin límites - Claude recibe TODO
  // No hay restricciones de cantidad para que Claude pueda razonar con contexto completo
  const limits = {
    stories: 10000,
    events: 10000,
    social: 10000,
    coverage: 10000,
    opportunities: 10000
  };

  // STEP 2: Construir las queries
  // Los endpoints aceptan `entity` y filtran en SQL directamente
  // Global intents: sin entity filter → top items
  // Entity intents: con entity filter → búsqueda directa por entidad

  try {
    const [storiesRes, eventsRes, socialRes, coverageRes, opportunitiesRes, knowledgeRes] = await Promise.allSettled([
      getActiveStories({ limit: limits.stories, hours, sort: 'score', ...(entity ? { entity } : {}) }),
      getActiveEvents({ limit: limits.events, hours, sort: 'score', ...(entity ? { entity } : {}) }),
      getActiveSocialClusters({ limit: limits.social, hours, sort: 'score', ...(entity ? { entity } : {}) }),
      getCoverageChanges({ limit: limits.coverage, hours, ...(entity ? { entity } : {}) }),
      getOpportunities({ limit: limits.opportunities, status: 'pending', sort: 'score', hours, ...(entity ? { entity } : {}) }),
      entity ? getEntityProfile(entity) : Promise.resolve(null)
    ]);

    // STEP 3: Unwrap resultados (manejo de fulfilled/rejected)
    retrieved.stories = unwrapArray(storiesRes, 'items');
    retrieved.events = unwrapArray(eventsRes, 'items');
    retrieved.social = unwrapArray(socialRes, 'items');
    retrieved.coverage = unwrapArray(coverageRes, 'items');
    retrieved.opportunities = unwrapArray(opportunitiesRes, 'items');
    retrieved.entities = entity && knowledgeRes.status === 'fulfilled'
      ? (Array.isArray(knowledgeRes.value) ? knowledgeRes.value : [])
      : [];

    // Metadata
    retrieved.metadata.totalRetrieved = retrieved.stories.length + retrieved.events.length + retrieved.social.length + retrieved.coverage.length + retrieved.opportunities.length;
    retrieved.metadata.totalRelevant = retrieved.stories.length + retrieved.events.length + retrieved.social.length + retrieved.coverage.length + retrieved.opportunities.length;

  } catch (err) {
    console.error('[retrieveEditorialEvidence] Error during retrieval:', err);
    // Devolver estructura vacía pero válida
    retrieved.metadata.error = err.message;
  }

  return retrieved;
}

/**
 * Unwrap Promise.allSettled result, extract array field
 */
function unwrapArray(settlement, field = 'items') {
  if (settlement.status === 'fulfilled') {
    const val = settlement.value;
    if (val && typeof val === 'object') {
      return Array.isArray(val) ? val : (val[field] || []);
    }
  }
  return [];
}

