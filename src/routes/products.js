import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

/**
 * GET /products
 * Public - Get active products
 */
router.get("/", async (req, res, next) => {
    try {
        const result = await query(
            `SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC`
        );
        res.json({ products: result.rows });
    } catch (e) {
        next(e);
    }
});

/**
 * POST /products (CMS)
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { name, category, price, old_price, image_url, target_url } = req.body;
        const result = await query(
            `INSERT INTO products (name, category, price, old_price, image_url, target_url)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, category, price, old_price, image_url, target_url]
        );
        res.json(result.rows[0]);
    } catch (e) {
        next(e);
    }
});

/**
 * DELETE /products/:id (CMS)
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

export default router;
