import { query } from "../src/routes/db.js";

async function run() {
    try {
        console.log("Repairing Subscribers Table...");

        // Add status column if missing
        await query(`
      ALTER TABLE subscribers 
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
    `);

        // Add created_at if missing (just in case)
        await query(`
      ALTER TABLE subscribers 
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    `);

        console.log("✅ Fixed subscribers table schema");
        process.exit(0);
    } catch (e) {
        console.error("Repair Failed", e);
        process.exit(1);
    }
}

run();
