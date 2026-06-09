import { Router } from "express";
import { z } from "zod";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import crypto from "crypto";

const router = Router();

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

const createSchema = z.object({
  authorName: z.string().min(2).max(80).optional(),
  authorEmail: z.string().email().max(120).optional(),
  body: z.string().min(3).max(2000),
  parentId: z.string().uuid().optional().nullable(),
});

async function getArticleIdBySlug(slug) {
  const r = await query(`SELECT id FROM articles WHERE slug=$1`, [slug]);
  return r.rows[0]?.id || null;
}

// PUBLIC: approved comments
router.get("/articles/:slug/comments", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const articleId = await getArticleIdBySlug(slug);
    if (!articleId) return res.status(404).json({ error: "Not found" });

    const r = await query(
      `SELECT id, parent_id, user_id, author_name, body, created_at
       FROM comments
       WHERE article_id=$1 AND status='approved'
       ORDER BY created_at ASC`,
      [articleId]
    );

    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// PUBLIC: create comment (pending)
router.post("/articles/:slug/comments", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const articleId = await getArticleIdBySlug(slug);
    if (!articleId) return res.status(404).json({ error: "Not found" });

    const data = createSchema.parse(req.body);

    // Si hay auth, podrías tomar user_id automáticamente
    // (depende si tu middleware auth es global/opcional)
    const userId = req.user?.sub || null;

    // Si es anónimo, authorName debería venir
    if (!userId && !data.authorName) {
      return res
        .status(400)
        .json({ error: "authorName is required for anonymous comments" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.socket.remoteAddress;
    const ipHash = hashIp(ip);
    const ua = req.headers["user-agent"]?.toString() || null;

    const r = await query(
      `INSERT INTO comments(article_id, parent_id, user_id, author_name, author_email, body, status, ip_hash, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)
       RETURNING id, status, created_at`,
      [
        articleId,
        data.parentId ?? null,
        userId,
        data.authorName ?? null,
        data.authorEmail ?? null,
        data.body,
        ipHash,
        ua,
      ]
    );

    res.status(201).json({ comment: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

// ADMIN: moderate
router.get(
  "/admin/comments",
  requireAuth,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
      const status = (req.query.status || "pending").toString();

      const r = await query(
        `SELECT c.id, c.status, c.created_at, c.author_name, c.body,
              a.slug AS article_slug, a.title AS article_title
       FROM comments c
       JOIN articles a ON a.id = c.article_id
       WHERE c.status=$1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      res.json({ items: r.rows, limit, offset });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  "/admin/comments/:id",
  requireAuth,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        status: z.enum(["pending", "approved", "rejected", "spam"]),
      });
      const data = schema.parse(req.body);

      const r = await query(
        `UPDATE comments SET status=$1 WHERE id=$2
       RETURNING id, status`,
        [data.status, req.params.id]
      );

      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ comment: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  "/admin/comments/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const r = await query(`DELETE FROM comments WHERE id=$1 RETURNING id`, [
        req.params.id,
      ]);
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
