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
    console.log("[Analytics Debug] Incoming:", req.body);

    // Malformed payload is a real client bug (broken integration), not a
    // transient beacon failure — worth a real 400 so it's visible and fixable,
    // unlike the DB-failure case below which must stay silent to the client.
    let parsed;
    try {
        parsed = trackSchema.parse(req.body);
    } catch (e) {
        return res.status(400).json({ error: "INVALID_PAYLOAD", message: e.message });
    }
    const { article_id, type, session_id, metadata } = parsed;

    try {
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
        // This is a fire-and-forget analytics beacon: a DB failure here isn't
        // something the client (a real visitor reading an article) can act on,
        // and surfacing it would break the reading experience for no benefit —
        // so the response still says ok:true. But it must not be invisible to
        // operators either: log at error severity (not warn) so it actually
        // surfaces in monitoring, and be honest in the payload that nothing
        // was recorded, instead of the misleading "legacy_error" field name.
        console.error("[Analytics] DB write failed:", e.message);
        return res.json({ ok: true, recorded: false });
    }
});

export default router;
