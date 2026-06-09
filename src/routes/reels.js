import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

/**
 * GET /reels/settings
 */
router.get("/settings", async (req, res, next) => {
    try {
        const result = await query(`SELECT * FROM reel_settings LIMIT 1`);
        res.json({ settings: result.rows[0] });
    } catch (e) {
        next(e);
    }
});

/**
 * PUT /reels/settings
 */
router.put("/settings", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { background_color } = req.body;
        const result = await query(
            `UPDATE reel_settings SET background_color = $1, updated_at = CURRENT_TIMESTAMP RETURNING *`,
            [background_color]
        );
        res.json({ settings: result.rows[0] });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /reels?status=active
 * Public endpoint - Get active reels
 */
router.get("/", async (req, res, next) => {
    try {
        const { status = 'active' } = req.query;
        const result = await query(
            `SELECT * FROM reels WHERE status = $1 ORDER BY order_index ASC, created_at DESC`,
            [status]
        );
        res.json({ reels: result.rows });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /reels/admin/list
 * Admin - Get all reels
 */
router.get("/admin/list", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const result = await query(
            `SELECT * FROM reels ORDER BY order_index ASC, created_at DESC`
        );
        res.json({ reels: result.rows });
    } catch (e) {
        next(e);
    }
});

/**
 * POST /reels
 * Admin - Create new reel
 */
router.post("/", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { title, description, url, thumbnail, platform, status, order_index } = req.body;

        const result = await query(
            `INSERT INTO reels (title, description, url, thumbnail, platform, status, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [title, description, url, thumbnail || null, platform || 'instagram', status || 'active', order_index || 0]
        );

        res.json({ reel: result.rows[0] });
    } catch (e) {
        next(e);
    }
});

/**
 * PUT /reels/:id
 * Admin - Update reel
 */
router.put("/:id", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, description, url, thumbnail, platform, status, order_index } = req.body;

        const result = await query(
            `UPDATE reels 
             SET title = $1, description = $2, url = $3, thumbnail = $4, 
                 platform = $5, status = $6, order_index = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *`,
            [title, description, url, thumbnail, platform, status, order_index, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Reel not found" });
        }

        res.json({ reel: result.rows[0] });
    } catch (e) {
        next(e);
    }
});

/**
 * DELETE /reels/:id
 * Admin - Delete reel
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { id } = req.params;
        await query(`DELETE FROM reels WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

export default router;
