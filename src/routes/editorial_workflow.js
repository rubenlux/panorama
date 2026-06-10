import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { AiService } from '../services/AiService.js';

const router = Router();
const ai = new AiService();

// ── POST /editorial-workflow/dossiers ──────────────────────────────────────
router.post('/dossiers', requireAuth, async (req, res, next) => {
  try {
    const { topic_id } = req.body;
    if (!topic_id) return res.status(400).json({ error: 'topic_id is required' });

    const { rows: [topic] } = await query(
      `SELECT rt.*, rb.executive_summary, rb.key_facts, rb.controversies, rb.timeline, rb.opportunities, rb.risks
       FROM research_topics rt
       LEFT JOIN LATERAL (
         SELECT * FROM research_briefs WHERE topic_id = rt.id ORDER BY generated_at DESC LIMIT 1
       ) rb ON true
       WHERE rt.id = $1`,
      [topic_id]
    );
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (!topic.executive_summary) return res.status(422).json({ error: 'Topic does not have a research brief yet' });

    const userId = req.user?.sub || null;
    const { rows: [dossier] } = await query(
      `INSERT INTO editorial_dossiers (topic_id, status, created_by) VALUES ($1, 'generating', $2) RETURNING *`,
      [topic_id, userId]
    );

    res.status(201).json({ dossier });
    setImmediate(() => _generateDossier(dossier.id, topic));
  } catch (e) { next(e); }
});

// ── GET /editorial-workflow/dossiers ──────────────────────────────────────
router.get('/dossiers', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT ed.*,
             rt.title AS topic_title,
             rt.status AS topic_status,
             (SELECT COUNT(*)::int FROM articles WHERE dossier_id = ed.id) AS drafts_count,
             (SELECT COUNT(*)::int FROM editorial_angles WHERE dossier_id = ed.id) AS angles_count
      FROM editorial_dossiers ed
      LEFT JOIN research_topics rt ON rt.id = ed.topic_id
      ORDER BY ed.created_at DESC
      LIMIT 50
    `);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// ── GET /editorial-workflow/dossiers/:id ──────────────────────────────────
router.get('/dossiers/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows: [dossier] } = await query(`
      SELECT ed.*,
             rt.title AS topic_title,
             rt.id    AS topic_id_check,
             rb.executive_summary AS brief_summary,
             rb.key_facts         AS brief_key_facts
      FROM editorial_dossiers ed
      LEFT JOIN research_topics rt ON rt.id = ed.topic_id
      LEFT JOIN LATERAL (
        SELECT executive_summary, key_facts
        FROM research_briefs WHERE topic_id = ed.topic_id
        ORDER BY generated_at DESC LIMIT 1
      ) rb ON true
      WHERE ed.id = $1
    `, [req.params.id]);
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' });

    const { rows: drafts } = await query(
      `SELECT id, title, slug, status, created_at FROM articles WHERE dossier_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    const { rows: angles } = await query(
      `SELECT * FROM editorial_angles WHERE dossier_id = $1 ORDER BY position ASC`,
      [req.params.id]
    );

    res.json({ dossier, drafts, angles });
  } catch (e) { next(e); }
});

// ── GET /editorial-workflow/dossiers/:id/angles ───────────────────────────
router.get('/dossiers/:id/angles', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM editorial_angles WHERE dossier_id = $1 ORDER BY position ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ── POST /editorial-workflow/dossiers/:id/angles/refresh ──────────────────
// Generate 4 brand-new angles, replacing all existing ones
router.post('/dossiers/:id/angles/refresh', requireAuth, async (req, res, next) => {
  try {
    const { rows: [dossier] } = await query(
      `SELECT ed.*, rt.title AS topic_title, rb.executive_summary, rb.key_facts, rb.opportunities, rb.risks
       FROM editorial_dossiers ed
       LEFT JOIN research_topics rt ON rt.id = ed.topic_id
       LEFT JOIN LATERAL (
         SELECT executive_summary, key_facts, opportunities, risks
         FROM research_briefs WHERE topic_id = ed.topic_id
         ORDER BY generated_at DESC LIMIT 1
       ) rb ON true
       WHERE ed.id = $1`,
      [req.params.id]
    );
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' });
    if (dossier.status !== 'ready') return res.status(422).json({ error: 'Dossier is not ready yet' });

    const { rows: entities } = await query(
      `SELECT ke.name, ke.entity_type FROM entity_mentions em JOIN knowledge_entities ke ON ke.id = em.entity_id WHERE em.topic_id = $1`,
      [dossier.topic_id]
    );
    const entityList = entities.map(e => `${e.name} (${e.entity_type})`).join(', ');
    const briefText = dossier.executive_summary || '';

    const newAngles = await ai.generateAngles(dossier.topic_title, briefText, entityList);

    await query(`DELETE FROM editorial_angles WHERE dossier_id = $1`, [req.params.id]);

    // Always save noticia first
    const sorted = [
      ...newAngles.filter(a => a.angle_type === 'noticia'),
      ...newAngles.filter(a => a.angle_type !== 'noticia'),
    ];
    const saved = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const { rows: [row] } = await query(
        `INSERT INTO editorial_angles (dossier_id, title, angle_type, summary, target_audience, seo_keywords, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, a.title, a.angle_type, a.summary, a.target_audience, JSON.stringify(a.seo_keywords || []), i]
      );
      saved.push(row);
    }

    res.json(saved);
  } catch (e) { next(e); }
});

// ── POST /editorial-workflow/dossiers/:id/angles/regenerate ──────────────
// Regenerate a single angle by angle_id
router.post('/dossiers/:id/angles/regenerate', requireAuth, async (req, res, next) => {
  try {
    const { angle_id } = req.body;
    if (!angle_id) return res.status(400).json({ error: 'angle_id is required' });

    const { rows: [angle] } = await query(
      `SELECT * FROM editorial_angles WHERE id = $1 AND dossier_id = $2`,
      [angle_id, req.params.id]
    );
    if (!angle) return res.status(404).json({ error: 'Angle not found' });

    const { rows: [dossier] } = await query(
      `SELECT ed.*, rt.title AS topic_title, rb.executive_summary
       FROM editorial_dossiers ed
       LEFT JOIN research_topics rt ON rt.id = ed.topic_id
       LEFT JOIN LATERAL (SELECT executive_summary FROM research_briefs WHERE topic_id = ed.topic_id ORDER BY generated_at DESC LIMIT 1) rb ON true
       WHERE ed.id = $1`,
      [req.params.id]
    );

    const { rows: entities } = await query(
      `SELECT ke.name, ke.entity_type FROM entity_mentions em JOIN knowledge_entities ke ON ke.id = em.entity_id WHERE em.topic_id = $1`,
      [dossier.topic_id]
    );
    const entityList = entities.map(e => `${e.name} (${e.entity_type})`).join(', ');

    const newAngle = await ai.regenerateAngle(
      dossier.topic_title,
      dossier.executive_summary || '',
      entityList,
      angle.angle_type
    );

    const { rows: [updated] } = await query(
      `UPDATE editorial_angles SET title=$1, summary=$2, target_audience=$3, seo_keywords=$4
       WHERE id=$5 RETURNING *`,
      [newAngle.title, newAngle.summary, newAngle.target_audience, JSON.stringify(newAngle.seo_keywords || []), angle_id]
    );

    res.json(updated);
  } catch (e) { next(e); }
});

// ── POST /editorial-workflow/dossiers/:id/draft ───────────────────────────
// Generate article draft from a specific angle_id (sync, returns content — does NOT create article)
router.post('/dossiers/:id/draft', requireAuth, async (req, res, next) => {
  try {
    const { angle_id } = req.body;
    if (!angle_id) return res.status(400).json({ error: 'angle_id is required' });

    const { rows: [angle] } = await query(
      `SELECT * FROM editorial_angles WHERE id = $1 AND dossier_id = $2`,
      [angle_id, req.params.id]
    );
    if (!angle) return res.status(404).json({ error: 'Angle not found in this dossier' });

    const { rows: [dossier] } = await query(
      `SELECT ed.*, rt.title AS topic_title, rb.executive_summary AS brief_summary
       FROM editorial_dossiers ed
       LEFT JOIN research_topics rt ON rt.id = ed.topic_id
       LEFT JOIN LATERAL (
         SELECT executive_summary FROM research_briefs WHERE topic_id = ed.topic_id
         ORDER BY generated_at DESC LIMIT 1
       ) rb ON true
       WHERE ed.id = $1`,
      [req.params.id]
    );
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' });
    if (dossier.status !== 'ready') return res.status(422).json({ error: 'Dossier is not ready yet' });

    const angleForAi = {
      angle_type:      angle.angle_type,
      title:           angle.title,
      summary:         angle.summary,
      target_audience: angle.target_audience,
      seo_keywords:    Array.isArray(angle.seo_keywords) ? angle.seo_keywords : tryParse(angle.seo_keywords, []),
    };

    const draft = await ai.generateArticleDraft(
      dossier.topic_title,
      dossier,
      angleForAi,
      dossier.brief_summary || ''
    );

    res.json({ draft, dossier_id: dossier.id, angle_id, angle: angleForAi });
  } catch (e) { next(e); }
});

// ── GET /editorial-workflow/metrics ──────────────────────────────────────
router.get('/metrics', requireAuth, async (req, res, next) => {
  try {
    const { rows: [m] } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM editorial_dossiers)                              AS total_dossiers,
        (SELECT COUNT(*)::int FROM editorial_dossiers WHERE status = 'ready')       AS ready_dossiers,
        (SELECT COUNT(*)::int FROM editorial_dossiers WHERE status = 'generating')  AS generating_dossiers,
        (SELECT COUNT(*)::int FROM editorial_angles)                                AS total_angles,
        (SELECT COUNT(*)::int FROM articles WHERE origin = 'manual')                AS articles_manual,
        (SELECT COUNT(*)::int FROM articles WHERE origin = 'dossier')               AS articles_from_dossier,
        (SELECT COUNT(*)::int FROM articles WHERE origin = 'research')              AS articles_from_research,
        (SELECT COUNT(*)::int FROM research_topics WHERE status = 'completed')      AS topics_completed
    `);
    res.json(m);
  } catch (e) { next(e); }
});

// ── Background dossier generation ─────────────────────────────────────────
async function _generateDossier(dossierId, topic) {
  try {
    const { rows: entities } = await query(
      `SELECT ke.name, ke.entity_type
       FROM entity_mentions em JOIN knowledge_entities ke ON ke.id = em.entity_id
       WHERE em.topic_id = $1`,
      [topic.id]
    );

    const brief = {
      executive_summary: topic.executive_summary,
      key_facts:     Array.isArray(topic.key_facts)     ? topic.key_facts     : tryParse(topic.key_facts,     []),
      controversies: Array.isArray(topic.controversies) ? topic.controversies : tryParse(topic.controversies, []),
      timeline:      Array.isArray(topic.timeline)      ? topic.timeline      : tryParse(topic.timeline,      []),
      opportunities: topic.opportunities,
      risks:         topic.risks,
    };

    const data = await ai.generateDossier(topic.title, brief, entities);

    // Save dossier fields
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

    // Persist angles to editorial_angles table — noticia always first
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

    console.log(`[Dossier] Generated: ${dossierId} | ${noticiaFirst.length} angles persisted`);
  } catch (e) {
    console.error(`[Dossier] Generation failed for ${dossierId}:`, e.message);
    await query(
      `UPDATE editorial_dossiers SET status = 'failed', updated_at = now() WHERE id = $1`,
      [dossierId]
    ).catch(() => {});
  }
}

function tryParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export default router;
