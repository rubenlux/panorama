/**
 * rankEditorialEvidence(evidence)
 *
 * Convierte miles de resultados en un briefing ejecutivo.
 * No es una función de filtrado arbitrario.
 * Es un RANKING por criterios editoriales concretos.
 *
 * Input: { stories: 778, events: 2213, social: 933, coverage: 84, opportunities: 10000 }
 * Output: { stories: 10, events: 10, social: 10, coverage: 20, opportunities: 5, entities: 20 }
 *
 * Criterios de ranking:
 * 1. STORIES: score + freshness + coverage + article_count
 * 2. EVENTS: editorial_score + story_count + recency
 * 3. SOCIAL: viral_score + gap_score (trending + editorial gap)
 * 4. COVERAGE: recency (más reciente = más importante)
 * 5. OPPORTUNITIES: composite_score (ya está calculado)
 * 6. ENTITIES: mentions (popularidad)
 */

export function rankEditorialEvidence(evidence) {
  const ranked = {
    query: evidence.query,
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
 * Top 10 por: importance_score (primary)
 */
function rankStories(stories) {
  if (!stories || stories.length === 0) return [];

  return stories
    .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0))
    .slice(0, 10)
    .map(s => ({
      title: s.title,
      summary: s.algorithmic_summary || s.summary || '(sin resumen)',
      type: s.story_type,
      status: s.coverage_status,
      importance: s.importance_score,
      articles: s.article_count,
      sources: (s.sources || []).slice(0, 3),
      internal_link: `/stories/${s.id}`
    }));
}

/**
 * Ranking de eventos
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
    .map(e => ({
      headline: e.headline,
      summary: e.summary || '(sin contexto)',
      type: e.event_type,
      importance: e.editorial_score,
      stories: e.story_count,
      internal_link: `/events/${e.id}`
    }));
}

/**
 * Ranking de social
 * Top 10 por: viral_score + gap_score (trending que no está cubierto editorialmente)
 */
function rankSocial(social) {
  if (!social || social.length === 0) return [];

  return social
    .sort((a, b) => {
      // Priorizar viral + gap (editorial opportunity)
      const scoreA = (b.viral_score || 0) * 0.6 + (b.gap_score || 0) * 0.4;
      const scoreB = (a.viral_score || 0) * 0.6 + (a.gap_score || 0) * 0.4;
      return scoreA - scoreB;
    })
    .slice(0, 10)
    .map(s => ({
      title: s.title,
      platforms: Array.isArray(s.platforms) ? s.platforms : [],
      engagement: s.total_engagement,
      viral: s.viral_score,
      gap: s.gap_score,
      posts: s.post_count,
      internal_link: `/social/clusters/${s.id}`
    }));
}

/**
 * Ranking de coverage
 * Top 20 por: recency (más reciente primero)
 */
function rankCoverage(coverage) {
  if (!coverage || coverage.length === 0) return [];

  return coverage
    .sort((a, b) => new Date(b.detected_at || 0) - new Date(a.detected_at || 0))
    .slice(0, 20)
    .map(c => ({
      source: c.source_name,
      change_type: c.change_type,
      headline: c.article_title,
      when: c.detected_at,
      internal_link: `/coverage/${c.id}`
    }));
}

/**
 * Ranking de opportunities
 * Top 5 por: composite_score (ya es un ranking completo)
 */
function rankOpportunities(opportunities) {
  if (!opportunities || opportunities.length === 0) return [];

  return opportunities
    .sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0))
    .slice(0, 5)
    .map(o => ({
      title: o.title,
      type: o.opportunity_type,
      score: o.composite_score,
      trigger: o.trigger,
      internal_link: `/opportunities/${o.id}`
    }));
}

/**
 * Ranking de entities
 * Top 20 por: mentions (cuántas veces mencionada)
 */
function rankEntities(entities) {
  if (!entities || entities.length === 0) return [];

  return entities
    .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    .slice(0, 20)
    .map(e => ({
      name: e.name,
      type: e.entity_type,
      mentions: e.mentions || 0,
      internal_link: `/knowledge-graph/entities/${e.id}`
    }));
}
