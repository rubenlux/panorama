import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Add verification columns to tracked_sources
    await client.query(`
      ALTER TABLE tracked_sources
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verified_by         INTEGER,
        ADD COLUMN IF NOT EXISTS trust_score         NUMERIC(4,1) DEFAULT 5.0;
    `);

    // Verification history log
    await client.query(`
      CREATE TABLE IF NOT EXISTS source_verifications (
        id          SERIAL PRIMARY KEY,
        source_id   UUID NOT NULL REFERENCES tracked_sources(id) ON DELETE CASCADE,
        status      VARCHAR(20) NOT NULL,
        checked_by  INTEGER,
        notes       TEXT,
        http_status INTEGER,
        response_ms INTEGER,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_source_verifications_source
        ON source_verifications(source_id, created_at DESC);
    `);

    await client.query("COMMIT");
    console.log("✅ Sprint 3.5 — source_verifications migration complete");
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
