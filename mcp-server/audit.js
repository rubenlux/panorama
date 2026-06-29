#!/usr/bin/env node

/**
 * MCP Tools Audit
 * Tests all 12 Panorama MCP tools to identify failures and SQL errors
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5435/newsdb"
});

const tests = {
  "agenda_snapshot": {
    query: `SELECT id, title, importance_score, last_seen FROM story_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY importance_score DESC LIMIT $2`,
    params: [7, 10],
    tables: ["story_clusters"],
    columns: ["importance_score", "last_seen"]
  },

  "topic_snapshot_stories": {
    query: `SELECT id, title, importance_score, last_seen FROM story_clusters WHERE title ILIKE $1 AND last_seen > NOW() - INTERVAL '1 day' * $2 ORDER BY importance_score DESC LIMIT 5`,
    params: ["%Boca%", 7],
    tables: ["story_clusters"],
    columns: ["importance_score", "last_seen"]
  },

  "topic_snapshot_articles": {
    query: `SELECT ma.id, ma.title, rs.name as source_name, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id WHERE ma.title ILIKE $1 AND ma.detected_at > NOW() - INTERVAL '1 hour' * $2 ORDER BY ma.detected_at DESC LIMIT 10`,
    params: ["%Boca%", 24],
    tables: ["monitored_articles", "rss_sources"],
    columns: ["source_name", "detected_at"]
  },

  "story_get": {
    query: `SELECT id, title, importance_score, detected_category, article_count FROM story_clusters WHERE id = $1`,
    params: ["550e8400-e29b-41d4-a716-446655440000"], // dummy UUID
    tables: ["story_clusters"],
    columns: ["importance_score", "detected_category", "article_count"]
  },

  "story_get_articles": {
    query: `SELECT ma.id, ma.title, rs.name as source_name, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id JOIN story_cluster_articles sca ON sca.article_id = ma.id WHERE sca.story_id = $1 ORDER BY ma.detected_at DESC`,
    params: ["550e8400-e29b-41d4-a716-446655440000"], // dummy UUID
    tables: ["monitored_articles", "rss_sources", "story_cluster_articles"],
    columns: ["source_name", "detected_at"]
  },

  "stories_search": {
    query: `SELECT id, title, importance_score, detected_category, last_seen FROM story_clusters WHERE title ILIKE $1 AND last_seen > NOW() - INTERVAL '1 day' * $2 ORDER BY importance_score DESC LIMIT $3`,
    params: ["%Boca%", 7, 10],
    tables: ["story_clusters"],
    columns: ["importance_score", "detected_category", "last_seen"]
  },

  "coverage_timeline": {
    query: `SELECT rs.name as source_name, ma.title, ma.url, ma.detected_at FROM monitored_articles ma LEFT JOIN rss_sources rs ON rs.id = ma.source_id WHERE ma.title ILIKE $1 AND ma.detected_at > NOW() - INTERVAL '1 day' * $2 ORDER BY ma.detected_at ASC LIMIT 100`,
    params: ["%Boca%", 7],
    tables: ["monitored_articles", "rss_sources"],
    columns: ["source_name", "url", "detected_at"]
  },

  "social_top": {
    query: `SELECT id, title, viral_score, total_engagement, last_seen FROM social_clusters WHERE last_seen > NOW() - INTERVAL '1 day' * $1 ORDER BY viral_score DESC LIMIT $2`,
    params: [1, 10],
    tables: ["social_clusters"],
    columns: ["viral_score", "total_engagement", "last_seen"]
  },

  "events_search": {
    query: `SELECT id, headline as title, editorial_score, last_updated_at FROM event_clusters WHERE last_updated_at > NOW() - INTERVAL '1 day' * $1 ORDER BY editorial_score DESC LIMIT $2`,
    params: [7, 10],
    tables: ["event_clusters"],
    columns: ["headline", "editorial_score", "last_updated_at"]
  },

  "opportunities_top": {
    query: `SELECT id, title, composite_score, trigger, created_at FROM story_opportunities WHERE status = 'pending' AND created_at > NOW() - INTERVAL '1 day' * $1 ORDER BY composite_score DESC LIMIT $2`,
    params: [7, 10],
    tables: ["story_opportunities"],
    columns: ["composite_score", "trigger", "created_at"]
  }
};

async function auditTool(name, test) {
  try {
    const result = await pool.query(test.query, test.params);
    return {
      name,
      status: "✅ OK",
      rows: result.rows.length,
      error: null,
      tables: test.tables,
      columns: test.columns
    };
  } catch (error) {
    return {
      name,
      status: "❌ FAILED",
      rows: 0,
      error: error.message,
      tables: test.tables,
      columns: test.columns
    };
  }
}

async function runAudit() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║            PANORAMA MCP TOOLS AUDIT                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const results = [];

  for (const [toolName, test] of Object.entries(tests)) {
    const result = await auditTool(toolName, test);
    results.push(result);

    const statusIcon = result.status.includes("✅") ? "✅" : "❌";
    console.log(`${statusIcon} ${result.name.padEnd(30)} | Tables: ${result.tables.join(", ")}`);

    if (result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}`);
    } else {
      console.log(`   Rows: ${result.rows}`);
    }
    console.log();
  }

  // Summary
  const passed = results.filter(r => r.status.includes("✅")).length;
  const failed = results.filter(r => r.status.includes("❌")).length;

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log(`║  SUMMARY: ${passed} PASSED  |  ${failed} FAILED                          ║`);
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // List failures
  if (failed > 0) {
    console.log("⚠️  FAILURES:");
    results.filter(r => r.status.includes("❌")).forEach(r => {
      console.log(`\n  ${r.name}`);
      console.log(`  Error: ${r.error}`);
      console.log(`  Tables used: ${r.tables.join(", ")}`);
      console.log(`  Columns used: ${r.columns.join(", ")}`);
    });
  }

  await pool.end();
}

runAudit();
