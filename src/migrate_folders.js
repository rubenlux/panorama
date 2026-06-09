import { query, pool } from "./routes/db.js";

async function run() {
    try {
        console.log("Adding folder column to media table...");
        await query("ALTER TABLE media ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT 'general'");
        console.log("Done!");
        await pool.end(); // Close connection to exit process
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}

run();
