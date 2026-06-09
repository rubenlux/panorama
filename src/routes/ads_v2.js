import { Router } from "express";
import { query } from "./db.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// --- Schemas ---
const advertiserSchema = z.object({
    name: z.string().min(1),
    contact_email: z.string().email().optional()
});

const campaignSchema = z.object({
    advertiser_id: z.string().uuid(),
    name: z.string().min(1),
    status: z.enum(["active", "paused", "archived"]).default("active"),
    start_date: z.string().optional(), // ISO date
    end_date: z.string().optional(),
    target_impressions: z.number().optional(),
    banner_url: z.string().url(),
    target_url: z.string().url(),
    position: z.enum([
        "home_top",
        "article_sidebar",
        "article_bottom",
        "header_top",
        "article_hero",
        "article_top_banner",
        "article_sidebar_top",
        "article_sticky",
        "article_sidebar_bottom_1",
        "article_sidebar_bottom_2",
        "home_sponsors",
        "home_latest_sidebar",
        "footer_top_horizontal"
    ]),
    tags: z.array(z.string()).optional()
});

// --- Smart Ad Serving (Profiling + Targeting) ---

/**
 * GET /ads/serve?position=home_top&visitor_id=...
 * Smart Ad Server logic
 */
router.get("/serve", async (req, res) => {
    const { position, visitor_id } = req.query;
    if (!position) return res.status(400).json({ error: "Position required" });

    try {
        let userInterests = [];

        // 1. Build User Profile (Real-time)
        // If visitor_id is provided, check what they like.
        if (visitor_id && visitor_id !== 'undefined') {
            const history = await query(`
                SELECT 
                   (payload->>'category') as category, 
                   COUNT(*) as weight
                FROM pixel_events 
                WHERE visitor_id = $1 
                AND event = 'content_view'
                AND created_at > NOW() - INTERVAL '30 days'
                AND payload->>'category' IS NOT NULL
                GROUP BY 1 
                ORDER BY 2 DESC 
                LIMIT 3
            `, [visitor_id]);

            userInterests = history.rows.map(r => r.category);
            if (userInterests.length > 0) {
                console.log(`[AdBrain] Visitor ${visitor_id.substring(0, 5)}... likes:`, userInterests);
            }
        }

        // 2. Find Matching Campaigns
        // Priority: 
        // A. Campaigns matching User Interests (Targeted)
        // B. Campaigns with NO tags (General/Run-of-Network)

        let queryParams = [position];
        let tagFilter = "";

        if (userInterests.length > 0) {
            // Find campaigns that have ANY of the user's interests in their tags
            // OR have no tags (broad)
            // Postgres Array Overlap operator: &&
            tagFilter = `AND (tags IS NULL OR tags = '{}' OR tags && $2::text[])`;
            queryParams.push(userInterests);
        } else {
            // No profile? Show broad ads only
            tagFilter = `AND (tags IS NULL OR tags = '{}')`;
        }

        const adQuery = `
            SELECT id, banner_url, target_url, name, tags
            FROM campaigns 
            WHERE status = 'active'
            AND position = $1
            AND start_date <= NOW()
            AND (end_date IS NULL OR end_date >= NOW())
            ${tagFilter}
            ORDER BY 
                (tags && $2::text[]) DESC, -- Prioritize specific matches if we have interests
                RANDOM() -- Rotate the rest
            LIMIT 1
        `;

        // If no user interests, we don't pass $2, so we need to be careful with the query construction.
        // Let's simplify:
        // Always pass userInterests (even if empty).
        // If empty, the (tags && $2) will be false, so it falls back to empty tags.

        const result = await query(adQuery, [position, userInterests]);

        if (result.rows.length === 0) {
            // Fallback: Try finding ANY ad for this position just in case strict matching failed
            const fallback = await query(`
                SELECT id, banner_url, target_url, name 
                FROM campaigns 
                WHERE status = 'active' 
                AND position = $1
                AND (tags IS NULL OR tags = '{}') -- Pure broad match
                LIMIT 1
            `, [position]);

            if (fallback.rows.length === 0) return res.json({ ad: null });
            return res.json({ ad: fallback.rows[0], debug_match: 'fallback' });
        }

        res.json({
            ad: result.rows[0],
            debug_interests: userInterests,
            debug_match: result.rows[0].tags && result.rows[0].tags.length > 0 ? 'targeted' : 'general'
        });

    } catch (e) {
        console.error("Ad Serve Error:", e);
        res.status(500).json({ error: "Server Error" });
    }
});

// --- Management API (CMS) ---

router.get("/manage/advertisers", requireAuth, requireRole("admin"), async (req, res) => {
    const result = await query("SELECT * FROM advertisers ORDER BY created_at DESC");
    res.json(result.rows);
});

router.post("/manage/advertisers", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const data = advertiserSchema.parse(req.body);
        const result = await query(
            "INSERT INTO advertisers (name, contact_email) VALUES ($1, $2) RETURNING *",
            [data.name, data.contact_email]
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.get("/manage/campaigns", requireAuth, requireRole("admin"), async (req, res) => {
    const result = await query(`
        SELECT c.*, a.name as advertiser_name 
        FROM campaigns c
        JOIN advertisers a ON c.advertiser_id = a.id
        ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
});

router.post("/manage/campaigns", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const data = campaignSchema.parse(req.body);
        const result = await query(`
            INSERT INTO campaigns 
            (advertiser_id, name, status, start_date, end_date, target_impressions, banner_url, target_url, position, tags)
            VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            data.advertiser_id,
            data.name,
            data.status,
            data.start_date,
            data.end_date,
            data.target_impressions,
            data.banner_url,
            data.target_url,
            data.position,
            data.tags || [] // Default to empty array
        ]);
        res.json(result.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

// PUT /ads/manage/campaigns/:id - Actualizar campaña
router.put("/manage/campaigns/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const data = campaignSchema.parse(req.body);

        const result = await query(`
            UPDATE campaigns 
            SET advertiser_id = $1,
                name = $2,
                status = $3,
                start_date = COALESCE($4::timestamptz, start_date),
                end_date = $5,
                target_impressions = $6,
                banner_url = $7,
                target_url = $8,
                position = $9,
                tags = $10,
                updated_at = NOW()
            WHERE id = $11
            RETURNING *
        `, [
            data.advertiser_id,
            data.name,
            data.status,
            data.start_date,
            data.end_date,
            data.target_impressions,
            data.banner_url,
            data.target_url,
            data.position,
            data.tags || [],
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Campaña no encontrada" });
        }

        res.json(result.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

// DELETE /ads/manage/campaigns/:id - Eliminar campaña
router.delete("/manage/campaigns/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(`
            DELETE FROM campaigns 
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Campaña no encontrada" });
        }

        res.json({ success: true, message: "Campaña eliminada" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
