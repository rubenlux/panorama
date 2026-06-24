/**
 * NarrativeBuilder
 * Transforma contexto bruto en narrativa editorial
 *
 * OpenClaw no debe mostrar listas de datos.
 * Debe responder como un editor jefe.
 *
 * Input: Contexto bruto (stories, events, social, coverage, opportunities)
 * Output: Narrativa en lenguaje natural que responde la intención del usuario
 *
 * Ejemplo:
 *   Contexto bruto:
 *   - Story: "Boca busca arquero" (12 artículos)
 *   - Event: "Lesión de Rojo" (8 artículos)
 *   - Social: 5 clusters sobre Boca
 *   - Coverage: +12 artículos en últimas 2h
 *
 *   Narrativa editorial:
 *   "Hoy Boca estuvo en el foco informativo por la búsqueda de arquero.
 *    El tema tuvo repercusión en redes con 42 publicaciones.
 *    También se confirmó la lesión de Rojo.
 *    En total, 38 artículos en 6 medios cubrieron al club."
 */

import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic();

// Use Sonnet for complex editorial reasoning, not Haiku
// OpenClaw reads thousands of records, finds contradictions, decides importance
// That's complex reasoning. Sonnet is much better for this.
const MODEL = 'claude-sonnet-4-6';

export class NarrativeBuilder {
  /**
   * Build narrative for entity query
   * "¿Qué pasó con Boca?" → Editorial explanation, not data dump
   */
  async buildEntityNarrative(entityName, context) {
    if (!entityName || !context) throw new Error('Entity and context required');

    try {
      const summary = this._summarizeContext(entityName, context);

      const prompt = `Eres un editor jefe de un medio de noticias argentino.

El usuario preguntó: "¿Qué pasó con ${entityName} hoy?"

Tienes este contexto:
${summary}

Tu tarea: Responde como lo haría un editor jefe. No muestres listas ni métricas crudas.
Identifica las 3-5 historias principales del día sobre ${entityName}.
Ordénalas por importancia informativa.
Construye un párrafo o dos que explique qué ocurrió.
Incluye datos relevantes (números de cobertura, engagement) de forma natural en el texto, no como listas.

Responde en español. Sé conciso (máx 150 palabras).
Si no hay noticias significativas, dilo claramente.
Si hay mucho ruido (posts de cumpleaños, etc), ignóralo.`;

      const message = await claude.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: 'Eres un editor jefe de un medio de noticias. Tu objetivo es explicar qué está pasando de forma clara y concisa, como lo haría alguien que entiende periodismo.',
        messages: [{ role: 'user', content: prompt }]
      });

      const narrative = message.content[0].type === 'text' ? message.content[0].text : '';

      return {
        narrative,
        summary_used: summary,
        elapsed: Date.now()
      };
    } catch (error) {
      console.warn('[NarrativeBuilder] Entity narrative error:', error.message);
      throw error;
    }
  }

  /**
   * Build narrative for "what's happening today"
   */
  async buildDayNarrative(context) {
    try {
      const summary = this._summarizeDayContext(context);

      const prompt = `Eres un editor jefe de noticias.

El usuario preguntó: "¿Qué está pasando hoy?"

Tienes este contexto de todo lo que pasó:
${summary}

Tu tarea:
1. Identifica los 3-5 temas principales del día
2. Ordénalos por importancia informativa
3. Construye 2-3 párrafos explicando qué está pasando
4. Incluye números (artículos, medios, engagement) de forma natural
5. Menciona si hay oportunidades editoriales sin cubrir

Responde en español. Sé un editor, no un agregador de datos.
Máx 200 palabras.`;

      const message = await claude.messages.create({
        model: MODEL,
        max_tokens: 500,
        system: 'Eres un editor jefe. Explica qué está pasando de forma clara, priorizando lo importante.',
        messages: [{ role: 'user', content: prompt }]
      });

      const narrative = message.content[0].type === 'text' ? message.content[0].text : '';

      return {
        narrative,
        summary_used: summary
      };
    } catch (error) {
      console.warn('[NarrativeBuilder] Day narrative error:', error.message);
      throw error;
    }
  }

  /**
   * Build narrative for opportunities
   * "¿Qué puedo publicar ahora?" → What should you write
   */
  async buildOpportunityNarrative(context) {
    try {
      const summary = this._summarizeOpportunities(context);

      const prompt = `Eres un editor jefe.

El usuario preguntó: "¿Qué puedo publicar ahora?"

Tienes estas oportunidades editoriales:
${summary}

Tu tarea:
1. Identifica las 3-5 mejores oportunidades para publicar AHORA
2. Explica POR QUÉ cada una es importante (tendencia, engagement, gap de cobertura)
3. Sugiere qué tipo de nota (news, analysis, explainer, etc)
4. Ordena por urgencia/impacto

Responde como un editor sugeriéndole a un periodista qué escribir.
Máx 150 palabras.`;

      const message = await claude.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: 'Eres un editor jefe sugiriendo tareas. Sé directo: qué escribir y por qué es importante.',
        messages: [{ role: 'user', content: prompt }]
      });

      const narrative = message.content[0].type === 'text' ? message.content[0].text : '';

      return {
        narrative,
        summary_used: summary
      };
    } catch (error) {
      console.warn('[NarrativeBuilder] Opportunity narrative error:', error.message);
      throw error;
    }
  }

  /**
   * Build narrative for trends
   * "¿Qué temas crecieron?" → What's rising
   */
  async buildTrendsNarrative(context) {
    try {
      const summary = this._summarizeTrends(context);

      const prompt = `Eres un editor jefe.

El usuario preguntó: "¿Qué temas crecieron?"

Tienes estos datos de tendencias:
${summary}

Tu tarea:
1. Identifica qué temas están creciendo hoy
2. Explica por qué (viral en redes, múltiples medios cubriendo, etc)
3. Qué historias están perdiendo fuerza
4. Cuáles son los temas emergentes

Responde como un editor leyendo el panorama del día.
Máx 150 palabras.`;

      const message = await claude.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: 'Eres un editor entendiendo tendencias. Explica qué está subiendo y por qué.',
        messages: [{ role: 'user', content: prompt }]
      });

      const narrative = message.content[0].type === 'text' ? message.content[0].text : '';

      return {
        narrative,
        summary_used: summary
      };
    } catch (error) {
      console.warn('[NarrativeBuilder] Trends narrative error:', error.message);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE: Summarize raw context into readable format for Claude
  // ────────────────────────────────────────────────────────────

  _summarizeContext(entityName, context) {
    let summary = `CONTEXTO: ${entityName}\n\n`;

    if (context.stories?.length) {
      summary += `EDITORIAL STORIES:\n`;
      context.stories.forEach(s => {
        summary += `- "${s.title}": ${s.article_count} artículos, ${s.source_count} medios, ${s.coverage_status}\n`;
      });
      summary += '\n';
    }

    if (context.events?.length) {
      summary += `EVENTOS:\n`;
      context.events.forEach(e => {
        summary += `- "${e.headline}": ${e.story_count} stories, ${e.article_count} artículos\n`;
      });
      summary += '\n';
    }

    if (context.social?.length) {
      summary += `REDES SOCIALES:\n`;
      context.social.forEach(s => {
        summary += `- "${s.title}": ${s.post_count} posts, ${s.total_engagement?.toLocaleString() || '0'} engagement, ${(s.platforms || []).join(', ')}\n`;
      });
      summary += '\n';
    }

    if (context.coverage?.length) {
      summary += `COVERAGE CHANGES (últimas 2h):\n`;
      context.coverage.forEach(c => {
        summary += `- ${c.source_name}: ${c.change_type} - ${c.article_title}\n`;
      });
      summary += '\n';
    }

    if (context.trend_analysis) {
      summary += `ANÁLISIS DE TENDENCIA:\n`;
      summary += `- Trend: ${context.trend_analysis.trend || 'N/A'}\n`;
      summary += `- Artículos hoy: ${context.trend_analysis.article_count_today || 0}\n`;
      summary += `- Medios cubriendo: ${context.trend_analysis.source_count || 0}\n`;
      summary += '\n';
    }

    if (context.opportunities?.length) {
      summary += `OPORTUNIDADES SIN CUBRIR:\n`;
      context.opportunities.forEach(o => {
        summary += `- "${o.title}" (score: ${o.composite_score || 0})\n`;
      });
      summary += '\n';
    }

    return summary;
  }

  _summarizeDayContext(context) {
    let summary = `PANORAMA DEL DÍA\n\n`;

    if (context.stories?.items?.length) {
      summary += `TEMAS PRINCIPALES:\n`;
      context.stories.items.slice(0, 5).forEach(s => {
        summary += `- "${s.title}": ${s.article_count} artículos, ${s.source_count} medios, ${s.coverage_status}\n`;
      });
      summary += '\n';
    }

    if (context.events?.items?.length) {
      summary += `EVENTOS DESARROLLÁNDOSE:\n`;
      context.events.items.forEach(e => {
        summary += `- "${e.headline}"\n`;
      });
      summary += '\n';
    }

    if (context.social?.items?.length) {
      summary += `TENDENCIAS EN REDES:\n`;
      context.social.items.slice(0, 3).forEach(s => {
        summary += `- "${s.title}": ${s.total_engagement?.toLocaleString() || '0'} engagement\n`;
      });
      summary += '\n';
    }

    if (context.trending?.length) {
      summary += `TEMAS CRECIENDO:\n`;
      context.trending.slice(0, 3).forEach(t => {
        summary += `- "${t.title}": ${t.article_count} artículos en ${t.minutes_ago} minutos\n`;
      });
      summary += '\n';
    }

    if (context.opportunities?.items?.length) {
      summary += `OPORTUNIDADES EDITORIALES:\n`;
      context.opportunities.items.slice(0, 3).forEach(o => {
        summary += `- "${o.title}" (score: ${o.composite_score || 0})\n`;
      });
    }

    return summary;
  }

  _summarizeOpportunities(context) {
    let summary = `OPORTUNIDADES DISPONIBLES\n\n`;

    if (context.opportunities?.length) {
      context.opportunities.slice(0, 10).forEach(o => {
        summary += `- "${o.title}"\n`;
        summary += `  Tipo: ${o.opportunity_type}\n`;
        summary += `  Score: ${o.composite_score?.toFixed(0) || '—'}\n`;
        summary += `  Tráfico: ${o.traffic_score || '—'}, Editorial: ${o.editorial_score || '—'}\n\n`;
      });
    }

    return summary;
  }

  _summarizeTrends(context) {
    let summary = `ANÁLISIS DE TENDENCIAS\n\n`;

    if (context.trending_now?.length) {
      summary += `TEMAS CRECIENDO (últimas 2h):\n`;
      context.trending_now.slice(0, 5).forEach(t => {
        summary += `- "${t.title}": ${t.article_count} artículos, ${t.source_count} medios\n`;
      });
      summary += '\n';
    }

    if (context.growing?.length) {
      summary += `HISTORIAS CON MÁS COBERTURA:\n`;
      context.growing.slice(0, 5).forEach(s => {
        summary += `- "${s.title}": ${s.article_count} artículos\n`;
      });
      summary += '\n';
    }

    return summary;
  }
}

export default new NarrativeBuilder();
