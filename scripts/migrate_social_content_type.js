import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate] Agregando content_type a social_sources...');

  await query(`
    ALTER TABLE social_sources 
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'videos' 
    CHECK (content_type IN ('videos', 'shorts', 'posts'))
  `);
  console.log('[migrate] ✓ content_type agregado');

  // Auto-detectar el tipo según la URL ya existente
  await query(`UPDATE social_sources SET content_type = 'shorts' WHERE profile_url ILIKE '%/shorts'`);
  await query(`UPDATE social_sources SET content_type = 'posts'  WHERE profile_url ILIKE '%/posts'`);
  await query(`UPDATE social_sources SET content_type = 'videos' WHERE content_type IS NULL OR profile_url ILIKE '%/videos'`);
  console.log('[migrate] ✓ Tipos inferidos de URLs existentes');

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
