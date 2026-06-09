import "dotenv/config";
import cron from "node-cron";
import { calculateAdRevenue } from "./jobs/calculateAdRevenue.js";
import { runNewsMonitor }     from "./jobs/newsMonitor.js";
import { pool } from "./routes/db.js";

console.log("Starting Panorama Worker...");

// Verify DB Connection
pool.query("SELECT NOW()").then(() => {
    console.log("✅ Worker connected to Database.");

    // Run news monitor immediately on start, then every minute
    runNewsMonitor().catch(e => console.error("❌ News Monitor initial run failed:", e.message));
    cron.schedule("* * * * *", () => {
        runNewsMonitor().catch(e => console.error("❌ News Monitor error:", e.message));
    });
    console.log("📡 News Intelligence Monitor: running every 60s");

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

process.on('SIGINT', () => {
    console.log("🛑 Worker stopping...");
    pool.end();
    process.exit();
});
