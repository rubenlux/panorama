/**
 * Intelligence — Editorial Opportunities Engine
 * Generates story-specific opportunities using algorithmic templates (Cost Killer 2+3)
 * and AI-driven opportunities (on-demand via POST /editorial-workflow/dossiers/:id/enrich)
 */

import { query } from '../../routes/db.js';
import { AiService } from '../../services/AiService.js';
import {
  STORY_WINDOW_HOURS,
  STORY_SUMMARY_MIN_ARTICLES,
  STORY_SUMMARY_MIN_SOURCES,
  ENRICHMENT_GATE_COVERAGE,
  RELEVANCE_FILTER_THRESHOLD,
  buildAlgorithmicSummary,
  detectStoryCategory,
  ensureOpportunityTriggerColumn,
  ensureAlgorithmicSummaryColumn,
  ensureClusteringSchema2,
  ensureFreshnessSchema,
} from './stories.js';

const ai = new AiService();

// ── Opportunity Generation Constants ─────────────────────────────────────────

export const VALID_OPP_TYPES = new Set([
  'NEWS', 'SEO', 'ANALYSIS', 'EXPLAINER', 'SOCIAL', 'FACT_CHECK', 'LIVE_COVERAGE', 'OPINION'
]);

// ── Opportunity Scoring (pure) ──────────────────────────────────────────────

/**
 * calcComposite — Calculate weighted composite opportunity score
 * Weights: Editorial 40%, Traffic 30%, SEO 20%, Urgency 10%
 *
 * @param {number} editorial — 0-100
 * @param {number} traffic — 0-100
 * @param {number} seo — 0-100
 * @param {number} urgency — 0-100
 * @returns {number} — Composite score 0-100
 */
export function calcComposite(editorial, traffic, seo, urgency) {
  return parseFloat((editorial * 0.4 + traffic * 0.3 + seo * 0.2 + urgency * 0.1).toFixed(2));
}

// ── Category-Specific Opportunity Templates (pure) ──────────────────────────

/**
 * getCategoryOpportunityTemplates — Generate category-specific editorial templates
 * Returns 3-4 opportunity templates per category with weighted scores
 *
 * Templates include:
 *   - LIVE_COVERAGE: Real-time coverage pieces (breaking news)
 *   - NEWS: Standard news articles
 *   - ANALYSIS: Deep-dive analysis pieces
 *   - EXPLAINER: Context/background pieces
 *   - SEO: Search-optimized pieces
 *   - OPINION: Opinion/commentary pieces (where applicable)
 *
 * Cross-category rules (always apply):
 *   - Exclusivity window: single-source high-importance stories
 *   - Concentration opportunity: multiple articles but few sources
 *
 * @param {object} story — story_clusters row
 * @param {string} category — Story category (judicial, security, international, etc.)
 * @param {string[]} sourceList — List of source names
 * @returns {object[]} — Array of {type, title, desc, urgency, editorial, traffic, seo}
 */
export function getCategoryOpportunityTemplates(story, category, sourceList) {
  const title    = story.title || 'Esta historia';
  const arts     = story.article_count;
  const srcs     = story.source_count;
  const firstSrc = sourceList[0] || 'una fuente';
  const srcW     = srcs === 1 ? 'fuente' : 'fuentes';
  const templates = [];

  if (category === 'judicial') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `En vivo: audiencia del caso "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. Cobertura de la audiencia en curso.`,
        urgency: 92, editorial: 90, traffic: 82, seo: 68 });
    }
    templates.push({ type: 'ANALYSIS',
      title: `Qué se decidió y por qué importa: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis del fallo o resolución judicial.`,
      urgency: 78, editorial: 92, traffic: 72, seo: 78 });
    templates.push({ type: 'EXPLAINER',
      title: `Cronología del caso: de la denuncia a hoy — "${title}"`,
      desc: `Contexto completo para lectores que llegaron tarde al caso. Base: ${arts} artículos.`,
      urgency: 55, editorial: 85, traffic: 75, seo: 82 });
    templates.push({ type: 'NEWS',
      title: `Cuáles son los próximos pasos judiciales: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza de seguimiento de la causa.`,
      urgency: 65, editorial: 80, traffic: 68, seo: 70 });
  }

  if (category === 'security') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `Última hora: "${title}" — lo que se sabe`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW} en la última hora.`,
        urgency: 95, editorial: 85, traffic: 88, seo: 62 });
    }
    templates.push({ type: 'NEWS',
      title: `Qué pasó: cronología de "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Reconstrucción del hecho para lectores.`,
      urgency: 80, editorial: 82, traffic: 78, seo: 68 });
    if (srcs >= 2) {
      templates.push({ type: 'ANALYSIS',
        title: `Contexto y antecedentes: "${title}"`,
        desc: `${srcs} fuentes informan. Pieza de profundidad sobre el hecho y su entorno.`,
        urgency: 65, editorial: 78, traffic: 70, seo: 72 });
    }
  }

  if (category === 'international') {
    templates.push({ type: 'ANALYSIS',
      title: `Qué significa para Argentina: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis del impacto local de un hecho global.`,
      urgency: 60, editorial: 88, traffic: 72, seo: 80 });
    templates.push({ type: 'EXPLAINER',
      title: `Explicado: quiénes son los actores y qué disputan en "${title}"`,
      desc: `Pieza de contexto para lectores no especializados. ${arts} artículos disponibles.`,
      urgency: 55, editorial: 85, traffic: 75, seo: 82 });
    if (srcs >= 3) {
      templates.push({ type: 'NEWS',
        title: `Estado de situación: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del estado actual del conflicto o evento.`,
        urgency: 70, editorial: 78, traffic: 70, seo: 72 });
    }
    templates.push({ type: 'SEO',
      title: `Preguntas clave sobre "${title}": guía de contexto`,
      desc: `Alta búsqueda en eventos internacionales. ${arts} artículos como fuente.`,
      urgency: 45, editorial: 65, traffic: 78, seo: 88 });
  }

  if (category === 'politics') {
    templates.push({ type: 'ANALYSIS',
      title: `Qué cambia para los ciudadanos: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis de impacto concreto en la población.`,
      urgency: 65, editorial: 88, traffic: 72, seo: 78 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Quiénes apoyan y quiénes rechazan: "${title}"`,
        desc: `${srcs} fuentes con distintos ángulos. Mapa de posiciones políticas.`,
        urgency: 60, editorial: 82, traffic: 68, seo: 74 });
    }
    templates.push({ type: 'EXPLAINER',
      title: `Explicado en simple: "${title}"`,
      desc: `Pieza de contexto para lectores no especializados. Base: ${arts} artículos.`,
      urgency: 55, editorial: 80, traffic: 70, seo: 82 });
    templates.push({ type: 'SEO',
      title: `Claves y posiciones: "${title}"`,
      desc: `Alta búsqueda en hitos políticos. ${arts} artículos como fuente.`,
      urgency: 45, editorial: 65, traffic: 75, seo: 85 });
  }

  if (category === 'economy') {
    templates.push({ type: 'EXPLAINER',
      title: `Qué significa para el bolsillo: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Explicación accesible del hecho económico.`,
      urgency: 62, editorial: 85, traffic: 72, seo: 80 });
    templates.push({ type: 'ANALYSIS',
      title: `Impacto económico: "${title}"`,
      desc: `Análisis de consecuencias a corto y mediano plazo. Base: ${arts} artículos.`,
      urgency: 58, editorial: 88, traffic: 68, seo: 76 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Qué dicen los economistas sobre "${title}"`,
        desc: `${srcs} fuentes con distintas visiones. Síntesis de opiniones expertas.`,
        urgency: 52, editorial: 82, traffic: 65, seo: 75 });
    }
    templates.push({ type: 'SEO',
      title: `Precio, datos y proyecciones: "${title}"`,
      desc: `Alta intención de búsqueda en temas económicos. Base: ${arts} artículos.`,
      urgency: 48, editorial: 62, traffic: 80, seo: 88 });
  }

  if (category === 'health') {
    templates.push({ type: 'EXPLAINER',
      title: `Qué hay que saber: síntomas, riesgos y prevención — "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza informativa de salud pública.`,
      urgency: 68, editorial: 86, traffic: 78, seo: 88 });
    templates.push({ type: 'NEWS',
      title: `Estado de situación: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Actualización del cuadro sanitario.`,
      urgency: 72, editorial: 80, traffic: 72, seo: 70 });
    templates.push({ type: 'ANALYSIS',
      title: `Qué dice la ciencia sobre "${title}"`,
      desc: `Pieza de contexto científico. Base: ${arts} artículos de ${srcs} ${srcW}.`,
      urgency: 50, editorial: 88, traffic: 68, seo: 82 });
    templates.push({ type: 'SEO',
      title: `Preguntas frecuentes sobre "${title}"`,
      desc: `Altísima intención de búsqueda en salud. ${arts} artículos disponibles.`,
      urgency: 45, editorial: 65, traffic: 82, seo: 92 });
  }

  if (category === 'technology') {
    templates.push({ type: 'NEWS',
      title: `Qué anunció y qué cambia: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del anuncio y sus implicaciones.`,
      urgency: 70, editorial: 78, traffic: 80, seo: 72 });
    templates.push({ type: 'ANALYSIS',
      title: `Qué significa para los usuarios: "${title}"`,
      desc: `Pieza de impacto para audiencia general. Base: ${arts} artículos.`,
      urgency: 58, editorial: 82, traffic: 75, seo: 78 });
    templates.push({ type: 'SEO',
      title: `Cómo funciona y para qué sirve: "${title}"`,
      desc: `Alta intención de búsqueda en tecnología e innovación. ${arts} artículos como fuente.`,
      urgency: 42, editorial: 65, traffic: 85, seo: 90 });
    if (srcs >= 2) {
      templates.push({ type: 'EXPLAINER',
        title: `Guía para no especializados: "${title}"`,
        desc: `${srcs} fuentes cubren el tema. Pieza accesible para audiencia masiva.`,
        urgency: 48, editorial: 78, traffic: 78, seo: 82 });
    }
  }

  if (category === 'sports') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `En vivo: "${title}"`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 92, editorial: 75, traffic: 90, seo: 65 });
    }
    templates.push({ type: 'NEWS',
      title: `Cobertura completa: "${title}"`,
      desc: `${arts} artículos en ${srcs} medios deportivos. Resumen del hecho para fans.`,
      urgency: 75, editorial: 72, traffic: 88, seo: 68 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Impacto en la tabla y el torneo: "${title}"`,
        desc: `${srcs} fuentes cubren las consecuencias para la competencia.`,
        urgency: 55, editorial: 68, traffic: 82, seo: 72 });
    }
    templates.push({ type: 'SEO',
      title: `Estadísticas, figuras y datos del encuentro: "${title}"`,
      desc: `Datos concretos con alto potencial de búsqueda. Base: ${arts} artículos.`,
      urgency: 48, editorial: 60, traffic: 85, seo: 88 });
  }

  if (category === 'entertainment') {
    templates.push({ type: 'NEWS',
      title: `Todo sobre "${title}": lo que hay que saber`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Cobertura completa del hecho de espectáculos.`,
      urgency: 68, editorial: 68, traffic: 85, seo: 72 });
    templates.push({ type: 'SEO',
      title: `Quién es, qué dijo y por qué es tendencia: "${title}"`,
      desc: `Alta intención de búsqueda en espectáculos. Base: ${arts} artículos.`,
      urgency: 45, editorial: 58, traffic: 88, seo: 90 });
    if (srcs >= 2) {
      templates.push({ type: 'ANALYSIS',
        title: `Por qué "${title}" genera tanta repercusión`,
        desc: `${srcs} fuentes cubren el fenómeno. Pieza de análisis cultural.`,
        urgency: 50, editorial: 72, traffic: 80, seo: 75 });
    }
  }

  if (category === 'society' || templates.length === 0) {
    templates.push({ type: 'ANALYSIS',
      title: `Por qué importa: "${title}" en contexto`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza de profundidad sobre el impacto social.`,
      urgency: 55, editorial: 80, traffic: 68, seo: 72 });
    templates.push({ type: 'NEWS',
      title: `Qué pasó y quiénes se ven afectados: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del hecho y sus protagonistas.`,
      urgency: 65, editorial: 75, traffic: 72, seo: 68 });
    templates.push({ type: 'EXPLAINER',
      title: `Explicado: "${title}" y su impacto en la comunidad`,
      desc: `Pieza accesible para audiencia general. Base: ${arts} artículos.`,
      urgency: 50, editorial: 78, traffic: 65, seo: 75 });
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `Cobertura en vivo: "${title}"`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 95, editorial: 82, traffic: 88, seo: 68 });
    }
    if (story.coverage_status === 'growing' && srcs >= 2) {
      templates.push({ type: 'NEWS',
        title: `Historia en crecimiento: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. La cobertura está aumentando.`,
        urgency: 70, editorial: 70, traffic: 75, seo: 62 });
    }
  }

  // Cross-category structural rules (always apply)
  if (story.source_count === 1 && (story.importance_score || 0) >= 5) {
    templates.push({ type: 'NEWS',
      title: `Ventana de exclusiva: solo "${firstSrc}" cubre este tema`,
      desc: `Historia con ${arts} artículos cubierta por una sola fuente. Oportunidad de ser el segundo medio.`,
      urgency: 85, editorial: 80, traffic: 62, seo: 52 });
  }
  if (arts >= 6 && srcs <= 2) {
    templates.push({ type: 'NEWS',
      title: `Cobertura concentrada: "${title}"`,
      desc: `${arts} artículos pero solo ${srcs} ${srcW}. Oportunidad para diversificar el ángulo.`,
      urgency: 60, editorial: 66, traffic: 58, seo: 52 });
  }

  return templates;
}

// ── Algorithmic Opportunity Generation (Cost Killer 2+3) ─────────────────────

/**
 * generateAlgorithmicOpportunities — Generate opportunities using templates (no AI)
 * Per Cost Killer 2+3: Automatically generates standardized opportunities for
 * stories without AI calls. Only called from runNewsMonitor (batch cycle).
 *
 * - Generates algorithmic_summary (stored in story_clusters)
 * - Generates 3-4 category-specific opportunities per story
 * - Marks opportunities as trigger='algorithmic' (not 'ai')
 * - Skips stories that already have fresh algorithmic opportunities
 *
 * @param {string[]} storyIds — story_clusters UUIDs
 */
export async function generateAlgorithmicOpportunities(storyIds) {
  if (!storyIds || storyIds.length === 0) return;
  await ensureOpportunityTriggerColumn();
  await ensureAlgorithmicSummaryColumn();
  await ensureClusteringSchema2();
  await ensureFreshnessSchema();

  const { rows: stories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.story_type,
      sc.article_count,
      sc.source_count,
      sc.coverage_status,
      sc.importance_score,
      (
        SELECT json_agg(DISTINCT ts.name)
        FROM story_cluster_articles sca2
        JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
        JOIN tracked_sources ts ON ts.id = ma2.source_id
        WHERE sca2.story_id = sc.id
      ) AS sources,
      (
        SELECT json_agg(ke.name ORDER BY ke.name)
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = sc.id
        LIMIT 5
      ) AS entities,
      (
        SELECT COUNT(*)::int FROM story_opportunities
        WHERE story_cluster_id = sc.id
          AND status = 'pending'
          AND created_at > now() - interval '4 hours'
          AND "trigger" = 'algorithmic'
      ) AS existing_algo_opps
    FROM story_clusters sc
    WHERE sc.id = ANY($1::uuid[])
      AND sc.is_recurring = false
      AND sc.status IN ('active', 'ready')
  `, [storyIds]);

  for (const story of stories) {
    const sourceList = Array.isArray(story.sources) ? story.sources : [];
    const entityList = Array.isArray(story.entities) ? story.entities.filter(Boolean) : [];

    // Generate and persist algorithmic summary
    const algoSummary = buildAlgorithmicSummary(story, entityList);
    await query(
      `UPDATE story_clusters SET algorithmic_summary = $1 WHERE id = $2 AND (algorithmic_summary IS NULL OR summary IS NULL)`,
      [algoSummary, story.id]
    ).catch(() => {});

    if ((story.existing_algo_opps || 0) > 0) continue;

    const catResult = detectStoryCategory(story.title, story.story_type);
    const category = catResult.category;
    const oppsToInsert = getCategoryOpportunityTemplates(story, category, sourceList);

    for (const opp of oppsToInsert) {
      const composite = parseFloat(
        (opp.editorial * 0.4 + opp.traffic * 0.3 + opp.seo * 0.2 + opp.urgency * 0.1).toFixed(2)
      );
      await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'algorithmic')
      `, [
        story.id, opp.title, opp.desc, opp.type,
        opp.traffic, opp.seo, opp.urgency, opp.editorial, composite,
      ]).catch(() => {});
    }
  }
}

/**
 * generateOpportunitiesForStories — AI-driven opportunity generation (Cost Killer 1)
 * CURRENTLY COMMENTED OUT - Called only via explicit user action via POST /editorial-workflow/dossiers/:id/enrich
 * Uses AiService to generate context-aware opportunities for ready stories
 * Requires minimum coverage threshold (ENRICHMENT_GATE_COVERAGE)
 *
 * @deprecated Cost Killer 1: Disabled automatic AI opportunity generation
 */
export async function generateOpportunitiesForStories() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  // Find ready stories that don't have fresh opportunities yet (< 4h old)
  const { rows: stories } = await query(`
    SELECT sc.id, sc.title, sc.summary, sc.story_type, sc.importance_score, sc.coverage_status
    FROM story_clusters sc
    WHERE sc.status = 'ready'
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM story_opportunities so
        WHERE so.story_cluster_id = sc.id
          AND so.created_at > now() - interval '4 hours'
      )
      AND (
        SELECT CASE WHEN COUNT(*) = 0 THEN false
               ELSE (COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright')))::float
                    / COUNT(*) >= $1
               END
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        WHERE sca.story_id = sc.id
      )
    ORDER BY sc.importance_score DESC, sc.source_count DESC
    LIMIT 5
  `, [ENRICHMENT_GATE_COVERAGE]);

  for (const story of stories) {
    try {
      const [articlesRes, entitiesRes] = await Promise.all([
        query(`
          SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
                 ma.content_words, ts.name AS source_name
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources    ts ON ts.id = ma.source_id
          WHERE sca.story_id = $1
            AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
          ORDER BY sca.relevance_score DESC, ma.detected_at DESC
          LIMIT 15
        `, [story.id]),
        query(`
          SELECT ke.name, ke.entity_type
          FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = $1
          LIMIT 10
        `, [story.id]),
      ]);

      // Log AI context for traceability
      query(`
        INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
        VALUES ($1, 'opportunities', $2, $3, $4)
      `, [
        story.id,
        articlesRes.rows.length,
        JSON.stringify(articlesRes.rows.map(a => a.title)),
        articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
      ]).catch(() => {});

      const opps = await ai.generateEditorialOpportunities(
        story, articlesRes.rows, entitiesRes.rows
      );

      // Clear stale pending opportunities before inserting fresh batch
      await query(
        `DELETE FROM story_opportunities WHERE story_cluster_id = $1 AND status = 'pending'`,
        [story.id]
      ).catch(() => {});

      // Persist opportunities
      for (const opp of (opps || [])) {
        if (!opp.title) continue;
        const oppType = VALID_OPP_TYPES.has(opp.type) ? opp.type : 'NEWS';
        const composite = calcComposite(
          opp.editorial_score || 70,
          opp.traffic_score || 60,
          opp.seo_score || 65,
          opp.urgency_score || 50
        );
        await query(`
          INSERT INTO story_opportunities
            (story_cluster_id, title, description, opportunity_type,
             traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ai')
        `, [
          story.id, opp.title, opp.description || '', oppType,
          opp.traffic_score || 60, opp.seo_score || 65,
          opp.urgency_score || 50, opp.editorial_score || 70, composite,
        ]).catch(() => {});
      }

      console.log(`[Monitor] ${opps.length} opportunities generated for story "${story.title}"`);
    } catch (e) {
      console.error(`[Monitor] Opportunity generation failed for "${story.title}":`, e.message);
    }
  }
}
