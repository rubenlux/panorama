#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5435/newsdb"
});

const server = new McpServer({ name: "panorama-mcp-server", version: "1.0.0" });

const agendaSchema = z.object({ limit: z.number().default(10) });
const topicSchema = z.object({ entity: z.string(), hours: z.number().default(24) });
const storySchema = z.object({ id: z.number() });
const searchSchema = z.object({ entity: z.string().optional(), limit: z.number().default(10) });
const coverageSchema = z.object({ entity: z.string(), days: z.number().default(7) });
const limitSchema = z.object({ limit: z.number().default(10) });

server.registerTool("agenda_snapshot", { description: "Get complete editorial agenda", inputSchema: agendaSchema }, async (args) => {
  try {
    const limit = args.limit || 10;
    const [s, e, so, o] = await Promise.all([
      pool.query(`SELECT id, title, importance_score FROM story_clusters ORDER BY importance_score DESC LIMIT $1`, [limit]),
      pool.query(`SELECT id, title, editorial_score FROM event_clusters ORDER BY editorial_score DESC LIMIT $1`, [limit]),
      pool.query(`SELECT id, title, viral_score FROM social_clusters ORDER BY viral_score DESC LIMIT $1`, [limit]),
      pool.query(`SELECT id, title, composite_score FROM story_opportunities WHERE status = 'pending' ORDER BY composite_score DESC LIMIT $1`, [limit]),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ stories: s.rows, events: e.rows, social: so.rows, opportunities: o.rows }) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("topic_snapshot", { description: "Get snapshot of a topic", inputSchema: topicSchema }, async (args) => {
  try {
    const e = args.entity;
    const h = args.hours || 24;
    const [s, a, c] = await Promise.all([
      pool.query(`SELECT id, title, importance_score FROM story_clusters WHERE title ILIKE $1 ORDER BY importance_score DESC LIMIT 5`, [`%${e}%`]),
      pool.query(`SELECT id, title, source_name, detected_at FROM monitored_articles WHERE title ILIKE $1 AND detected_at > NOW() - INTERVAL '1 hour' * $2 ORDER BY detected_at DESC LIMIT 10`, [`%${e}%`, h]),
      pool.query(`SELECT source_name, COUNT(*) as count FROM monitored_articles WHERE title ILIKE $1 AND detected_at > NOW() - INTERVAL '1 hour' * $2 GROUP BY source_name ORDER BY count DESC`, [`%${e}%`, h]),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ entity: e, stories: s.rows, articles: a.rows, coverage: c.rows }) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("story_get", { description: "Get complete story cluster", inputSchema: storySchema }, async (args) => {
  try {
    const [s, a, c] = await Promise.all([
      pool.query(`SELECT * FROM story_clusters WHERE id = $1`, [args.id]),
      pool.query(`SELECT ma.* FROM monitored_articles ma JOIN story_cluster_articles sca ON sca.article_id = ma.id WHERE sca.story_id = $1`, [args.id]),
      pool.query(`SELECT source_name, COUNT(*) as count FROM monitored_articles ma JOIN story_cluster_articles sca ON sca.article_id = ma.id WHERE sca.story_id = $1 GROUP BY source_name`, [args.id]),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ story: s.rows[0], articles: a.rows, coverage: c.rows }) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("stories_search", { description: "Search stories", inputSchema: searchSchema }, async (args) => {
  try {
    let q = `SELECT id, title, importance_score FROM story_clusters ORDER BY importance_score DESC LIMIT $1`;
    let p = [args.limit || 10];
    if (args.entity) {
      q = `SELECT id, title, importance_score FROM story_clusters WHERE title ILIKE $1 ORDER BY importance_score DESC LIMIT $2`;
      p = [`%${args.entity}%`, args.limit || 10];
    }
    const r = await pool.query(q, p);
    return { content: [{ type: "text", text: JSON.stringify(r.rows) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("coverage_timeline", { description: "Get coverage timeline", inputSchema: coverageSchema }, async (args) => {
  try {
    const r = await pool.query(
      `SELECT source_name, title, url, detected_at FROM monitored_articles WHERE title ILIKE $1 AND detected_at > NOW() - INTERVAL '1 day' * $2 ORDER BY detected_at ASC LIMIT 50`,
      [`%${args.entity}%`, args.days || 7]
    );
    return { content: [{ type: "text", text: JSON.stringify(r.rows) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("social_top", { description: "Get top social posts", inputSchema: limitSchema }, async (args) => {
  try {
    const r = await pool.query(`SELECT id, title, viral_score FROM social_clusters ORDER BY viral_score DESC LIMIT $1`, [args.limit || 10]);
    return { content: [{ type: "text", text: JSON.stringify(r.rows) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("events_search", { description: "Search events", inputSchema: limitSchema }, async (args) => {
  try {
    const r = await pool.query(`SELECT id, title, editorial_score FROM event_clusters ORDER BY editorial_score DESC LIMIT $1`, [args.limit || 10]);
    return { content: [{ type: "text", text: JSON.stringify(r.rows) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

server.registerTool("opportunities_top", { description: "Get opportunities", inputSchema: limitSchema }, async (args) => {
  try {
    const r = await pool.query(`SELECT id, title, composite_score FROM story_opportunities WHERE status = 'pending' ORDER BY composite_score DESC LIMIT $1`, [args.limit || 10]);
    return { content: [{ type: "text", text: JSON.stringify(r.rows) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
