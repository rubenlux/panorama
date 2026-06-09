import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import geoip from "geoip-lite";
import { query, logActivity } from "./db.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = registerSchema;

router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);
    const password_hash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users(email, password_hash, role)
       VALUES ($1, $2, 'editor')
       RETURNING id, email, role, created_at`,
      [email, password_hash]
    );

    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    // unique violation
    if (err?.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const result = await query(
      `SELECT id, email, role, password_hash FROM users WHERE email=$1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // LOG ACTIVITY
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const geo = geoip.lookup(ip);
    await logActivity(user.id, 'login', {
      ip,
      city: geo?.city,
      country: geo?.country
    });

    return res.json({ token });
  } catch (err) {
    return next(err);
  }
});

export default router;
