import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
console.log(">> MEDIA STORAGE PATH:", uploadDir); // DEBUG

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Sanitize original name: remove accents, special chars, spaces -> hyphens
    const originalName = file.originalname || "image";
    const namePart = originalName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "-") // Replace non-alphanumeric with hyphen
      .replace(/-+/g, "-"); // Collapse multiple hyphens

    const ext = path.extname(namePart);
    const base = path.basename(namePart, ext);

    // Add timestamp to ensure uniqueness but keep semantic name
    const finalName = `${base}-${Date.now()}${ext}`;
    cb(null, finalName);
  },
});

const upload = multer({ storage });

// -- Folders endpoints (specific paths first) --

router.get("/folders", requireAuth, async (req, res, next) => {
  try {
    const r = await query("SELECT * FROM folders ORDER BY name");
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post("/folders", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const r = await query("INSERT INTO folders(name) VALUES ($1) RETURNING *", [name.trim()]);
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: "Folder already exists" });
    next(e);
  }
});

router.delete("/folders/:id", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const f = await query("SELECT name FROM folders WHERE id = $1", [id]);
    if (f.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    const folderName = f.rows[0].name;

    if (folderName === "general") return res.status(400).json({ error: "Cannot delete general folder" });

    const m = await query("SELECT count(*) FROM media WHERE folder = $1", [folderName]);
    if (parseInt(m.rows[0].count) > 0) return res.status(400).json({ error: "Folder is not empty" });

    await query("DELETE FROM folders WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// -- Media Item endpoints --

router.get("/", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    const { folder } = req.query;
    let queryText = `
      SELECT
        id,
        url,
        filename,
        mime AS mime_type,
        size_bytes,
        created_by,
        created_at,
        folder
      FROM media
    `;
    const params = [];
    if (folder) {
      queryText += ` WHERE folder = $1`;
      params.push(folder);
    }
    queryText += ` ORDER BY created_at DESC LIMIT 200`;

    const r = await query(queryText, params);
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

router.post("/", requireAuth, requireRole("admin", "editor"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const url = `/uploads/${req.file.filename}`;
    const mime = req.file.mimetype;
    const sizeBytes = req.file.size;
    const folder = req.body.folder || "general";

    const createdBy = req.user.sub;

    const r = await query(
      `INSERT INTO media(url, filename, mime, size_bytes, created_by, folder)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, url, filename, mime AS mime_type, size_bytes, created_by, created_at, folder`,
      [url, req.file.filename, mime, sizeBytes, createdBy, folder]
    );

    console.log(">> MEDIA UPLOAD SUCCESS:", {
      originalName: req.file.originalname,
      finalFilename: req.file.filename,
      storedUrl: url,
      fullUrl: `${req.protocol}://${req.get('host')}${url}`
    });

    res.status(201).json({ media: r.rows[0] });
  } catch (e) {
    if (e.message.includes('column "folder" of relation "media" does not exist')) {
      return res.status(500).json({ error: "DB Schema mismatched: missing folder column" });
    }
    next(e);
  }
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const check = await query("SELECT filename FROM media WHERE id = $1", [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Not found" });

    const filename = check.rows[0].filename;

    await query("DELETE FROM media WHERE id = $1", [id]);

    if (filename) {
      const filePath = path.resolve(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// -- Pexels Integration --

const PEXELS_KEY = process.env.PEXELS_API_KEY || "FrCKMN9vRHIJQfnTsE5QKJclufpwB848oNYkZYFqq5L0ojHsV1p2BA6P";

import fetch from "node-fetch";
import { pipeline } from "stream/promises";

router.get("/pexels/search", requireAuth, async (req, res, next) => {
  try {
    const { q, page = 1, per_page = 15 } = req.query;
    if (!q) return res.status(400).json({ error: "Query required" });

    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&page=${page}&per_page=${per_page}`, {
      headers: { Authorization: PEXELS_KEY }
    });

    if (!response.ok) throw new Error(`Pexels API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post("/pexels/upload", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    const { url, photographer, photographer_url, alt } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    // Generate filename
    const ext = ".jpg"; // Pexels usually serves JPEGs
    const filename = `pexels-${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Download stream
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download image from Pexels");

    const fileStream = fs.createWriteStream(filePath);
    await pipeline(response.body, fileStream);

    const relativeUrl = `/uploads/${filename}`;
    const sizeBytes = fs.statSync(filePath).size;
    const createdBy = req.user.sub;
    const folder = "general"; // User requirement

    // Insert to DB
    const r = await query(
      `INSERT INTO media(url, filename, mime, size_bytes, created_by, folder)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, url, filename, mime AS mime_type, size_bytes, created_by, created_at, folder`,
      [relativeUrl, filename, "image/jpeg", sizeBytes, createdBy, folder]
    );

    res.json({ media: r.rows[0], success: true });
  } catch (e) {
    next(e);
  }
});

export default router;


