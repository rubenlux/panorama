import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log("Creating ad_revenue table...");

        await pool.query(`
      CREATE TABLE IF NOT EXISTS ad_revenue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id UUID NOT NULL REFERENCES ads(id),
        impressions INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (ad_id, period_start, period_end)
      );
    `);

        console.log("✅ Table ad_revenue created successfully.");
    } catch (e) {
        console.error("Error running migration:", e);
    } finally {
        await pool.end();
    }
}

run();
