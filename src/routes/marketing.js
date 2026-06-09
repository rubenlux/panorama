import { Router } from "express";
import { z } from "zod";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// PUBLIC: Subscribe to newsletter
router.post("/subscribe", async (req, res, next) => {
    try {
        const schema = z.object({
            email: z.string().email(),
        });
        const { email } = schema.parse(req.body);

        // Upsert: If exists, do nothing or update status
        const r = await query(`
      INSERT INTO subscribers (email, status)
      VALUES ($1, 'active')
      ON CONFLICT (email) DO UPDATE SET status = 'active'
      RETURNING id, email, status
    `, [email]);

        res.json({ success: true, subscriber: r.rows[0] });
    } catch (e) {
        if (e.code === '23505') { // Unique violation (already handled by UPSERT generally, but good failsafe)
            return res.json({ success: true, message: "Already subscribed" });
        }
        next(e);
    }
});

// ADMIN: List subscribers
router.get("/subscribers", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const r = await query(`
        SELECT id, email, status, created_at 
        FROM subscribers 
        ORDER BY created_at DESC 
        LIMIT 100
    `);
        res.json({ data: r.rows });
    } catch (e) {
        next(e);
    }
});

export default router;
