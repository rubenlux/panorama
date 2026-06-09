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
      CREATE TABLE IF NOT EXISTS editorial_angles (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dossier_id     UUID NOT NULL REFERENCES editorial_dossiers(id) ON DELETE CASCADE,
        title          VARCHAR(255) NOT NULL,
        angle_type     VARCHAR(50)  NOT NULL
                         CHECK (angle_type IN ('noticia','ultima_hora','cronica','analisis','investigacion','fact_check','explicador')),
        summary        TEXT,
        target_audience TEXT,
        seo_keywords   JSONB DEFAULT '[]',
        position       INTEGER DEFAULT 0,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_editorial_angles_dossier
        ON editorial_angles(dossier_id, position);
    `);

    await client.query("COMMIT");
    console.log("✅ Sprint 4.1 migration complete — editorial_angles table");
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
