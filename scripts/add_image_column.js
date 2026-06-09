import { pool } from "../src/routes/db.js";

async function fix() {
    try {
        console.log("Adding image column to articles table...");
        await pool.query(`
      ALTER TABLE articles 
      ADD COLUMN IF NOT EXISTS image text;
    `);
        console.log("Success! image column added.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        pool.end();
    }
}

fix();
