/**
 * Sprint 5.1 — Separate entity origins to prevent research contaminating trending.
 *
 * Changes:
 *  1. Add entity_origin VARCHAR(20) DEFAULT 'RESEARCH' to knowledge_entities
 *  2. Drop old unique index (lower(name), entity_type)
 *  3. Create new unique index (lower(name), entity_type, entity_origin)
 *  4. Index on entity_origin for trending filter
 */

import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[migrate_entity_origin] Starting…');

  // 1. Add column (idempotent)
  await query(`
    ALTER TABLE knowledge_entities
      ADD COLUMN IF NOT EXISTS entity_origin VARCHAR(20) NOT NULL DEFAULT 'RESEARCH'
  `);
  console.log('[migrate_entity_origin] Column entity_origin added.');

  // 2. Add CHECK constraint (skip if already exists)
  const { rows: checks } = await query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'knowledge_entities'::regclass
      AND conname = 'chk_entity_origin'
  `);
  if (checks.length === 0) {
    await query(`
      ALTER TABLE knowledge_entities
        ADD CONSTRAINT chk_entity_origin
        CHECK (entity_origin IN ('RESEARCH', 'MONITOR', 'SOCIAL', 'MANUAL'))
    `);
    console.log('[migrate_entity_origin] CHECK constraint added.');
  } else {
    console.log('[migrate_entity_origin] CHECK constraint already exists — skipping.');
  }

  // 3. Drop old unique index and replace with origin-aware one
  const { rows: oldIdx } = await query(`
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'knowledge_entities'
      AND indexname = 'idx_knowledge_entities_name_type'
  `);
  if (oldIdx.length > 0) {
    await query(`DROP INDEX idx_knowledge_entities_name_type`);
    console.log('[migrate_entity_origin] Dropped idx_knowledge_entities_name_type.');
  }

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ke_name_type_origin
      ON knowledge_entities (lower(name), entity_type, entity_origin)
  `);
  console.log('[migrate_entity_origin] Created idx_ke_name_type_origin.');

  // 4. Fast lookup index for trending filter
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ke_origin
      ON knowledge_entities (entity_origin)
  `);
  console.log('[migrate_entity_origin] Created idx_ke_origin.');

  console.log('[migrate_entity_origin] Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('[migrate_entity_origin] FAILED:', err.message);
  process.exit(1);
});
