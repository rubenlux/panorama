import { Router } from "express";
import { query } from "./db.js";
import { z } from "zod";

const router = Router();

const trackSchema = z.object({
    article_id: z.string().uuid(),
    type: z.string(), // Allow generic strings for scroll_25, etc.
    session_id: z.string().optional(),
    metadata: z.record(z.any()).optional()
});

router.post("/track", async (req, res, next) => {
    try {
        console.log("[Analytics Debug] Incoming:", req.body);
        const { article_id, type, session_id, metadata } = trackSchema.parse(req.body);

        // 1. Log Raw Event (The "Brain" Memory)
        await query(`
            INSERT INTO events (article_id, type, session_id, metadata)
            VALUES ($1, $2, $3, $4)
        `, [article_id, type, session_id || null, metadata || null]);

        // 2. Update Aggregated Stats (Fast Read)
        if (type === "view") {
            await query(`
            INSERT INTO article_stats (article_id, views, last_viewed_at)
            VALUES ($1, 1, NOW())
            ON CONFLICT (article_id) 
            DO UPDATE SET views = article_stats.views + 1, last_viewed_at = NOW()
        `, [article_id]);

        } else if (type === "heartbeat") {
            // Heartbeat is now 10s
            await query(`
            UPDATE article_stats 
            SET total_read_time_seconds = COALESCE(total_read_time_seconds, 0) + 10,
                avg_read_time = CASE 
                    WHEN views > 0 THEN (COALESCE(total_read_time_seconds, 0) + 10) / views 
                    ELSE 0 
                END
            WHERE article_id = $1
        `, [article_id]);

        } else if (type === "like") {
            await query(`
            UPDATE article_stats 
            SET likes = likes + 1 
            WHERE article_id = $1
        `, [article_id]);

        } else if (type === "share") {
            await query(`
            UPDATE article_stats 
            SET shares = shares + 1 
            WHERE article_id = $1
        `, [article_id]);
        }

        res.json({ ok: true });

    } catch (e) {
        // ERROR FIREWALL:
        // We catch EVERYTHING here to prevent Legacy Analytics from breaking the client
        // or showing red console errors during the transition to Pixel.

        console.warn("[Analytics Legacy Breakdown]:", e.message);

        // Return 200 OK to keep client happy
        return res.json({ ok: true, legacy_error: e.message });
    }
});

export default router;
