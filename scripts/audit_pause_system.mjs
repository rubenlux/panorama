/**
 * Auditoría: Sistema de Pausa del Worker
 * Solo lectura — sin modificaciones
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p) => pool.query(sql, p);
const sep = (t) => console.log(`\n${'═'.repeat(60)}\n${t}\n${'─'.repeat(60)}`);

// ── 1. Settings / flags ───────────────────────────────────────────────────────
sep('SECCIÓN 1 — FLAGS EN BASE DE DATOS (tabla settings)');
try {
  const { rows } = await q(`SELECT key, value, type, group_name, updated_at FROM settings ORDER BY group_name, key`);
  if (!rows.length) { console.log('(tabla settings vacía)'); }
  else {
    console.log(`${'Key'.padEnd(35)} ${'Value'.padEnd(15)} ${'Type'.padEnd(10)} Updated`);
    console.log('─'.repeat(80));
    for (const r of rows) {
      console.log(`${r.key.padEnd(35)} ${String(r.value).padEnd(15)} ${String(r.type||'').padEnd(10)} ${r.updated_at?.toISOString?.() ?? r.updated_at}`);
    }
  }
} catch(e) { console.log('ERROR:', e.message); }

// ── 2. Columnas de settings ───────────────────────────────────────────────────
sep('SECCIÓN 2 — ESTRUCTURA DE LA TABLA SETTINGS');
try {
  const { rows } = await q(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'settings' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  for (const r of rows) {
    console.log(`  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(20)} nullable=${r.is_nullable} default=${r.column_default}`);
  }
} catch(e) { console.log('ERROR:', e.message); }

// ── 3. Otras tablas con flags de control ─────────────────────────────────────
sep('SECCIÓN 3 — OTRAS POSIBLES TABLAS DE CONTROL (worker_status, jobs, config...)');
try {
  const { rows: tables } = await q(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%worker%' OR table_name ILIKE '%job%' OR table_name ILIKE '%config%'
        OR table_name ILIKE '%settings%' OR table_name ILIKE '%flag%' OR table_name ILIKE '%schedule%')
    ORDER BY table_name
  `);
  console.log('Tablas encontradas:', tables.map(t => t.table_name).join(', ') || '(ninguna)');
} catch(e) { console.log('ERROR:', e.message); }

// ── 4. worker_logs ────────────────────────────────────────────────────────────
sep('SECCIÓN 4 — ÚLTIMAS 10 FILAS DE worker_logs');
try {
  const { rows } = await q(`
    SELECT * FROM worker_logs ORDER BY created_at DESC LIMIT 10
  `);
  if (!rows.length) console.log('(tabla vacía o no existe)');
  else rows.forEach((r, i) => console.log(`${i+1}. ${JSON.stringify(r)}`));
} catch(e) { console.log('ERROR (tabla no existe?):', e.message); }

// ── 5. social_fetch_logs ──────────────────────────────────────────────────────
sep('SECCIÓN 5 — ÚLTIMAS 10 FILAS DE social_fetch_logs');
try {
  const { rows } = await q(`
    SELECT sfl.id, ss.name as source_name, sfl.platform, sfl.started_at, sfl.finished_at,
           sfl.success, sfl.posts_found, sfl.posts_saved, sfl.error_message
    FROM social_fetch_logs sfl
    LEFT JOIN social_sources ss ON ss.id = sfl.source_id
    ORDER BY sfl.started_at DESC
    LIMIT 10
  `);
  if (!rows.length) console.log('(sin registros)');
  else for (const r of rows) {
    console.log(`  ${r.started_at?.toISOString?.()?.slice(0,19)} | ${String(r.source_name||'?').padEnd(20)} | ok=${r.success} | found=${r.posts_found} save=${r.posts_saved} | ${r.error_message?.slice(0,60)||''}`);
  }
} catch(e) { console.log('ERROR:', e.message); }

// ── 6. ingestion_logs ────────────────────────────────────────────────────────
sep('SECCIÓN 6 — ÚLTIMAS 10 FILAS DE ingestion_logs');
try {
  const { rows } = await q(`SELECT * FROM ingestion_logs ORDER BY created_at DESC LIMIT 10`);
  if (!rows.length) console.log('(sin registros)');
  else rows.forEach((r, i) => console.log(`${i+1}. ${JSON.stringify(r)}`));
} catch(e) { console.log('ERROR (tabla no existe?):', e.message); }

// ── 7. trend_logs / event_logs ───────────────────────────────────────────────
sep('SECCIÓN 7 — ÚLTIMAS 5 FILAS DE trend_logs / news_fetch_logs / event_logs');
for (const tbl of ['trend_logs','news_fetch_logs','event_logs','monitor_logs','job_logs']) {
  try {
    const { rows } = await q(`SELECT * FROM ${tbl} ORDER BY created_at DESC LIMIT 5`);
    console.log(`${tbl}: ${rows.length} rows`);
    rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));
  } catch(e) { console.log(`${tbl}: NO EXISTE (${e.message.split('\n')[0]})`); }
}

// ── 8. Cuándo fue la última actividad del monitor de noticias ─────────────────
sep('SECCIÓN 8 — ÚLTIMA ACTIVIDAD DEL MONITOR DE NOTICIAS');
try {
  const { rows } = await q(`
    SELECT
      (SELECT MAX(published_at) FROM articles)                    AS last_article,
      (SELECT MAX(captured_at) FROM articles)                     AS last_captured,
      (SELECT COUNT(*) FROM articles WHERE captured_at > NOW()-INTERVAL '1 hour')  AS articles_last_hour,
      (SELECT COUNT(*) FROM articles WHERE captured_at > NOW()-INTERVAL '24 hours') AS articles_last_day
  `);
  console.log(JSON.stringify(rows[0], null, 2));
} catch(e) { console.log('ERROR:', e.message); }

// ── 9. Última actividad social ────────────────────────────────────────────────
sep('SECCIÓN 9 — ÚLTIMA ACTIVIDAD DEL MONITOR SOCIAL');
try {
  const { rows } = await q(`
    SELECT
      (SELECT MAX(captured_at) FROM social_posts)                         AS last_post,
      (SELECT COUNT(*) FROM social_posts WHERE captured_at > NOW()-INTERVAL '1 hour')   AS posts_last_hour,
      (SELECT COUNT(*) FROM social_posts WHERE captured_at > NOW()-INTERVAL '24 hours') AS posts_last_day,
      (SELECT MAX(started_at) FROM social_fetch_logs)                     AS last_fetch_log,
      (SELECT MAX(last_checked) FROM social_sources WHERE enabled=true)   AS last_source_check
  `);
  console.log(JSON.stringify(rows[0], null, 2));
} catch(e) { console.log('ERROR:', e.message); }

// ── 10. Timestamp NOW para referencia ─────────────────────────────────────────
sep('REFERENCIA DE TIEMPO');
const { rows: [t] } = await q(`SELECT NOW() as db_now`);
console.log('DB now:', t.db_now.toISOString());
console.log('Node now:', new Date().toISOString());

await pool.end();
