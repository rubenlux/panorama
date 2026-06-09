import { Router } from "express";
import { pool, query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const REGIONS = [
  { slug: "argentina",  name: "Argentina" },
  { slug: "nea",        name: "NEA" },
  { slug: "formosa",    name: "Formosa" },
  { slug: "chaco",      name: "Chaco" },
  { slug: "corrientes", name: "Corrientes" },
  { slug: "misiones",   name: "Misiones" },
];

// ── LIST topics ───────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { region, category, coverage_scope, search } = req.query;
  try {
    let sql = `
      SELECT
        t.*,
        COUNT(DISTINCT ta.article_id)        AS article_count,
        COUNT(DISTINCT tr.research_topic_id) AS research_count,
        COUNT(DISTINCT te.entity_id)         AS entity_count
      FROM topics t
      LEFT JOIN topic_articles ta ON ta.topic_id = t.id
      LEFT JOIN topic_research  tr ON tr.topic_id = t.id
      LEFT JOIN topic_entities  te ON te.topic_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (region)         { params.push(region);         sql += ` AND t.region = $${params.length}`; }
    if (category)       { params.push(category);       sql += ` AND t.category = $${params.length}`; }
    if (coverage_scope) { params.push(coverage_scope); sql += ` AND t.coverage_scope = $${params.length}`; }
    if (search)         { params.push(`%${search}%`); sql += ` AND (t.name ILIKE $${params.length} OR t.description ILIKE $${params.length})`; }

    sql += ` GROUP BY t.id ORDER BY t.importance_score DESC, t.updated_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("GET /topics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── TRENDING topics ───────────────────────────────────────────────────────────
router.get("/trending", async (req, res) => {
  const { limit = 10 } = req.query;
  try {
    const { rows } = await query(`
      SELECT
        t.id, t.slug, t.name, t.category, t.region, t.coverage_scope,
        t.importance_score,
        COUNT(DISTINCT ta.article_id) AS article_count,
        COUNT(DISTINCT tr.research_topic_id) AS research_count,
        COUNT(DISTINCT te.entity_id) AS entity_count,
        -- velocity: articles added in last 48h
        COUNT(DISTINCT CASE WHEN ta.added_at > NOW() - INTERVAL '48 hours' THEN ta.article_id END) AS recent_articles
      FROM topics t
      LEFT JOIN topic_articles ta ON ta.topic_id = t.id
      LEFT JOIN topic_research  tr ON tr.topic_id = t.id
      LEFT JOIN topic_entities  te ON te.topic_id = t.id
      GROUP BY t.id
      ORDER BY
        (COUNT(DISTINCT ta.article_id) * 1.0
         + COUNT(DISTINCT tr.research_topic_id) * 2.0
         + COUNT(DISTINCT CASE WHEN ta.added_at > NOW() - INTERVAL '48 hours' THEN ta.article_id END) * 3.0
         + t.importance_score
        ) DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LIST regions ──────────────────────────────────────────────────────────────
router.get("/regions", async (req, res) => {
  try {
    const { rows: counts } = await query(`
      SELECT region, COUNT(*) AS topic_count
      FROM topics
      WHERE region IS NOT NULL
      GROUP BY region
    `);
    const countMap = Object.fromEntries(counts.map(r => [r.region, parseInt(r.topic_count)]));

    const { rows: articlesPerRegion } = await query(`
      SELECT region, COUNT(*) AS article_count
      FROM articles
      WHERE region IS NOT NULL AND status = 'published'
      GROUP BY region
    `);
    const artMap = Object.fromEntries(articlesPerRegion.map(r => [r.region, parseInt(r.article_count)]));

    const regions = REGIONS.map(r => ({
      ...r,
      topic_count:   countMap[r.slug]   || 0,
      article_count: artMap[r.slug]     || 0,
    }));
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REGIONAL HUB ─────────────────────────────────────────────────────────────
router.get("/regions/:slug", async (req, res) => {
  const { slug } = req.params;
  const region = REGIONS.find(r => r.slug === slug);
  if (!region) return res.status(404).json({ error: "Region not found" });

  try {
    const [topicsRes, articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT t.*, COUNT(DISTINCT ta.article_id) AS article_count
        FROM topics t
        LEFT JOIN topic_articles ta ON ta.topic_id = t.id
        WHERE t.region = $1
        GROUP BY t.id
        ORDER BY t.importance_score DESC, article_count DESC
        LIMIT 20
      `, [slug]),

      query(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.published_at,
               a.cover_image_url, a.coverage_scope,
               c.name AS category_name
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.region = $1 AND a.status = 'published'
        ORDER BY a.published_at DESC
        LIMIT 20
      `, [slug]),

      query(`
        SELECT ke.id, ke.name, ke.entity_type, ke.description,
               COUNT(em.id) AS mention_count
        FROM knowledge_entities ke
        JOIN entity_mentions em ON em.entity_id = ke.id
        JOIN research_topics rt ON rt.id = em.topic_id
        WHERE rt.region = $1 OR EXISTS (
          SELECT 1 FROM topic_entities te
          JOIN topics tp ON tp.id = te.topic_id
          WHERE te.entity_id = ke.id AND tp.region = $1
        )
        GROUP BY ke.id
        ORDER BY mention_count DESC
        LIMIT 10
      `, [slug]),
    ]);

    res.json({
      region,
      topics:   topicsRes.rows,
      articles: articlesRes.rows,
      entities: entitiesRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET topic detail ──────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: [topic] } = await query(`SELECT * FROM topics WHERE id = $1 OR slug = $1`, [id]);
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    const [articlesRes, researchRes, entitiesRes, eventsRes] = await Promise.all([
      query(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.published_at,
               a.cover_image_url, a.status, ta.relevance_score, ta.added_at,
               c.name AS category_name
        FROM topic_articles ta
        JOIN articles a ON a.id = ta.article_id
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ta.topic_id = $1
        ORDER BY ta.added_at DESC
      `, [topic.id]),

      query(`
        SELECT rt.id, rt.title, rt.status, rt.created_at, tr.added_at,
               rb.executive_summary
        FROM topic_research tr
        JOIN research_topics rt ON rt.id = tr.research_topic_id
        LEFT JOIN LATERAL (
          SELECT executive_summary FROM research_briefs
          WHERE topic_id = rt.id ORDER BY created_at DESC LIMIT 1
        ) rb ON true
        WHERE tr.topic_id = $1
        ORDER BY tr.added_at DESC
      `, [topic.id]),

      query(`
        SELECT ke.id, ke.name, ke.entity_type, ke.description, te.prominence_score
        FROM topic_entities te
        JOIN knowledge_entities ke ON ke.id = te.entity_id
        WHERE te.topic_id = $1
        ORDER BY te.prominence_score DESC
      `, [topic.id]),

      query(`
        SELECT ke2.title, ke2.summary, ke2.event_date, ke2.event_type,
               kent.name AS entity_name
        FROM topic_events tev
        JOIN knowledge_events ke2 ON ke2.id = tev.event_id
        JOIN knowledge_entities kent ON kent.id = ke2.entity_id
        WHERE tev.topic_id = $1
        ORDER BY ke2.event_date DESC NULLS LAST
      `, [topic.id]),
    ]);

    res.json({
      ...topic,
      articles: articlesRes.rows,
      research: researchRes.rows,
      entities: entitiesRes.rows,
      events:   eventsRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE topic ──────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { name, description, category, region, coverage_scope, importance_score } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const slug = slugify(name);
  try {
    const { rows: [topic] } = await query(`
      INSERT INTO topics (slug, name, description, category, region, coverage_scope, importance_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [slug, name, description||null, category||null, region||null, coverage_scope||'national', importance_score||0]);
    res.status(201).json(topic);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Slug already exists" });
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE topic ──────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, category, region, coverage_scope, importance_score } = req.body;
  try {
    const sets = [];
    const vals = [];
    const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    if (name            !== undefined) { add("name", name); add("slug", slugify(name)); }
    if (description     !== undefined) add("description", description);
    if (category        !== undefined) add("category", category);
    if (region          !== undefined) add("region", region);
    if (coverage_scope  !== undefined) add("coverage_scope", coverage_scope);
    if (importance_score!== undefined) add("importance_score", importance_score);
    if (!sets.length) return res.status(400).json({ error: "No fields to update" });
    add("updated_at", new Date());
    vals.push(id);
    const { rows: [topic] } = await query(
      `UPDATE topics SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals
    );
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE topic ──────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  await query("DELETE FROM topics WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// ── LINK article ──────────────────────────────────────────────────────────────
router.post("/:id/articles", requireAuth, async (req, res) => {
  const { article_id, relevance_score = 1.0 } = req.body;
  if (!article_id) return res.status(400).json({ error: "article_id required" });
  try {
    await query(`
      INSERT INTO topic_articles (topic_id, article_id, relevance_score)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
    `, [req.params.id, article_id, relevance_score]);
    await query("UPDATE topics SET updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UNLINK article ────────────────────────────────────────────────────────────
router.delete("/:id/articles/:article_id", requireAuth, async (req, res) => {
  await query("DELETE FROM topic_articles WHERE topic_id=$1 AND article_id=$2",
    [req.params.id, req.params.article_id]);
  res.status(204).end();
});

// ── LINK research ─────────────────────────────────────────────────────────────
router.post("/:id/research", requireAuth, async (req, res) => {
  const { research_topic_id } = req.body;
  if (!research_topic_id) return res.status(400).json({ error: "research_topic_id required" });
  try {
    await query(`
      INSERT INTO topic_research (topic_id, research_topic_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING
    `, [req.params.id, research_topic_id]);
    await query("UPDATE topics SET updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LINK entity ───────────────────────────────────────────────────────────────
router.post("/:id/entities", requireAuth, async (req, res) => {
  const { entity_id, prominence_score = 1.0 } = req.body;
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });
  try {
    await query(`
      INSERT INTO topic_entities (topic_id, entity_id, prominence_score)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
    `, [req.params.id, entity_id, prominence_score]);
    await query("UPDATE topics SET updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LINK event ────────────────────────────────────────────────────────────────
router.post("/:id/events", requireAuth, async (req, res) => {
  const { event_id } = req.body;
  if (!event_id) return res.status(400).json({ error: "event_id required" });
  try {
    await query(`
      INSERT INTO topic_events (topic_id, event_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING
    `, [req.params.id, event_id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
