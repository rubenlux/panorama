import fs from 'fs';
import path from 'path';
import { query } from '../routes/db.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  try {
    console.log('[Migrations] Running database migrations...');

    // Run traceability migration
    const traceabilitySql = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/migrate_article_traceability.sql'),
      'utf8'
    );

    // Split into individual statements and execute
    const statements = traceabilitySql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await query(statement);
      }
    }

    console.log('[Migrations] ✓ Article traceability migration completed');
  } catch (e) {
    console.error('[Migrations] Error:', e.message);
    // Don't fail startup if migration fails (could be already applied)
    if (!e.message.includes('already exists')) {
      console.error(e);
    }
  }
}

export { runMigrations };
