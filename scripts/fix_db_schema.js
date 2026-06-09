import { pool } from "../src/routes/db.js";

async function fix() {
    try {
        console.log("Adding updated_at column to articles table...");
        await pool.query(`
      ALTER TABLE articles 
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    `);
        console.log("Success! updated_at column added.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        pool.end();
    }
}

fix();
