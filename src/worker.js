import "dotenv/config";
import cron from "node-cron";
import { calculateAdRevenue } from "./jobs/calculateAdRevenue.js";
import { runNewsMonitor, recalcFreshness } from "./jobs/newsMonitor.js";
import { runSocialMonitor }   from "./jobs/socialMonitor.js";
import { trackedSourceMonitor } from "./jobs/trackedSourceMonitor.js";
import { runCrawlerScheduler } from "./jobs/crawlerScheduler.js";
import { pool } from "./routes/db.js";
import { ensureObservabilitySchema, logEvent } from "./jobs/workerUtils.js";
import { closeBrowser } from "./connectors/playwright.js";

console.log("Starting Panorama Worker...");

// Verify DB Connection
pool.query("SELECT NOW()").then(async () => {
    console.log("✅ Worker connected to Database.");

    // Initialize observability tables once on startup (idempotent)
    await ensureObservabilitySchema().catch(e => console.warn("⚠️ Observability schema init failed:", e.message));
    await logEvent('worker_started', 'system', { pid: process.pid });

    // Run news monitor immediately on start, then every minute
    runNewsMonitor().catch(e => console.error("❌ News Monitor initial run failed:", e.message));
    cron.schedule("* * * * *", () => {
        runNewsMonitor().catch(e => console.error("❌ News Monitor error:", e.message));
    });
    console.log("📡 News Intelligence Monitor: running every 60s");

    // P1: Crawler Scheduler — process PENDING/RETRY articles every 30 seconds
    runCrawlerScheduler().catch(e => console.error("❌ Crawler Scheduler initial run failed:", e.message));
    cron.schedule("*/30 * * * * *", () => {
        runCrawlerScheduler().catch(e => console.error("❌ Crawler Scheduler error:", e.message));
    });
    console.log("🔄 P1 Crawler Scheduler: running every 30s");

    // Run social monitor immediately on start, then every 5 minutes
    runSocialMonitor().catch(e => console.error("❌ Social Monitor initial run failed:", e.message));
    cron.schedule("*/5 * * * *", () => {
      runSocialMonitor().catch(e => console.error("❌ Social Monitor error:", e.message));
    });
    console.log("📱 Social Intelligence Monitor: running every 5min");
    
    // Coverage Monitor (Tracked Sources) - every 5 minutes
    trackedSourceMonitor().catch(e => console.error("❌ Tracked Source initial run failed:", e.message));
    cron.schedule("*/5 * * * *", () => {
      trackedSourceMonitor().catch(e => console.error("❌ Tracked Source error:", e.message));
    });
    console.log("📡 Coverage Monitor: running every 5min");

    // Recalculate freshness scores every 30 minutes (independent of ingestion cycle)
    recalcFreshness().catch(e => console.error("❌ Freshness initial recalc failed:", e.message));
    cron.schedule("*/30 * * * *", () => {
      recalcFreshness().catch(e => console.error("❌ Freshness recalc error:", e.message));
    });
    console.log("🔄 Freshness Recalc: running every 30min");

}).catch(err => {
    console.error("❌ Worker DB Connection Failed:", err);
    process.exit(1);
});

// Schedule Daily Revenue Calculation (00:05 AM)
cron.schedule("5 0 * * *", async () => {
    console.log("🔄 Running Daily Revenue Job...");
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    try {
        await calculateAdRevenue(start, end);
        console.log("✅ Revenue Calculated Successfully.");
    } catch (e) {
        console.error("❌ Error in Revenue Job:", e);
    }
});

console.log("📅 Revenue Job Scheduled: Daily at 00:05 AM");

process.on('SIGINT', async () => {
    console.log("🛑 Worker stopping...");
    await logEvent('worker_stopped', 'system', { pid: process.pid }).catch(() => {});
    await closeBrowser().catch(() => {});
    pool.end();
    process.exit();
});
