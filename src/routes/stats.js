import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin", "editor"), async (req, res, next) => {
  try {
    // 1. Counts
    const counts = await Promise.all([
      query("SELECT COUNT(*) FROM articles"),
      query("SELECT COUNT(*) FROM users"),
      query("SELECT COUNT(*) FROM comments WHERE status = 'approved'"),
      query("SELECT COUNT(*) FROM categories"),
    ]);

    const stats = {
      articles: parseInt(counts[0].rows[0].count, 10),
      users: parseInt(counts[1].rows[0].count, 10),
      comments: parseInt(counts[2].rows[0].count, 10),
      categories: parseInt(counts[3].rows[0].count, 10),
    };

    // 2. Recent Articles (for cards)
    const recentRes = await query(`
      SELECT id, title, status, created_at, updated_at 
      FROM articles 
      ORDER BY updated_at DESC 
      LIMIT 4
    `);

    // 3. User Stats Chart
    const rolesRes = await query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);

    // 4. Top Articles (Most Read) - Using pixel_events
    const topReadRes = await query(`
      SELECT 
        a.id, 
        a.title, 
        COUNT(*) FILTER (WHERE p.event = 'page_view') as views,
        COUNT(*) FILTER (WHERE p.event = 'comment_submit') as comments_count
      FROM articles a
      LEFT JOIN pixel_events p ON (p.payload->>'article_id' = a.id::text OR p.payload->>'content_id' = a.id::text)
      WHERE a.status = 'published'
      GROUP BY a.id, a.title
      ORDER BY views DESC
      LIMIT 5
    `);

    // 5. Top Commented - Using pixel_events
    const topCommentedRes = await query(`
      SELECT 
        a.id, 
        a.title, 
        COUNT(*) FILTER (WHERE p.event = 'page_view') as views,
        COUNT(*) FILTER (WHERE p.event = 'comment_submit') as comments_count
      FROM articles a
      LEFT JOIN pixel_events p ON (p.payload->>'article_id' = a.id::text OR p.payload->>'content_id' = a.id::text)
      WHERE a.status = 'published'
      GROUP BY a.id, a.title
      ORDER BY comments_count DESC
      LIMIT 5
    `);

    // 6. Time Series (Last 24h Hourly) - Using pixel_events
    const hourlyRes = await query(`
      SELECT to_char(date_trunc('hour', created_at), 'HH24:00') as time, COUNT(*) as views
      FROM pixel_events
      WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    // 7. Daily (Last 7 days) - Using pixel_events
    const dailyRes = await query(`
      SELECT to_char(created_at, 'YYYY-MM-DD') as date, COUNT(*) as views
      FROM pixel_events
      WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    res.json({
      stats,
      recentArticles: recentRes.rows,
      roles: rolesRes.rows,
      topRead: topReadRes.rows,
      topCommented: topCommentedRes.rows,
      hourly: hourlyRes.rows,
      daily: dailyRes.rows,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
