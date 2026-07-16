// SPEC 014 (Editorial Analytics Consolidation) — Paso 1
// Adds a real pixel_events.article_id UUID column, populated safely from the
// two drifted client field names (payload->>'article_id' / payload->>'content_id').
//
// Safety: never casts blindly. Only values that match the UUID shape are cast;
// anything else is left NULL. Audited beforehand (2026-07-06): 100% of non-null
// values in both fields are already UUID-shaped, so this is expected to backfill
// cleanly — the guard exists for future/malformed data, not because today's data
// needs it.
//
// Usage: node scripts/migrate_pixel_events_article_id.mjs

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

const UUID_RE_SQL = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

async function main() {
  console.log('=== pixel_events.article_id migration (SPEC 014, Paso 1) ===\n');

  console.log('1. Auditing historical article_id / content_id values…');
  for (const field of ['article_id', 'content_id']) {
    const total = await query(
      `SELECT COUNT(*) FROM pixel_events WHERE payload->>'${field}' IS NOT NULL AND payload->>'${field}' != ''`
    );
    const uuidShaped = await query(
      `SELECT COUNT(*) FROM pixel_events WHERE payload->>'${field}' ~ '${UUID_RE_SQL}'`
    );
    const matchesReal = await query(`
      SELECT COUNT(*) FROM pixel_events p
      WHERE payload->>'${field}' ~ '${UUID_RE_SQL}'
      AND EXISTS (SELECT 1 FROM articles a WHERE a.id::text = p.payload->>'${field}')
    `);
    console.log(`   ${field}: ${total.rows[0].count} non-null, ${uuidShaped.rows[0].count} UUID-shaped, ${matchesReal.rows[0].count} match a real article`);
  }

  console.log('\n2. (DDL part skipped — handled by add_pixel_article_id_column.js)');

  console.log('\n3. Backfilling — article_id takes precedence over content_id (matches existing OR-pattern order), only well-formed UUIDs are cast…');
  const result = await query(`
    UPDATE pixel_events
    SET article_id = CASE
      WHEN COALESCE(payload->>'article_id', payload->>'content_id') ~ '${UUID_RE_SQL}'
      THEN COALESCE(payload->>'article_id', payload->>'content_id')::uuid
      ELSE NULL
    END
    WHERE article_id IS NULL
      AND COALESCE(payload->>'article_id', payload->>'content_id') IS NOT NULL
  `);
  console.log(`   ✓ ${result.rowCount} rows backfilled`);

  const { rows: [stats] } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(article_id)::int AS with_article_id
    FROM pixel_events
  `);
  console.log('\n=== Migration Complete ===');
  console.log(`Total pixel_events rows:        ${stats.total}`);
  console.log(`Rows with article_id populated: ${stats.with_article_id}`);

  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
