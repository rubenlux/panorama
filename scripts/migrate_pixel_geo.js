
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    try {
        console.log("Adding Geo and UTM columns to pixel_events...");
        await pool.query(`
      ALTER TABLE pixel_events 
      ADD COLUMN IF NOT EXISTS geo_country VARCHAR(2),
      ADD COLUMN IF NOT EXISTS geo_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100),
      ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100),
      ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
    `);
        console.log("Migration successful!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        pool.end();
    }
}

migrate();
