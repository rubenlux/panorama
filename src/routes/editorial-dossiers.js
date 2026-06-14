import { Router } from 'express';
import { query } from './db.js';
import { chromium } from 'playwright';

const router = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit)     || 20, 50);
    const offset   = parseInt(req.query.offset)   || 0;
    const minScore = parseInt(req.query.min_score) || 0;
    const status   = req.query.status  || null;
    const q        = req.query.q       || null;

    const conds  = ['ec.editorial_score >= $1'];
    const params = [minScore];
    let p = 2;
    if (status) { conds.push(`ec.status = $${p++}`);            params.push(status); }
    if (q)      { conds.push(`ec.headline ILIKE $${p++}`);      params.push(`%${q}%`); }
    const where = conds.join(' AND ');

    const [rows, tot] = await Promise.all([
      query(`
        SELECT
          ec.id, ec.headline, ec.event_type, ec.importance_score, ec.editorial_score,
          ec.coverage_status, ec.status,
          ec.story_count, ec.article_count, ec.source_count,
          ec.first_detected_at, ec.last_updated_at,
          COUNT(DISTINCT eo.id)::int  AS opportunity_count,
          COUNT(DISTINCT se.entity_id)::int AS entity_count
        FROM event_clusters ec
        LEFT JOIN editorial_opportunities eo  ON eo.event_id  = ec.id
        LEFT JOIN event_cluster_stories  ecs2 ON ecs2.event_id = ec.id
        LEFT JOIN story_entities         se   ON se.story_id  = ecs2.story_id
        WHERE ${where}
        GROUP BY ec.id
        ORDER BY ec.editorial_score DESC, ec.last_updated_at DESC NULLS LAST
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*)::int AS n FROM event_clusters ec WHERE ${where}`, params),
    ]);

    res.json({ items: rows.rows, total: tot.rows[0].n, limit, offset });
  } catch (e) { next(e); }
});

// ── Stats (para cabecera de la página) ───────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const { rows: [s] } = await query(`
      SELECT
        COUNT(*)::int                                        AS total_events,
        COUNT(*) FILTER (WHERE status='active')::int        AS active_events,
        COUNT(*) FILTER (WHERE coverage_status='breaking')::int AS breaking,
        COUNT(*) FILTER (WHERE coverage_status='growing')::int  AS growing,
        ROUND(AVG(editorial_score))::int                    AS avg_score,
        MAX(editorial_score)::int                           AS max_score,
        (SELECT COUNT(*)::int FROM editorial_opportunities WHERE status='pending') AS pending_opps
      FROM event_clusters
    `);
    res.json(s);
  } catch (e) { next(e); }
});

// ── Full dossier ──────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [event] } = await query(`
      SELECT id, headline, summary, event_type, importance_score, editorial_score,
             coverage_status, status, story_count, article_count, source_count,
             first_detected_at, last_updated_at
      FROM event_clusters WHERE id = $1
    `, [id]);

    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    const [timelineR, entitiesR, mediaR, oppsR, storyOppsR] = await Promise.all([

      // 2. Cronología — artículos ordenados por fecha, deduplicados
      query(`
        SELECT DISTINCT ON (ma.id)
               ma.id, ma.title, ma.url,
               COALESCE(ma.published_at, ma.detected_at) AS ts,
               ma.detected_at, ma.published_at, ma.summary,
               ts.name AS source_name, ts.type AS source_type,
               sca.relevance_score
        FROM monitored_articles ma
        JOIN story_cluster_articles sca ON sca.article_id = ma.id
        JOIN event_cluster_stories  ecs ON ecs.story_id   = sca.story_id
        JOIN tracked_sources        ts  ON ts.id          = ma.source_id
        WHERE ecs.event_id = $1
        ORDER BY ma.id, COALESCE(ma.published_at, ma.detected_at) ASC
      `, [id]),

      // 3. Participantes — entidades únicas por tipo, con normalización de tipos
      query(`
        SELECT ke.name,
               CASE LOWER(ke.entity_type)
                 WHEN 'person'       THEN 'person'
                 WHEN 'per'          THEN 'person'
                 WHEN 'organization' THEN 'organization'
                 WHEN 'org'          THEN 'organization'
                 WHEN 'company'      THEN 'organization'
                 WHEN 'institution'  THEN 'organization'
                 WHEN 'location'     THEN 'place'
                 WHEN 'place'        THEN 'place'
                 WHEN 'gpe'          THEN 'place'
                 WHEN 'loc'          THEN 'place'
                 WHEN 'topic'        THEN 'topic'
                 WHEN 'tag'          THEN 'topic'
                 WHEN 'product'      THEN 'topic'
                 ELSE 'unknown'
               END AS entity_type,
               ke.mention_count,
               COUNT(DISTINCT se.story_id)::int AS story_mentions
        FROM knowledge_entities ke
        JOIN story_entities        se  ON se.entity_id  = ke.id
        JOIN event_cluster_stories ecs ON ecs.story_id  = se.story_id
        WHERE ecs.event_id = $1
        GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
        ORDER BY story_mentions DESC, ke.mention_count DESC
        LIMIT 60
      `, [id]),

      // 4. Cobertura mediática — medios rankeados por cantidad
      query(`
        SELECT ts.name AS source_name, ts.type AS source_type, ts.trust_score,
               COUNT(DISTINCT ma.id)::int AS article_count,
               MIN(COALESCE(ma.published_at, ma.detected_at)) AS first_article,
               MAX(COALESCE(ma.published_at, ma.detected_at)) AS last_article
        FROM tracked_sources        ts
        JOIN monitored_articles     ma  ON ma.source_id  = ts.id
        JOIN story_cluster_articles sca ON sca.article_id = ma.id
        JOIN event_cluster_stories  ecs ON ecs.story_id   = sca.story_id
        WHERE ecs.event_id = $1
        GROUP BY ts.id, ts.name, ts.type, ts.trust_score
        ORDER BY article_count DESC, ts.trust_score DESC NULLS LAST
        LIMIT 20
      `, [id]),

      // 5. Oportunidades editoriales pre-computadas (por evento)
      query(`
        SELECT id, type, title, reason, seo_value, traffic_potential, difficulty, status
        FROM editorial_opportunities
        WHERE event_id = $1
        ORDER BY seo_value DESC NULLS LAST
      `, [id]),

      // 6. Oportunidades de historias relacionadas
      query(`
        SELECT DISTINCT so.title, so.description, so.opportunity_type,
               so.composite_score, so.traffic_score, so.editorial_score, so.urgency_score, so.status
        FROM story_opportunities    so
        JOIN event_cluster_stories ecs ON ecs.story_id = so.story_cluster_id
        WHERE ecs.event_id = $1
        ORDER BY so.composite_score DESC NULLS LAST
        LIMIT 10
      `, [id]),
    ]);

    // Sort timeline in app (DISTINCT ON prevents ORDER in outer query)
    const timeline = timelineR.rows.sort((a, b) => new Date(a.ts) - new Date(b.ts));

    res.json({
      event,
      timeline,
      entities:          entitiesR.rows,
      media:             mediaR.rows,
      opportunities:     oppsR.rows,
      story_opportunities: storyOppsR.rows,
    });
  } catch (e) { next(e); }
});

// ── PDF export ────────────────────────────────────────────────────────────────

router.get('/:id/pdf', async (req, res, next) => {
  let browser;
  try {
    const { id } = req.params;

    const { rows: [event] } = await query(`
      SELECT id, headline, summary, event_type, importance_score, editorial_score,
             coverage_status, status, story_count, article_count, source_count,
             first_detected_at, last_updated_at
      FROM event_clusters WHERE id = $1
    `, [id]);

    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    const [timelineR, entitiesR, mediaR, oppsR] = await Promise.all([
      query(`
        SELECT DISTINCT ON (ma.id)
               ma.id, ma.title, ma.url,
               COALESCE(ma.published_at, ma.detected_at) AS ts,
               ma.summary, ts.name AS source_name
        FROM monitored_articles ma
        JOIN story_cluster_articles sca ON sca.article_id = ma.id
        JOIN event_cluster_stories  ecs ON ecs.story_id   = sca.story_id
        JOIN tracked_sources        ts  ON ts.id          = ma.source_id
        WHERE ecs.event_id = $1
        ORDER BY ma.id, COALESCE(ma.published_at, ma.detected_at) ASC
      `, [id]),
      query(`
        SELECT ke.name, ke.entity_type, ke.mention_count,
               COUNT(DISTINCT se.story_id)::int AS story_mentions
        FROM knowledge_entities ke
        JOIN story_entities        se  ON se.entity_id  = ke.id
        JOIN event_cluster_stories ecs ON ecs.story_id  = se.story_id
        WHERE ecs.event_id = $1
        GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
        ORDER BY story_mentions DESC LIMIT 30
      `, [id]),
      query(`
        SELECT ts.name AS source_name,
               COUNT(DISTINCT ma.id)::int AS article_count,
               MIN(COALESCE(ma.published_at, ma.detected_at)) AS first_article
        FROM tracked_sources        ts
        JOIN monitored_articles     ma  ON ma.source_id  = ts.id
        JOIN story_cluster_articles sca ON sca.article_id = ma.id
        JOIN event_cluster_stories  ecs ON ecs.story_id   = sca.story_id
        WHERE ecs.event_id = $1
        GROUP BY ts.id, ts.name ORDER BY article_count DESC LIMIT 15
      `, [id]),
      query(`
        SELECT title, reason, seo_value, traffic_potential, difficulty
        FROM editorial_opportunities WHERE event_id = $1
        ORDER BY seo_value DESC NULLS LAST LIMIT 10
      `, [id]),
    ]);

    const timeline = timelineR.rows.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const coverageBadge = { breaking: '🔴 Breaking', growing: '📈 Creciendo', monitoring: '👁 Monitoreando', cooling: '❄ Enfriando' };

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; line-height: 1.5; }
  .page { padding: 32px 40px; max-width: 900px; margin: 0 auto; }
  .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .headline { font-size: 20px; font-weight: 900; color: #0f172a; line-height: 1.3; margin-bottom: 10px; }
  .meta { display: flex; gap: 20px; font-size: 11px; color: #6b7280; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
  .score-badge { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .summary { background: #f8fafc; border-left: 3px solid #3b82f6; padding: 10px 14px; margin: 14px 0; font-size: 12px; color: #374151; line-height: 1.6; }
  h2 { font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: .05em; margin: 24px 0 12px; padding-bottom: 4px; border-bottom: 2px solid #e5e7eb; }
  .timeline-item { display: flex; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f3f4f6; }
  .timeline-num { width: 22px; height: 22px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 10px; color: #374151; flex-shrink: 0; }
  .timeline-num.first { background: #1d4ed8; color: #fff; }
  .timeline-num.last  { background: #059669; color: #fff; }
  .tl-source { font-size: 10px; font-weight: 700; color: #1d4ed8; margin-bottom: 2px; }
  .tl-title  { font-size: 12px; font-weight: 700; color: #111; }
  .tl-date   { font-size: 10px; color: #9ca3af; }
  .entity-group { margin-bottom: 14px; }
  .entity-group-label { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .entity-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .entity-tag { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #f3f4f6; border: 1px solid #e5e7eb; }
  .media-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
  .media-rank { width: 24px; font-size: 11px; font-weight: 700; color: #9ca3af; text-align: right; }
  .media-name { flex: 1; font-weight: 700; font-size: 12px; }
  .media-count { font-size: 13px; font-weight: 800; color: #1d4ed8; }
  .opp-item { margin-bottom: 10px; padding: 10px 12px; border-radius: 8px; background: #f8fafc; border-left: 3px solid #1d4ed8; }
  .opp-title { font-weight: 700; font-size: 12px; margin-bottom: 3px; }
  .opp-reason { font-size: 11px; color: #6b7280; }
  .opp-meta { font-size: 10px; color: #1d4ed8; font-weight: 700; margin-top: 3px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body><div class="page">
  <div class="header">
    <div class="brand">📋 Dossier Editorial · Panorama CMS</div>
    <div class="headline">${event.headline}</div>
    <div class="meta">
      <span class="badge score-badge">Score ${event.editorial_score}</span>
      <span>${coverageBadge[event.coverage_status] || '👁 Monitoreando'}</span>
      <span>📰 ${event.article_count} artículos</span>
      <span>📡 ${event.source_count} fuentes</span>
      <span>🕐 ${fmtDate(event.first_detected_at)}</span>
      <span>🔄 ${fmtDate(event.last_updated_at)}</span>
    </div>
    ${event.summary ? `<div class="summary">${event.summary}</div>` : ''}
  </div>

  <h2>📅 Cronología (${timeline.length} publicaciones)</h2>
  ${timeline.map((a, i) => `
    <div class="timeline-item">
      <div class="timeline-num ${i === 0 ? 'first' : i === timeline.length - 1 ? 'last' : ''}">${i + 1}</div>
      <div style="flex:1">
        <div class="tl-source">${a.source_name} · <span class="tl-date">${fmtDate(a.ts)}</span></div>
        <div class="tl-title">${a.title}</div>
      </div>
    </div>
  `).join('')}

  ${entitiesR.rows.length > 0 ? `
  <h2>👥 Participantes</h2>
  ${['person','organization','place','topic'].map(type => {
    const group = entitiesR.rows.filter(e => e.entity_type === type);
    if (!group.length) return '';
    const labels = { person: '👤 Personas', organization: '🏛 Organizaciones', place: '📍 Lugares', topic: '🏷 Temas' };
    return `<div class="entity-group">
      <div class="entity-group-label">${labels[type]}</div>
      <div class="entity-tags">${group.map(e => `<span class="entity-tag">${e.name}${e.story_mentions > 1 ? ` (${e.story_mentions})` : ''}</span>`).join('')}</div>
    </div>`;
  }).join('')}` : ''}

  <h2>📺 Cobertura Mediática</h2>
  ${mediaR.rows.map((m, i) => `
    <div class="media-row">
      <div class="media-rank">#${i + 1}</div>
      <div class="media-name">${m.source_name}</div>
      <div class="media-count">${m.article_count} art.</div>
    </div>
  `).join('')}

  ${oppsR.rows.length > 0 ? `
  <h2>🎯 Oportunidades Editoriales</h2>
  ${oppsR.rows.map(o => `
    <div class="opp-item">
      <div class="opp-title">${o.title}</div>
      ${o.reason ? `<div class="opp-reason">${o.reason}</div>` : ''}
      <div class="opp-meta">${o.traffic_potential ? `📈 ${o.traffic_potential}` : ''}${o.difficulty ? `  ·  🎯 ${o.difficulty}` : ''}${o.seo_value ? `  ·  SEO ${o.seo_value}/10` : ''}</div>
    </div>
  `).join('')}` : ''}

  <div class="footer">Generado por Panorama CMS · ${new Date().toLocaleString('es-AR')} · Confidencial</div>
</div></body></html>`;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', bottom: '0', left: '0', right: '0' },
    });

    const slug = event.headline.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="dossier-${id}-${slug}.pdf"`);
    res.send(pdf);
  } catch (e) {
    next(e);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

export default router;
