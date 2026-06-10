import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE tracked_sources
        ADD COLUMN IF NOT EXISTS last_verification_notes TEXT,
        ADD COLUMN IF NOT EXISTS last_format_detected    VARCHAR(40);
    `);
    await client.query("COMMIT");
    console.log("✅ Added last_verification_notes + last_format_detected to tracked_sources");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
