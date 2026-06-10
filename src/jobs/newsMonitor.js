import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { query } from '../routes/db.js';

const TRENDING_WINDOW_MIN   = 30;  // minutes — sliding window for trending detection
const AUTO_RESEARCH_MENTIONS = 5;  // min article mentions to trigger auto-research
const AUTO_RESEARCH_SOURCES  = 3;  // min distinct sources to trigger auto-research
const AUTO_RESEARCH_COOLDOWN = 120; // minutes before same entity can trigger again

// ── RSS Parser (no external deps) ────────────────────────────────────────────

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#39;/g,   "'")
    .replace(/&apos;/g,  "'")
    .replace(/&#(\d+);/g,   (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    items.push({
      title:       extractTag(raw, 'title'),
      link:        extractTag(raw, 'link') || extractTag(raw, 'guid'),
      description: extractTag(raw, 'description').replace(/<[^>]*>/g, '').trim().slice(0, 500),
      pubDate:     extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date'),
      guid:        extractTag(raw, 'guid'),
    });
  }
  return items;
}

function hashUrl(url) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

// ── Source processing ─────────────────────────────────────────────────────────

async function processSource(source) {
  const newIds = [];
  try {
    const res = await fetch(source.rss_url, {
      headers: { 'User-Agent': 'Panorama-Monitor/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return newIds;

    const xml = await res.text();
    const items = parseRssItems(xml);

    for (const item of items) {
      const url = item.link;
      if (!url || !item.title) continue;

      const { rows } = await query(
        `INSERT INTO monitored_articles (source_id, external_id, title, url, summary, published_at, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (hash) DO NOTHING
         RETURNING id`,
        [
          source.id,
          item.guid || null,
          item.title,
          url,
          item.description || null,
          item.pubDate ? new Date(item.pubDate) : null,
          hashUrl(url),
        ]
      );
      if (rows[0]) newIds.push(rows[0].id);
    }

    await query(`UPDATE tracked_sources SET last_checked = now() WHERE id = $1`, [source.id]);
  } catch (e) {
    console.error(`[Monitor] Source "${source.name}" failed: ${e.message}`);
  }
  return newIds;
}

// ── Entity matching (string-based, free, real-time) ───────────────────────────

async function matchEntities(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const { rows: entities } = await query(
    // Longer names first → avoid "AI" matching before "OpenAI"
    `SELECT id, name FROM knowledge_entities ORDER BY length(name) DESC`
  );
  if (entities.length === 0) return;

  const { rows: articles } = await query(
    `SELECT id, title FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  for (const article of articles) {
    const lower = article.title.toLowerCase();
    for (const entity of entities) {
      if (lower.includes(entity.name.toLowerCase())) {
        await query(
          `INSERT INTO article_entity_matches (article_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [article.id, entity.id]
        );
      }
    }
  }
}

// ── Trending topics (rolling 30-min window) ───────────────────────────────────

async function refreshTrendingTopics() {
  const { rows } = await query(`
    SELECT
      aem.entity_id,
      COUNT(DISTINCT aem.article_id)::int  AS mention_count,
      COUNT(DISTINCT ma.source_id)::int    AS source_count,
      MAX(ma.detected_at)                  AS last_seen_at
    FROM article_entity_matches aem
    JOIN monitored_articles ma ON ma.id = aem.article_id
    WHERE ma.detected_at > now() - interval '${TRENDING_WINDOW_MIN} minutes'
    GROUP BY aem.entity_id
  `);

  for (const row of rows) {
    await query(`
      INSERT INTO trending_topics (entity_id, mention_count, source_count, last_seen_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (entity_id) DO UPDATE SET
        mention_count   = EXCLUDED.mention_count,
        source_count    = EXCLUDED.source_count,
        last_seen_at    = EXCLUDED.last_seen_at,
        -- Reset auto_researched if entity went quiet for the cooldown period
        auto_researched = CASE
          WHEN trending_topics.last_seen_at < now() - interval '${AUTO_RESEARCH_COOLDOWN} minutes'
          THEN false
          ELSE trending_topics.auto_researched
        END,
        updated_at = now()
    `, [row.entity_id, row.mention_count, row.source_count, row.last_seen_at]);
  }
}

// ── Auto-research trigger ─────────────────────────────────────────────────────

async function checkAutoResearchTriggers() {
  const { rows } = await query(`
    SELECT tt.id, tt.entity_id, ke.name AS entity_name
    FROM trending_topics tt
    JOIN knowledge_entities ke ON ke.id = tt.entity_id
    WHERE tt.mention_count  >= $1
      AND tt.source_count   >= $2
      AND tt.auto_researched = false
      AND tt.last_seen_at   > now() - interval '${TRENDING_WINDOW_MIN} minutes'
    ORDER BY tt.mention_count DESC
    LIMIT 3
  `, [AUTO_RESEARCH_MENTIONS, AUTO_RESEARCH_SOURCES]);

  for (const topic of rows) {
    await query(
      `INSERT INTO research_topics (title, status, category, tags)
       VALUES ($1, 'pending', 'trending', ARRAY['auto-detectado', 'news-intelligence'])`,
      [`${topic.entity_name} — tendencia detectada automáticamente`]
    );
    await query(
      `UPDATE trending_topics SET auto_researched = true WHERE id = $1`,
      [topic.id]
    );
    console.log(`[Monitor] Auto-research queued: "${topic.entity_name}"`);
  }
}

// ── Main job ──────────────────────────────────────────────────────────────────

export async function runNewsMonitor() {
  try {
    const { rows: sources } = await query(`
      SELECT * FROM tracked_sources
      WHERE enabled = true
        AND (last_checked IS NULL
             OR last_checked < now() - (check_interval || ' seconds')::interval)
    `);

    if (sources.length === 0) return;

    // Process all sources, collect IDs of newly inserted articles
    const allNewIds = [];
    for (const source of sources) {
      const ids = await processSource(source);
      allNewIds.push(...ids);
    }

    if (allNewIds.length === 0) return;

    console.log(`[Monitor] ${allNewIds.length} new articles from ${sources.length} sources`);

    await matchEntities(allNewIds);
    await refreshTrendingTopics();
    await checkAutoResearchTriggers();

  } catch (e) {
    console.error('[Monitor] Job error:', e.message);
  }
}
