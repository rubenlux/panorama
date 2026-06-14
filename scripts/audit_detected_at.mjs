import 'dotenv/config';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p) => pool.query(sql, p);

// 1. detected_at timeline
const { rows: timeline } = await q(`
  SELECT DATE_TRUNC('hour', detected_at) as hora, COUNT(*) as cnt
  FROM monitored_articles
  WHERE detected_at > NOW()-INTERVAL '7 days'
  GROUP BY hora ORDER BY hora DESC LIMIT 30
`);
console.log('=== DETECTED_AT TIMELINE (últimos 7 días, por hora) ===');
timeline.forEach(r => console.log(r.hora.toISOString().slice(0,16), '->', r.cnt, 'artículos'));

// 2. Last 10 monitored articles
const { rows: recent } = await q(`
  SELECT title, detected_at, extraction_method, content_words
  FROM monitored_articles ORDER BY detected_at DESC LIMIT 10
`);
console.log('\n=== ÚLTIMOS 10 MONITORED_ARTICLES ===');
recent.forEach(r => console.log(
  r.detected_at?.toISOString?.()?.slice(0,19), '|',
  (r.extraction_method||'?').padEnd(10), '|',
  String(r.content_words||0).padEnd(6), 'words |',
  r.title?.slice(0,65)
));

// 3. Stats
const { rows: [stats] } = await q(`
  SELECT
    COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '1 hour')  as last_hour,
    COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '6 hours') as last_6h,
    COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '24 hours') as last_day,
    COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '7 days')  as last_week,
    MAX(detected_at) as last_detected
  FROM monitored_articles
`);
console.log('\n=== STATS ===');
console.log('Última hora:', stats.last_hour);
console.log('Últimas 6h: ', stats.last_6h);
console.log('Último día: ', stats.last_day);
console.log('Última semana:', stats.last_week);
console.log('Último detected_at:', stats.last_detected?.toISOString?.());

// 4. By source last 24h
const { rows: bySource } = await q(`
  SELECT ts.name, COUNT(ma.id) as cnt, MAX(ma.detected_at) as last
  FROM monitored_articles ma
  JOIN tracked_sources ts ON ts.id = ma.source_id
  WHERE ma.detected_at > NOW()-INTERVAL '24 hours'
  GROUP BY ts.name ORDER BY last DESC
`);
console.log('\n=== POR FUENTE (últimas 24h) ===');
if (!bySource.length) console.log('(ninguna actividad en las últimas 24h)');
bySource.forEach(r => console.log(r.name, '->', r.cnt, '| last:', r.last?.toISOString?.()?.slice(0,19)));

// 5. Gap analysis — days without activity
const { rows: gaps } = await q(`
  SELECT
    DATE_TRUNC('day', detected_at) as dia, COUNT(*) as cnt
  FROM monitored_articles
  WHERE detected_at > NOW()-INTERVAL '10 days'
  GROUP BY dia ORDER BY dia DESC
`);
console.log('\n=== ACTIVIDAD POR DÍA (últimos 10 días) ===');
gaps.forEach(r => console.log(r.dia.toISOString().slice(0,10), '->', r.cnt, 'artículos'));

// 6. news_monitor_paused flag and last worker check
const { rows: flag } = await q(`SELECT key, value, updated_at FROM settings WHERE key='news_monitor_paused'`);
console.log('\n=== PAUSE FLAG ===');
console.log(JSON.stringify(flag[0]));

// 7. Check article_content_cache
const { rows: [cache] } = await q(`SELECT COUNT(*) as total, MAX(created_at) as last FROM article_content_cache`).catch(() => ({ rows: [{ total: 'N/A' }] }));
console.log('\n=== ARTICLE_CONTENT_CACHE ===', JSON.stringify(cache));

// 8. Check if the processSource function runs but inserts 0 new (hash dedup)
const { rows: dupCheck } = await q(`
  SELECT COUNT(*) as total,
         COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '24 hours') as today,
         COUNT(*) FILTER (WHERE detected_at > NOW()-INTERVAL '10 days' AND detected_at < NOW()-INTERVAL '3 days') as older
  FROM monitored_articles
`);
console.log('\n=== DEDUP ANALYSIS ===', JSON.stringify(dupCheck.rows?.[0] ?? dupCheck));

await pool.end();
