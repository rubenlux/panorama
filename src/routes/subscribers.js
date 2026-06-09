import { Router } from "express";
import { query } from "./db.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

const subscribeSchema = z.object({
    email: z.string().email(),
    source: z.string().optional(),
});

// NON-MATCHING PUBLIC: Subscribe
router.post("/", async (req, res, next) => {
    try {
        const { email, source } = subscribeSchema.parse(req.body);

        await query(`
        INSERT INTO subscribers (email, source)
        VALUES ($1, $2)
        ON CONFLICT (email) DO NOTHING
    `, [email, source || "unknown"]);

        res.json({ ok: true });
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
        next(e);
    }
});

// ADMIN: List subscribers
router.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query(`SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 100`);
        res.json({ items: r.rows });
    } catch (e) {
        next(e);
    }
});

export default router;
