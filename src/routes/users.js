import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, logActivity } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);
// router.use(requireRole("admin")); // Removed global admin check

const userSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).optional(), // optional when editing if not changing
    role: z.enum(["reader", "editor", "admin"]),
    name: z.string().optional(),
    bio: z.string().optional(),
    avatar_url: z.string().optional(),
    social_links: z.record(z.string()).optional(), // JSON object
});

// ACTIVITY HEARTBEAT
router.post("/activity/heartbeat", async (req, res) => {
    try {
        await logActivity(req.user.sub, "heartbeat", { path: req.body.path });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PERFORMANCE STATS
router.get("/performance/stats", requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { userId, days = 7 } = req.query;
        if (!userId) return res.status(400).json({ error: "userId is required" });

        // Non-admins can only see their own performance
        if (req.user.role !== 'admin' && req.user.sub !== userId) {
            return res.status(403).json({ error: "No tienes permiso para ver el rendimiento de otros usuarios" });
        }

        // Total Articles Published
        const publishedCount = await query(
            "SELECT COUNT(*) FROM user_activity WHERE user_id=$1 AND event='article_publish' AND created_at > NOW() - (interval '1 day' * $2)",
            [userId, parseInt(days)]
        );

        // Total Articles Edited
        const editedCount = await query(
            "SELECT COUNT(*) FROM user_activity WHERE user_id=$1 AND event='article_edit' AND created_at > NOW() - (interval '1 day' * $2)",
            [userId, parseInt(days)]
        );

        // Word Count Stats
        const wordStats = await query(
            "SELECT SUM((payload->>'word_count')::int) as total_words FROM user_activity WHERE user_id=$1 AND event IN ('article_publish', 'article_edit') AND created_at > NOW() - (interval '1 day' * $2)",
            [userId, parseInt(days)]
        );

        // Heatmap Data (Hourly)
        const heatmap = await query(`
            SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as count
            FROM user_activity
            WHERE user_id=$1 AND event='heartbeat' AND created_at > NOW() - (interval '1 day' * $2)
            GROUP BY hour
            ORDER BY hour
        `, [userId, parseInt(days)]);

        // Active Hours Calculation (approximate from heartbeats)
        // Each heartbeat is ~1 min. We'll group heartbeats within 10 mins as one session.
        const heartbeatStats = await query(`
            WITH sessions AS (
                SELECT 
                    created_at,
                    LAG(created_at) OVER (ORDER BY created_at) as prev_t
                FROM user_activity 
                WHERE user_id=$1 AND event='heartbeat' AND created_at > NOW() - (interval '1 day' * $2)
            )
            SELECT COUNT(*) * 1 as total_active_minutes FROM sessions
        `, [userId, parseInt(days)]);

        // Detailed log
        const log = await query(
            "SELECT event, payload, created_at FROM user_activity WHERE user_id=$1 AND created_at > NOW() - (interval '1 day' * $2) AND event != 'heartbeat' ORDER BY created_at DESC LIMIT 100",
            [userId, parseInt(days)]
        );

        res.json({
            published: parseInt(publishedCount.rows[0].count),
            edited: parseInt(editedCount.rows[0].count),
            totalWords: parseInt(wordStats.rows[0].total_words || 0),
            activeMinutes: parseInt(heartbeatStats.rows[0].total_active_minutes || 0),
            heatmap: heatmap.rows,
            recentActivity: log.rows
        });
    } catch (e) {
        next(e);
    }
});

// PERFORMANCE EXPORT (ADMIN ONLY)
router.get("/performance/export", requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { userId, days = 30 } = req.query;
        if (!userId) return res.status(400).json({ error: "userId is required" });

        // Non-admins can only export their own data
        if (req.user.role !== 'admin' && req.user.sub !== userId) {
            return res.status(403).json({ error: "No tienes permiso para exportar datos de otros usuarios" });
        }

        const result = await query(
            "SELECT event, payload, created_at FROM user_activity WHERE user_id=$1 AND created_at > NOW() - (interval '1 day' * $2) ORDER BY created_at ASC",
            [userId, parseInt(days)]
        );

        // Simple CSV construction
        let csv = "Fecha,Evento,Detalles\n";
        result.rows.forEach(r => {
            const date = new Date(r.created_at).toISOString();
            const payload = JSON.stringify(r.payload).replace(/"/g, '""');
            csv += `${date},${r.event},"${payload}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=activity_${userId}.csv`);
        res.send(csv);
    } catch (e) {
        next(e);
    }
});

// LIST USERS (Filterable by editors for metadata purposes)
router.get("/", requireRole("admin", "editor"), async (req, res, next) => {
    try {
        const { role } = req.query;
        let queryText = "SELECT id, email, role, name, avatar_url, created_at, bio, social_links FROM users";
        const params = [];

        if (role) {
            queryText += " WHERE role = $1";
            params.push(role);
        }

        queryText += " ORDER BY created_at DESC";

        const result = await query(queryText, params);
        return res.json({ items: result.rows });
    } catch (err) {
        next(err);
    }
});

// CREATE USER
router.post("/", requireRole("admin"), async (req, res, next) => {
    try {
        const { email, password, role, name, bio, avatar_url, social_links } = userSchema.parse(req.body);

        if (!password) {
            return res.status(400).json({ error: "Password is required for new users" });
        }

        const password_hash = await bcrypt.hash(password, 12);

        const result = await query(
            `INSERT INTO users(email, password_hash, role, name, bio, avatar_url, social_links)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role, name, created_at`,
            [email, password_hash, role, name, bio, avatar_url, social_links]
        );

        return res.status(201).json({ user: result.rows[0] });
    } catch (err) {
        if (err?.code === "23505")
            return res.status(409).json({ error: "Email already exists" });
        next(err);
    }
});

// GET USER
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.role === "admin";
        const isSelf = req.user.sub === id;

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ error: "Access denied" });
        }

        const result = await query(
            "SELECT id, email, role, name, bio, avatar_url, social_links, created_at FROM users WHERE id = $1",
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
        return res.json({ user: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// UPDATE USER
router.patch("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.role === "admin";
        const isSelf = req.user.sub === id;

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ error: "Access denied" });
        }

        const { email, role, password, name, bio, avatar_url, social_links } = userSchema.partial().parse(req.body);

        // Restrictions for non-admins
        if (!isAdmin) {
            if (role && role !== req.user.role) return res.status(403).json({ error: "Cannot change role" });
            if (email) return res.status(403).json({ error: "Cannot change email" });
        }

        let updateQuery = "UPDATE users SET updated_at = now()";
        const values = [];
        let idx = 1;

        if (email && isAdmin) {
            updateQuery += `, email = $${idx++}`;
            values.push(email);
        }
        if (role && isAdmin) {
            updateQuery += `, role = $${idx++}`;
            values.push(role);
        }
        if (password) {
            const hash = await bcrypt.hash(password, 12);
            updateQuery += `, password_hash = $${idx++}`;
            values.push(hash);
        }
        if (name !== undefined) {
            updateQuery += `, name = $${idx++}`;
            values.push(name);
        }
        if (bio !== undefined) {
            updateQuery += `, bio = $${idx++}`;
            values.push(bio);
        }
        if (avatar_url !== undefined) {
            updateQuery += `, avatar_url = $${idx++}`;
            values.push(avatar_url);
        }
        if (social_links !== undefined) {
            updateQuery += `, social_links = $${idx++}`;
            values.push(social_links);
        }

        if (values.length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        updateQuery += ` WHERE id = $${idx} RETURNING id, email, role, created_at`;
        values.push(id);

        const result = await query(updateQuery, values);
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

        // LOG ACTIVITY
        await logActivity(req.user.sub, "profile_update", { target_id: id });

        return res.json({ user: result.rows[0] });
    } catch (err) {
        if (err?.code === "23505")
            return res.status(409).json({ error: "Email already exists" });
        next(err);
    }
});

// DELETE USER
router.delete("/:id", requireRole("admin"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
        return res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
