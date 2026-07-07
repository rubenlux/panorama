import { Router } from "express";
import { query } from "./db.js";
import crypto from "crypto";
import fs from "fs";
import geoip from "geoip-lite";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Event Contract V1 (SPEC 014) — every event name pixel_events is allowed to store,
// with its real cardinality per (article, session) as observed in the live clients
// (web/src/utils/pixel.js, src/templates/pixel-client.js).
const KNOWN_EVENTS = {
    page_view: "1 per route render (site-wide, includes articles)",
    content_view: "1 per article view (deduped client-side per mount)",
    time_on_content: "N per view — one per 20s engaged-heartbeat tick",
    scroll_depth: "up to 4 per view — one per threshold (25/50/75/100)",
    exit_intent: "up to 1 per view (one-shot listener)",
    internal_link_click: "N per view — one per internal link click",
    content_loaded: "1 per view",
    like_click: "N per view",
    share_click: "N per view",
    comment_submit: "N per view",
    engagement: "N — generic engagement signal (e.g. newsletter_signup)",
    ad_impression: "N per ad slot shown",
    ad_click: "N per ad slot clicked",
};
const KNOWN_EVENT_NAMES = new Set(Object.keys(KNOWN_EVENTS));

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Resolves the canonical article_id for a pixel_events row, tolerant of the two
// live client field names (article_id vs. content_id — see SPEC 014 audit).
// Returns null (never throws) for anything that isn't a well-formed UUID.
function extractArticleId(payload) {
    const raw = (payload && (payload.article_id || payload.content_id)) || null;
    return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}

// GET /pixel/pixel.js
// Serves the standalone tracking script to advertisers
router.get("/pixel.js", (req, res) => {
    try {
        const templatePath = path.join(__dirname, "../templates/pixel-client.js");
        let script = fs.readFileSync(templatePath, "utf-8");

        // Determine API URL (Current Host)
        const protocol = req.protocol;
        const host = req.get('host');
        const apiUrl = `${protocol}://${host}`;

        // Inject Config
        script = script.replace(/{{API_URL}}/g, apiUrl);

        res.header("Content-Type", "application/javascript");
        res.header("Access-Control-Allow-Origin", "*"); // Accessible from anywhere
        res.send(script);
    } catch (err) {
        console.error("[Pixel] Failed to serve script:", err);
        res.status(500).send("// Error loading pixel script");
    }
});

// Validation Helper (Keep it simple and fast)
const validateEvent = (evt) => {
    if (!evt || typeof evt !== 'object') return false;
    if (!evt.visitor_id || typeof evt.visitor_id !== 'string') return false;
    if (!evt.event || typeof evt.event !== 'string') return false;
    if (!KNOWN_EVENT_NAMES.has(evt.event)) {
        console.warn(`[Pixel] Rejected unknown event name: "${evt.event}"`);
        return false;
    }
    return true;
};

// POST /pixel/events
// Fire-and-forget logic: Always returns 200 OK
router.post("/events", async (req, res) => {
    // 1. Immediate Response to Client
    res.json({ ok: true });

    try {
        const body = req.body;

        // Handle both single event and array of events (batching)
        const rawEvents = Array.isArray(body.events) ? body.events : (Array.isArray(body) ? body : [body]);

        // 2. Prepare Data
        // Get IP for hashing (Forwarded for proxies)
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
        const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');
        const userAgent = req.headers['user-agent'] || "";

        const validEvents = rawEvents.filter(validateEvent);

        if (validEvents.length === 0) return;

        // 3. Insert loop (or bulk insert if load is high, loop is fine for V1)
        // We use a simple loop for now to safer error handling per row if needed, 
        // but parallel promise.all is faster.
        const geo = geoip.lookup(rawIp);
        const country = geo ? geo.country : null;
        const city = geo ? geo.city : null;

        await Promise.all(validEvents.map(async (evt) => {
            const { visitor_id, session_id, event, payload, url } = evt;

            // Ensure payload is JSON object
            const safePayload = payload && typeof payload === 'object' ? payload : {};

            // Extract UTMs from payload (if sent by client) or from URL querystring if simple
            // Ideally client parses them.
            const utmSource = safePayload.utm_source || null;
            const utmMedium = safePayload.utm_medium || null;
            const utmCampaign = safePayload.utm_campaign || null;

            // Generate clean session_id if missing (though client should send it)
            const safeSessionId = session_id || 'unknown_session';
            const safeUrl = url || payload.url || null;
            const articleId = extractArticleId(safePayload); // null unless a well-formed UUID

            await query(`
                INSERT INTO pixel_events
                (visitor_id, session_id, event, payload, url, user_agent, ip_hash, geo_country, geo_city, utm_source, utm_medium, utm_campaign, article_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                visitor_id,
                safeSessionId,
                event,
                JSON.stringify(safePayload),
                safeUrl,
                userAgent,
                ipHash,
                country,
                city,
                utmSource,
                utmMedium,
                utmCampaign,
                articleId
            ]);
        }));

    } catch (err) {
        // Log locally, do not crash.
        // In producton: send to Sentry / Error Service
        console.error("[Pixel Error] Ingestion failed:", err.message);
    }
});

export default router;
