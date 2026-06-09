import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log("Adding pricing columns to campaigns table...");

        // Add columns if they don't exist
        await pool.query(`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(10) DEFAULT 'CPM', -- CPM, CPC, FIXED
      ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
    `);

        console.log("✅ Columns added successfully.");
    } catch (e) {
        console.error("Error running migration:", e);
    } finally {
        await pool.end();
    }
}

run();
