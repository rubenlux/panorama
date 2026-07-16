import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sourcesPath = path.resolve(__dirname, '../backups/rss_sources.json');
  if (!fs.existsSync(sourcesPath)) {
    console.error(`[import-sources] ❌ Sources backup file not found at: ${sourcesPath}`);
    process.exit(1);
  }

  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  console.log(`[import-sources] Found ${sources.length} sources to import.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const src of sources) {
      console.log(`[import-sources] Importing source: ${src.name}`);
      await client.query(`
        INSERT INTO rss_sources (id, name, type, rss_url, homepage, enabled, check_interval, verification_status)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, true, 60, 'verified')
        ON CONFLICT DO NOTHING
      `, [src.name, src.type, src.rss_url, src.homepage]);
    }

    await client.query('COMMIT');
    console.log('[import-sources] 🎉 Sources successfully imported!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[import-sources] ❌ Failed to import sources:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
