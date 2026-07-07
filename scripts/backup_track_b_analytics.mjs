// SPEC 014 Paso 7 — backup of article_stats + events (Track B, the legacy
// analytics system) before removing its producers. Follows the same JSON-dump
// pattern as scripts/backup_data.js, scoped to just these two tables.
// Usage: node scripts/backup_track_b_analytics.mjs

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function backup() {
  const client = await pool.connect();
  try {
    console.log('📦 Backing up Track B (legacy analytics)...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve('backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const tables = ['article_stats', 'events'];
    const data = {};

    for (const table of tables) {
      const res = await client.query(`SELECT * FROM "${table}"`);
      data[table] = res.rows;
      console.log(`✅ ${table}: ${res.rowCount} rows`);
    }

    const filename = path.join(backupDir, `backup_track_b_${timestamp}.json`);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\n💾 Backup saved to: ${filename}`);
  } finally {
    client.release();
    await pool.end();
  }
}

backup().catch((e) => { console.error('❌ Backup failed:', e.message); process.exit(1); });
