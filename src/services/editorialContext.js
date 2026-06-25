/**
 * editorialContext.js — CRECIMIENTO CONTROLADO
 *
 * RESPONSABILIDAD ÚNICA: Construir el snapshot editorial
 *
 * FUNCIONES PERMITIDAS:
 *   - buildSnapshot()           — construir el snapshot
 *   - calculateConfidence()     — calcular confianza
 *   - detectGaps()              — detectar vacíos editoriales
 *   - detectCorrelations()      — detectar patrones
 *   - [+ algunas pocas más]
 *
 * LÍMITE DE CRECIMIENTO:
 *   - Si el archivo excede ~300 líneas con muchas funciones pequeñas:
 *     NO crear "Editorial Intelligence Service"
 *     SÍ reorganizar en helper files con nombres claros (e.g., confidence.js, gaps.js)
 *   - Organizamos por TAMAÑO, no por CONCEPTOS
 *   - Cada archivo < 150 líneas, responsabilidad clara
 *
 * PROHIBIDO:
 *   - Crear "AnalysisEngine", "IntelligenceService", "ContextBuilder"
 *   - Agregar funciones que pertenecen a Panorama (SQL, cálculos complejos)
 *   - Funciones que no se usan por 2+ módulos permanecen aquí
 *
 * Un objeto único que todos consumen:
 * - OpenClaw, Telegram, Dossier, API, Mobile
 */

export function buildEditorialContext(evidence, rankedBriefing) {
  // Computar las métricas del retrieval
  const timeline = {
    total_retrieved: {
      editorial: evidence.stories.length,
      events: evidence.events.length,
      social: evidence.social.length,
      coverage: evidence.coverage.length,
      opportunities: evidence.opportunities.length
    },
    after_ranking: {
      editorial: rankedBriefing.stories?.length || 0,
      events: rankedBriefing.events?.length || 0,
      social: rankedBriefing.social?.length || 0,
      coverage: rankedBriefing.coverage?.length || 0,
      opportunities: rankedBriefing.opportunities?.length || 0
    }
  };

  // EDITORIAL: ordenar por importance_score (ya calculado)
  const editorialThemes = (rankedBriefing.stories || [])
    .map(s => ({
      id: s.id,
      title: s.title,
      rank: s.rank,
      priority_score: s.editorial_score,
      importance: s.importance_score,
      coverage_status: s.coverage_status,
      source_count: s.source_count,
      article_count: s.article_count,
      reason: s.reason,
      story_type: s.story_type,
      entities: s.entities || [],
      sources: s.sources || []
    }));

  // Detectar tema dominante (el primero en ranking)
  const dominantTheme = editorialThemes[0] || null;

  // SOCIAL: ordenar por viral_score × gap_score (oportunidad editorial)
  const socialOpportunities = (rankedBriefing.social || [])
    .map(s => ({
      id: s.id,
      title: s.title,
      rank: s.rank,
      priority_score: s.editorial_score,
      viral_score: s.viral_score,
      gap_score: s.gap_score,
      engagement: s.total_engagement,
      post_count: s.post_count,
      platforms: s.platforms || [],
      reason: s.reason
    }));

  // COVERAGE: ordenar por recency (detected_at)
  const coverageChanges = (rankedBriefing.coverage || [])
    .map(c => ({
      id: c.id,
      title: c.article_title,
      rank: c.rank,
      priority_score: c.editorial_score,
      source: c.source_name,
      change_type: c.change_type,
      detected_at: c.detected_at,
      article_url: c.article_url,
      reason: c.reason
    }));

  // EVENTS: ordenar por editorial_score
  const events = (rankedBriefing.events || [])
    .map(e => ({
      id: e.id,
      headline: e.headline,
      rank: e.rank,
      priority_score: e.editorial_score,
      story_count: e.story_count,
      source_count: e.source_count,
      coverage_status: e.coverage_status,
      reason: e.reason,
      sources: e.sources || []
    }));

  // OPPORTUNITIES: ordenar por composite_score (ya lo hace ranker)
  const opportunities = (rankedBriefing.opportunities || [])
    .map(o => ({
      id: o.id,
      title: o.title,
      rank: o.rank,
      priority_score: o.editorial_score,
      opportunity_type: o.opportunity_type,
      trigger: o.trigger,
      story_title: o.story_title,
      reason: o.reason
    }));

  // ACCIONES: qué puede hacer el editor con cada item
  const actions = [];
  editorialThemes.slice(0, 3).forEach(s => {
    actions.push({
      id: s.id,
      type: 'story',
      label: s.title,
      available_actions: [
        'open',
        'create_dossier',
        'create_article',
        'view_coverage',
        'view_social',
        'follow_story'
      ]
    });
  });
  socialOpportunities.slice(0, 2).forEach(s => {
    actions.push({
      id: s.id,
      type: 'social',
      label: s.title,
      available_actions: [
        'open',
        'create_dossier',
        'create_article_from_post',
        'view_engagement'
      ]
    });
  });
  coverageChanges.slice(0, 2).forEach(c => {
    actions.push({
      id: c.id,
      type: 'coverage',
      label: c.title,
      available_actions: [
        'open_source',
        'compare_coverage',
        'create_followup'
      ]
    });
  });

  // CORRELACIONES: detectar patrones (será mejorado luego con ML)
  const correlations = detectCorrelations(editorialThemes, socialOpportunities, events);

  // EL OBJETO FINAL: Editorial Snapshot (solo datos, sin lógica)
  const snapshot = {
    timestamp: new Date().toISOString(),

    query: {
      intent: evidence.query.intent,
      entity: evidence.query.entity,
      timeframe: evidence.query.timeframe
    },

    timeline,

    agenda: {
      dominant_theme: dominantTheme,
      themes: editorialThemes
    },

    evidence: {
      editorial: editorialThemes,
      social: socialOpportunities,
      coverage: coverageChanges,
      events: events,
      opportunities: opportunities
    },

    actions: actions,

    // Cómo llegamos aquí
    reasoning: {
      stage_1_retrieval: {
        label: 'Búsqueda',
        results: timeline.total_retrieved
      },
      stage_2_ranking: {
        label: 'Priorización (por métricas de Panorama)',
        results: timeline.after_ranking
      },
      stage_3_correlation: {
        label: 'Detección de patrones',
        findings: correlations.findings
      },
      stage_4_narrative: {
        label: 'Narrativa editorial',
        status: 'pending'
      }
    }
  };

  return snapshot;
}

/**
 * calculateConfidence(dominantTheme)
 *
 * Cuánto confiar en que este es el tema dominante.
 * Basado en métricas objetivas, no en IA.
 */
function calculateConfidence(dominant) {
  if (!dominant) return { score: 0, reasons: [] };

  let score = 0;
  const reasons = [];

  // Factor 1: Número de medios (8+ = muy confiable)
  if (dominant.source_count >= 8) {
    score += 30;
    reasons.push(`${dominant.source_count} medios cubriendo`);
  } else if (dominant.source_count >= 5) {
    score += 20;
    reasons.push(`${dominant.source_count} medios`);
  }

  // Factor 2: Número de artículos (muchos = consenso)
  if (dominant.article_count >= 15) {
    score += 25;
    reasons.push(`${dominant.article_count} artículos`);
  } else if (dominant.article_count >= 10) {
    score += 15;
    reasons.push(`${dominant.article_count} artículos`);
  }

  // Factor 3: Estado de cobertura (breaking = muy activo ahora)
  if (dominant.coverage_status === 'breaking') {
    score += 25;
    reasons.push('En desarrollo (últimas 4 horas)');
  } else if (dominant.coverage_status === 'growing') {
    score += 15;
    reasons.push('Creciendo');
  }

  // Factor 4: Importancia (score de Panorama)
  if (dominant.importance >= 9) {
    score += 20;
    reasons.push('Muy importante editorialmente');
  } else if (dominant.importance >= 7) {
    score += 10;
    reasons.push('Importante');
  }

  return {
    theme: dominant.title,
    score: Math.min(100, score),
    reasons
  };
}

/**
 * detectEditorialGaps(themes, social)
 *
 * Vacíos editoriales:
 * - Mucho social, poca news
 * - Mucha news, poco social
 */
function detectEditorialGaps(themes, social) {
  const gaps = [];

  // Gap 1: Redes sin cobertura editorial
  social.forEach(s => {
    if (s.gap_score > 0.7) {
      gaps.push({
        type: 'viral_uncovered',
        title: s.title,
        engagement: s.engagement,
        gap_score: s.gap_score,
        recommendation: 'Considerar cobertura editorial'
      });
    }
  });

  // Gap 2: Cobertura sin resonancia social
  themes.forEach(t => {
    const socialMentions = social.filter(s =>
      s.title.toLowerCase().includes(t.title.split(' ')[0].toLowerCase())
    ).length;

    if (t.article_count >= 10 && socialMentions === 0) {
      gaps.push({
        type: 'low_social_reach',
        title: t.title,
        articles: t.article_count,
        engagement: 0,
        recommendation: 'Amplificar en redes sociales'
      });
    }
  });

  return gaps.slice(0, 3); // Top 3 gaps
}

/**
 * explainRanking(themes)
 *
 * Por qué cada tema quedó donde.
 * Transparencia en el ranking.
 */
function explainRanking(themes) {
  return themes.slice(0, 5).map((t, idx) => ({
    rank: idx + 1,
    title: t.title,
    score: t.priority_score,
    factors: [
      { name: 'importance_score', value: t.importance, weight: 40 },
      { name: 'source_count', value: t.source_count, weight: 30 },
      { name: 'article_count', value: t.article_count, weight: 20 },
      { name: 'recency', value: t.rank === 1 ? 100 : 50, weight: 10 }
    ],
    summary: t.reason
  }));
}

/**
 * detectCorrelations(themes, social, events)
 *
 * Detectar patrones sin IA.
 */
function detectCorrelations(themes, social, events) {
  const findings = [];
  const summary = [];

  // Encontrar entidades que aparecen en múltiples temas
  const entityCount = {};
  themes.forEach(t => {
    (t.entities || []).forEach(e => {
      entityCount[e] = (entityCount[e] || 0) + 1;
    });
  });

  // Entidades que aparecen en 3+ temas = patrón
  Object.entries(entityCount)
    .filter(([entity, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([entity, count]) => {
      findings.push({
        entity,
        mentions: count,
        appears_in: 'themes'
      });
      summary.push(`${entity} (${count} temas)`);
    });

  // Social trends sin cobertura editorial = gap editorial
  const uncoveredSocial = social.filter(s => s.gap_score > 0.7);
  if (uncoveredSocial.length > 0) {
    findings.push({
      type: 'editorial_gap',
      count: uncoveredSocial.length,
      example: uncoveredSocial[0].title
    });
    summary.push(`Gap editorial: ${uncoveredSocial.length} tendencias sin cobertura`);
  }

  return {
    findings,
    summary: summary.join(' | ')
  };
}

// Exportar funciones pequeñas (no "engines")
export {
  calculateConfidence,
  detectEditorialGaps,
  explainRanking,
  detectCorrelations
};
