import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_editorial_scores] Starting…');

  await query(`
    ALTER TABLE social_clusters
    ADD COLUMN IF NOT EXISTS viral_score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS growth_rate FLOAT DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS sources_count INTEGER DEFAULT 1
  `);

  console.log('[migrate_editorial_scores] ✓ Columns appended to social_clusters for Viral Scoring.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
