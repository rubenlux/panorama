import "dotenv/config";
import cron from "node-cron";
import { calculateAdRevenue } from "./jobs/calculateAdRevenue.js";
import { pool } from "./routes/db.js";

console.log("Starting Ads System Worker...");

// Verify DB Connection
pool.query("SELECT NOW()").then(() => {
    console.log("✅ Worker connected to Database.");
}).catch(err => {
    console.error("❌ Worker DB Connection Failed:", err);
    process.exit(1);
});

// Schedule Daily Revenue Calculation (00:05 AM)
cron.schedule("5 0 * * *", async () => {
    console.log("🔄 Running Daily Revenue Job (Automatic)...");
    const end = new Date();
    end.setHours(0, 0, 0, 0); // Today 00:00

    const start = new Date(end);
    start.setDate(start.getDate() - 1); // Yesterday 00:00

    try {
        await calculateAdRevenue(start, end);
        console.log("✅ Revenue Calculated Successfully.");
    } catch (e) {
        console.error("❌ Error in Revenue Job:", e);
    }
});

console.log("📅 Cron Job Scheduled: Daily at 00:05 AM");

// Keep process alive
process.on('SIGINT', () => {
    console.log("🛑 Worker stopping...");
    pool.end();
    process.exit();
});
