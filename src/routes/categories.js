import { Router } from "express";
import { z } from "zod";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { slugify } from "./_util.js";

const router = Router();

const categorySchema = z.object({
  name: z.string().min(2).max(60),
  show_in_menu: z.boolean().optional().default(true),
  color: z.string().optional().default('#3b82f6'),
  is_tag: z.boolean().optional().default(false)
});

router.get("/", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.id, c.name, c.slug, c.show_in_menu, c.color, c.is_tag, COUNT(ac.article_id) as article_count 
       FROM categories c 
       LEFT JOIN article_categories ac ON c.id = ac.category_id 
       GROUP BY c.id, c.name, c.slug, c.show_in_menu, c.color, c.is_tag
       ORDER BY c.name ASC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/",
  requireAuth,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { name, show_in_menu, color, is_tag } = categorySchema.parse(req.body);
      const slug = slugify(name);

      const r = await query(
        `INSERT INTO categories(name, slug, show_in_menu, color, is_tag) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, slug, show_in_menu, color, is_tag]
      );
      res.status(201).json({ category: r.rows[0] });
    } catch (e) {
      if (e?.code === "23505")
        return res.status(409).json({ error: "Category already exists" });
      next(e);
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, show_in_menu, color, is_tag } = categorySchema.parse(req.body);
      const slug = slugify(name);

      const r = await query(
        `UPDATE categories SET name = $1, slug = $2, show_in_menu = $3, color = $4, is_tag = $5, updated_at = NOW() WHERE id = $6 RETURNING *`,
        [name, slug, show_in_menu, color, is_tag, id]
      );

      if (r.rowCount === 0) return res.status(404).json({ error: "Category not found" });
      res.json({ category: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const r = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [id]);
      if (r.rowCount === 0) return res.status(404).json({ error: "Category not found" });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
