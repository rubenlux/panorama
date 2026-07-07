import { Router } from "express";
import { z } from "zod";
import { query, logActivity } from "./db.js";
import { requireAuth, requireAuthOrMcp } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { slugify } from "./_util.js";
import fs from "fs";
import path from "path";

const router = Router();

function getWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

// Helper to log errors
function logError(context, err) {
  const msg = `[${new Date().toISOString()}] ${context}: ${err.message}\n${err.stack}\n\n`;
  console.error(msg);
  // Enable file logging
  try {
    fs.appendFileSync(path.resolve("last_error.txt"), msg);
  } catch (e) {
    console.error("Failed to write to Error Log:", e);
  }
}

const ALLOWED_STATUS = new Set(["draft", "published"]);

// ============================================================================
// ADMIN/MCP: Dashboard stats (must be BEFORE public :slug route)
// GET /articles/dashboard
// ============================================================================
router.get(
  "/dashboard",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const [total, drafts, published, scheduled] = await Promise.all([
        query(`SELECT COUNT(*)::int as count FROM articles`),
        query(`SELECT COUNT(*)::int as count FROM articles WHERE status='draft'`),
        query(`SELECT COUNT(*)::int as count FROM articles WHERE status='published'`),
        query(`SELECT COUNT(*)::int as count FROM articles WHERE scheduled_at > now()`)
      ]);

      const response = {
        generated_at: new Date().toISOString(),
        metrics: {
          total_posts: total.rows[0]?.count ?? 0,
          drafts_count: drafts.rows[0]?.count ?? 0,
          published_count: published.rows[0]?.count ?? 0,
          scheduled_count: scheduled.rows[0]?.count ?? 0
        }
      };

      res.json(response);
    } catch (e) {
      next(e);
    }
  }
);

/**
 * PUBLIC: List published only
 * GET /articles?limit=&offset=&q=&category=
 */
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
    const q = req.query.q?.trim();
    const category = req.query.category?.trim();
    const catId = req.query.category_id;

    const params = [];
    let where = `WHERE a.status = $${params.push("published")}`;

    if (category) {
      where += ` AND EXISTS (
        SELECT 1 FROM article_categories ac
        JOIN categories c ON c.id = ac.category_id
        WHERE ac.article_id = a.id AND c.slug = $${params.push(category)}
      )`;
    }

    if (catId) {
      where += ` AND EXISTS (
        SELECT 1 FROM article_categories ac
        WHERE ac.article_id = a.id AND ac.category_id = $${params.push(catId)}
      )`;
    }

    if (q) {
      // Requires articles.search_tsv to exist
      where += ` AND a.search_tsv @@ plainto_tsquery('simple', $${params.push(
        q
      )})`;
    }

    const sql = `
      SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.published_at, a.created_at,
             a.image_url,
             u.email AS author_email,
             (SELECT name FROM categories c JOIN article_categories ac ON ac.category_id = c.id WHERE ac.article_id = a.id LIMIT 1) AS category_name,
             (SELECT color FROM categories c JOIN article_categories ac ON ac.category_id = c.id WHERE ac.article_id = a.id LIMIT 1) AS category_color,
             (SELECT COUNT(*)::int FROM comments cm WHERE cm.article_id = a.id) AS comments_count
      FROM articles a
      JOIN users u ON u.id = a.author_id
      ${where}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC
      LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}
    `;

    const r = await query(sql, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    next(e);
  }
});

/**
 * STAFF: List drafts/published
 * GET /articles/admin/list?status=draft|published&limit=&offset=&q=&category=
 */
router.get(
  "/admin/list",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
      const status = (req.query.status || "draft").toString();
      const q = req.query.q?.trim();
      const category = req.query.category?.trim();

      if (status !== "all" && !ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const params = [];
      let where = "WHERE 1=1";

      if (status !== "all") {
        where += ` AND a.status = $${params.push(status)}`;
      }

      if (category) {
        where += ` AND EXISTS (
        SELECT 1 FROM article_categories ac
        JOIN categories c ON c.id = ac.category_id
        WHERE ac.article_id = a.id AND c.slug = $${params.push(category)}
      )`;
      }

      if (q) {
        where += ` AND a.search_tsv @@ plainto_tsquery('simple', $${params.push(
          q
        )})`;
      }

      // Date Filters (published_at)
      if (req.query.date_from) {
        where += ` AND a.published_at >= $${params.push(req.query.date_from)}`;
      }
      if (req.query.date_to) {
        where += ` AND a.published_at <= $${params.push(req.query.date_to)}`;
      }

      // Author Filter
      if (req.query.author_id) {
        where += ` AND a.author_id = $${params.push(req.query.author_id)}`;
      }

      const sql = `
      SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.published_at, a.created_at, a.image_url AS image,
             u.email AS author_email,
             (
                SELECT COALESCE(json_agg(json_build_object('name', c.name, 'slug', c.slug)), '[]'::json)
                FROM article_categories ac
                JOIN categories c ON c.id = ac.category_id
                WHERE ac.article_id = a.id
             ) AS categories
      FROM articles a
      JOIN users u ON u.id = a.author_id
      ${where}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC
      LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}
    `;

      const r = await query(sql, params);

      // DEBUG: Log first item to check categories/image format
      if (r.rows.length > 0) {
        console.log("DEBUG /admin/list first item:", JSON.stringify(r.rows[0], null, 2));
      }

      res.json({ items: r.rows, limit, offset });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * STAFF: Get article (draft/published)
 * GET /articles/admin/:slug
 */
router.get(
  "/admin/:slug",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;

      const r = await query(
        `SELECT a.*, u.email AS author_email,
                s.meta_title, s.meta_description, s.canonical_url, s.og_title, s.og_description, s.og_image, s.schema_json, s.keywords
       FROM articles a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN article_seo s ON s.article_id = a.id
       WHERE a.slug = $1`,
        [slug]
      );

      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ article: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * PUBLIC: Get published article only
 * GET /articles/:slug
 */
router.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const r = await query(
      `SELECT a.*, u.email AS author_email, u.name AS author_name, u.avatar_url AS author_avatar,
              s.meta_title, s.meta_description, s.canonical_url, s.keywords, s.schema_json, s.og_image
       FROM articles a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN article_seo s ON s.article_id = a.id
       WHERE a.slug = $1 AND a.status = 'published'`,
      [slug]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json({ article: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  title: z.string().min(5).max(200),
  epigraph: z.string().optional(),
  volanta: z.string().max(255).optional(),
  origin: z.enum(['manual', 'research', 'dossier']).default('manual'),
  dossier_id: z.string().uuid().optional().nullable(),
  image_url: z.string().optional(),
  excerpt: z.string().max(500).optional(),
  body: z.string().min(20),
  status: z.enum(["draft", "published"]).default("draft"),
  categorySlugs: z.array(z.string().min(1)).default([]),
  created_by: z.string().uuid().optional(), // Real user who initiated (for AI workflows)
  created_via: z.enum(['claude_desktop', 'cms_ui', 'cli', 'api']).default('cms_ui'),
  workflow: z.enum(['editorial_ai', 'manual', 'optimized', 'translated', 'curated']).default('manual'),
  seo: z.object({
    meta_title: z.string().optional(),
    meta_description: z.string().optional(),
    canonical_url: z.string().optional(),
    og_title: z.string().optional(),
    og_description: z.string().optional(),
    og_image: z.string().optional(),
    schema_json: z.string().optional(),
    keywords: z.string().optional(), // New
  }).optional(),
});

/**
 * STAFF: Create article
 * POST /articles
 */
router.post(
  "/",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const data = createSchema.parse(req.body);

      const slugBase = slugify(data.title);
      let slug = slugBase;

      // Ensure uniqueness
      for (let i = 0; i < 10; i++) {
        const exists = await query(`SELECT 1 FROM articles WHERE slug=$1`, [
          slug,
        ]);
        if (exists.rowCount === 0) break;
        slug = `${slugBase}-${i + 2}`;
      }

      const published_at = data.status === "published" ? new Date() : null;

      // If created_by is specified (e.g., from Claude), use it; otherwise use current user
      const createdBy = data.created_by || req.user.sub;

      const r = await query(
        `INSERT INTO articles(author_id, title, slug, volanta, image_url, excerpt, body, status, published_at, epigraph, word_count, origin, dossier_id, created_by, created_via, workflow)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, title, slug, status, published_at, word_count, origin, dossier_id, created_by, created_via, workflow`,
        [
          req.user.sub,
          data.title,
          slug,
          data.volanta ?? null,
          data.image_url ?? null,
          data.excerpt ?? null,
          data.body,
          data.status,
          published_at,
          data.epigraph ?? null,
          getWordCount(data.body),
          data.origin ?? 'manual',
          data.dossier_id ?? null,
          createdBy,
          data.created_via ?? 'cms_ui',
          data.workflow ?? 'manual',
        ]
      );

      const article = r.rows[0];

      // Link categories (best-effort)
      for (const catSlug of data.categorySlugs) {
        const c = await query(`SELECT id FROM categories WHERE slug=$1`, [
          catSlug,
        ]);
        if (c.rows[0]) {
          await query(
            `INSERT INTO article_categories(article_id, category_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [article.id, c.rows[0].id]
          );
        }
      }

      // Insert SEO if present
      if (data.seo) {
        await query(
          `INSERT INTO article_seo (article_id, meta_title, meta_description, canonical_url, og_title, og_description, og_image, schema_json, keywords)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            article.id,
            data.seo.meta_title ?? null,
            data.seo.meta_description ?? null,
            data.seo.canonical_url ?? null,
            data.seo.og_title ?? null,
            data.seo.og_description ?? null,
            data.seo.og_image ?? null,
            data.seo.schema_json ?? null,
            data.seo.keywords ?? null
          ]
        );
      }

      // LOG ACTIVITY
      await logActivity(req.user.sub, article.status === 'published' ? 'article_publish' : 'article_create', {
        id: article.id,
        slug: article.slug,
        title: article.title,
        word_count: article.word_count
      });

      res.status(201).json({ article });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors.map(x => `${x.path.join('.')}: ${x.message}`).join(', ') });
      }
      console.error("ERROR IN POST ARTICLE:", e);
      next(e);
    }
  }
);

const putSchema = z.object({
  title: z.string().min(5).max(200),
  excerpt: z.string().max(500).optional().nullable(),
  body: z.string().min(20),
  status: z.enum(["draft", "published"]),
  categorySlugs: z.array(z.string().min(1)).default([]),
});

/**
 * STAFF: Replace article (PUT = reemplazo completo)
 * PUT /articles/:slug
 *
 * Nota: mantiene el slug para no romper URLs. Si quieres que cambie con el título, se puede implementar.
 */
router.put(
  "/:slug",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const data = putSchema.parse(req.body);

      const current = await query(
        `SELECT id, status, author_id FROM articles WHERE slug=$1`,
        [slug]
      );
      if (!current.rows[0]) return res.status(404).json({ error: "Not found" });

      // Ownership Check: Editors can only edit their own articles
      if (req.user.role === 'editor' && current.rows[0].author_id !== req.user.sub) {
        return res.status(403).json({ error: "No tienes permiso para editar este artículo (no eres el autor)" });
      }

      // published_at logic
      let published_at = null;
      if (data.status === "published") {
        // If it was already published, keep existing published_at; else set now
        const prev = await query(
          `SELECT published_at FROM articles WHERE slug=$1`,
          [slug]
        );
        published_at = prev.rows[0]?.published_at ?? new Date();
      } else {
        // Draft: leave published_at as-is or null. Aquí lo dejamos NULL para que no sea público.
        published_at = null;
      }

      const r = await query(
        `UPDATE articles
       SET title=$1, excerpt=$2, body=$3, status=$4, published_at=$5, updated_at=$6, word_count=$8
       WHERE slug=$7
       RETURNING id, title, slug, status, published_at, updated_at, word_count`,
        [
          data.title,
          data.excerpt ?? null,
          data.body,
          data.status,
          published_at,
          new Date(),
          slug,
          getWordCount(data.body)
        ]
      );

      const article = r.rows[0];

      // Replace categories (best-effort)
      await query(`DELETE FROM article_categories WHERE article_id=$1`, [
        article.id,
      ]);

      for (const catSlug of data.categorySlugs) {
        const c = await query(`SELECT id FROM categories WHERE slug=$1`, [
          catSlug,
        ]);
        if (c.rows[0]) {
          await query(
            `INSERT INTO article_categories(article_id, category_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [article.id, c.rows[0].id]
          );
        }
      }

      // LOG ACTIVITY
      const event = (current.rows[0].status !== 'published' && data.status === 'published')
        ? 'article_publish'
        : 'article_edit';

      await logActivity(req.user.sub, event, {
        id: article.id,
        slug: article.slug,
        title: article.title,
        word_count: article.word_count
      });

      res.json({ article });
    } catch (e) {
      next(e);
    }
  }
);

const patchSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  epigraph: z.string().optional(),
  volanta: z.string().max(255).optional(),
  origin: z.enum(['manual', 'research', 'dossier']).optional(),
  dossier_id: z.string().uuid().optional().nullable(),
  image_url: z.string().optional(),
  excerpt: z.string().max(500).optional().nullable(),
  body: z.string().min(20).optional(),
  status: z.enum(["draft", "published"]).optional(),
  categorySlugs: z.array(z.string().min(1)).optional(),
  seo: z.object({
    meta_title: z.string().optional(),
    meta_description: z.string().optional(),
    canonical_url: z.string().optional(),
    og_title: z.string().optional(),
    og_description: z.string().optional(),
    og_image: z.string().optional(),
    schema_json: z.string().optional(),
  }).optional(),
});

/**
 * STAFF: Partial update
 * PATCH /articles/:slug
 */
router.patch(
  "/:slug",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const data = patchSchema.parse(req.body);

      const current = await query(
        `SELECT id, status, published_at, author_id FROM articles WHERE slug=$1`,
        [slug]
      );
      if (!current.rows[0]) return res.status(404).json({ error: "Not found" });

      // Ownership Check: Editors can only edit their own articles
      if (req.user.role === 'editor' && current.rows[0].author_id !== req.user.sub) {
        return res.status(403).json({ error: "No tienes permiso para editar este artículo (no eres el autor)" });
      }

      const fields = [];
      const params = [];
      const set = (name, value) =>
        fields.push(`${name}=$${params.push(value)}`);

      if (data.title) set("title", data.title);
      if (data.origin)    set("origin",    data.origin);
      if (data.dossier_id !== undefined) set("dossier_id", data.dossier_id);
      if (data.epigraph !== undefined) set("epigraph", data.epigraph);
      if (data.volanta !== undefined) set("volanta", data.volanta);
      if (data.image_url !== undefined) set("image_url", data.image_url);
      if (data.excerpt !== undefined) set("excerpt", data.excerpt);
      if (data.body) {
        set("body", data.body);
        set("word_count", getWordCount(data.body));
      }

      if (data.status) {
        set("status", data.status);

        if (
          current.rows[0].status !== "published" &&
          data.status === "published"
        ) {
          set("published_at", new Date());
        }
        if (data.status === "draft") {
          set("published_at", null);
        }
      }

      set("updated_at", new Date());

      if (fields.length === 0 && data.categorySlugs === undefined) {
        return res.status(400).json({ error: "No fields to update" });
      }

      let updatedArticle = null;

      // Update article fields if needed
      if (fields.length > 0) {
        const sql = `
        UPDATE articles SET ${fields.join(", ")}
        WHERE slug=$${params.push(slug)}
        RETURNING id, title, slug, status, published_at, updated_at, word_count
      `;
        const r = await query(sql, params);
        updatedArticle = r.rows[0];
      } else {
        updatedArticle = {
          id: current.rows[0].id,
          slug,
        };
      }



      // Upsert SEO if provided
      if (data.seo) {
        // Check if exists
        const seoCheck = await query(`SELECT 1 FROM article_seo WHERE article_id=$1`, [current.rows[0].id]);
        if (seoCheck.rowCount === 0) {
          await query(
            `INSERT INTO article_seo (article_id, meta_title, meta_description, canonical_url, og_title, og_description, og_image, schema_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              current.rows[0].id,
              data.seo.meta_title ?? null,
              data.seo.meta_description ?? null,
              data.seo.canonical_url ?? null,
              data.seo.og_title ?? null,
              data.seo.og_description ?? null,
              data.seo.og_image ?? null,
              data.seo.schema_json ?? null
            ]
          );
        } else {
          const seoFields = [];
          const seoParams = [current.rows[0].id];
          const setSeo = (col, val) => seoFields.push(`${col}=$${seoParams.push(val)}`);

          if (data.seo.meta_title !== undefined) setSeo("meta_title", data.seo.meta_title);
          if (data.seo.meta_description !== undefined) setSeo("meta_description", data.seo.meta_description);
          if (data.seo.canonical_url !== undefined) setSeo("canonical_url", data.seo.canonical_url);
          if (data.seo.og_title !== undefined) setSeo("og_title", data.seo.og_title);
          if (data.seo.og_description !== undefined) setSeo("og_description", data.seo.og_description);
          if (data.seo.og_image !== undefined) setSeo("og_image", data.seo.og_image);
          if (data.seo.schema_json !== undefined) setSeo("schema_json", data.seo.schema_json);
          if (data.seo.keywords !== undefined) setSeo("keywords", data.seo.keywords);

          if (seoFields.length > 0) {
            await query(`UPDATE article_seo SET ${seoFields.join(", ")} WHERE article_id=$1`, seoParams);
          }
        }
      }

      // Update Categories if provided
      if (data.categorySlugs !== undefined) {
        // Replace categories logic (similar to PUT)
        await query(`DELETE FROM article_categories WHERE article_id=$1`, [
          current.rows[0].id,
        ]);

        for (const catSlug of data.categorySlugs) {
          const c = await query(`SELECT id FROM categories WHERE slug=$1`, [
            catSlug,
          ]);
          if (c.rows[0]) {
            await query(
              `INSERT INTO article_categories(article_id, category_id)
               VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [current.rows[0].id, c.rows[0].id]
            );
          }
        }
      }

      // Return updated row (full)
      const final = await query(
        `SELECT id, title, slug, status, published_at, updated_at, word_count
       FROM articles WHERE slug=$1`,
        [slug]
      );

      // LOG ACTIVITY
      const event = (current.rows[0].status !== 'published' && data.status === 'published')
        ? 'article_publish'
        : 'article_edit';

      await logActivity(req.user.sub, event, {
        id: final.rows[0].id,
        slug: final.rows[0].slug,
        title: final.rows[0].title,
        word_count: final.rows[0].word_count
      });

      res.json({ article: final.rows[0] });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors.map(x => `${x.path.join('.')}: ${x.message}`).join(', ') });
      }
      logError("PATCH ARTICLE ERROR", e);
      next(e);
    }
  }
);

/**
 * ADMIN: Delete article
 * DELETE /articles/:slug
 */
router.delete(
  "/:slug",
  requireAuthOrMcp,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const r = await query(`DELETE FROM articles WHERE slug=$1 RETURNING id`, [
        slug,
      ]);
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// ============================================================================
// MCP-SPECIFIC ENDPOINTS (ID-based, action-specific)
// ============================================================================

/**
 * STAFF: Get article by ID (UUID or slug)
 * GET /articles/:id
 */
router.get(
  "/:id",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Try as UUID first, then as slug
      let sql = `SELECT a.id, a.title, a.slug, a.excerpt, a.body, a.status, a.published_at,
                        a.scheduled_at, a.created_at, a.updated_at, a.image_url, a.word_count,
                        u.email as author_email, u.name as author_name,
                        s.meta_title, s.meta_description, s.canonical_url, s.og_title, s.og_description, s.keywords,
                        json_agg(json_build_object('slug', c.slug, 'name', c.name)) as categories
                 FROM articles a
                 JOIN users u ON u.id = a.author_id
                 LEFT JOIN article_seo s ON s.article_id = a.id
                 LEFT JOIN article_categories ac ON ac.article_id = a.id
                 LEFT JOIN categories c ON c.id = ac.category_id
                 WHERE a.id = $1 OR a.slug = $1
                 GROUP BY a.id, u.id, s.id
                 LIMIT 1`;

      const r = await query(sql, [id]);
      if (!r.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const a = r.rows[0];
      const resp = {
        schema_version: "1.0",
        metadata: {
          id: a.id,
          slug: a.slug,
          author: { email: a.author_email, name: a.author_name },
          created_at: a.created_at,
          updated_at: a.updated_at,
          status: a.status
        },
        content: {
          title: a.title,
          excerpt: a.excerpt,
          body: a.body,
          word_count: a.word_count
        },
        seo: {
          meta_title: a.meta_title,
          meta_description: a.meta_description,
          canonical_url: a.canonical_url,
          og_title: a.og_title,
          og_description: a.og_description,
          keywords: a.keywords ? a.keywords.split(',').map(k => k.trim()) : []
        },
        featured_image: {
          url: a.image_url,
          caption: null
        },
        categories: a.categories || [],
        publication: {
          status: a.status,
          published_at: a.published_at,
          scheduled_at: a.scheduled_at
        },
        provenance: {
          generated_at: new Date().toISOString(),
          pipeline_version: "posts.open/1.0"
        }
      };

      res.json(resp);
    } catch (e) {
      next(e);
    }
  }
);

/**
 * STAFF: Pre-flight validation before publishing
 * GET /articles/:id/publish-check
 * Returns validation status and errors that would block publishing
 */
router.get(
  "/:id/publish-check",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const r = await query(
        `SELECT a.id, a.title, a.body, a.excerpt, a.image_url, a.word_count,
                s.meta_title, s.meta_description, s.keywords,
                (SELECT COUNT(*) FROM article_categories WHERE article_id = a.id) as category_count
         FROM articles a
         LEFT JOIN article_seo s ON s.article_id = a.id
         WHERE a.id = $1 OR a.slug = $1
         LIMIT 1`,
        [id]
      );

      if (!r.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const article = r.rows[0];
      const errors = [];
      const warnings = [];

      // ERRORS (block publishing)
      if (!article.image_url) errors.push("featured_image missing");
      if (article.category_count === 0) errors.push("category not assigned");
      if (!article.excerpt || article.excerpt.length < 50) {
        errors.push(`excerpt too short or missing (current: ${article.excerpt?.length || 0} chars, min: 50)`);
      }
      if (article.word_count < 300) {
        errors.push(`article too short (current: ${article.word_count} words, min: 300)`);
      }
      if (!article.title || article.title.length < 10 || article.title.length > 200) {
        errors.push(`title invalid (current: ${article.title?.length || 0} chars, range: 10-200)`);
      }

      // WARNINGS (allow publishing but notify)
      if (!article.meta_title || article.meta_title.length < 30) {
        warnings.push("meta_title missing or too short (recommend: 30-60 chars)");
      }
      if (!article.meta_description || article.meta_description.length < 120) {
        warnings.push(`meta_description too short (current: ${article.meta_description?.length || 0} chars, recommend: 120-160)`);
      }
      if (article.word_count < 500) {
        warnings.push(`article is short (current: ${article.word_count} words, recommend: 500+)`);
      }
      if (!article.keywords || article.keywords.split(',').length < 3) {
        const keywordCount = article.keywords ? article.keywords.split(',').length : 0;
        warnings.push(`keywords missing or incomplete (current: ${keywordCount}, recommend: 3-5)`);
      }

      res.json({
        can_publish: errors.length === 0,
        errors,
        warnings,
        article: {
          id: article.id,
          title: article.title,
          word_count: article.word_count,
          has_image: !!article.image_url,
          has_category: article.category_count > 0,
          has_excerpt: !!article.excerpt,
          excerpt_length: article.excerpt?.length || 0
        }
      });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * STAFF: Publish article immediately
 * POST /articles/:id/publish
 */
router.post(
  "/:id/publish",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params; // Can be either UUID or slug
      const { force_publish } = req.body; // Optional: bypass validation for admins

      const current = await query(
        `SELECT id, status, author_id FROM articles
         WHERE id::text = $1 OR slug = $1`,
        [id]
      );
      if (!current.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const articleId = current.rows[0].id; // Get the real UUID

      // Ownership check
      if (req.user.role === 'editor' && current.rows[0].author_id !== req.user.sub) {
        return res.status(403).json({ error: "No permission" });
      }

      // Minimal validation: title and slug must exist
      const checkRes = await query(
        `SELECT a.id, a.title, a.slug FROM articles a WHERE a.id = $1`,
        [articleId]
      );

      const article = checkRes.rows[0];
      if (!article.title || !article.slug) {
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: "Article must have title and slug",
          details: {
            title: !!article.title,
            slug: !!article.slug
          }
        });
      }

      const r = await query(
        `UPDATE articles SET status='published', published_at=COALESCE(published_at, now()), updated_at=now()
         WHERE id=$1
         RETURNING id, status, published_at`,
        [articleId]
      );

      await logActivity(req.user.sub, 'article_publish', {
        id: r.rows[0].id,
        published_at: r.rows[0].published_at
      });

      res.json({ id: r.rows[0].id, status: r.rows[0].status, published_at: r.rows[0].published_at });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * STAFF: Schedule article for future publication
 * POST /articles/:id/schedule
 */
router.post(
  "/:id/schedule",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params; // Can be either UUID or slug
      const { scheduled_at } = req.body;

      if (!scheduled_at) return res.status(400).json({ error: "scheduled_at required" });

      const current = await query(
        `SELECT id, status, author_id FROM articles
         WHERE id::text = $1 OR slug = $1`,
        [id]
      );
      if (!current.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const articleId = current.rows[0].id; // Get the real UUID

      // Ownership check
      if (req.user.role === 'editor' && current.rows[0].author_id !== req.user.sub) {
        return res.status(403).json({ error: "No permission" });
      }

      const r = await query(
        `UPDATE articles SET status='scheduled', scheduled_at=$1, updated_at=now()
         WHERE id=$2
         RETURNING id, status, scheduled_at`,
        [new Date(scheduled_at), articleId]
      );

      await logActivity(req.user.sub, 'article_schedule', {
        id: r.rows[0].id,
        scheduled_at: r.rows[0].scheduled_at
      });

      res.json({ id: r.rows[0].id, status: r.rows[0].status, scheduled_at: r.rows[0].scheduled_at });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * STAFF: Unpublish article (revert to draft)
 * POST /articles/:id/unpublish
 */
router.post(
  "/:id/unpublish",
  requireAuthOrMcp,
  requireRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { id } = req.params; // Can be either UUID or slug

      const current = await query(
        `SELECT id, status, author_id FROM articles
         WHERE id::text = $1 OR slug = $1`,
        [id]
      );
      if (!current.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

      const articleId = current.rows[0].id; // Get the real UUID

      // Ownership check
      if (req.user.role === 'editor' && current.rows[0].author_id !== req.user.sub) {
        return res.status(403).json({ error: "No permission" });
      }

      const r = await query(
        `UPDATE articles SET status='draft', published_at=null, updated_at=now()
         WHERE id=$1
         RETURNING id, status`,
        [articleId]
      );

      await logActivity(req.user.sub, 'article_unpublish', {
        id: r.rows[0].id
      });

      res.json({ id: r.rows[0].id, status: r.rows[0].status });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
