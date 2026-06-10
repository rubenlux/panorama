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

    const data = await ai.generateDossier(topic.title, brief, entities);

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
    await query(
      `UPDATE editorial_dossiers SET status = 'failed', updated_at = now() WHERE id = $1`,
      [dossierId]
    ).catch(() => {});
  }
}
