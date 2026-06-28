#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Pool } from "pg";

// ─── ALL LOGGING GOES TO STDERR, NEVER STDOUT ───────────────────────────────
function log(msg) {
  console.error(`[MCP] ${msg}`);
}

function logTool(tool, msg) {
  console.error(`[${tool}] ${msg}`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5435/newsdb"
});

log("Initializing server...");
const server = new McpServer({ name: "panorama-mcp-server", version: "1.0.0" });

const agendaSchema = z.object({
  limit: z.number().default(10),
  days: z.number().default(7).describe("Filter to stories from last N days (1-30)")
});
const topicSchema = z.object({
  entity: z.string(),
  hours: z.number().default(24),
  days: z.number().default(7).describe("Filter to stories from last N days (1-30)")
});
const storySchema = z.object({ id: z.string() });
const searchSchema = z.object({
  entity: z.string().optional(),
  limit: z.number().default(10),
  days: z.number().default(7).describe("Filter to stories from last N days (1-30)")
});
const coverageSchema = z.object({
  entity: z.string(),
  days: z.number().default(7).describe("Filter to articles from last N days (1-30)")
});
const socialSchema = z.object({
  limit: z.number().default(10),
  days: z.number().default(1).describe("Filter to posts from last N days (1-7)")
});
const limitSchema = z.object({
  limit: z.number().default(10),
  days: z.number().default(7).describe("Filter to items from last N days (1-30)")
});

const contentOpenSchema = z.object({
  id: z.string().optional().describe("monitored_articles.id (UUID)"),
  url: z.string().optional().describe("article URL"),
  article_id: z.string().optional().describe("alias for id"),
  story_id: z.string().optional().describe("story_cluster.id (UUID)"),
  story_article_index: z.number().int().optional().describe("index in cluster (0-based)")
});

const storyOpenSchema = z.object({
  story_id: z.string().describe("story_cluster.id (UUID, required)")
});

const editorialListSchema = z.object({
  status: z.enum(['active', 'stale']).optional().describe("Filter by event status"),
  min_score: z.number().int().optional().describe("Minimum editorial score (0-100)"),
  q: z.string().optional().describe("Search query for event headline"),
  limit: z.number().int().default(50).describe("Items per page (max 200)"),
  offset: z.number().int().default(0).describe("Pagination offset")
});

const editorialOpenSchema = z.object({
  id: z.string().describe("event_cluster.id (UUID, required)")
});

const socialTrendingSchema = z.object({
  limit: z.number().int().default(50).describe("Items per page (max 300)"),
  offset: z.number().int().default(0).describe("Pagination offset"),
  platform: z.enum(['youtube', 'facebook', 'x', 'instagram']).optional().describe("Filter by platform"),
  hours: z.number().int().optional().describe("Filter to clusters from last N hours (0=all)"),
  sort: z.enum(['recent', 'engagement', 'trend']).default('trend').describe("Sort order")
});

const socialOpenSchema = z.object({
  id: z.string().describe("social_clusters.id (required)")
});

const socialContentOpenSchema = z.object({
  id: z.string().describe("social_posts.id (required)")
});

const socialOpportunitiesSchema = z.object({
  limit: z.number().int().default(50).describe("Items per page (max 100)"),
  offset: z.number().int().default(0).describe("Pagination offset"),
  tier: z.enum(['MUY_ALTA', 'MEDIA', 'BAJA']).optional().describe("Filter by opportunity tier"),
  hours: z.number().int().optional().describe("Filter to clusters from last N hours (0=all)"),
  region: z.string().optional().describe("Filter by region"),
  platform: z.enum(['youtube', 'facebook', 'x', 'instagram']).optional().describe("Filter by platform")
});

// Posts Domain Schemas
const postsListSchema = z.object({
  limit: z.number().int().default(50).describe("Items per page (max 100)"),
  offset: z.number().int().default(0).describe("Pagination offset"),
  status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional().describe("Filter by status"),
  author: z.string().optional().describe("Filter by author email or ID"),
  category: z.string().optional().describe("Filter by category slug"),
  search: z.string().optional().describe("Free-text search in title/excerpt"),
  from_date: z.string().optional().describe("Filter published_at >= (ISO date)"),
  to_date: z.string().optional().describe("Filter published_at <= (ISO date)"),
  sort: z.enum(['recent', 'oldest', 'title']).default('recent').describe("Sort order")
});

const postsOpenSchema = z.object({
  id: z.string().describe("Post ID (UUID or slug)")
});

const postsCreateSchema = z.object({
  title: z.string().describe("Post title"),
  content: z.string().describe("Post body HTML"),
  excerpt: z.string().optional().describe("Post excerpt/copete")
});

const postsUpdateSchema = z.object({
  id: z.string().describe("Post ID"),
  title: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  slug: z.string().optional(),
  seo: z.object({
    meta_title: z.string().optional(),
    meta_description: z.string().optional(),
    canonical_url: z.string().optional(),
    og_title: z.string().optional(),
    og_description: z.string().optional(),
    keywords: z.string().optional()
  }).optional(),
  featured_image: z.object({
    url: z.string(),
    caption: z.string().optional(),
    alt: z.string().optional()
  }).optional(),
  categories: z.array(z.string()).optional().describe("Category slugs"),
  status: z.enum(['draft', 'published', 'scheduled']).optional()
});

const postsPublishSchema = z.object({
  id: z.string().describe("Post ID")
});

const postsScheduleSchema = z.object({
  id: z.string().describe("Post ID"),
  scheduled_at: z.string().describe("ISO datetime for publication")
});

const postsDeleteSchema = z.object({
  id: z.string().describe("Post ID")
});

// ─── DIAGNOSTIC TOOL ───────────────────────────────────────────────────────
server.registerTool("ping", { description: "Diagnostic tool to verify MCP is working", inputSchema: z.object({}) }, async () => {
  logTool("ping", "CALLED");
  return { content: [{ type: "text", text: "pong - MCP is working!" }] };
});

server.registerTool("agenda_snapshot", { description: "Get complete editorial agenda (stories, events, social, opportunities) with optional date filtering", inputSchema: agendaSchema }, async (args) => {
  const tool = "agenda_snapshot";
  const start = Date.now();
  logTool(tool, "CALLED");

  try {
    logTool(tool, `1. parse args: ${JSON.stringify(args)}`);
    const limit = args.limit || 10;
    const days = Math.max(1, Math.min(30, args.days || 7));
    logTool(tool, `2. params: days=${days}, limit=${limit}`);

    logTool(tool, `3. executing 4 queries...`);
    const [s, e, so, o] = await Promise.all([
      pool.query(`SELECT id, title, importance_score, last_seen FROM story_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY importance_score DESC LIMIT $2`, [days, limit]),
      pool.query(`SELECT id, headline as title, editorial_score, last_updated_at FROM event_clusters WHERE last_updated_at > NOW() - INTERVAL '1 day' * $1 ORDER BY editorial_score DESC LIMIT $2`, [days, limit]),
      pool.query(`SELECT id, title, viral_score, last_seen FROM social_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY viral_score DESC LIMIT $2`, [days, limit]),
      pool.query(`SELECT id, title, composite_score, created_at FROM story_opportunities WHERE status = 'pending' AND created_at > NOW() - INTERVAL '1 day' * $1 ORDER BY composite_score DESC LIMIT $2`, [days, limit]),
    ]);
    logTool(tool, `4. queries ok: stories=${s.rows.length}, events=${e.rows.length}, social=${so.rows.length}, opps=${o.rows.length}`);

    logTool(tool, `5. formatting response...`);
    const response = { stories: s.rows, events: e.rows, social: so.rows, opportunities: o.rows, filter: { days } };
    const text = JSON.stringify(response);
    logTool(tool, `6. json length: ${text.length} bytes`);

    const result = { content: [{ type: "text", text }] };
    logTool(tool, `7. ok ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, `STACK:\n${error.stack}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("topic_snapshot", { description: "Get snapshot of a specific topic/entity with coverage timeline", inputSchema: topicSchema }, async (args) => {
  const tool = "topic_snapshot";
  const start = Date.now();
  logTool(tool, `start entity="${args.entity}"`);
  try {
    const e = args.entity;
    const h = args.hours || 24;
    const d = Math.max(1, Math.min(30, args.days || 7));
    logTool(tool, `queries: stories, articles (${h}h), coverage`);

    const [s, a, c] = await Promise.all([
      pool.query(`SELECT id, title, importance_score FROM story_clusters WHERE title ILIKE $1 AND last_seen > NOW() - INTERVAL '1 day' * $2 ORDER BY importance_score DESC LIMIT 5`, [`%${e}%`, d]),
      pool.query(`SELECT ma.id, ma.title, rs.name as source_name, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id WHERE ma.title ILIKE $1 AND ma.detected_at > NOW() - INTERVAL '1 hour' * $2 ORDER BY ma.detected_at DESC LIMIT 10`, [`%${e}%`, h]),
      pool.query(`SELECT rs.name as source_name, COUNT(*) as count FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id WHERE ma.title ILIKE $1 AND ma.detected_at > NOW() - INTERVAL '1 hour' * $2 GROUP BY rs.name ORDER BY count DESC`, [`%${e}%`, h]),
    ]);
    logTool(tool, `ok ${Date.now() - start}ms (stories=${s.rows.length}, articles=${a.rows.length}, sources=${c.rows.length})`);
    return { content: [{ type: "text", text: JSON.stringify({ entity: e, stories: s.rows, articles: a.rows, coverage: c.rows }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("story_get", { description: "Get complete story cluster with all articles and coverage", inputSchema: storySchema }, async (args) => {
  const tool = "story_get";
  const start = Date.now();
  logTool(tool, `start id="${args.id}"`);
  try {
    logTool(tool, `queries: story, articles, coverage`);
    const [s, a, c] = await Promise.all([
      pool.query(`SELECT id, title, importance_score, detected_category, article_count FROM story_clusters WHERE id = $1`, [args.id]),
      pool.query(`SELECT ma.id, ma.title, rs.name as source_name, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id JOIN story_cluster_articles sca ON sca.article_id = ma.id WHERE sca.story_id = $1 ORDER BY ma.detected_at DESC`, [args.id]),
      pool.query(`SELECT rs.name as source_name, COUNT(*) as count FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id JOIN story_cluster_articles sca ON sca.article_id = ma.id WHERE sca.story_id = $1 GROUP BY rs.name ORDER BY count DESC`, [args.id]),
    ]);
    logTool(tool, `ok ${Date.now() - start}ms (articles=${a.rows.length}, sources=${c.rows.length})`);
    return { content: [{ type: "text", text: JSON.stringify({ story: s.rows[0], articles: a.rows, coverage: c.rows }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("stories_search", { description: "Search editorial stories with optional entity filter and date range", inputSchema: searchSchema }, async (args) => {
  const tool = "stories_search";
  const start = Date.now();
  logTool(tool, `start entity="${args.entity}"`);
  try {
    const limit = args.limit || 10;
    const days = Math.max(1, Math.min(30, args.days || 7));
    let q;
    let p;

    if (args.entity) {
      logTool(tool, `search mode, entity="${args.entity}", days=${days}`);
      q = `SELECT id, title, importance_score, detected_category, last_seen FROM story_clusters WHERE title ILIKE $1 AND last_seen > NOW() - INTERVAL '1 day' * $2 ORDER BY importance_score DESC LIMIT $3`;
      p = [`%${args.entity}%`, days, limit];
    } else {
      logTool(tool, `all mode, days=${days}`);
      q = `SELECT id, title, importance_score, detected_category, last_seen FROM story_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY importance_score DESC LIMIT $2`;
      p = [days, limit];
    }
    const r = await pool.query(q, p);
    logTool(tool, `ok ${Date.now() - start}ms (${r.rows.length} stories)`);
    return { content: [{ type: "text", text: JSON.stringify({ stories: r.rows, filter: { entity: args.entity, days, limit } }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("coverage_timeline", { description: "Get chronological coverage timeline for an entity", inputSchema: coverageSchema }, async (args) => {
  const tool = "coverage_timeline";
  const start = Date.now();
  logTool(tool, "CALLED");

  try {
    logTool(tool, `1. parse args: entity="${args.entity}"`);
    const days = Math.max(1, Math.min(30, args.days || 7));
    logTool(tool, `2. params: days=${days}`);

    logTool(tool, `3. executing query: SELECT rs.name as source_name, ma.title, ma.url, ma.detected_at ...`);
    const r = await pool.query(
      `SELECT rs.name as source_name, ma.title, ma.url, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id WHERE ma.title ILIKE $1 AND ma.detected_at > NOW() - INTERVAL '1 day' * $2 ORDER BY ma.detected_at ASC LIMIT 100`,
      [`%${args.entity}%`, days]
    );
    logTool(tool, `4. query ok: ${r.rows.length} articles found`);

    if (r.rows.length > 0) {
      logTool(tool, `   first article: title="${r.rows[0].title}", source="${r.rows[0].source_name}"`);
    }

    logTool(tool, `5. formatting response...`);
    const response = { entity: args.entity, articles: r.rows, filter: { days } };
    const text = JSON.stringify(response);
    logTool(tool, `6. json length: ${text.length} bytes`);

    const result = { content: [{ type: "text", text }] };
    logTool(tool, `7. ok ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, `STACK:\n${error.stack}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("social_top", { description: "Get trending social posts by viral score", inputSchema: socialSchema }, async (args) => {
  const tool = "social_top";
  const start = Date.now();
  logTool(tool, "start");
  try {
    const limit = args.limit || 10;
    const days = Math.max(1, Math.min(7, args.days || 1));
    logTool(tool, `days=${days}, limit=${limit}`);
    const r = await pool.query(`SELECT id, title, viral_score, total_engagement, last_seen FROM social_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY viral_score DESC LIMIT $2`, [days, limit]);
    logTool(tool, `ok ${Date.now() - start}ms (${r.rows.length} posts)`);
    return { content: [{ type: "text", text: JSON.stringify({ posts: r.rows, filter: { days, limit } }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("events_search", { description: "Get top events by editorial score", inputSchema: limitSchema }, async (args) => {
  const tool = "events_search";
  const start = Date.now();
  logTool(tool, "start");
  try {
    const limit = args.limit || 10;
    const days = Math.max(1, Math.min(30, args.days || 7));
    logTool(tool, `days=${days}, limit=${limit}`);
    const r = await pool.query(`SELECT id, headline as title, editorial_score, last_updated_at FROM event_clusters WHERE last_updated_at > NOW() - INTERVAL '1 day' * $1 ORDER BY editorial_score DESC LIMIT $2`, [days, limit]);
    logTool(tool, `ok ${Date.now() - start}ms (${r.rows.length} events)`);
    return { content: [{ type: "text", text: JSON.stringify({ events: r.rows, filter: { days, limit } }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("opportunities_top", { description: "Get top editorial opportunities (pending editorial actions)", inputSchema: limitSchema }, async (args) => {
  const tool = "opportunities_top";
  const start = Date.now();
  logTool(tool, "start");
  try {
    const limit = args.limit || 10;
    const days = Math.max(1, Math.min(30, args.days || 7));
    logTool(tool, `days=${days}, limit=${limit}`);
    const r = await pool.query(`SELECT id, title, composite_score, trigger, created_at FROM story_opportunities WHERE status = 'pending' AND created_at > NOW() - INTERVAL '1 day' * $1 ORDER BY composite_score DESC LIMIT $2`, [days, limit]);
    logTool(tool, `ok ${Date.now() - start}ms (${r.rows.length} opportunities)`);
    return { content: [{ type: "text", text: JSON.stringify({ opportunities: r.rows, filter: { days, limit } }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, error.stack);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// ─── MONITOR MODULE: Media Monitor API ─────────────────────────────────────
// These tools expose the Media Monitor interface for Claude

server.registerTool("monitor_dashboard", { description: "Dashboard snapshot - operational overview (sources, articles, trends, worker status)", inputSchema: z.object({}) }, async () => {
  const tool = "monitor.dashboard";
  logTool(tool, "CALLED");
  try {
    const { rows: [r] } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM rss_sources WHERE enabled = true) AS sources_active,
        (SELECT COUNT(*)::int FROM rss_sources) AS sources_total,
        (SELECT COUNT(*)::int FROM monitored_articles WHERE detected_at > now() - interval '24 hours') AS articles_today,
        (SELECT COUNT(*)::int FROM trending_topics WHERE last_seen_at > now() - interval '30 minutes') AS trending_now,
        (SELECT COUNT(*)::int FROM story_opportunities WHERE status = 'pending') AS opportunities,
        (SELECT MAX(last_checked) FROM rss_sources WHERE enabled = true) AS last_worker_run,
        extract(epoch FROM (now() - (SELECT MAX(last_checked) FROM rss_sources WHERE enabled = true)))::int AS worker_idle_seconds
    `);
    logTool(tool, `ok (${Object.keys(r).length} metrics)`);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_system", { description: "System health - worker status, monitors, transcripts, RSS health, alerts", inputSchema: z.object({}) }, async () => {
  const tool = "monitor_system";
  logTool(tool, "CALLED");
  try {
    const { rows: [wr] } = await pool.query(`
      SELECT DISTINCT ON (worker_name)
        worker_name, started_at, status
      FROM worker_runs
      ORDER BY worker_name, started_at DESC
    `).catch(() => ({ rows: [] }));

    const { rows: [src] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE enabled = true)::int AS active
      FROM rss_sources
    `).catch(() => ({ rows: [{ total: 0, active: 0 }] }));

    const { rows: pauseRows } = await pool.query(`
      SELECT key, value FROM settings
      WHERE key IN ('news_monitor_paused', 'news_monitor_paused_at')
    `).catch(() => ({ rows: [] }));
    const pauseInfo = Object.fromEntries(pauseRows.map(r => [r.key, r.value]));

    logTool(tool, "ok");
    return { content: [{ type: "text", text: JSON.stringify({
      worker: { last_run: wr?.started_at, status: wr?.status },
      rss_sources: src,
      news_monitor_paused: pauseInfo['news_monitor_paused'] === 'true',
      paused_since: pauseInfo['news_monitor_paused_at']
    }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_feed", { description: "Recent articles detected by the system", inputSchema: z.object({
  hours: z.number().int().default(24),
  source_id: z.string().optional(),
  entity: z.string().optional(),
  story_id: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().int().default(50),
  offset: z.number().int().default(0)
}) }, async (args) => {
  const tool = "monitor.feed";
  logTool(tool, `CALLED hours=${args.hours} source_id=${args.source_id}`);
  try {
    const hours = Math.min(parseInt(args.hours || '24'), 168);
    const limit = Math.min(parseInt(args.limit || '50'), 1000);
    const offset = parseInt(args.offset || '0');
    const source_id = args.source_id || null;
    const entity = args.entity || null;

    let conditions = [`ma.detected_at > now() - interval '${hours} hours'`];
    const params = [];

    if (source_id) {
      params.push(source_id);
      conditions.push(`ma.source_id = $${params.length}`);
    }
    if (entity) {
      params.push(`%${entity}%`);
      conditions.push(`ma.title ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        ma.id, ma.title, ma.url, ma.summary, ma.detected_at,
        ts.name AS source_name, ts.type AS source_type,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', ke.id, 'name', ke.name, 'entity_type', ke.entity_type)) FILTER (WHERE ke.id IS NOT NULL), '[]') AS entities
      FROM monitored_articles ma
      JOIN rss_sources ts ON ts.id = ma.source_id
      LEFT JOIN article_entity_matches aem ON aem.article_id = ma.id
      LEFT JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE ${where}
      GROUP BY ma.id, ts.name, ts.type
      ORDER BY ma.detected_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = parseInt(rows[0]?.total_count || '0');
    logTool(tool, `ok (${rows.length}/${total})`);
    return { content: [{ type: "text", text: JSON.stringify({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_stories", { description: "Story clusters detected - complete editorial stories with filters", inputSchema: z.object({
  hours: z.number().int().default(24),
  sort: z.enum(['recent', 'score']).default('recent'),
  entity: z.string().optional(),
  coverage_status: z.string().optional(),
  importance_min: z.number().int().default(0),
  category: z.string().optional(),
  has_multiple_sources: z.boolean().default(false),
  limit: z.number().int().default(50),
  offset: z.number().int().default(0)
}) }, async (args) => {
  const tool = "monitor.stories";
  logTool(tool, `CALLED entity=${args.entity} coverage=${args.coverage_status}`);
  try {
    const hours = Math.min(parseInt(args.hours || '24'), 168);
    const limit = Math.min(parseInt(args.limit || '50'), 500);
    const offset = parseInt(args.offset || '0');
    const sort = args.sort === 'score' ? 'importance_score DESC' : 'last_seen DESC';

    let conditions = [`sc.last_seen > now() - interval '${hours} hours'`, `sc.article_count >= 2`];
    const params = [];

    if (args.entity) {
      params.push(`%${args.entity}%`);
      conditions.push(`sc.title ILIKE $${params.length}`);
    }
    if (args.coverage_status) {
      params.push(args.coverage_status);
      conditions.push(`sc.coverage_status = $${params.length}`);
    }
    if (args.importance_min > 0) {
      params.push(args.importance_min);
      conditions.push(`sc.importance_score >= $${params.length}`);
    }
    if (args.category) {
      params.push(args.category);
      conditions.push(`sc.detected_category = $${params.length}`);
    }
    if (args.has_multiple_sources) {
      conditions.push(`sc.source_count >= 2`);
    }

    const where = conditions.join(' AND ');
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        sc.id, sc.title, sc.importance_score, sc.article_count, sc.source_count,
        sc.detected_category, sc.coverage_status, sc.last_seen, sc.created_at,
        sc.algorithmic_summary AS summary
      FROM story_clusters sc
      WHERE ${where}
      ORDER BY ${sort}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = parseInt(rows[0]?.total_count || '0');
    logTool(tool, `ok (${rows.length}/${total})`);
    return { content: [{ type: "text", text: JSON.stringify({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_events", { description: "Event clusters detected - entities involved in multiple stories", inputSchema: z.object({
  hours: z.number().int().default(24),
  sort: z.enum(['recent', 'score']).default('recent'),
  entity: z.string().optional(),
  category: z.string().optional(),
  coverage_status: z.string().optional(),
  limit: z.number().int().default(50),
  offset: z.number().int().default(0)
}) }, async (args) => {
  const tool = "monitor.events";
  logTool(tool, `CALLED entity=${args.entity}`);
  try {
    const hours = Math.min(parseInt(args.hours || '24'), 168);
    const limit = Math.min(parseInt(args.limit || '50'), 500);
    const offset = parseInt(args.offset || '0');
    const sort = args.sort === 'score' ? 'editorial_score DESC' : 'last_updated_at DESC';

    let conditions = [`ec.last_updated_at > now() - interval '${hours} hours'`];
    const params = [];

    if (args.entity) {
      params.push(`%${args.entity}%`);
      conditions.push(`ec.headline ILIKE $${params.length}`);
    }
    if (args.coverage_status) {
      params.push(args.coverage_status);
      conditions.push(`ec.coverage_status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        ec.id, ec.headline, ec.editorial_score, ec.coverage_status,
        ec.last_updated_at, ec.created_at, ec.source_count, ec.story_count AS article_count
      FROM event_clusters ec
      WHERE ${where}
      ORDER BY ${sort}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = parseInt(rows[0]?.total_count || '0');
    logTool(tool, `ok (${rows.length}/${total})`);
    return { content: [{ type: "text", text: JSON.stringify({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_opportunities", { description: "Editorial opportunities - pending editorial actions and insights", inputSchema: z.object({
  hours: z.number().int().optional(),
  sort: z.enum(['recent', 'score']).default('recent'),
  trigger: z.enum(['algorithmic', 'ai']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  limit: z.number().int().default(50),
  offset: z.number().int().default(0)
}) }, async (args) => {
  const tool = "monitor.opportunities";
  logTool(tool, `CALLED trigger=${args.trigger} status=${args.status}`);
  try {
    const limit = Math.min(parseInt(args.limit || '50'), 1000);
    const offset = parseInt(args.offset || '0');
    const sort = args.sort === 'score' ? 'composite_score DESC' : 'created_at DESC';

    let conditions = [];
    const params = [];

    if (args.status) {
      params.push(args.status);
      conditions.push(`so.status = $${params.length}`);
    }
    if (args.trigger) {
      params.push(args.trigger);
      conditions.push(`so.trigger = $${params.length}`);
    }
    if (args.hours) {
      const h = Math.max(1, Math.min(30, args.hours));
      conditions.push(`so.created_at > now() - interval '${h} hours'`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) OVER() AS total_count,
        so.id, so.title, so.composite_score, so.trigger, so.status, so.created_at
      FROM story_opportunities so
      ${where}
      ORDER BY ${sort}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = parseInt(rows[0]?.total_count || '0');
    logTool(tool, `ok (${rows.length}/${total})`);
    return { content: [{ type: "text", text: JSON.stringify({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("monitor_sources", { description: "RSS sources - all sources with verification status and health", inputSchema: z.object({
  enabled: z.boolean().optional(),
  verification: z.enum(['pending', 'verified', 'failed', 'approved']).optional(),
  type: z.enum(['news', 'blog', 'company', 'government']).optional(),
  limit: z.number().int().default(500)
}) }, async (args) => {
  const tool = "monitor.sources";
  logTool(tool, `CALLED enabled=${args.enabled} verification=${args.verification}`);
  try {
    let conditions = [];
    const params = [];

    if (args.enabled !== undefined) {
      params.push(args.enabled);
      conditions.push(`enabled = $${params.length}`);
    }
    if (args.verification) {
      params.push(args.verification);
      conditions.push(`verification_status = $${params.length}`);
    }
    if (args.type) {
      params.push(args.type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(args.limit || 500);

    const { rows: sources } = await pool.query(`
      SELECT *,
        CASE WHEN last_checked IS NULL THEN NULL
             ELSE extract(epoch FROM (now() - last_checked))::int
        END AS seconds_since_check
      FROM rss_sources
      ${where}
      ORDER BY enabled DESC, name
      LIMIT $${params.length}
    `, params);

    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified,
        COUNT(*) FILTER (WHERE verification_status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE verification_status = 'approved')::int AS approved
      FROM rss_sources
    `);

    logTool(tool, `ok (${sources.length} sources)`);
    return { content: [{ type: "text", text: JSON.stringify({ items: sources, stats }) }] };
  } catch (error) {
    logTool(tool, `ERROR: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// ─── STORY TOOLS: Read story clusters ─────────────────────────────────────
server.registerTool("story_open", { description: "Open a story cluster and return complete editorial context with all articles, sources, and entities", inputSchema: storyOpenSchema }, async (args) => {
  const tool = "story_open";
  const start = Date.now();
  logTool(tool, `CALLED story_id=${args.story_id}`);

  try {
    logTool(tool, `1. validate selector`);

    if (!args.story_id) {
      logTool(tool, `ERROR: story_id is required`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "INVALID_SELECTOR",
            message: "story_id is required"
          })
        }],
        isError: true
      };
    }

    logTool(tool, `2. fetch story cluster (id=${args.story_id})`);

    const { rows: storyRows } = await pool.query(`
      SELECT
        id, title, summary, detected_category, coverage_status,
        importance_score, source_count, article_count,
        created_at, updated_at, first_seen, last_seen
      FROM story_clusters
      WHERE id = $1
      LIMIT 1
    `, [args.story_id]);

    if (storyRows.length === 0) {
      logTool(tool, `NOT_FOUND: story_id=${args.story_id}`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "NOT_FOUND",
            message: "Story cluster not found"
          })
        }],
        isError: true
      };
    }

    const story = storyRows[0];
    logTool(tool, `2a. story found: title="${story.title}"`);
    logTool(tool, `3. fetch all articles in cluster`);

    const { rows: articleRows } = await pool.query(`
      SELECT
        ma.id as article_id,
        ma.title,
        ma.url,
        ma.published_at,
        ma.detected_at,
        rs.id as source_id,
        rs.name as source_name
      FROM monitored_articles ma
      LEFT JOIN rss_sources rs ON rs.id = ma.source_id
      JOIN story_cluster_articles sca ON sca.article_id = ma.id
      WHERE sca.story_id = $1
      ORDER BY ma.published_at DESC
    `, [args.story_id]);

    logTool(tool, `3a. articles found: ${articleRows.length}`);
    logTool(tool, `4. fetch entities for story`);

    const { rows: entityRows } = await pool.query(`
      SELECT
        ke.id,
        ke.name,
        ke.entity_type
      FROM story_entities se
      JOIN knowledge_entities ke ON ke.id = se.entity_id
      WHERE se.story_id = $1
      ORDER BY ke.name ASC
    `, [args.story_id]);

    logTool(tool, `4a. entities found: ${entityRows.length}`);
    logTool(tool, `5. build sources array`);

    // Group articles by source
    const sourcesMap = new Map();
    for (const article of articleRows) {
      const sourceId = article.source_id;
      if (!sourcesMap.has(sourceId)) {
        sourcesMap.set(sourceId, {
          id: sourceId || null,
          name: article.source_name || "Unknown Source",
          article_count: 0,
          first_article_at: null,
          last_article_at: null
        });
      }
      const source = sourcesMap.get(sourceId);
      source.article_count += 1;

      // Track first (oldest) and last (newest) articles
      if (!source.first_article_at || (article.published_at && source.first_article_at > article.published_at)) {
        source.first_article_at = article.published_at;
      }
      if (!source.last_article_at || (article.published_at && source.last_article_at < article.published_at)) {
        source.last_article_at = article.published_at;
      }
    }

    const sources = Array.from(sourcesMap.values());
    logTool(tool, `5a. sources grouped: ${sources.length}`);
    logTool(tool, `6. build response object`);

    // Find coverage dates
    const firstPublished = articleRows.length > 0 ? articleRows[articleRows.length - 1]?.published_at : null;
    const lastUpdated = articleRows.length > 0 ? articleRows[0]?.published_at : null;

    const response = {
      schema_version: "1.0",

      metadata: {
        id: story.id,
        title: story.title || null,
        summary: story.summary || null,
        category: story.detected_category || null,
        importance_score: story.importance_score || null,
        coverage_status: story.coverage_status || null,
        created_at: story.created_at || null,
        updated_at: story.updated_at || null
      },

      coverage: {
        article_count: story.article_count || 0,
        source_count: story.source_count || 0,
        first_published_at: firstPublished || null,
        last_updated_at: lastUpdated || null
      },

      sources,

      articles: articleRows.map(art => ({
        article_id: art.article_id,
        title: art.title || null,
        source: art.source_name || "Unknown Source",
        published_at: art.published_at || null,
        url: art.url || null
      })),

      entities: entityRows.map(ent => ({
        id: ent.id,
        name: ent.name || null,
        type: ent.entity_type || null,
        confidence: null
      })),

      provenance: {
        generated_at: new Date().toISOString(),
        pipeline_version: "2.0"
      }
    };

    logTool(tool, `6a. serializando respuesta`);
    const text = JSON.stringify(response);
    logTool(tool, `7. OK ${Date.now() - start}ms (json ${text.length} bytes, articles=${articleRows.length}, sources=${sources.length}, entities=${entityRows.length})`);

    return { content: [{ type: "text", text }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, `STACK:\n${error.stack}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "ERROR",
          message: error.message
        })
      }],
      isError: true
    };
  }
});

// ─── CONTENT TOOLS: Read article content ───────────────────────────────────
server.registerTool("content_open", { description: "Open and read article content from Panorama's database without making network requests", inputSchema: contentOpenSchema }, async (args) => {
  const tool = "content.open";
  const start = Date.now();
  logTool(tool, `CALLED id=${args.id} url=${args.url} article_id=${args.article_id} story_id=${args.story_id} index=${args.story_article_index}`);

  try {
    logTool(tool, `1. validate selector`);

    // Count how many selectors are provided
    const providedSelectors = [
      args.id,
      args.url,
      args.article_id,
      (args.story_id && args.story_article_index !== undefined)
    ].filter(Boolean).length;

    if (providedSelectors !== 1) {
      logTool(tool, `ERROR: Must provide exactly one selector (got ${providedSelectors})`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "INVALID_SELECTOR",
            message: "Selector must include exactly one of: id, url, article_id, story_id+story_article_index"
          })
        }],
        isError: true
      };
    }

    let articleId = args.id || args.article_id;
    let article = null;
    let story = null;

    logTool(tool, `2. fetch article based on selector`);

    if (articleId || args.url) {
      // Fetch by id, article_id, or url
      const column = args.url ? 'url' : 'id';
      const value = args.url || articleId;

      const { rows } = await pool.query(`
        SELECT
          ma.id, ma.title, ma.summary, ma.published_at, ma.content_text,
          ma.content_words as word_count, ma.url, ma.detected_at,
          rs.id as source_id, rs.name as source_name, rs.homepage as source_url, rs.rss_url
        FROM monitored_articles ma
        LEFT JOIN rss_sources rs ON rs.id = ma.source_id
        WHERE ma.${column} = $1
        LIMIT 1
      `, [value]);

      if (rows.length === 0) {
        logTool(tool, `NOT_FOUND: no article with ${column}=${value}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "NOT_FOUND",
              message: "No content found matching selector"
            })
          }],
          isError: true
        };
      }

      article = rows[0];
    } else if (args.story_id && args.story_article_index !== undefined) {
      // Fetch article by story_id and index
      logTool(tool, `3. fetch article by story_id=${args.story_id} index=${args.story_article_index}`);

      const { rows: storyRows } = await pool.query(`
        SELECT id, title FROM story_clusters WHERE id = $1 LIMIT 1
      `, [args.story_id]);

      if (storyRows.length === 0) {
        logTool(tool, `NOT_FOUND: no story with id=${args.story_id}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "NOT_FOUND",
              message: "No content found matching selector"
            })
          }],
          isError: true
        };
      }

      story = storyRows[0];

      // Get the Nth article from the story (ordered by detected_at DESC)
      const { rows: articleRows } = await pool.query(`
        SELECT
          ma.id, ma.title, ma.summary, ma.published_at, ma.content_text,
          ma.content_words as word_count, ma.url, ma.detected_at,
          rs.id as source_id, rs.name as source_name, rs.homepage as source_url, rs.rss_url,
          ROW_NUMBER() OVER (ORDER BY ma.detected_at DESC) - 1 as article_index
        FROM monitored_articles ma
        LEFT JOIN rss_sources rs ON rs.id = ma.source_id
        JOIN story_cluster_articles sca ON sca.article_id = ma.id
        WHERE sca.story_id = $1
        ORDER BY ma.detected_at DESC
        LIMIT 1 OFFSET $2
      `, [args.story_id, args.story_article_index]);

      if (articleRows.length === 0) {
        logTool(tool, `NOT_FOUND: no article at index ${args.story_article_index} in story ${args.story_id}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "NOT_FOUND",
              message: "No content found matching selector"
            })
          }],
          isError: true
        };
      }

      article = articleRows[0];
    }

    if (!article) {
      logTool(tool, `NOT_FOUND: article not found`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "NOT_FOUND",
            message: "No content found matching selector"
          })
        }],
        isError: true
      };
    }

    logTool(tool, `4. fetch story cluster if not already loaded`);

    if (!story && article) {
      const { rows: storyRows } = await pool.query(`
        SELECT sc.id, sc.title, sc.coverage_status, sc.importance_score, sc.source_count, sc.article_count
        FROM story_clusters sc
        JOIN story_cluster_articles sca ON sca.story_id = sc.id
        WHERE sca.article_id = $1
        LIMIT 1
      `, [article.id]);

      if (storyRows.length > 0) {
        story = storyRows[0];
      }
    }

    logTool(tool, `5. detect language from title (simple heuristic)`);
    // Simple heuristic: if content has Spanish common words, mark as es, otherwise default to en
    const spanishWords = ['el', 'la', 'de', 'que', 'y', 'en', 'con', 'para', 'una', 'del', 'las', 'por', 'es'];
    const titleWords = (article.title || '').toLowerCase().split(/\s+/);
    const spanishWordCount = titleWords.filter(w => spanishWords.includes(w)).length;
    const language = spanishWordCount > 2 ? 'es' : 'en';

    logTool(tool, `6. build response object`);

    const response = {
      schema_version: "1.0",
      metadata: {
        id: article.id,
        title: article.title || null,
        subtitle: null,
        published_at: article.published_at || null,
        language,
        word_count: article.word_count || null
      },
      source: {
        id: article.source_id || null,
        name: article.source_name || null,
        url: article.source_url || null,
        rss: article.rss_url || null,
        author: null
      },
      content: {
        summary: article.summary ? article.summary.substring(0, 300) : null,
        text: article.content_text || null,
        html: null
      },
      editorial: {
        story_id: story?.id || null,
        story_title: story?.title || null,
        event_id: null,
        coverage_status: story?.coverage_status || null,
        importance_score: story?.importance_score || null,
        source_count: story?.source_count || null,
        article_count: story?.article_count || null
      },
      provenance: {
        ingested_at: article.detected_at || null,
        fetch_status: article.content_text ? 'complete' : 'incomplete',
        fetch_status_reason: article.content_text ? null : 'content not extracted'
      }
    };

    const text = JSON.stringify(response);
    logTool(tool, `7. ok ${Date.now() - start}ms (json ${text.length} bytes)`);

    return { content: [{ type: "text", text }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    logTool(tool, `STACK:\n${error.stack}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "ERROR",
          message: error.message
        })
      }],
      isError: true
    };
  }
});

// ─── EDITORIAL TOOLS: Editorial Intelligence (Inteligencia Editorial) ──────
server.registerTool("editorial_list", { description: "List editorial dossiers from Inteligencia Editorial with filtering and pagination", inputSchema: editorialListSchema }, async (args) => {
  const tool = "editorial_list";
  const start = Date.now();
  logTool(tool, `CALLED status=${args.status} min_score=${args.min_score} q=${args.q} limit=${args.limit} offset=${args.offset}`);

  try {
    const status = args.status || null;
    const minScore = args.min_score || 0;
    const q = args.q || null;
    const limit = Math.min(args.limit || 50, 200);
    const offset = args.offset || 0;

    const conds = [];
    const params = [];

    if (status === 'active') {
      conds.push(`ec.status IN ('active', 'followed')`);
    } else if (status === 'stale') {
      conds.push(`ec.status = 'stale'`);
    }
    if (minScore > 0) {
      params.push(minScore);
      conds.push(`ec.editorial_score >= $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conds.push(`ec.headline ILIKE $${params.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) OVER()::int AS total_count,
        ec.id, ec.headline, ec.summary, ec.event_type,
        ec.importance_score, ec.editorial_score, ec.coverage_status, ec.status,
        ec.story_count, ec.article_count, ec.source_count,
        ec.main_entities, ec.first_detected_at, ec.last_updated_at,
        (
          SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = ec.id
        ) AS sources,
        (
          SELECT json_agg(json_build_object(
            'id', eo.id, 'type', eo.type, 'title', eo.title,
            'traffic_potential', eo.traffic_potential, 'difficulty', eo.difficulty,
            'status', eo.status
          ) ORDER BY eo.seo_value DESC NULLS LAST)
          FROM editorial_opportunities eo
          WHERE eo.event_id = ec.id AND eo.status NOT IN ('dismissed')
          LIMIT 5
        ) AS opportunities
      FROM event_clusters ec
      ${where}
      ORDER BY ec.editorial_score DESC NULLS LAST, ec.last_updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = rows[0]?.total_count ?? 0;
    logTool(tool, `ok ${Date.now() - start}ms (${rows.length}/${total} items)`);
    return { content: [{ type: "text", text: JSON.stringify({ items: rows.map(({ total_count, ...r }) => r), total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("editorial_open", { description: "Open a complete editorial dossier from Inteligencia Editorial with all content, timeline, participants, and coverage", inputSchema: editorialOpenSchema }, async (args) => {
  const tool = "editorial_open";
  const start = Date.now();
  logTool(tool, `CALLED id=${args.id}`);

  try {
    if (!args.id) {
      logTool(tool, `ERROR: id is required`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "INVALID_SELECTOR", message: "id is required" }) }], isError: true };
    }

    const { rows: [event] } = await pool.query(`SELECT ec.* FROM event_clusters ec WHERE ec.id = $1`, [args.id]);
    if (!event) {
      logTool(tool, `NOT_FOUND: id=${args.id}`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND", message: "Editorial dossier not found" }) }], isError: true };
    }

    const [timelineR, entitiesR, mediaR, opportunitiesR] = await Promise.all([
      pool.query(`
        SELECT
          ma.id as article_id,
          ma.title,
          ma.url,
          ma.published_at AS ts,
          ma.summary,
          rs.name AS source_name,
          (ma.content_text IS NOT NULL) AS content_available,
          CASE WHEN ma.content_text IS NOT NULL THEN
            json_build_object('content', ma.id::text)
          ELSE json_build_object() END AS links
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources rs ON rs.id = ma.source_id
        WHERE ecs.event_id = $1
        ORDER BY ma.published_at ASC
        LIMIT 100
      `, [args.id]),

      pool.query(`
        SELECT ke.id, ke.name, ke.entity_type, ke.mention_count
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        JOIN event_cluster_stories ecs ON ecs.story_id = se.story_id
        WHERE ecs.event_id = $1
        GROUP BY ke.id, ke.name, ke.entity_type, ke.mention_count
        ORDER BY ke.mention_count DESC
        LIMIT 50
      `, [args.id]),

      pool.query(`
        SELECT ts.id, ts.name AS source_name,
               COUNT(DISTINCT ma.id)::int AS article_count,
               MIN(ma.detected_at) AS first_article,
               MAX(ma.detected_at) AS last_article
        FROM event_cluster_stories ecs
        JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN rss_sources ts ON ts.id = ma.source_id
        WHERE ecs.event_id = $1
        GROUP BY ts.id, ts.name
        ORDER BY article_count DESC
      `, [args.id]),

      pool.query(`
        SELECT eo.id, eo.type, eo.title, eo.traffic_potential, eo.difficulty, eo.status, eo.seo_value
        FROM editorial_opportunities eo
        WHERE eo.event_id = $1 AND eo.status NOT IN ('dismissed')
        ORDER BY eo.seo_value DESC NULLS LAST
        LIMIT 20
      `, [args.id])
    ]);

    const response = {
      schema_version: "1.0",
      metadata: {
        id: event.id,
        headline: event.headline,
        summary: event.summary,
        event_type: event.event_type,
        editorial_score: event.editorial_score,
        importance_score: event.importance_score,
        coverage_status: event.coverage_status,
        status: event.status,
        created_at: event.first_detected_at,
        updated_at: event.last_updated_at
      },
      coverage: {
        story_count: event.story_count || 0,
        article_count: event.article_count || 0,
        source_count: event.source_count || 0
      },
      timeline: timelineR.rows,
      entities: entitiesR.rows,
      sources: mediaR.rows,
      opportunities: opportunitiesR.rows,
      provenance: {
        generated_at: new Date().toISOString(),
        pipeline_version: "1.0"
      }
    };

    const text = JSON.stringify(response);
    logTool(tool, `ok ${Date.now() - start}ms (json ${text.length} bytes, articles=${timelineR.rows.length}, entities=${entitiesR.rows.length}, sources=${mediaR.rows.length}, opportunities=${opportunitiesR.rows.length})`);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

// ─── SOCIAL INTELLIGENCE DOMAIN ─────────────────────────────────────────────

server.registerTool("social_dashboard", { description: "Social Intelligence dashboard - operational metrics matching /social/stats exactly", inputSchema: z.object({}) }, async () => {
  const tool = "social_dashboard";
  const start = Date.now();
  logTool(tool, "CALLED");

  try {
    const [p, s, yt, fb, xq, ig, st, today, cls, gaps, gaps2] = await Promise.all([
      pool.query(`SELECT count(*) as total, COALESCE(sum(views), 0) as engagement FROM social_posts WHERE captured_at >= now() - interval '48 hours'`),
      pool.query(`SELECT count(*) as total FROM social_sources WHERE enabled = true`),
      pool.query(`SELECT count(*) as total FROM social_sources WHERE platform = 'youtube'   AND enabled = true`),
      pool.query(`SELECT count(*) as total FROM social_sources WHERE platform = 'facebook'  AND enabled = true`),
      pool.query(`SELECT count(*) as total FROM social_sources WHERE platform = 'x'         AND enabled = true`),
      pool.query(`SELECT count(*) as total FROM social_sources WHERE platform = 'instagram' AND enabled = true`),
      pool.query(`SELECT count(*) as total FROM social_sources`),
      pool.query(`SELECT count(*) as total FROM social_posts WHERE captured_at >= now() - interval '24 hours'`),
      pool.query(`SELECT count(*) as total FROM social_clusters WHERE status = 'active'`),
      pool.query(`SELECT count(*) as total FROM social_clusters WHERE status = 'active' AND gap_score >= 0.7 AND viral_score > 10`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`
        SELECT
          count(*) FILTER (WHERE opportunity_score >= 70) as muy_alta,
          count(*) FILTER (WHERE opportunity_score >= 40 AND opportunity_score < 70) as media,
          count(*) FILTER (WHERE opportunity_score > 0 AND opportunity_score < 40) as baja
        FROM social_clusters WHERE status='active'
      `).catch(() => ({ rows: [{ muy_alta: 0, media: 0, baja: 0 }] })),
    ]);

    const opp = gaps2.rows[0];
    const response = {
      generated_at: new Date().toISOString(),
      posts_today: parseInt(today.rows[0]?.total ?? 0),
      clusters_active: parseInt(cls.rows[0]?.total ?? 0),
      total_engagement_active: parseInt(p.rows[0]?.engagement ?? 0),
      content_gaps: parseInt(gaps.rows[0]?.total ?? 0),
      opportunities_muy_alta: parseInt(opp.muy_alta ?? 0),
      opportunities_media: parseInt(opp.media ?? 0),
      opportunities_baja: parseInt(opp.baja ?? 0),
      youtube_sources: parseInt(yt.rows[0]?.total ?? 0),
      facebook_sources: parseInt(fb.rows[0]?.total ?? 0),
      x_sources: parseInt(xq.rows[0]?.total ?? 0),
      instagram_sources: parseInt(ig.rows[0]?.total ?? 0),
      sources_total: parseInt(st.rows[0]?.total ?? 0),
      sources_active: parseInt(s.rows[0]?.total ?? 0)
    };

    logTool(tool, `ok ${Date.now() - start}ms`);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

server.registerTool("social_trending", { description: "List trending social clusters with viral content, filtering by platform, recency, and engagement", inputSchema: socialTrendingSchema }, async (args) => {
  const tool = "social_trending";
  const start = Date.now();
  logTool(tool, `CALLED limit=${args.limit} offset=${args.offset} platform=${args.platform} hours=${args.hours} sort=${args.sort}`);

  try {
    const limit = Math.min(args.limit || 50, 300);
    const offset = args.offset || 0;
    const hours = args.hours || 0;
    const platform = args.platform || '';
    const sort = args.sort || 'trend';

    const params = [];
    let timeCondition = '';
    let platformCondition = '';

    if (hours > 0) {
      params.push(hours);
      timeCondition = `AND sc.last_seen >= now() - make_interval(hours => $${params.length})`;
    }
    if (platform) {
      params.push(platform);
      platformCondition = `AND $${params.length} = ANY(COALESCE(agg.platforms, '{}'))`;
    }

    const sortClause = {
      recent: 'sc.last_seen DESC',
      engagement: 'sc.total_engagement DESC, sc.viral_score DESC',
      trend: 'trend_score DESC, sc.total_engagement DESC',
    }[sort] || 'trend_score DESC, sc.total_engagement DESC';

    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT sc.*,
        COUNT(*) OVER()::int AS total_count,
        COALESCE(sc.opportunity_score, 0) AS opportunity_score,
        CASE WHEN COALESCE(sc.opportunity_score,0) >= 70 THEN 'MUY_ALTA'
             WHEN COALESCE(sc.opportunity_score,0) >= 40 THEN 'MEDIA'
             ELSE 'BAJA' END AS opportunity_tier,
        ROUND(
          COALESCE(sc.total_engagement, 0)::numeric /
          GREATEST(EXTRACT(EPOCH FROM (now() - sc.last_seen)) / 60, 1),
        4) AS trend_score,
        COALESCE(agg.platforms, '{}') AS platforms,
        COALESCE(agg.regions,   '{}') AS regions,
        COALESCE(agg.sources,   '{}') AS sources
      FROM social_clusters sc
      LEFT JOIN (
        SELECT scp.cluster_id,
          ARRAY_AGG(DISTINCT ss.platform) FILTER (WHERE ss.platform IS NOT NULL) AS platforms,
          ARRAY_AGG(DISTINCT ss.region)   FILTER (WHERE ss.region   IS NOT NULL) AS regions,
          ARRAY_AGG(DISTINCT ss.name)     FILTER (WHERE ss.name     IS NOT NULL) AS sources
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        JOIN social_sources ss ON ss.id = sp.source_id
        GROUP BY scp.cluster_id
      ) agg ON agg.cluster_id = sc.id
      WHERE sc.status = 'active'
        ${timeCondition}
        ${platformCondition}
      ORDER BY ${sortClause}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = rows[0]?.total_count ?? 0;
    const items = rows.map(({ total_count, ...r }) => r);

    logTool(tool, `ok ${Date.now() - start}ms (${items.length}/${total} items)`);
    return { content: [{ type: "text", text: JSON.stringify({ items, total, offset, limit }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

server.registerTool("social_open", { description: "Open a social cluster with all posts, engagement metrics, content gap analysis, and editorial opportunities", inputSchema: socialOpenSchema }, async (args) => {
  const tool = "social_open";
  const start = Date.now();
  logTool(tool, `CALLED id=${args.id}`);

  try {
    if (!args.id) {
      logTool(tool, `ERROR: id is required`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "INVALID_SELECTOR", message: "id is required" }) }], isError: true };
    }

    const { rows: [cluster] } = await pool.query(`
      SELECT * FROM social_clusters WHERE id = $1
    `, [args.id]);

    if (!cluster) {
      logTool(tool, `NOT_FOUND: id=${args.id}`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND", message: "Social cluster not found" }) }], isError: true };
    }

    const [postsR, entitiesR, sourcesR] = await Promise.all([
      pool.query(`
        SELECT sp.id, sp.title, sp.url, sp.platform,
               sp.views, sp.likes, sp.comments, sp.shares, sp.engagement_score,
               sp.captured_at, sp.thumbnail_url,
               ss.name AS source_name,
               CASE
                 WHEN sp.platform = 'youtube' AND sp.url LIKE '%/shorts/%' THEN 'shorts'
                 WHEN sp.platform = 'youtube' AND (sp.url LIKE '%watch?v=%' OR sp.url LIKE '%youtu.be/%') THEN 'videos'
                 WHEN sp.platform = 'youtube' AND (sp.url LIKE '%/post/%' OR sp.url LIKE '%/community%') THEN 'posts'
                 ELSE ss.content_type
               END AS content_type,
               sp.transcript_available,
               vt.post_id IS NOT NULL AS has_transcript,
               ta.post_id IS NOT NULL AS has_analysis
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        JOIN social_sources ss ON ss.id = sp.source_id
        LEFT JOIN video_transcripts vt ON vt.post_id = sp.id
        LEFT JOIN transcript_analysis ta ON ta.post_id = sp.id
        WHERE scp.cluster_id = $1
        ORDER BY sp.captured_at ASC
      `, [args.id]),
      pool.query(`
        SELECT DISTINCT sp.keywords
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        WHERE scp.cluster_id = $1
      `, [args.id]),
      pool.query(`
        SELECT DISTINCT ss.id, ss.name, ss.platform, ss.region,
               COUNT(sp.id) OVER (PARTITION BY ss.id)::int AS post_count
        FROM social_cluster_posts scp
        JOIN social_posts sp ON sp.id = scp.post_id
        JOIN social_sources ss ON ss.id = sp.source_id
        WHERE scp.cluster_id = $1
      `, [args.id])
    ]);

    const response = {
      schema_version: "1.0",
      metadata: {
        id: cluster.id,
        title: cluster.title,
        viral_score: cluster.viral_score,
        gap_score: parseFloat(cluster.gap_score || 0),
        opportunity_score: parseFloat(cluster.opportunity_score || 0),
        opportunity_tier: cluster.opportunity_score >= 70 ? 'MUY_ALTA' : cluster.opportunity_score >= 40 ? 'MEDIA' : 'BAJA',
        status: cluster.status,
        created_at: cluster.first_seen,
        updated_at: cluster.last_seen
      },
      coverage: {
        post_count: cluster.post_count || 0,
        source_count: cluster.source_count || 0,
        total_engagement: cluster.total_engagement || 0,
        platforms: cluster.platforms || []
      },
      posts: postsR.rows,
      sources: [...new Map(sourcesR.rows.map(s => [s.id, s])).values()],
      keywords: [...new Set(entitiesR.rows.flatMap(r => r.keywords || []))],
      provenance: {
        generated_at: new Date().toISOString(),
        pipeline_version: "1.0"
      }
    };

    logTool(tool, `ok ${Date.now() - start}ms (posts=${postsR.rows.length}, sources=${sourcesR.length})`);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

server.registerTool("social_content_open", { description: "Open a social post with transcript, analysis, and editorial context", inputSchema: socialContentOpenSchema }, async (args) => {
  const tool = "social_content_open";
  const start = Date.now();
  logTool(tool, `CALLED id=${args.id}`);

  try {
    if (!args.id) {
      logTool(tool, `ERROR: id is required`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "INVALID_SELECTOR", message: "id is required" }) }], isError: true };
    }

    const { rows: [post] } = await pool.query(`
      SELECT sp.*, ss.name AS source_name
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE sp.id = $1
    `, [args.id]);

    if (!post) {
      logTool(tool, `NOT_FOUND: id=${args.id}`);
      return { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND", message: "Social post not found" }) }], isError: true };
    }

    const [transcriptR, analysisR, clusterR] = await Promise.all([
      pool.query(`
        SELECT transcript_text, transcript_language, transcript_source, word_count, quality_score
        FROM video_transcripts
        WHERE post_id = $1
      `, [args.id]),
      pool.query(`
        SELECT summary, key_points, entities_people, entities_places, entities_orgs,
               main_topics, quotes, keywords, editorial_type
        FROM transcript_analysis
        WHERE post_id = $1
      `, [args.id]),
      pool.query(`
        SELECT DISTINCT sc.id, sc.title, sc.viral_score, sc.opportunity_score
        FROM social_cluster_posts scp
        JOIN social_clusters sc ON sc.id = scp.cluster_id
        WHERE scp.post_id = $1
      `, [args.id])
    ]);

    const response = {
      schema_version: "1.0",
      metadata: {
        id: post.id,
        title: post.title,
        url: post.url,
        platform: post.platform,
        source: post.source_name,
        published_at: post.published_at,
        captured_at: post.captured_at
      },
      engagement: {
        views: post.views || 0,
        likes: post.likes || 0,
        comments: post.comments || 0,
        shares: post.shares || 0,
        engagement_score: post.engagement_score || 0
      },
      transcript: transcriptR.rows[0] ? {
        text: transcriptR.rows[0].transcript_text,
        language: transcriptR.rows[0].transcript_language,
        source: transcriptR.rows[0].transcript_source,
        word_count: transcriptR.rows[0].word_count,
        quality_score: transcriptR.rows[0].quality_score
      } : null,
      analysis: analysisR.rows[0] || null,
      cluster: clusterR.rows[0] || null,
      provenance: {
        generated_at: new Date().toISOString(),
        pipeline_version: "1.0"
      }
    };

    logTool(tool, `ok ${Date.now() - start}ms (transcript=${!!transcriptR.rows[0]}, analysis=${!!analysisR.rows[0]})`);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

server.registerTool("social_opportunities", { description: "List editorial opportunities from social intelligence with tier-based filtering and engagement analysis", inputSchema: socialOpportunitiesSchema }, async (args) => {
  const tool = "social_opportunities";
  const start = Date.now();
  logTool(tool, `CALLED limit=${args.limit} offset=${args.offset} tier=${args.tier} hours=${args.hours} region=${args.region} platform=${args.platform}`);

  try {
    const limit = Math.min(args.limit || 50, 100);
    const offset = args.offset || 0;
    const hours = args.hours || 0;
    const tier = args.tier || '';
    const region = args.region || '';
    const platform = args.platform || '';

    const params = [];

    let tierCondition = '';
    if (tier === 'MUY_ALTA') tierCondition = 'AND sc.opportunity_score >= 70';
    else if (tier === 'MEDIA') tierCondition = 'AND sc.opportunity_score >= 40 AND sc.opportunity_score < 70';
    else if (tier === 'BAJA') tierCondition = 'AND sc.opportunity_score > 0 AND sc.opportunity_score < 40';

    let timeCondition = '';
    if (hours > 0) {
      params.push(hours);
      timeCondition = `AND sc.last_seen >= now() - make_interval(hours => $${params.length})`;
    }

    let regionCondition = '';
    if (region) {
      params.push(region);
      regionCondition = `AND $${params.length} = ANY(regions)`;
    }

    let platformCondition = '';
    if (platform) {
      params.push(platform);
      platformCondition = `AND $${params.length} = ANY(platforms)`;
    }

    params.push(limit, offset);

    const { rows } = await pool.query(`
      SELECT * FROM (
        SELECT
          COUNT(*) OVER()::int AS total_count,
          sc.id, sc.title,
          sc.viral_score,
          round(sc.gap_score::numeric, 2) AS gap_score,
          round(COALESCE(sc.opportunity_score,0)::numeric, 1) AS opportunity_score,
          CASE WHEN COALESCE(sc.opportunity_score,0) >= 70 THEN 'MUY_ALTA'
               WHEN COALESCE(sc.opportunity_score,0) >= 40 THEN 'MEDIA'
               ELSE 'BAJA' END AS opportunity_tier,
          sc.total_engagement, sc.source_count, sc.post_count,
          sc.last_seen, sc.first_seen,
          ARRAY_AGG(DISTINCT ss.region) FILTER (WHERE ss.region IS NOT NULL) AS regions,
          ARRAY_AGG(DISTINCT ss.name) FILTER (WHERE ss.name IS NOT NULL) AS source_names,
          ARRAY_AGG(DISTINCT ss.platform) FILTER (WHERE ss.platform IS NOT NULL) AS platforms,
          COUNT(sp.id) FILTER (WHERE sp.transcript_available = true)::int AS transcripts_available,
          COUNT(sp.id) FILTER (WHERE sp.platform = 'youtube')::int AS youtube_posts,
          COUNT(ta.id) FILTER (WHERE ta.id IS NOT NULL)::int AS has_analysis_count
        FROM social_clusters sc
        LEFT JOIN social_cluster_posts scp ON scp.cluster_id = sc.id
        LEFT JOIN social_posts sp ON sp.id = scp.post_id
        LEFT JOIN social_sources ss ON ss.id = sp.source_id
        LEFT JOIN transcript_analysis ta ON ta.post_id = sp.id
        WHERE sc.status = 'active'
          AND COALESCE(sc.opportunity_score, 0) > 0
          ${tierCondition}
          ${timeCondition}
        GROUP BY sc.id
      ) t
      WHERE 1=1 ${regionCondition} ${platformCondition}
      ORDER BY t.opportunity_score DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = rows[0]?.total_count ?? 0;
    const items = rows.map(({ total_count, ...r }) => r);

    const summary = {
      muy_alta: items.filter(i => i.opportunity_tier === 'MUY_ALTA').length,
      media: items.filter(i => i.opportunity_tier === 'MEDIA').length,
      baja: items.filter(i => i.opportunity_tier === 'BAJA').length,
      total
    };

    logTool(tool, `ok ${Date.now() - start}ms (${items.length}/${total} items, muy_alta=${summary.muy_alta}, media=${summary.media}, baja=${summary.baja})`);
    return { content: [{ type: "text", text: JSON.stringify({ items, total, offset, limit, summary }) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

// POSTS DOMAIN TOOLS (Editorial Workflow)
server.registerTool("posts.dashboard", { description: "Posts operational dashboard", inputSchema: z.object({}) }, async () => {
  const tool = "posts.dashboard";
  const start = Date.now();
  try {
    const [total, drafts, published, scheduled] = await Promise.all([
      pool.query(`SELECT count(*) as total FROM articles`),
      pool.query(`SELECT count(*) as total FROM articles WHERE status='draft'`),
      pool.query(`SELECT count(*) as total FROM articles WHERE status='published'`),
      pool.query(`SELECT count(*) as total FROM articles WHERE scheduled_at > now()`)
    ]);
    const response = { generated_at: new Date().toISOString(), metrics: { total_posts: parseInt(total.rows[0]?.total ?? 0), drafts_count: parseInt(drafts.rows[0]?.total ?? 0), published_count: parseInt(published.rows[0]?.total ?? 0), scheduled_count: parseInt(scheduled.rows[0]?.total ?? 0) } };
    logTool(tool, `ok ${Date.now() - start}ms`);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    logTool(tool, `ERROR ${Date.now() - start}ms: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: "ERROR", message: error.message }) }], isError: true };
  }
});

server.registerTool("posts.list", { description: "List posts with filters", inputSchema: postsListSchema }, async (params) => {
  const tool = "posts.list";
  const start = Date.now();
  try {
    const { limit, offset, status, author, category, search, sort } = params;
    const qp = [];
    let w = "WHERE 1=1";
    if (status) w += ` AND a.status = $${qp.push(status)}`;
    if (author) w += ` AND u.email = $${qp.push(author)}`;
    if (search) w += ` AND a.search_tsv @@ plainto_tsquery('simple', $${qp.push(search)})`;
    let ob = "a.created_at DESC";
    if (sort === 'oldest') ob = "a.created_at ASC";
    if (sort === 'title') ob = "a.title ASC";
    const cnt = await pool.query(`SELECT count(*) FROM articles a JOIN users u ON u.id = a.author_id ${w}`, qp);
    const res = await pool.query(`SELECT a.id, a.slug, a.title, a.excerpt, a.status, a.published_at, a.image_url, u.email, a.word_count, json_agg(json_build_object('slug', c.slug, 'name', c.name)) AS categories FROM articles a JOIN users u ON u.id = a.author_id LEFT JOIN article_categories ac ON ac.article_id = a.id LEFT JOIN categories c ON c.id = ac.category_id ${w} GROUP BY a.id, u.id ORDER BY ${ob} LIMIT $${qp.push(limit)} OFFSET $${qp.push(offset)}`, qp);
    const items = res.rows.map(r => ({ id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, status: r.status, author_email: r.email, published_at: r.published_at, featured_image_url: r.image_url, word_count: r.word_count, categories: r.categories }));
    logTool(tool, `ok ${Date.now() - start}ms`);
    return { content: [{ type: "text", text: JSON.stringify({ items, total: parseInt(cnt.rows[0]?.count ?? 0), offset, limit }) }] };
  } catch (e) {
    logTool(tool, `ERROR: ${e.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.open", { description: "Get complete post resource", inputSchema: postsOpenSchema }, async (params) => {
  const tool = "posts.open";
  const start = Date.now();
  try {
    const res = await pool.query(`SELECT a.*, u.email, u.name, s.meta_title, s.meta_description, s.canonical_url, s.og_title, s.og_description, s.keywords, json_agg(json_build_object('slug', c.slug, 'name', c.name)) AS categories FROM articles a JOIN users u ON u.id = a.author_id LEFT JOIN article_seo s ON s.article_id = a.id LEFT JOIN article_categories ac ON ac.article_id = a.id LEFT JOIN categories c ON c.id = ac.category_id WHERE a.id = $1 OR a.slug = $1 GROUP BY a.id, u.id, s.id LIMIT 1`, [params.id]);
    if (!res.rows[0]) return { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND" }) }], isError: true };
    const a = res.rows[0];
    const resp = { schema_version: "1.0", metadata: { id: a.id, slug: a.slug, author: { email: a.email, name: a.name }, created_at: a.created_at, updated_at: a.updated_at, status: a.status }, content: { title: a.title, excerpt: a.excerpt, body: a.body, word_count: a.word_count }, seo: { meta_title: a.meta_title, meta_description: a.meta_description, canonical_url: a.canonical_url, og_title: a.og_title, og_description: a.og_description, keywords: a.keywords ? a.keywords.split(',').map(k => k.trim()) : [] }, featured_image: { url: a.image_url, caption: a.epigraph }, categories: a.categories, publication: { status: a.status, published_at: a.published_at, scheduled_at: a.scheduled_at }, provenance: { generated_at: new Date().toISOString(), pipeline_version: "posts.open/1.0" } };
    logTool(tool, `ok ${Date.now() - start}ms`);
    return { content: [{ type: "text", text: JSON.stringify(resp) }] };
  } catch (e) {
    logTool(tool, `ERROR: ${e.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.create", { description: "Create new post draft", inputSchema: postsCreateSchema }, async (params) => {
  const tool = "posts.create";
  try {
    const uid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await pool.query(`INSERT INTO articles (author_id, title, slug, body, excerpt, status, word_count, origin) VALUES ($1, $2, $3, $4, $5, 'draft', $6, 'manual') RETURNING id, slug, status`, [uid, params.title, params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), params.content, params.excerpt || '', Math.ceil((params.content.split(/\s+/).length))]);
    return { content: [{ type: "text", text: JSON.stringify(res.rows[0]) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.update", { description: "Update post fields", inputSchema: postsUpdateSchema }, async (params) => {
  const tool = "posts.update";
  try {
    const qp = [];
    const sf = [];
    if (params.title) sf.push(`title = $${qp.push(params.title)}`);
    if (params.content) { sf.push(`body = $${qp.push(params.content)}`); sf.push(`word_count = $${qp.push(Math.ceil((params.content.split(/\s+/).length))}`); }
    if (params.excerpt !== undefined) sf.push(`excerpt = $${qp.push(params.excerpt)}`);
    if (params.status) sf.push(`status = $${qp.push(params.status)}`);
    sf.push(`updated_at = $${qp.push(new Date())}`);
    qp.push(params.id);
    const res = await pool.query(`UPDATE articles SET ${sf.join(', ')} WHERE id = $${qp.length} RETURNING id, status, updated_at`, qp);
    if (params.seo) await pool.query(`INSERT INTO article_seo (article_id, meta_title, meta_description, canonical_url, og_title, og_description, keywords) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (article_id) DO UPDATE SET meta_title = COALESCE($2, article_seo.meta_title), meta_description = COALESCE($3, article_seo.meta_description)`, [params.id, params.seo.meta_title, params.seo.meta_description, params.seo.canonical_url, params.seo.og_title, params.seo.og_description, params.seo.keywords]);
    return { content: [{ type: "text", text: JSON.stringify(res.rows[0]) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.publish", { description: "Publish post", inputSchema: postsPublishSchema }, async (params) => {
  try {
    const res = await pool.query(`UPDATE articles SET status = 'published', published_at = now() WHERE id = $1 RETURNING id, status, published_at`, [params.id]);
    return res.rows[0] ? { content: [{ type: "text", text: JSON.stringify(res.rows[0]) }] } : { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND" }) }], isError: true };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.schedule", { description: "Schedule post", inputSchema: postsScheduleSchema }, async (params) => {
  try {
    const res = await pool.query(`UPDATE articles SET status = 'scheduled', scheduled_at = $1 WHERE id = $2 RETURNING id, status, scheduled_at`, [params.scheduled_at, params.id]);
    return res.rows[0] ? { content: [{ type: "text", text: JSON.stringify(res.rows[0]) }] } : { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND" }) }], isError: true };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.unpublish", { description: "Unpublish post", inputSchema: postsPublishSchema }, async (params) => {
  try {
    const res = await pool.query(`UPDATE articles SET status = 'draft', published_at = null WHERE id = $1 RETURNING id, status`, [params.id]);
    return res.rows[0] ? { content: [{ type: "text", text: JSON.stringify(res.rows[0]) }] } : { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND" }) }], isError: true };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

server.registerTool("posts.delete", { description: "Delete post", inputSchema: postsDeleteSchema }, async (params) => {
  try {
    const res = await pool.query(`DELETE FROM articles WHERE id = $1 RETURNING id`, [params.id]);
    return res.rows[0] ? { content: [{ type: "text", text: JSON.stringify({ deleted: true, id: res.rows[0].id }) }] } : { content: [{ type: "text", text: JSON.stringify({ error: "NOT_FOUND" }) }], isError: true };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

console.error("TOOLS REGISTERED:");
console.error([
  "ping",
  "agenda_snapshot",
  "topic_snapshot",
  "story_get",
  "stories_search",
  "coverage_timeline",
  "social_top",
  "events_search",
  "opportunities_top",
  "monitor_dashboard",
  "monitor_system",
  "monitor_feed",
  "monitor_stories",
  "monitor_events",
  "monitor_opportunities",
  "monitor_sources",
  "story_open",
  "content_open",
  "editorial_list",
  "editorial_open",
  "social_dashboard",
  "social_trending",
  "social_open",
  "social_content_open",
  "social_opportunities",
  "posts.dashboard",
  "posts.list",
  "posts.open",
  "posts.create",
  "posts.update",
  "posts.publish",
  "posts.schedule",
  "posts.unpublish",
  "posts.delete"
].join("\n"));

async function main() {
  log("Connecting to transport...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP ready");
}

log("Starting main()...");
main().catch(err => {
  console.error("[MCP] FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
