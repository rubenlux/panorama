import { Router } from "express";
import { query } from "./db.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// --- PUBLIC: SMART SERVING ---
// GET /active?position=header
router.get("/active", async (req, res, next) => {
    try {
        const { position } = req.query;
        // Logic:
        // 1. Join Ads -> Campaigns -> Advertisers
        // 2. Check Campaign Status = 'active'
        // 3. Check Campaign Dates (NOW between start/end)
        // 4. Check Ad Active = true
        // 5. Filter by Slot Position

        const params = [];
        let sql = `
            SELECT a.id, a.image_url, a.link_url, a.alt_text, 
                   c.name as campaign_name, adv.name as sponsor_name
            FROM ads a
            JOIN campaigns c ON a.campaign_id = c.id
            JOIN advertisers adv ON c.advertiser_id = adv.id
            JOIN ad_slots s ON a.ad_slot_id = s.id
            WHERE a.active = TRUE
              AND c.status = 'active'
              AND (c.start_date IS NULL OR c.start_date <= NOW())
              AND (c.end_date IS NULL OR c.end_date >= NOW())
              AND s.active = TRUE
        `;

        if (position) {
            sql += ` AND s.position = $${params.push(position)}`;
        }

        // Randomize for rotation
        sql += " ORDER BY RANDOM()";

        const r = await query(sql, params);
        res.json({ items: r.rows });
    } catch (e) {
        next(e);
    }
});

// PUBLIC: Track Impression
router.post("/:id/impression", async (req, res, next) => {
    try {
        // Log to ad_events for detailed stats
        await query(`
            INSERT INTO ad_events (ad_id, type, ip, user_agent)
            VALUES ($1, 'impression', $2, $3)
        `, [req.params.id, req.ip, req.headers['user-agent']]);

        // Also update legacy counter for fast display
        await query(`UPDATE ads SET impressions = impressions + 1 WHERE id = $1`, [req.params.id]);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

// PUBLIC: Track Click
router.post("/:id/click", async (req, res, next) => {
    try {
        await query(`
            INSERT INTO ad_events (ad_id, type, ip, user_agent)
            VALUES ($1, 'click', $2, $3)
        `, [req.params.id, req.ip, req.headers['user-agent']]);

        await query(`UPDATE ads SET clicks = clicks + 1 WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});


// --- ADMIN: INVENTORY & CRM ---

// List Inventory (Slots)
router.get("/admin/slots", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query("SELECT * FROM ad_slots ORDER BY position");
        res.json({ items: r.rows });
    } catch (e) { next(e); }
});

// ADMIN: List All Ads
router.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query(`
            SELECT a.*, c.name as campaign_name, adv.name as advertiser_name, s.name as slot_name
            FROM ads a
            LEFT JOIN campaigns c ON a.campaign_id = c.id
            LEFT JOIN advertisers adv ON c.advertiser_id = adv.id
            LEFT JOIN ad_slots s ON a.ad_slot_id = s.id
            ORDER BY a.created_at DESC
        `);
        // Fallback for legacy ads that might not have campaign_id
        const items = r.rows.map(ad => ({
            ...ad,
            sponsor_name: ad.advertiser_name || ad.sponsor_name || "Legacy Ad"
        }));
        res.json({ items });
    } catch (e) {
        next(e);
    }
});

// List Advertisers
router.get("/admin/advertisers", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query("SELECT * FROM advertisers ORDER BY name");
        res.json({ items: r.rows });
    } catch (e) { next(e); }
});

// Create Advertiser
router.post("/admin/advertisers", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { name, email, contact_name } = req.body;
        const r = await query(
            "INSERT INTO advertisers (name, email, contact_name) VALUES ($1, $2, $3) RETURNING *",
            [name, email, contact_name]
        );
        res.json({ item: r.rows[0] });
    } catch (e) { next(e); }
});

// List Campaigns
router.get("/admin/campaigns", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query(`
            SELECT c.*, adv.name as advertiser_name,
                   (SELECT COUNT(*) FROM ads WHERE campaign_id = c.id) as ads_count
             FROM campaigns c
             JOIN advertisers adv ON c.advertiser_id = adv.id
             ORDER BY c.created_at DESC
         `);

        const items = r.rows.map(c => {
            // Calculate hypothetical revenue if we had the stats joined, 
            // but here we just return the config fields.
            // If we want revenue in the list, we need the counts.
            // The query effectively counts only ads, not impressions.
            // Let's just return the config for now.
            return {
                ...c,
                price_formatted: `${c.price} ${c.currency}`
            };
        });
        res.json({ items });
    } catch (e) { next(e); }
});

// Create Campaign
router.post("/admin/campaigns", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { advertiser_id, name, budget, start_date, end_date, status, pricing_model, price, currency } = req.body;
        const r = await query(`
            INSERT INTO campaigns (advertiser_id, name, budget, start_date, end_date, status, pricing_model, price, currency)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [advertiser_id, name, budget || 0, start_date || null, end_date || null, status || 'draft', pricing_model || 'CPM', price || 0, currency || 'USD']);
        res.json({ item: r.rows[0] });
    } catch (e) { next(e); }
});

// Create Ad (Creative) Linked to Campaign
router.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { campaign_id, ad_slot_id, image_url, link_url, alt_text, active } = req.body;
        const r = await query(`
            INSERT INTO ads (campaign_id, ad_slot_id, image_url, link_url, alt_text, active, sponsor_name, type, position)
            VALUES ($1, $2, $3, $4, $5, $6, 'Linked', 'banner', 'dynamic') 
            RETURNING *
        `, [campaign_id, ad_slot_id, image_url, link_url, alt_text, active !== false]);
        // Note: sponsor_name, type, position in 'ads' table might be redundant or legacy. 
        // We fill them with defaults to satisfy NON NULL if any, or just for backward compat.
        res.json({ item: r.rows[0] });
    } catch (e) { next(e); }
});


// --- ADMIN: DASHBOARD (INTELLIGENCE) ---

// 1. KPIs
router.get("/admin/kpis", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Impressions today
        const impRes = await query(`
            SELECT COUNT(*) as count FROM ad_events 
            WHERE type = 'impression' AND created_at::date = $1
        `, [today]);

        // Clicks today
        const clickRes = await query(`
            SELECT COUNT(*) as count FROM ad_events 
            WHERE type = 'click' AND created_at::date = $1
        `, [today]);

        // Active Campaigns
        const activeRes = await query(`
            SELECT COUNT(*) as count FROM campaigns 
            WHERE status = 'active' 
            AND (start_date IS NULL OR start_date <= NOW())
            AND (end_date IS NULL OR end_date >= NOW())
        `);

        // Global CTR (Today)
        const impressions = parseInt(impRes.rows[0].count) || 0;
        const clicks = parseInt(clickRes.rows[0].count) || 0;
        const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0.00";

        // Global Revenue (Month to Date - from ad_revenue table)
        const revRes = await query(`
            SELECT
              COALESCE(SUM(revenue), 0) as revenue
            FROM ad_revenue
            WHERE period_start >= date_trunc('month', NOW())
        `);
        const totalRevenue = parseFloat(revRes.rows[0].revenue);

        res.json({
            impressionsToday: impressions,
            clicksToday: clicks,
            ctr: ctr + "%",
            activeCampaigns: parseInt(activeRes.rows[0].count) || 0,
            revenueToday: totalRevenue.toFixed(2) // Actually returning MTD, but keeping key for frontend compat
        });
    } catch (e) { next(e); }
});

// 2. Chart Data (Performance)
router.get("/admin/chart", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { range = 30 } = req.query; // days

        const r = await query(`
            SELECT 
                to_char(created_at, 'YYYY-MM-DD') as date,
                SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) as impressions,
                SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) as clicks
            FROM ad_events
            WHERE created_at >= NOW() - INTERVAL '${parseInt(range)} days'
            GROUP BY 1
            ORDER BY 1 ASC
        `);

        res.json({ data: r.rows });
    } catch (e) { next(e); }
});

// 3. Active Campaigns List (Dashboard Widget)
router.get("/admin/campaigns/active-list", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query(`
            SELECT c.id, c.name, adv.name as sponsor, 
                   COUNT(DISTINCT a.id) as ad_count,
                   c.start_date, c.end_date, c.status,
                   -- Aggregated stats from legacy counters or events could go here
                   -- specific stats per campaign might need a join on ad_events, keeping it simple for now
                   COALESCE(SUM(a.impressions), 0) as total_impressions,
                   COALESCE(SUM(a.clicks), 0) as total_clicks
            FROM campaigns c
            JOIN advertisers adv ON c.advertiser_id = adv.id
            LEFT JOIN ads a ON a.campaign_id = c.id
            WHERE c.status = 'active'
              AND (c.start_date IS NULL OR c.start_date <= NOW())
              AND (c.end_date IS NULL OR c.end_date >= NOW())
            GROUP BY c.id, adv.name
            ORDER BY c.end_date ASC
            LIMIT 10
        `);

        // Calc CTR
        const items = r.rows.map(row => {
            const imps = parseInt(row.total_impressions);
            const clks = parseInt(row.total_clicks);
            return {
                ...row,
                ctr: imps > 0 ? ((clks / imps) * 100).toFixed(2) + "%" : "0.00%"
            };
        });

        res.json({ items });
    } catch (e) { next(e); }
});

// 4. Top Ads Ranking
router.get("/admin/ads/top", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const r = await query(`
            SELECT a.id, a.image_url, a.impressions, a.clicks, s.name as slot_name
            FROM ads a
            LEFT JOIN ad_slots s ON a.ad_slot_id = s.id
            WHERE a.active = TRUE
            ORDER BY a.clicks DESC, a.impressions DESC
            LIMIT 5
        `);

        const items = r.rows.map(ad => ({
            ...ad,
            ctr: ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) + "%" : "0.00%"
        }));

        res.json({ items });
    } catch (e) { next(e); }
});

// 5. Alerts (Intelligence)
router.get("/admin/alerts", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const alerts = [];

        // Alert 1: Low CTR Ads (< 0.5% after 1000 impressions)
        const lowCtrApi = await query(`
            SELECT id, clicks, impressions FROM ads 
            WHERE impressions > 1000 AND (clicks::float / impressions) < 0.005 AND active = TRUE
        `);
        lowCtrApi.rows.forEach(ad => {
            alerts.push({
                type: 'warning',
                message: `Ad #${ad.id} has very low CTR (${((ad.clicks / ad.impressions) * 100).toFixed(2)}%). Consider replacing.`
            });
        });

        // Alert 2: Campaigns ending soon (in 3 days)
        const endingSoon = await query(`
            SELECT name, end_date FROM campaigns 
            WHERE status = 'active' 
            AND end_date BETWEEN NOW() AND NOW() + INTERVAL '3 days'
        `);
        endingSoon.rows.forEach(c => {
            alerts.push({
                type: 'info',
                message: `Campaign "${c.name}" ends soon (${new Date(c.end_date).toLocaleDateString()}).`
            });
        });

        res.json({ items: alerts });
    } catch (e) { next(e); }
});


// --- CAMPAIGN DETAILS ---

// 6. Single Campaign Stats (KPIs + Chart)
router.get("/admin/campaigns/:id/stats", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { range = 30 } = req.query;

        // 1. Campaign Basic Info
        const campRes = await query(`
            SELECT c.*, adv.name as advertiser_name
            FROM campaigns c
            JOIN advertisers adv ON c.advertiser_id = adv.id
            WHERE c.id = $1
        `, [id]);

        if (campRes.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
        const campaign = campRes.rows[0];

        // 2. Aggregated KPIs (Lifetime)
        // We can sum from 'ads' table for speed, or count events. 
        // Let's use 'ads' table counters for lifetime totals to be fast.
        const kpiRes = await query(`
            SELECT SUM(impressions) as imm, SUM(clicks) as clk
            FROM ads
            WHERE campaign_id = $1
        `, [id]);

        const impressions = parseInt(kpiRes.rows[0].imm) || 0;
        const clicks = parseInt(kpiRes.rows[0].clk) || 0;
        const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0.00";

        // Revenue Calc
        let revenue = 0;
        const price = parseFloat(campaign.price || 0);
        if (campaign.pricing_model === 'CPM') revenue = (impressions / 1000) * price;
        else if (campaign.pricing_model === 'CPC') revenue = clicks * price;
        else if (campaign.pricing_model === 'FIXED') revenue = price; // Fixed total value





        // 3. Chart Data (Daily breakdown from events)
        // We need to join ad_events -> ads -> campaigns
        const chartRes = await query(`
            SELECT 
                to_char(e.created_at, 'YYYY-MM-DD') as date,
                SUM(CASE WHEN e.type = 'impression' THEN 1 ELSE 0 END) as impressions,
                SUM(CASE WHEN e.type = 'click' THEN 1 ELSE 0 END) as clicks
            FROM ad_events e
            JOIN ads a ON e.ad_id = a.id
            WHERE a.campaign_id = $1
              AND e.created_at >= NOW() - INTERVAL '${parseInt(range)} days'
            GROUP BY 1
            ORDER BY 1 ASC
        `, [id]);

        res.json({
            campaign,
            kpis: {
                impressions,
                clicks,
                ctr: ctr + "%",
                // Calculate days remaining if end_date exists
                daysLeft: campaign.end_date ? Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24)) : '∞',
                revenue: revenue.toLocaleString('en-US', { style: 'currency', currency: campaign.currency || 'USD' }),
                model: campaign.pricing_model,
                revenue: revenue.toLocaleString('en-US', { style: 'currency', currency: campaign.currency || 'USD' }),
                model: campaign.pricing_model
            },
            chart: chartRes.rows
        });
    } catch (e) { next(e); }
});

// 7. Campaign Ads List
router.get("/admin/campaigns/:id/ads", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const r = await query(`
            SELECT a.*, s.name as slot_name, s.position
            FROM ads a
            LEFT JOIN ad_slots s ON a.ad_slot_id = s.id
            WHERE a.campaign_id = $1
            ORDER BY a.impressions DESC
        `, [id]);

        const items = r.rows.map(ad => ({
            ...ad,
            ctr: ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) + "%" : "0.00%"
        }));

        res.json({ items });
    } catch (e) { next(e); }
});

// 8. Export Campaign Report (CSV)
router.get("/admin/campaigns/:id/export", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch all data
        const campRes = await query(`SELECT c.*, adv.name as advertiser FROM campaigns c JOIN advertisers adv ON c.advertiser_id = adv.id WHERE c.id = $1`, [id]);
        if (campRes.rows.length === 0) return res.status(404).send("Campaign not found");
        const campaign = campRes.rows[0];

        // Daily Stats
        const dailyRes = await query(`
            SELECT 
                to_char(created_at, 'YYYY-MM-DD') as date,
                SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) as impressions,
                SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) as clicks
            FROM ad_events e JOIN ads a ON e.ad_id = a.id
            WHERE a.campaign_id = $1
            GROUP BY 1 ORDER BY 1 DESC
        `, [id]);

        // Ads Stats
        const adsRes = await query(`
            SELECT a.id, a.sponsor_name, a.impressions, a.clicks, a.active
            FROM ads a WHERE a.campaign_id = $1
        `, [id]);

        // Build CSV content
        let csv = `REPORTE DE CAMPAÑA\n`;
        csv += `Campaña,${campaign.name}\n`;
        csv += `Cliente,${campaign.advertiser}\n`;
        csv += `Estado,${campaign.status}\n`;
        csv += `Fechas,${new Date(campaign.start_date).toLocaleDateString()} - ${new Date(campaign.end_date).toLocaleDateString()}\n\n`;

        csv += `RENDIMIENTO DIARIO\n`;
        csv += `Fecha,Impresiones,Clicks,CTR\n`;
        dailyRes.rows.forEach(r => {
            const imps = parseInt(r.impressions);
            const clks = parseInt(r.clicks);
            const ctr = imps > 0 ? ((clks / imps) * 100).toFixed(2) : "0.00";
            csv += `${r.date},${imps},${clks},${ctr}%\n`;
        });

        csv += `\nDESGLOSE POR ANUNCIO\n`;
        csv += `ID,Nombre,Impresiones,Clicks,CTR,Estado\n`;
        adsRes.rows.forEach(ad => {
            const ctr = parseInt(ad.impressions) > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00";
            csv += `${ad.id},${ad.sponsor_name},${ad.impressions},${ad.clicks},${ctr}%,${ad.active ? 'Activo' : 'Inactivo'}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment(`Reporte_${campaign.name.replace(/\s+/g, '_')}.csv`);
        res.send(csv);

    } catch (e) { next(e); }
});

export default router;
