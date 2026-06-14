import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_social_observability_v2] Starting…');

  await query(`
    ALTER TABLE social_fetch_logs
    ADD COLUMN IF NOT EXISTS auth_status VARCHAR(50) DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS rate_limited BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS captcha_detected BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS login_wall_detected BOOLEAN DEFAULT false
  `);

  console.log('[migrate_social_observability_v2] ✓ Columns added to social_fetch_logs');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
