/**
 * DossierService — shared dossier generation pipeline.
 * Extracted from editorial_workflow.js so stories, opportunities, and events
 * can all trigger dossier generation without duplicating the logic.
 */

import { query } from '../routes/db.js';
import { AiService } from './AiService.js';

const ai = new AiService();

function tryParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

/**
 * Runs the dossier generation pipeline for an existing editorial_dossier record.
 *
 * @param {string} dossierId  - UUID of the editorial_dossiers row (status must be 'generating')
 * @param {object} topic      - Row from research_topics + lateral join on research_briefs.
 *                              Must include: id, title, executive_summary, key_facts,
 *                              controversies, timeline, opportunities, risks, source_opportunities.
 */
export async function runDossierGeneration(dossierId, topic) {
  try {
    const { rows: entities } = await query(
      `SELECT ke.name, ke.entity_type
       FROM entity_mentions em JOIN knowledge_entities ke ON ke.id = em.entity_id
       WHERE em.topic_id = $1`,
      [topic.id]
    );

    const brief = {
      executive_summary:   topic.executive_summary,
      key_facts:           Array.isArray(topic.key_facts)     ? topic.key_facts     : tryParse(topic.key_facts,     []),
      controversies:       Array.isArray(topic.controversies) ? topic.controversies : tryParse(topic.controversies, []),
      timeline:            Array.isArray(topic.timeline)      ? topic.timeline      : tryParse(topic.timeline,      []),
      opportunities:       topic.opportunities,
      risks:               topic.risks,
      source_opportunities: Array.isArray(topic.source_opportunities)
        ? topic.source_opportunities
        : tryParse(topic.source_opportunities, []),
    };

    // ── Article context ──────────────────────────────────────────────────────
    // Prefer articles passed directly from the caller (stories/opportunities/events).
    // Fallback: fetch from research_sources for the manual editorial_workflow path.
    let sourceArticles = Array.isArray(topic.source_articles) ? topic.source_articles : [];

    if (sourceArticles.length === 0) {
      const { rows: rs } = await query(
        `SELECT title, source_name, url, published_at,
                content      AS content_text,
                word_count   AS content_words,
                relevance_score
         FROM research_sources
         WHERE topic_id = $1
         ORDER BY relevance_score DESC NULLS LAST
         LIMIT 8`,
        [topic.id]
      );
      sourceArticles = rs;
    }

    // ── Metrics ──────────────────────────────────────────────────────────────
    const charsAvailable = sourceArticles.reduce(
      (sum, a) => sum + (a.content_text?.length || a.summary?.length || 0), 0
    );
    const richCount = sourceArticles.filter(a => a.content_text && a.content_text.length > 200).length;

    const data = await ai.generateDossier(topic.title, brief, entities, sourceArticles);

    // Calculate chars actually sent (reuse same budget constants as _buildArticlesBlock)
    const MAX_PER = 9_000, TOTAL = 50_000;
    let budgetUsed = 0;
    for (const a of [...sourceArticles]
      .filter(a => a.content_text || a.summary)
      .sort((a, b) => (b.content_words || 0) - (a.content_words || 0))
      .slice(0, 8)) {
      const raw  = a.content_text || a.summary || '';
      const used = Math.min(raw.length, MAX_PER, TOTAL - budgetUsed);
      budgetUsed += used;
      if (budgetUsed >= TOTAL) break;
    }
    const pct = charsAvailable > 0 ? Math.round(budgetUsed / charsAvailable * 100) : 0;
    console.log(
      `[DossierService] Context: ${sourceArticles.length} articles (${richCount} full) | ` +
      `available=${charsAvailable}c sent=${budgetUsed}c utilization=${pct}%`
    );

    await query(
      `UPDATE editorial_dossiers SET
         status               = 'ready',
         executive_summary    = $1,
         verified_facts       = $2,
         timeline             = $3,
         entities             = $4,
         seo_keywords         = $5,
         suggested_categories = $6,
         suggested_tags       = $7,
         suggested_headlines  = $8,
         suggested_angles     = $9,
         hero_image_prompt    = $10,
         updated_at           = now()
       WHERE id = $11`,
      [
        data.executive_summary    || null,
        JSON.stringify(data.verified_facts    || []),
        JSON.stringify(data.timeline          || []),
        JSON.stringify(entities),
        data.seo_keywords         || [],
        data.suggested_categories || [],
        data.suggested_tags       || [],
        data.suggested_headlines  || [],
        JSON.stringify(data.suggested_angles  || []),
        data.hero_image_prompt    || null,
        dossierId,
      ]
    );

    const rawAngles = Array.isArray(data.suggested_angles) ? data.suggested_angles : [];
    const noticiaFirst = [
      ...rawAngles.filter(a => a.angle_type === 'noticia'),
      ...rawAngles.filter(a => a.angle_type !== 'noticia'),
    ];
    for (let i = 0; i < noticiaFirst.length; i++) {
      const a = noticiaFirst[i];
      if (!a.angle_type || !a.title) continue;
      await query(
        `INSERT INTO editorial_angles (dossier_id, title, angle_type, summary, target_audience, seo_keywords, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [dossierId, a.title, a.angle_type, a.summary || '', a.target_audience || '', JSON.stringify(a.seo_keywords || a.keywords || []), i]
      );
    }

    console.log(`[DossierService] Generated: ${dossierId} | ${noticiaFirst.length} angles`);
  } catch (e) {
    console.error(`[DossierService] Generation failed for ${dossierId}:`, e.message);
    // Detect credit exhaustion specifically to surface a clear message in the CMS
    const reason = e.message?.includes('credit balance') || e.message?.includes('too low')
      ? 'Créditos de API insuficientes. Recargá el saldo en console.anthropic.com/settings/billing'
      : e.message?.slice(0, 300) || 'Error desconocido';
    await query(
      `UPDATE editorial_dossiers SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`,
      [dossierId, reason]
    ).catch(() => {});
  }
}
