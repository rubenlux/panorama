/**
 * RANKER RULES — INNEGOCIABLES
 *
 * ✓ PERMITIDO:
 *   - ordenar evidencia
 *   - agregar metadata de ranking (rank, score, reason)
 *   - preservar TODOS los campos originales
 *
 * ✗ PROHIBIDO:
 *   - resumir o simplificar campos
 *   - interpretar o analizar datos
 *   - llamar a IA o LLMs
 *   - eliminar o modificar campos originales
 *   - duplicar cálculos que ya hace Panorama
 *
 * RAZÓN: Si el ranker empieza a hacer inteligencia, todo el pipeline se degrada.
 * El ranker es SOLO ordenador. Panorama es el cerebro.
 */

/**
 * rankEditorialEvidence(evidence)
 *
 * ARQUITECTURA DEFENSIVA: Ninguna capa destruye evidencia.
 *
 * - Input: evidencia COMPLETA desde retrieval (todas las columnas de DB)
 * - Output: MISMA evidencia + metadata de ranking (rank, editorial_score, reason)
 * - PROHIBIDO: eliminar campos, transformar estructuras, simplificar objetos
 *
 * Criterios de ranking:
 * 1. STORIES: importance_score (primary) → freshness, coverage
 * 2. EVENTS: editorial_score + story_count
 * 3. SOCIAL: viral_score × 0.6 + gap_score × 0.4
 * 4. COVERAGE: recency
 * 5. OPPORTUNITIES: composite_score
 * 6. ENTITIES: mentions
 */

export function rankEditorialEvidence(evidence) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const ranked = {
    metadata: {
      query: evidence.query,
      report_date: todayStr,
      report_timestamp: today.toISOString(),
      timeframe: evidence.query.timeframe,
      retrieved: {
        stories: evidence.stories.length,
        events: evidence.events.length,
        social: evidence.social.length,
        coverage: evidence.coverage.length,
        opportunities: evidence.opportunities.length
      }
    },
    stories: rankStories(evidence.stories),
    events: rankEvents(evidence.events),
    social: rankSocial(evidence.social),
    coverage: rankCoverage(evidence.coverage),
    opportunities: rankOpportunities(evidence.opportunities),
    entities: rankEntities(evidence.entities)
  };

  return ranked;
}

/**
 * Ranking de stories
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 10 por: importance_score (primary)
 */
function rankStories(stories) {
  if (!stories || stories.length === 0) return [];

  return stories
    .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0))
    .slice(0, 10)
    .map((s, index) => ({
      ...s,
      rank: index + 1,
      editorial_score: calculateStoryScore(s),
      reason: generateStoryReason(s)
    }));
}

function calculateStoryScore(s) {
  const scoreBase = (s.importance_score || 0);
  const coverageBonus = s.coverage_status === 'breaking' ? 5 : s.coverage_status === 'growing' ? 3 : 0;
  const recencyBonus = s.article_count >= 5 ? 2 : 0;
  return Math.min(100, scoreBase + coverageBonus + recencyBonus);
}

function generateStoryReason(s) {
  const parts = [];
  if (s.source_count) parts.push(`${s.source_count} medios`);
  if (s.article_count) parts.push(`${s.article_count} artículos`);
  if (s.coverage_status === 'breaking') parts.push('en desarrollo');
  return parts.join(' • ') || 'Historia editorial importante';
}

/**
 * Ranking de eventos
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 10 por: editorial_score (primary) + story_count (tiebreaker)
 */
function rankEvents(events) {
  if (!events || events.length === 0) return [];

  return events
    .sort((a, b) => {
      const scoreA = (b.editorial_score || 0) - (a.editorial_score || 0);
      if (scoreA !== 0) return scoreA;
      return (b.story_count || 0) - (a.story_count || 0);
    })
    .slice(0, 10)
    .map((e, index) => ({
      ...e,
      rank: index + 1,
      editorial_score: e.editorial_score || 0,
      reason: generateEventReason(e)
    }));
}

function generateEventReason(e) {
  const parts = [];
  if (e.story_count) parts.push(`${e.story_count} historias`);
  if (e.source_count) parts.push(`${e.source_count} medios`);
  if (e.coverage_status === 'breaking') parts.push('evento en desarrollo');
  return parts.join(' • ') || 'Evento editorial importante';
}

/**
 * Ranking de social
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 10 por: viral_score × 0.6 + gap_score × 0.4 (trending + editorial gap)
 */
function rankSocial(social) {
  if (!social || social.length === 0) return [];

  return social
    .sort((a, b) => {
      const scoreA = (b.viral_score || 0) * 0.6 + (b.gap_score || 0) * 0.4;
      const scoreB = (a.viral_score || 0) * 0.6 + (a.gap_score || 0) * 0.4;
      return scoreA - scoreB;
    })
    .slice(0, 10)
    .map((s, index) => ({
      ...s,
      rank: index + 1,
      editorial_score: calculateSocialScore(s),
      reason: generateSocialReason(s)
    }));
}

function calculateSocialScore(s) {
  return Math.round((s.viral_score || 0) * 0.6 + (s.gap_score || 0) * 0.4);
}

function generateSocialReason(s) {
  const parts = [];
  if (s.post_count) parts.push(`${s.post_count} posts`);
  if (s.total_engagement) parts.push(`${Math.round(s.total_engagement / 1000)}k interacciones`);
  if (s.gap_score > 0.7) parts.push('sin cobertura editorial');
  const platforms = Array.isArray(s.platforms) ? s.platforms.join(', ') : (s.platforms || 'redes');
  parts.unshift(platforms);
  return parts.join(' • ') || 'Tendencia social relevante';
}

/**
 * Ranking de coverage
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 20 por: recency (más reciente primero)
 */
function rankCoverage(coverage) {
  if (!coverage || coverage.length === 0) return [];

  return coverage
    .sort((a, b) => new Date(b.detected_at || 0) - new Date(a.detected_at || 0))
    .slice(0, 20)
    .map((c, index) => ({
      ...c,
      rank: index + 1,
      editorial_score: 100 - (index * 5), // decrece por antigüedad
      reason: generateCoverageReason(c)
    }));
}

function generateCoverageReason(c) {
  return `${c.change_type} en ${c.source_name}`;
}

/**
 * Ranking de opportunities
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 5 por: composite_score (ya es un ranking completo)
 */
function rankOpportunities(opportunities) {
  if (!opportunities || opportunities.length === 0) return [];

  return opportunities
    .sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0))
    .slice(0, 5)
    .map((o, index) => ({
      ...o,
      rank: index + 1,
      editorial_score: o.composite_score || 0,
      reason: generateOpportunityReason(o)
    }));
}

function generateOpportunityReason(o) {
  const parts = [];
  if (o.opportunity_type) parts.push(o.opportunity_type);
  if (o.trigger === 'algorithmic') parts.push('algorítmica');
  if (o.trigger === 'ai') parts.push('validada IA');
  return parts.join(' • ') || 'Oportunidad editorial';
}

/**
 * Ranking de entities
 * Preserva TODOS los campos, agrega SOLO: rank, editorial_score, reason
 * Top 20 por: mentions (cuántas veces mencionada)
 */
function rankEntities(entities) {
  if (!entities || entities.length === 0) return [];

  return entities
    .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    .slice(0, 20)
    .map((e, index) => ({
      ...e,
      rank: index + 1,
      editorial_score: Math.min(100, (e.mentions || 0) * 10),
      reason: `Mencionada ${e.mentions || 0} veces`
    }));
}
