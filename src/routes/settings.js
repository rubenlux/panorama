import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// PUBLIC: Get all settings (frontend needs to know logos, title, etc)
// We might want to filter sensitive settings if we add API keys later
router.get("/", async (req, res, next) => {
    try {
        const r = await query(`SELECT key, value, type, group_name FROM settings`);
        // Convert to object { key: value }
        const settings = {};
        r.rows.forEach(row => {
            // Parse booleans
            if (row.type === 'boolean') {
                settings[row.key] = row.value === 'true';
            } else {
                settings[row.key] = row.value;
            }
        });
        res.json({ settings });
    } catch (e) {
        next(e);
    }
});

// ADMIN: Update settings (Bulk update)
router.post("/batch", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const { settings } = req.body; // Expect object { key: value }

        // Begin transaction ideally, but simple loop works for now
        for (const [key, value] of Object.entries(settings)) {
            await query(
                `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`,
                [String(value), key]
            );
        }

        // Return fresh list
        const r = await query(`SELECT key, value, type, group_name FROM settings`);
        const fresh = {};
        r.rows.forEach(row => fresh[row.key] = row.value);

        res.json({ success: true, settings: fresh });
    } catch (e) {
        next(e);
    }
});

export default router;
