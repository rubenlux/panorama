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

        fs.appendFileSync("pixel_debug.log", `[${new Date().toISOString()}] Incoming Request: ${rawEvents.length} events\n`);

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

            await query(`
                INSERT INTO pixel_events 
                (visitor_id, session_id, event, payload, url, user_agent, ip_hash, geo_country, geo_city, utm_source, utm_medium, utm_campaign)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                utmCampaign
            ]);
        }));

    } catch (err) {
        // Log locally, do not crash.
        // In producton: send to Sentry / Error Service
        console.error("[Pixel Error] Ingestion failed:", err.message);
    }
});

export default router;
