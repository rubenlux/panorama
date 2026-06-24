import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { processTrackedSource } from '../jobs/trackedSourceMonitor.js';

const router = Router();

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM tracked_sources) as total_sources,
        (SELECT COUNT(*)::int FROM tracked_sources WHERE active = true) as active_sources,
        (SELECT COUNT(*)::int FROM tracked_articles) as total_items,
        (SELECT COUNT(*)::int FROM tracked_articles WHERE is_active = true) as active_items,
        (SELECT COUNT(*)::int FROM coverage_changes) as total_changes,
        (SELECT COUNT(*)::int FROM coverage_changes WHERE detected_at > now() - interval '24 hours') as changes_24h,
        (SELECT COUNT(*)::int FROM coverage_changes WHERE change_type = 'link_added' AND detected_at > now() - interval '24 hours') as added_24h,
        (SELECT COUNT(*)::int FROM coverage_changes WHERE change_type = 'title_changed' AND detected_at > now() - interval '24 hours') as title_changed_24h,
        (SELECT COUNT(*)::int FROM coverage_changes WHERE change_type = 'link_removed' AND detected_at > now() - interval '24 hours') as removed_24h,
        (SELECT MAX(detected_at) FROM coverage_changes) as last_change_at
    `);
    res.json(stats);
  } catch (e) { next(e); }
});

// ── Global feed (all changes across all sources) ──────────────────────────────

router.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const { change_type, source_id, q } = req.query;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const conditions = [];
    const params = [];

    if (change_type) {
      params.push(change_type);
      conditions.push(`cc.change_type = $${params.length}`);
    }
    if (source_id) {
      params.push(source_id);
      conditions.push(`cc.tracked_source_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      conditions.push(`(ta.url ILIKE $${n} OR ta.title ILIKE $${n} OR cc.old_value ILIKE $${n} OR cc.new_value ILIKE $${n} OR ts.name ILIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await query(`
      SELECT
        cc.id,
        cc.change_type,
        cc.old_value,
        cc.new_value,
        cc.detected_at,
        ts.id   AS source_id,
        ts.name AS source_name,
        ts.url  AS source_url,
        ts.type AS source_type,
        ta.id    AS article_id,
        ta.url   AS article_url,
        ta.title AS article_title,
        ta.current_position,
        ta.is_active,
        ta.published_at
      FROM coverage_changes cc
      JOIN tracked_sources ts ON ts.id = cc.tracked_source_id
      LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
      ${where}
      ORDER BY cc.detected_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    // Total count for pagination
    const { rows: [{ total }] } = await query(`
      SELECT COUNT(*)::int AS total
      FROM coverage_changes cc
      JOIN tracked_sources ts ON ts.id = cc.tracked_source_id
      LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
      ${where}
    `, params.slice(0, -2));

    res.json({ items: rows, total, limit, offset });
  } catch (e) { next(e); }
});

// ── Sources list with stats ───────────────────────────────────────────────────

router.get('/sources', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        ts.*,
        COUNT(DISTINCT ta.id)::int                                                         AS item_count,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.is_active = true)::int                      AS active_item_count,
        COUNT(DISTINCT cc.id)::int                                                         AS change_count,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.detected_at > now() - interval '24 hours')::int AS changes_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_added'     AND cc.detected_at > now() - interval '24 hours')::int AS added_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'title_changed'  AND cc.detected_at > now() - interval '24 hours')::int AS title_changed_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_removed'   AND cc.detected_at > now() - interval '24 hours')::int AS removed_24h,
        MAX(cc.detected_at)                                                                AS last_change_at,
        (SELECT COUNT(*)::int FROM tracked_source_snapshots WHERE tracked_source_id = ts.id) AS snapshot_count
      FROM tracked_sources ts
      LEFT JOIN tracked_articles    ta ON ta.tracked_source_id = ts.id
      LEFT JOIN coverage_changes    cc ON cc.tracked_source_id = ts.id
      GROUP BY ts.id
      ORDER BY MAX(cc.detected_at) DESC NULLS LAST, ts.created_at DESC
    `);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// ── Single source ─────────────────────────────────────────────────────────────

router.get('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows: [source] } = await query(`
      SELECT
        ts.*,
        COUNT(DISTINCT ta.id)::int                                                         AS item_count,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.is_active = true)::int                      AS active_item_count,
        COUNT(DISTINCT cc.id)::int                                                         AS change_count,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.detected_at > now() - interval '24 hours')::int AS changes_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_added')::int             AS total_added,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'title_changed')::int          AS total_title_changed,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_removed')::int           AS total_removed,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_added'    AND cc.detected_at > now() - interval '24 hours')::int AS added_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'title_changed' AND cc.detected_at > now() - interval '24 hours')::int AS title_changed_24h,
        COUNT(DISTINCT cc.id) FILTER (WHERE cc.change_type = 'link_removed'  AND cc.detected_at > now() - interval '24 hours')::int AS removed_24h,
        MAX(cc.detected_at)                                                                AS last_change_at
      FROM tracked_sources ts
      LEFT JOIN tracked_articles ta ON ta.tracked_source_id = ts.id
      LEFT JOIN coverage_changes cc ON cc.tracked_source_id = ts.id
      WHERE ts.id = $1
      GROUP BY ts.id
    `, [req.params.id]);

    if (!source) return res.status(404).json({ error: 'Source not found' });
    res.json(source);
  } catch (e) { next(e); }
});

// ── Source timeline (changes for one source) ──────────────────────────────────

router.get('/sources/:id/timeline', requireAuth, async (req, res, next) => {
  try {
    const { change_type, q } = req.query;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const conditions = [`cc.tracked_source_id = $1`];
    const params = [req.params.id];

    if (change_type) {
      params.push(change_type);
      conditions.push(`cc.change_type = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      conditions.push(`(ta.url ILIKE $${n} OR ta.title ILIKE $${n} OR cc.old_value ILIKE $${n} OR cc.new_value ILIKE $${n})`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const { rows } = await query(`
      SELECT
        cc.id,
        cc.change_type,
        cc.old_value,
        cc.new_value,
        cc.detected_at,
        ta.id               AS article_id,
        ta.url              AS article_url,
        ta.title            AS article_title,
        ta.current_position,
        ta.is_active
      FROM coverage_changes cc
      LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
      ${where}
      ORDER BY cc.detected_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: [{ total }] } = await query(`
      SELECT COUNT(*)::int AS total
      FROM coverage_changes cc
      LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
      ${where}
    `, params.slice(0, -2));

    res.json({ items: rows, total, limit, offset });
  } catch (e) { next(e); }
});

// ── Source articles catalog ───────────────────────────────────────────────────

router.get('/sources/:id/articles', requireAuth, async (req, res, next) => {
  try {
    const { active } = req.query;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const conditions = [`tracked_source_id = $1`];
    const params = [req.params.id];

    if (active === 'true') {
      conditions.push(`is_active = true`);
    } else if (active === 'false') {
      conditions.push(`is_active = false`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const { rows } = await query(`
      SELECT id, url, title, first_detected_at, last_seen_at, current_position, is_active,
        published_at, (content_text IS NOT NULL) AS has_content
      FROM tracked_articles
      ${where}
      ORDER BY first_detected_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: [{ total }] } = await query(`
      SELECT COUNT(*)::int AS total FROM tracked_articles ${where}
    `, params.slice(0, -2));

    res.json({ items: rows, total, limit, offset });
  } catch (e) { next(e); }
});

// ── Single article detail ─────────────────────────────────────────────────────

router.get('/articles/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows: [article] } = await query(`
      SELECT
        ta.*,
        ts.id   AS source_id,
        ts.name AS source_name,
        ts.url  AS source_url,
        ts.type AS source_type
      FROM tracked_articles ta
      JOIN tracked_sources ts ON ts.id = ta.tracked_source_id
      WHERE ta.id = $1
    `, [req.params.id]);

    if (!article) return res.status(404).json({ error: 'Article not found' });

    // Changes specific to this article
    const { rows: changes } = await query(`
      SELECT id, change_type, old_value, new_value, detected_at
      FROM coverage_changes
      WHERE tracked_article_id = $1
      ORDER BY detected_at DESC
    `, [req.params.id]);

    res.json({ ...article, changes });
  } catch (e) { next(e); }
});

// ── Create source ─────────────────────────────────────────────────────────────

router.post('/sources', requireAuth, async (req, res, next) => {
  try {
    const { name, url, type, refresh_interval_seconds = 300 } = req.body;
    if (!name || !url || !type) return res.status(400).json({ error: 'name, url y type son obligatorios' });

    const { rows: [source] } = await query(
      `INSERT INTO tracked_sources (name, url, type, refresh_interval_seconds)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, url, type, refresh_interval_seconds]
    );
    res.status(201).json(source);
  } catch (e) { next(e); }
});

// ── Update source ─────────────────────────────────────────────────────────────

router.patch('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    const { name, url, type, refresh_interval_seconds, active } = req.body;
    const { rows: [source] } = await query(
      `UPDATE tracked_sources SET
         name                     = COALESCE($1, name),
         url                      = COALESCE($2, url),
         type                     = COALESCE($3, type),
         refresh_interval_seconds = COALESCE($4, refresh_interval_seconds),
         active                   = COALESCE($5, active),
         updated_at               = now()
       WHERE id = $6
       RETURNING *`,
      [name, url, type, refresh_interval_seconds, active, req.params.id]
    );
    if (!source) return res.status(404).json({ error: 'Source not found' });
    res.json(source);
  } catch (e) { next(e); }
});

// ── Delete source ─────────────────────────────────────────────────────────────

router.delete('/sources/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM tracked_sources WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Force check now ───────────────────────────────────────────────────────────

router.post('/sources/:id/check', requireAuth, async (req, res, next) => {
  try {
    const { rows: [source] } = await query(
      `SELECT * FROM tracked_sources WHERE id = $1`,
      [req.params.id]
    );
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (!source.active) return res.status(400).json({ error: 'Source is paused' });

    // Run immediately in background — respond fast
    res.json({ ok: true, message: 'Chequeo iniciado' });

    processTrackedSource(source).then(result => {
      console.log(`[Coverage] Manual check "${source.name}": ${result.changes} changes, ${result.newItems} new`);
    }).catch(e => {
      console.error(`[Coverage] Manual check failed for "${source.name}":`, e.message);
    });

  } catch (e) { next(e); }
});

// ── Legacy endpoints (kept for backward compat with TrackedSources.jsx) ───────

router.get('/sources/:id/snapshots', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM tracked_source_snapshots
       WHERE tracked_source_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /by-entity/:name — coverage changes for a specific entity (OpenClaw)
// Read-only, max 5 results for context aggregation
router.get('/by-entity/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    const { rows } = await query(`
      SELECT DISTINCT
        cc.id, cc.change_type, cc.detected_at,
        ts.name AS source_name, ts.url AS source_url,
        ta.title AS article_title, ta.url AS article_url,
        ta.published_at
      FROM coverage_changes cc
      LEFT JOIN tracked_sources ts ON ts.id = cc.tracked_source_id
      LEFT JOIN tracked_articles ta ON ta.id = cc.tracked_article_id
      WHERE LOWER(ta.title) ILIKE LOWER($1)
         OR LOWER(ts.name) ILIKE LOWER($1)
      ORDER BY cc.detected_at DESC
      LIMIT $2
    `, [name, limit]);

    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});

export default router;
