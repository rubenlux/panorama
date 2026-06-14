import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { query } from '../routes/db.js';
import { AiService } from '../services/AiService.js';
import { fetchArticleContentForMonitor } from '../services/ArticleFetcher.js';
import { startRun, finishRun } from './workerUtils.js';

const ai = new AiService();

const TRENDING_WINDOW_MIN    = 30;
const AUTO_RESEARCH_MENTIONS = 5;
const AUTO_RESEARCH_SOURCES  = 3;
const AUTO_RESEARCH_COOLDOWN = 120;

// Cluster is "active" for 6 hours — articles within that window belong together
const CLUSTER_WINDOW_HOURS  = 6;
// Thresholds to trigger AI summary generation
const CLUSTER_SUMMARY_MIN_ARTICLES = 3;
const CLUSTER_SUMMARY_MIN_SOURCES  = 2;

// ── HTML entity decoder ───────────────────────────────────────────────────────

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

// ── RSS Parser ────────────────────────────────────────────────────────────────

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

// ── Google News Sitemap parser ────────────────────────────────────────────────

function parseNewsSitemapItems(xml) {
  const items = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const block   = m[1];
    const loc     = extractTag(block, 'loc');
    if (!loc || !loc.startsWith('http')) continue;
    const title   = extractTag(block, 'news:title') || extractTag(block, 'title');
    const pubDate = extractTag(block, 'news:publication_date') || extractTag(block, 'lastmod');
    if (!title) continue;
    items.push({ title, link: loc, description: '', pubDate, guid: loc });
  }
  return items;
}

function parseSitemapIndexUrls(xml) {
  const urls = [];
  const re = /<loc>([\s\S]*?)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = decodeHtmlEntities(m[1].trim());
    if (u.startsWith('http')) urls.push(u);
  }
  return urls;
}

function detectFeedFormat(xml) {
  const t = xml.trimStart().slice(0, 2000);
  if (t.includes('<sitemapindex'))  return 'sitemap-index';
  if (t.includes('<urlset')) {
    return (t.includes('xmlns:news') || t.includes('news.google.com')) ? 'news-sitemap' : 'urlset';
  }
  if (t.includes('<rss') || t.includes('<channel')) return 'rss';
  if (t.includes('<feed') && t.includes('xmlns'))   return 'atom';
  return 'rss';
}

async function fetchFeedXml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Panorama-Monitor/2.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.text();
}

function hashUrl(url) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

// ── Monitor NER — extract proper-noun sequences from titles ──────────────────

const MONITOR_STOPWORDS = new Set([
  // Spanish articles and prepositions
  'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Unos', 'Unas',
  'De', 'Del', 'En', 'Al', 'Por', 'Con', 'Sin', 'Para', 'Sobre',
  'Ante', 'Bajo', 'Desde', 'Hacia', 'Hasta', 'Tras', 'Entre', 'Según',
  // Spanish pronouns / interrogatives
  'Que', 'Como', 'Cuando', 'Donde', 'Cual', 'Cuyo', 'Cuya', 'Quien',
  'Cómo', 'Cuándo', 'Dónde', 'Qué', 'Quién', 'Quiénes', 'Cuál', 'Cuáles',
  'Se', 'Su', 'Sus', 'Mi', 'Mis', 'Tu', 'Tus',
  // Spanish demonstratives / adjectives
  'Nuevo', 'Nueva', 'Nuevos', 'Nuevas',
  'Gran', 'Grande', 'Grandes',
  'Este', 'Esta', 'Estos', 'Estas', 'Ese', 'Esa', 'Esos', 'Esas',
  'Otro', 'Otra', 'Otros', 'Otras',
  'Mismo', 'Misma', 'Mismos', 'Mismas',
  'Todo', 'Toda', 'Todos', 'Todas',
  'Muy', 'Más', 'Menos', 'Bien', 'Mal', 'Solo', 'Sólo',
  // Spanish verbs / auxiliaries
  'Hay', 'Era', 'Fue', 'Ser', 'Han', 'Son', 'Está', 'Están', 'Tiene',
  'Puede', 'Debe', 'Hace', 'Dice', 'Sabe', 'Lleva', 'Quiere', 'Viene',
  // Quantifiers that commonly start sentences
  'Pocos', 'Muchos', 'Varios', 'Algunos', 'Ciertas', 'Ciertos',
  // Generic content-type words
  'Video', 'Foto', 'Fotos', 'Imagen', 'Imágenes', 'Galería', 'Audio',
  'Nota', 'Artículo', 'Informe', 'Resumen', 'Agenda', 'Exclusivo',
  // Clickbait adjectives that head titles
  'Impactante', 'Sorprendente', 'Increíble', 'Insólito', 'Viral',
  'Inesperado', 'Urgente', 'Alerta', 'Atención', 'Importante',
  // Generic topic nouns (Horóscopo breaks ALL "Horóscopo X" sequences from Clarín)
  'Horóscopo', 'Horoscopo',
  'Salud', 'Amor', 'Dinero', 'Trabajo', 'Economía',
  'Selección',
  // English stopwords
  'The', 'This', 'That', 'These', 'Those',
  'New', 'Old', 'Big', 'How', 'Why', 'What', 'When', 'Where', 'Who',
  'Its', 'Their', 'Your', 'Our',
]);

function extractMonitorEntities(title) {
  const clean = title.replace(/[¿¡«»:,;!?()[\]{}"']/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');

  const results = [];
  let current = [];

  const flush = () => {
    if (current.length >= 2) {
      results.push(current.join(' '));
    } else if (current.length === 1) {
      const w = current[0];
      if (w.length >= 4 || /^[A-ZÁÉÍÓÚÜÑ]{2,}\.?$/.test(w)) {
        results.push(w);
      }
    }
    current = [];
  };

  for (const word of words) {
    if (!word) continue;
    const bare = word.replace(/[.,;:!?'"]+$/, '');
    if (!bare) continue;

    const isCapStart      = /^[A-ZÁÉÍÓÚÜÑ]/.test(bare);
    const isNotStopword   = !MONITOR_STOPWORDS.has(bare);
    const isDigitOrHyphen = current.length > 0 && /^[\d-]/.test(bare) && bare.length <= 4;

    if ((isCapStart && isNotStopword && bare.length >= 2) || isDigitOrHyphen) {
      current.push(bare);
    } else {
      flush();
    }
  }
  flush();

  return [...new Set(results)].slice(0, 6);
}

// ── Source processing ─────────────────────────────────────────────────────────

async function processSource(source) {
  const newIds = [];
  try {
    const xml = await fetchFeedXml(source.rss_url);
    if (!xml) return newIds;

    const format = detectFeedFormat(xml);
    let items = [];

    if (format === 'news-sitemap') {
      items = parseNewsSitemapItems(xml);
    } else if (format === 'sitemap-index') {
      // Fetch up to 3 child sitemaps (most recent entries are last — reverse)
      const childUrls = parseSitemapIndexUrls(xml).slice(-3).reverse();
      for (const childUrl of childUrls) {
        try {
          const childXml = await fetchFeedXml(childUrl);
          if (!childXml) continue;
          const childFmt = detectFeedFormat(childXml);
          items.push(...(childFmt === 'news-sitemap'
            ? parseNewsSitemapItems(childXml)
            : parseRssItems(childXml)));
        } catch {}
        if (items.length >= 60) break;
      }
    } else {
      items = parseRssItems(xml);
    }

    for (const item of items) {
      const url = item.link;
      if (!url || !item.title) continue;

      let pubDate = null;
      if (item.pubDate) {
        const d = new Date(item.pubDate);
        pubDate = isNaN(d.getTime()) ? null : d;
      }

      const { rows } = await query(
        `INSERT INTO monitored_articles (source_id, external_id, title, url, summary, published_at, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (hash) DO NOTHING
         RETURNING id`,
        [source.id, item.guid || null, item.title, url,
         item.description || null, pubDate, hashUrl(url)]
      );
      if (rows[0]) newIds.push(rows[0].id);
    }

    await query(
      `UPDATE tracked_sources SET last_checked = now(), last_format_detected = $2 WHERE id = $1`,
      [source.id, format]
    );
    if (items.length > 0)
      console.log(`[Monitor] "${source.name}" (${format}): ${items.length} items → ${newIds.length} new`);
  } catch (e) {
    console.error(`[Monitor] Source "${source.name}" failed: ${e.message}`);
  }
  return newIds;
}

// ── RESEARCH entity matching (knowledge-base context, NOT for trending) ───────

async function matchResearchEntities(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const { rows: entities } = await query(
    `SELECT id, name FROM knowledge_entities
     WHERE entity_origin = 'RESEARCH'
     ORDER BY length(name) DESC`
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

// ── Trend cluster management ──────────────────────────────────────────────────

async function upsertTrendCluster(entityId, articleId) {
  // Find an active cluster for this entity within the window
  const { rows: existing } = await query(
    `SELECT id FROM trend_clusters
     WHERE entity_id = $1
       AND status != 'stale'
       AND last_seen > now() - interval '${CLUSTER_WINDOW_HOURS} hours'
     ORDER BY last_seen DESC LIMIT 1`,
    [entityId]
  );

  let clusterId;
  if (existing[0]) {
    clusterId = existing[0].id;
  } else {
    const { rows } = await query(
      `INSERT INTO trend_clusters (entity_id) VALUES ($1) RETURNING id`,
      [entityId]
    );
    clusterId = rows[0].id;
  }

  // Link article (idempotent)
  await query(
    `INSERT INTO trend_cluster_articles (trend_id, article_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [clusterId, articleId]
  );

  // Recalculate live counts
  await query(`
    UPDATE trend_clusters SET
      article_count = (SELECT COUNT(*) FROM trend_cluster_articles WHERE trend_id = $1),
      source_count  = (
        SELECT COUNT(DISTINCT ma.source_id)
        FROM trend_cluster_articles tca
        JOIN monitored_articles ma ON ma.id = tca.article_id
        WHERE tca.trend_id = $1
      ),
      last_seen  = now(),
      updated_at = now()
    WHERE id = $1
  `, [clusterId]);

  return clusterId;
}

// ── MONITOR entity discovery (NER) → cluster management ──────────────────────

async function discoverMonitorEntities(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const { rows: articles } = await query(
    `SELECT id, title, source_id FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  for (const article of articles) {
    const names = extractMonitorEntities(article.title);
    for (const name of names) {
      const { rows } = await query(
        `INSERT INTO knowledge_entities (name, entity_type, entity_origin, first_seen_at, last_seen_at, mention_count)
         VALUES ($1, 'unknown', 'MONITOR', now(), now(), 1)
         ON CONFLICT (lower(name), entity_type, entity_origin) DO UPDATE
           SET mention_count = knowledge_entities.mention_count + 1,
               last_seen_at  = now(),
               updated_at    = now()
         RETURNING id`,
        [name]
      );
      if (rows[0]) {
        const entityId = rows[0].id;
        // Create/update article_entity_matches (for trending)
        await query(
          `INSERT INTO article_entity_matches (article_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [article.id, entityId]
        );
        // Create/update trend cluster
        await upsertTrendCluster(entityId, article.id);
      }
    }
  }
}

// ── Trending topics (rolling window, MONITOR entities only) ──────────────────

async function refreshTrendingTopics() {
  const { rows } = await query(`
    SELECT
      aem.entity_id,
      COUNT(DISTINCT aem.article_id)::int  AS mention_count,
      COUNT(DISTINCT ma.source_id)::int    AS source_count,
      MAX(ma.detected_at)                  AS last_seen_at
    FROM article_entity_matches aem
    JOIN monitored_articles ma  ON ma.id  = aem.article_id
    JOIN knowledge_entities ke  ON ke.id  = aem.entity_id
    WHERE ma.detected_at > now() - interval '${TRENDING_WINDOW_MIN} minutes'
      AND ke.entity_origin = 'MONITOR'
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
        auto_researched = CASE
          WHEN trending_topics.last_seen_at < now() - interval '${AUTO_RESEARCH_COOLDOWN} minutes'
          THEN false
          ELSE trending_topics.auto_researched
        END,
        updated_at = now()
    `, [row.entity_id, row.mention_count, row.source_count, row.last_seen_at]);
  }
}

// ── AI cluster summarization (threshold-triggered, async, non-blocking) ───────

async function summarizePendingClusters() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { rows: pending } = await query(`
    SELECT tc.id, ke.name AS entity_name
    FROM trend_clusters tc
    JOIN knowledge_entities ke ON ke.id = tc.entity_id
    WHERE tc.status = 'active'
      AND (tc.article_count >= $1 OR tc.source_count >= $2)
      AND tc.last_seen > now() - interval '${CLUSTER_WINDOW_HOURS} hours'
    ORDER BY tc.source_count DESC, tc.article_count DESC
    LIMIT 3
  `, [CLUSTER_SUMMARY_MIN_ARTICLES, CLUSTER_SUMMARY_MIN_SOURCES]);

  for (const cluster of pending) {
    // Mark as summarizing (prevents double processing)
    await query(`UPDATE trend_clusters SET status = 'summarizing', updated_at = now() WHERE id = $1`, [cluster.id]);

    // Fetch articles for this cluster
    const { rows: articles } = await query(`
      SELECT ma.title, ma.url, ma.published_at, ma.detected_at, ts.name AS source_name
      FROM trend_cluster_articles tca
      JOIN monitored_articles ma ON ma.id = tca.article_id
      JOIN tracked_sources ts    ON ts.id = ma.source_id
      WHERE tca.trend_id = $1
      ORDER BY ma.detected_at DESC
    `, [cluster.id]);

    try {
      const result = await ai.generateTrendSummary(cluster.entity_name, articles);
      await query(`
        UPDATE trend_clusters SET
          headline         = $1,
          summary          = $2,
          editorial_angles = $3,
          status           = 'ready',
          updated_at       = now()
        WHERE id = $4
      `, [result.headline, result.summary, JSON.stringify(result.editorial_angles || []), cluster.id]);
      console.log(`[Monitor] Cluster summary ready: "${cluster.entity_name}"`);
    } catch (e) {
      console.error(`[Monitor] Cluster summarization failed for "${cluster.entity_name}":`, e.message);
      // Roll back to active so it can be retried next cycle
      await query(`UPDATE trend_clusters SET status = 'active', updated_at = now() WHERE id = $1`, [cluster.id]);
    }
  }
}

// ── Mark stale clusters ───────────────────────────────────────────────────────

async function markStaleClusters() {
  await query(`
    UPDATE trend_clusters SET status = 'stale', updated_at = now()
    WHERE status IN ('active','ready')
      AND last_seen < now() - interval '${CLUSTER_WINDOW_HOURS} hours'
  `);
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

// ── Story Intelligence (Sprint 5.5) ──────────────────────────────────────────

const STORY_WINDOW_HOURS           = 24;
const STORY_MATCH_THRESHOLD        = 0.20;
const STORY_SUMMARY_MIN_ARTICLES   = 3;
const STORY_SUMMARY_MIN_SOURCES    = 2;
const ENRICHMENT_GATE_COVERAGE     = 0.70; // min fraction of articles with full text before AI runs
const RELEVANCE_FILTER_THRESHOLD   = 0.30; // articles below this score excluded from AI context

// Aggressive stopwords for keyword-similarity matching — NOT for NER
const STORY_STOPWORDS = new Set([
  'como','hoy','ayer','para','sobre','ante','bajo','desde','hacia','hasta','tras','entre',
  'dice','dijo','señaló','afirmó','confirmó','anunció','aseguró','reveló','explicó',
  'nuevo','nueva','nuevos','nuevas','primer','primera','primero','últimas','último',
  'gran','grande','grandes','solo','sólo','también','además','muy','bien','mal',
  'todo','toda','todos','todas','esto','eso','este','esta','estos','estas',
  'lunes','martes','miercoles','jueves','viernes','sabado','domingo',
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre',
  'semana','semanas','mes','meses','años','hora','horas','minuto','minutos',
  'cual','cuales','quien','quienes','como','cuando','donde','cuanto',
  'caso','casos','forma','formas','tipo','tipos','parte','partes','lugar',
  'hace','hizo','debe','puede','tiene','tuvo','sera','seria',
  'the','also','from','this','that','with','have','will','been','were',
  'what','when','where','which','they','their','about','after','before',
  // High-frequency Argentine news words that don't define a story
  'pesos','dolares','porcentaje','inflacion','economia',
]);

// Templated/recurring content that should never create editorial stories
const RECURRING_CONTENT_PATTERNS = [
  /hor[oó]scopo\s+\w+\s+de\s+hoy/i,
  /quiniela.*resultado.*sorteo/i,
  /resultado.*quiniela/i,
  /quiniela.*(nocturna|vespertina|primera|matutina)/i,
  /loter[ií]a.*resultado/i,
  /resultado.*loter[ií]a/i,
  /n[uú]mero.*ganador/i,
  /sorteo.*loto/i,
];

function extractStoryKeywords(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents for matching
    .replace(/[¿¡«»:,;!?()[\]{}"'\/\\]/g, ' ')
    .split(/\s+/)
    .filter(w =>
      w.length >= 4 &&
      !STORY_STOPWORDS.has(w) &&
      !/^\d+$/.test(w) &&
      !/^[-–—]/.test(w)
    );
}

function jaccardSim(arrA, arrB) {
  const a = new Set(arrA), b = new Set(arrB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function jaccardShared(arrA, arrB) {
  const b = new Set(arrB);
  return [...new Set(arrA)].filter(x => b.has(x));
}

function isRecurringContent(title) {
  return RECURRING_CONTENT_PATTERNS.some(p => p.test(title));
}

function generateStorySlug(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  const ts = Date.now().toString(36).slice(-5);
  return `${base}-${ts}`;
}

async function detectStories(newArticleIds) {
  if (newArticleIds.length === 0) return;

  const { rows: articles } = await query(
    `SELECT id, title, source_id, detected_at FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  // Separate recurring content — flag them but don't cluster into editorial stories
  const storyArticles   = articles.filter(a => !isRecurringContent(a.title));
  const recurringOnes   = articles.filter(a =>  isRecurringContent(a.title));

  // Mark recurring articles as non-story (create stub cluster with is_recurring=true)
  for (const a of recurringOnes) {
    const slug = generateStorySlug(a.title);
    const { rows } = await query(`
      INSERT INTO story_clusters (title, slug, is_recurring, story_type)
      VALUES ($1, $2, true, 'news')
      ON CONFLICT (slug) DO UPDATE SET last_seen = now(), updated_at = now()
      RETURNING id
    `, [a.title, slug]);
    if (rows[0]) {
      await query(
        `INSERT INTO story_cluster_articles (story_id, article_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, a.id]
      );
    }
  }

  if (storyArticles.length === 0) return;

  // Load active non-recurring stories + their article titles for keyword matching
  const { rows: activeStories } = await query(`
    SELECT
      sc.id,
      sc.title,
      COALESCE(
        (SELECT array_agg(ma.title)
         FROM story_cluster_articles sca
         JOIN monitored_articles ma ON ma.id = sca.article_id
         WHERE sca.story_id = sc.id),
        ARRAY[]::text[]
      ) AS article_titles
    FROM story_clusters sc
    WHERE sc.status IN ('active','summarizing','ready')
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '${STORY_WINDOW_HOURS} hours'
  `);

  // Build in-memory keyword signatures for O(N×M) matching
  const signatures = activeStories.map(s => ({
    id:       s.id,
    keywords: extractStoryKeywords(
      (s.article_titles || []).concat([s.title || '']).join(' ')
    ),
  }));

  const affectedIds = new Set();

  for (const article of storyArticles) {
    const artKw = extractStoryKeywords(article.title);
    if (artKw.length < 2) continue;

    let bestId    = null;
    let bestScore = 0;

    for (const sig of signatures) {
      const score = jaccardSim(artKw, sig.keywords);
      if (score > bestScore) { bestScore = score; bestId = sig.id; }
    }

    let assignedId;

    if (bestScore >= STORY_MATCH_THRESHOLD && bestId) {
      const sharedKw = jaccardShared(artKw, signatures.find(s => s.id === bestId)?.keywords || []);
      await query(
        `INSERT INTO story_cluster_articles
           (story_id, article_id, relevance_score, matching_reason, shared_keywords, keyword_similarity, title_similarity)
         VALUES ($1, $2, $3, 'keyword_jaccard', $4, $5, $5) ON CONFLICT DO NOTHING`,
        [bestId, article.id, parseFloat(bestScore.toFixed(3)), JSON.stringify(sharedKw), parseFloat(bestScore.toFixed(3))]
      );
      assignedId = bestId;
      // Extend in-memory signature so later articles in same batch can match
      const sig = signatures.find(s => s.id === bestId);
      if (sig) sig.keywords.push(...artKw);
    } else {
      // Create new story candidate
      const slug = generateStorySlug(article.title);
      const { rows } = await query(
        `INSERT INTO story_clusters (title, slug, keywords, is_recurring)
         VALUES ($1, $2, $3, false) RETURNING id`,
        [article.title, slug, JSON.stringify(artKw)]
      );
      assignedId = rows[0].id;
      await query(
        `INSERT INTO story_cluster_articles
           (story_id, article_id, relevance_score, matching_reason, shared_keywords, keyword_similarity, title_similarity)
         VALUES ($1, $2, 1.0, 'story_seed', $3, 1.0, 1.0) ON CONFLICT DO NOTHING`,
        [assignedId, article.id, JSON.stringify(artKw)]
      );
      signatures.push({ id: assignedId, keywords: artKw });
    }

    affectedIds.add(assignedId);

    // Link article's MONITOR entities to the story
    await query(`
      INSERT INTO story_entities (story_id, entity_id)
      SELECT $1, aem.entity_id
      FROM article_entity_matches aem
      JOIN knowledge_entities ke ON ke.id = aem.entity_id
      WHERE aem.article_id = $2
        AND ke.entity_origin = 'MONITOR'
      ON CONFLICT DO NOTHING
    `, [assignedId, article.id]);
  }

  // Recalculate all quality metrics for affected stories using a single CTE query.
  // story_quality thresholds (score-based, single cap):
  //   <20 → poor | 20-44 → fair | 45-69 → good | ≥70 → excellent
  //   Cap: source_count = 1 AND excellent → good (single-source stories can't be excellent)
  // story_confidence ← source_count corroboration (1 = low, 2-3 = medium, 4+ = high)
  for (const storyId of affectedIds) {
    await query(`
      WITH m AS (
        SELECT
          base.rel_score,
          base.depth_score,
          base.div_score,
          base.cov_score,
          base.cnt_articles,
          base.cnt_sources,
          LEAST(100, base.rel_score + base.depth_score + base.div_score + base.cov_score) AS total_score
        FROM (
          SELECT
            ROUND(COALESCE(AVG(sca.relevance_score), 0) * 35)::integer                        AS rel_score,
            ROUND(LEAST(COALESCE(SUM(ma.content_words), 0)::float / 5000, 1.0) * 25)::integer AS depth_score,
            ROUND(LEAST(COUNT(DISTINCT ma.source_id)::float / 5, 1.0) * 15)::integer           AS div_score,
            ROUND(COALESCE(
              COUNT(ma.id) FILTER (WHERE ma.extraction_method IN ('fetch','playwright'))::float
              / NULLIF(COUNT(ma.id), 0), 0
            ) * 25)::integer                                                                   AS cov_score,
            COUNT(sca.article_id)::integer                                                     AS cnt_articles,
            COUNT(DISTINCT ma.source_id)::integer                                               AS cnt_sources
          FROM story_cluster_articles sca
          LEFT JOIN monitored_articles ma ON ma.id = sca.article_id
          WHERE sca.story_id = $1
        ) base
      )
      UPDATE story_clusters sc
      SET
        article_count           = m.cnt_articles,
        source_count            = m.cnt_sources,
        avg_relevance           = (SELECT AVG(relevance_score) FROM story_cluster_articles WHERE story_id = $1),
        context_relevance_score = m.rel_score,
        context_depth_score     = m.depth_score,
        context_diversity_score = m.div_score,
        context_coverage_score  = m.cov_score,
        story_context_score     = m.total_score,
        story_quality           = CASE
          WHEN m.total_score < 20  THEN 'poor'
          WHEN m.total_score < 45  THEN 'fair'
          WHEN m.total_score < 70  THEN 'good'
          WHEN m.cnt_sources <= 1  THEN 'good'
          ELSE 'excellent'
        END,
        story_confidence        = CASE
          WHEN m.cnt_sources >= 4 THEN 'high'
          WHEN m.cnt_sources >= 2 THEN 'medium'
          ELSE 'low'
        END,
        last_seen  = now(),
        updated_at = now()
      FROM m
      WHERE sc.id = $1
    `, [storyId]);
  }
}

async function markStaleStories() {
  await query(`
    UPDATE story_clusters SET status = 'stale', updated_at = now()
    WHERE status IN ('active','ready')
      AND last_seen < now() - interval '${STORY_WINDOW_HOURS} hours'
  `);
  // Orphan stories: article_count = 0 should never remain active
  await query(`
    UPDATE story_clusters SET status = 'stale', updated_at = now()
    WHERE article_count = 0
      AND status NOT IN ('stale','followed')
      AND is_recurring = false
  `);
}

async function summarizePendingStories() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { rows: pending } = await query(`
    SELECT sc.id, sc.title
    FROM story_clusters sc
    WHERE sc.status = 'active'
      AND sc.is_recurring = false
      AND (sc.article_count >= $1 OR sc.source_count >= $2)
      AND sc.last_seen > now() - interval '${STORY_WINDOW_HOURS} hours'
      AND (
        SELECT CASE WHEN COUNT(*) = 0 THEN false
               ELSE (COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright')))::float
                    / COUNT(*) >= $3
               END
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        WHERE sca.story_id = sc.id
      )
    ORDER BY sc.source_count DESC, sc.article_count DESC
    LIMIT 3
  `, [STORY_SUMMARY_MIN_ARTICLES, STORY_SUMMARY_MIN_SOURCES, ENRICHMENT_GATE_COVERAGE]);

  for (const story of pending) {
    await query(
      `UPDATE story_clusters SET status = 'summarizing', updated_at = now() WHERE id = $1`,
      [story.id]
    );

    const [articlesRes, entitiesRes] = await Promise.all([
      query(`
        SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
               ma.content_words, ts.name AS source_name
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        JOIN tracked_sources    ts ON ts.id = ma.source_id
        WHERE sca.story_id = $1
          AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
        ORDER BY sca.relevance_score DESC, ma.detected_at DESC
      `, [story.id]),
      query(`
        SELECT ke.name, ke.entity_type, se.role
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = $1
        LIMIT 12
      `, [story.id]),
    ]);

    // Log AI context for traceability
    query(`
      INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
      VALUES ($1, 'story_summary', $2, $3, $4)
    `, [
      story.id,
      articlesRes.rows.length,
      JSON.stringify(articlesRes.rows.map(a => a.title)),
      articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
    ]).catch(() => {});

    try {
      const result = await ai.generateStorySummary(articlesRes.rows, entitiesRes.rows);
      await query(`
        UPDATE story_clusters SET
          title                   = $1,
          summary                 = $2,
          story_type              = $3,
          importance_score        = $4,
          coverage_status         = $5,
          editorial_opportunities = $6,
          status                  = 'ready',
          updated_at              = now()
        WHERE id = $7
      `, [
        result.headline,
        result.summary,
        result.story_type     || 'news',
        result.importance_score ?? 5,
        result.coverage_status || 'monitoring',
        JSON.stringify(result.editorial_opportunities || []),
        story.id,
      ]);
      console.log(`[Monitor] Story ready: "${result.headline}"`);
    } catch (e) {
      console.error(`[Monitor] Story summarization failed for "${story.title}":`, e.message);
      await query(
        `UPDATE story_clusters SET status = 'active', updated_at = now() WHERE id = $1`,
        [story.id]
      );
    }
  }
}

// ── Editorial Opportunity Engine (Sprint 5.6.1) ───────────────────────────────

function calcComposite(editorial, traffic, seo, urgency) {
  return parseFloat((editorial * 0.4 + traffic * 0.3 + seo * 0.2 + urgency * 0.1).toFixed(2));
}

const VALID_OPP_TYPES = new Set([
  'NEWS', 'SEO', 'ANALYSIS', 'EXPLAINER', 'SOCIAL', 'FACT_CHECK', 'LIVE_COVERAGE', 'OPINION'
]);

async function generateOpportunitiesForStories() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  // Find ready stories that don't have fresh opportunities yet (< 4h old)
  const { rows: stories } = await query(`
    SELECT sc.id, sc.title, sc.summary, sc.story_type, sc.importance_score, sc.coverage_status
    FROM story_clusters sc
    WHERE sc.status = 'ready'
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM story_opportunities so
        WHERE so.story_cluster_id = sc.id
          AND so.created_at > now() - interval '4 hours'
      )
      AND (
        SELECT CASE WHEN COUNT(*) = 0 THEN false
               ELSE (COUNT(*) FILTER (WHERE ma.extraction_method IN ('fetch','playwright')))::float
                    / COUNT(*) >= $1
               END
        FROM story_cluster_articles sca
        JOIN monitored_articles ma ON ma.id = sca.article_id
        WHERE sca.story_id = sc.id
      )
    ORDER BY sc.importance_score DESC, sc.source_count DESC
    LIMIT 5
  `, [ENRICHMENT_GATE_COVERAGE]);

  for (const story of stories) {
    try {
      const [articlesRes, entitiesRes] = await Promise.all([
        query(`
          SELECT ma.title, ma.url, ma.summary, ma.detected_at, ma.content_text, ma.extraction_method,
                 ma.content_words, ts.name AS source_name
          FROM story_cluster_articles sca
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN tracked_sources    ts ON ts.id = ma.source_id
          WHERE sca.story_id = $1
            AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
          ORDER BY sca.relevance_score DESC, ma.detected_at DESC
          LIMIT 15
        `, [story.id]),
        query(`
          SELECT ke.name, ke.entity_type
          FROM story_entities se
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE se.story_id = $1
          LIMIT 10
        `, [story.id]),
      ]);

      // Log AI context for traceability
      query(`
        INSERT INTO ai_generation_logs (story_id, generation_type, article_count, article_titles, total_words_sent)
        VALUES ($1, 'opportunities', $2, $3, $4)
      `, [
        story.id,
        articlesRes.rows.length,
        JSON.stringify(articlesRes.rows.map(a => a.title)),
        articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
      ]).catch(() => {});

      const opps = await ai.generateEditorialOpportunities(
        story, articlesRes.rows, entitiesRes.rows
      );

      // Clear stale pending opportunities before inserting fresh batch
      await query(
        `DELETE FROM story_opportunities WHERE story_cluster_id = $1 AND status = 'pending'`,
        [story.id]
      );

      for (const opp of opps) {
        const type      = VALID_OPP_TYPES.has(opp.opportunity_type) ? opp.opportunity_type : 'NEWS';
        const editorial = Math.min(100, Math.max(0, opp.editorial_score || 50));
        const traffic   = Math.min(100, Math.max(0, opp.traffic_score   || 50));
        const seo       = Math.min(100, Math.max(0, opp.seo_score       || 50));
        const urgency   = Math.min(100, Math.max(0, opp.urgency_score   || 50));
        const composite = calcComposite(editorial, traffic, seo, urgency);

        await query(`
          INSERT INTO story_opportunities
            (story_cluster_id, title, description, opportunity_type,
             traffic_score, seo_score, urgency_score, editorial_score, composite_score)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [story.id, opp.title, opp.description || null, type,
            traffic, seo, urgency, editorial, composite]);
      }

      console.log(`[Monitor] ${opps.length} opportunities generated for: "${story.title}"`);
    } catch (e) {
      console.error(`[Monitor] Opportunity generation failed for "${story.title}":`, e.message);
    }
  }
}

// ── Event Intelligence (Sprint 5.6) ──────────────────────────────────────────

const EVENT_WINDOW_HOURS         = 48;
const EVENT_ENTITY_THRESHOLD     = 0.35; // Jaccard on shared entities to group stories into one event
const EVENT_SUMMARY_MIN_STORIES  = 2;    // min story clusters before event gets AI summary

function calcEditorialScore(importanceScore, sourceCount, articleCount, coverageStatus) {
  const impPart    = (importanceScore / 10) * 40;
  const srcPart    = Math.min(sourceCount / 5, 1) * 25;
  const livePart   = coverageStatus === 'breaking' ? 20 : coverageStatus === 'growing' ? 15 : 10;
  const artPart    = Math.min(articleCount / 20, 1) * 15;
  return Math.round(impPart + srcPart + livePart + artPart);
}

async function detectEvents(affectedStoryIds) {
  if (affectedStoryIds.length === 0) return;

  // Load each affected story with its entity set
  const { rows: newStories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.article_count,
      sc.source_count,
      sc.importance_score,
      sc.coverage_status,
      COALESCE(
        (SELECT array_agg(ke.name)
         FROM story_entities se
         JOIN knowledge_entities ke ON ke.id = se.entity_id
         WHERE se.story_id = sc.id),
        ARRAY[]::text[]
      ) AS entities
    FROM story_clusters sc
    WHERE sc.id = ANY($1::uuid[])
      AND sc.is_recurring = false
      AND sc.status IN ('active','summarizing','ready','followed')
  `, [affectedStoryIds]);

  if (newStories.length === 0) return;

  // Load active non-stale event clusters with their entity union and linked story ids
  const { rows: activeEvents } = await query(`
    SELECT
      ec.id,
      ec.headline,
      COALESCE(
        (SELECT array_agg(DISTINCT ke.name)
         FROM event_cluster_stories ecs
         JOIN story_entities se ON se.story_id = ecs.story_id
         JOIN knowledge_entities ke ON ke.id = se.entity_id
         WHERE ecs.event_id = ec.id),
        ARRAY[]::text[]
      ) AS entities,
      COALESCE(
        (SELECT array_agg(ecs.story_id)
         FROM event_cluster_stories ecs
         WHERE ecs.event_id = ec.id),
        ARRAY[]::uuid[]
      ) AS story_ids
    FROM event_clusters ec
    WHERE ec.status IN ('active','followed')
      AND ec.last_updated_at > now() - interval '${EVENT_WINDOW_HOURS} hours'
  `);

  const eventSigs = activeEvents.map(e => ({
    id:       e.id,
    entities: new Set((e.entities || []).map(n => n.toLowerCase())),
    storyIds: new Set((e.story_ids || []).map(String)),
  }));

  const affectedEventIds = new Set();

  for (const story of newStories) {
    const storyEntities = new Set((story.entities || []).map(n => n.toLowerCase()));
    if (storyEntities.size === 0) continue;

    // Skip stories already linked to any active event — prevents creating duplicate events
    if (eventSigs.some(ev => ev.storyIds.has(String(story.id)))) continue;

    let bestEventId = null;
    let bestScore   = 0;

    for (const ev of eventSigs) {
      if (ev.storyIds.has(String(story.id))) continue; // already linked
      const intersection = [...storyEntities].filter(e => ev.entities.has(e)).length;
      const union        = new Set([...storyEntities, ...ev.entities]).size;
      const score        = union === 0 ? 0 : intersection / union;
      if (score > bestScore) { bestScore = score; bestEventId = ev.id; }
    }

    if (bestScore >= EVENT_ENTITY_THRESHOLD && bestEventId) {
      await query(
        `INSERT INTO event_cluster_stories (event_id, story_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [bestEventId, story.id]
      );
      affectedEventIds.add(bestEventId);
      // Extend the in-memory entity set for subsequent stories
      const ev = eventSigs.find(e => e.id === bestEventId);
      if (ev) {
        storyEntities.forEach(e => ev.entities.add(e));
        ev.storyIds.add(String(story.id));
      }
    } else if (storyEntities.size >= 2) {
      // Create a new event candidate from this story
      const { rows } = await query(`
        INSERT INTO event_clusters (headline, event_type, importance_score, coverage_status)
        VALUES ($1, 'general', $2, $3)
        RETURNING id
      `, [story.title, story.importance_score || 5, story.coverage_status || 'monitoring']);
      const newEventId = rows[0].id;
      await query(
        `INSERT INTO event_cluster_stories (event_id, story_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [newEventId, story.id]
      );
      affectedEventIds.add(newEventId);
      eventSigs.push({
        id:       newEventId,
        entities: new Set(storyEntities),
        storyIds: new Set([String(story.id)]),
      });
    }
  }

  // Recalculate metrics for all affected events
  for (const eventId of affectedEventIds) {
    await query(`
      UPDATE event_clusters ec SET
        story_count   = (SELECT COUNT(*) FROM event_cluster_stories WHERE event_id = $1),
        article_count = (
          SELECT COALESCE(SUM(sc.article_count), 0)
          FROM event_cluster_stories ecs
          JOIN story_clusters sc ON sc.id = ecs.story_id
          WHERE ecs.event_id = $1
        ),
        source_count  = (
          SELECT COUNT(DISTINCT ma.source_id)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          WHERE ecs.event_id = $1
        ),
        editorial_score = LEAST(100, GREATEST(0, ROUND((
          (ec.importance_score::float / 10 * 40)
          + LEAST((SELECT COUNT(DISTINCT ma2.source_id)::float / 5
                   FROM event_cluster_stories ecs2
                   JOIN story_cluster_articles sca2 ON sca2.story_id = ecs2.story_id
                   JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
                   WHERE ecs2.event_id = $1), 1) * 25
          + CASE ec.coverage_status WHEN 'breaking' THEN 20 WHEN 'growing' THEN 15 ELSE 10 END
          + LEAST(COALESCE((SELECT SUM(sc2.article_count)::float / 20
                            FROM event_cluster_stories ecs3
                            JOIN story_clusters sc2 ON sc2.id = ecs3.story_id
                            WHERE ecs3.event_id = $1), 0), 1) * 15
        )::integer))),
        last_updated_at = now(),
        updated_at      = now()
      WHERE ec.id = $1
    `, [eventId]);
  }
}

async function markStaleEvents() {
  await query(`
    UPDATE event_clusters SET status = 'stale', updated_at = now()
    WHERE status IN ('active','followed')
      AND last_updated_at < now() - interval '${EVENT_WINDOW_HOURS} hours'
  `);
}

async function summarizePendingEvents() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { rows: pending } = await query(`
    SELECT ec.id, ec.headline, ec.story_count, ec.article_count, ec.source_count, ec.coverage_status
    FROM event_clusters ec
    WHERE ec.status = 'active'
      AND ec.story_count >= $1
      AND ec.last_updated_at > now() - interval '${EVENT_WINDOW_HOURS} hours'
      AND (ec.last_summarized_at IS NULL OR ec.last_summarized_at < now() - interval '2 hours')
    ORDER BY ec.source_count DESC, ec.article_count DESC
    LIMIT 3
  `, [EVENT_SUMMARY_MIN_STORIES]);

  for (const event of pending) {
    try {
      const [storiesRes, articlesRes, entitiesRes] = await Promise.all([
        query(`
          SELECT sc.id, sc.title, sc.article_count, sc.source_count, sc.importance_score, sc.coverage_status
          FROM event_cluster_stories ecs
          JOIN story_clusters sc ON sc.id = ecs.story_id
          WHERE ecs.event_id = $1
        `, [event.id]),
        query(`
          SELECT DISTINCT ON (ma.id) ma.title, ma.url, ma.summary, ma.detected_at,
                 ma.content_text, ma.extraction_method, ma.content_words, ts.name AS source_name
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN tracked_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = $1
            AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
          ORDER BY ma.id, ma.detected_at DESC
          LIMIT 25
        `, [event.id]),
        query(`
          SELECT DISTINCT ke.name, ke.entity_type
          FROM event_cluster_stories ecs
          JOIN story_entities se ON se.story_id = ecs.story_id
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE ecs.event_id = $1
          LIMIT 15
        `, [event.id]),
      ]);

      // Log AI context for traceability
      query(`
        INSERT INTO ai_generation_logs (event_id, generation_type, article_count, article_titles, total_words_sent)
        VALUES ($1, 'event_summary', $2, $3, $4)
      `, [
        event.id,
        articlesRes.rows.length,
        JSON.stringify(articlesRes.rows.map(a => a.title)),
        articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
      ]).catch(() => {});

      const result = await ai.generateEventSummary(
        storiesRes.rows, articlesRes.rows, entitiesRes.rows
      );

      const editScore = calcEditorialScore(
        result.importance_score ?? event.importance_score ?? 5,
        event.source_count,
        event.article_count,
        result.coverage_status || event.coverage_status
      );

      await query(`
        UPDATE event_clusters SET
          headline           = $1,
          summary            = $2,
          event_type         = $3,
          importance_score   = $4,
          editorial_score    = $5,
          coverage_status    = $6,
          main_entities      = $7,
          timeline           = $8,
          status             = 'active',
          last_summarized_at = now(),
          updated_at         = now()
        WHERE id = $9
      `, [
        result.headline      || result.event_name || event.headline,
        result.summary       || null,
        result.event_type    || 'general',
        result.importance_score ?? 5,
        editScore,
        result.coverage_status || 'monitoring',
        JSON.stringify(result.main_entities || []),
        JSON.stringify(result.timeline      || []),
        event.id,
      ]);

      // Persist structured editorial opportunities
      if (Array.isArray(result.editorial_opportunities) && result.editorial_opportunities.length > 0) {
        // Clear stale pending opportunities before inserting fresh ones
        await query(
          `DELETE FROM editorial_opportunities WHERE event_id = $1 AND status = 'pending'`,
          [event.id]
        );
        for (const opp of result.editorial_opportunities) {
          await query(`
            INSERT INTO editorial_opportunities
              (event_id, type, title, reason, seo_value, traffic_potential, difficulty)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            event.id,
            opp.type             || 'noticia',
            opp.title            || '',
            opp.reason           || null,
            opp.seo_value        || null,
            opp.traffic_potential || null,
            opp.difficulty       || null,
          ]);
        }
      }

      console.log(`[Monitor] Event ready: "${result.event_name || result.headline}" (score: ${editScore})`);
    } catch (e) {
      console.error(`[Monitor] Event summarization failed for "${event.headline}":`, e.message);
    }
  }
}

// ── Sprint 5.8 — Full Article Acquisition Layer ───────────────────────────────
// Background job: fetches full article content for recent unfetched articles.
// Runs fire-and-forget each monitor cycle. Limit per cycle prevents overloading.

const CONTENT_FETCH_LIMIT = 20;   // max articles fetched per cycle

async function fetchPendingArticleContent() {
  // Priority order:
  // 1. Articles in active stories (last 24h) — these unlock AI generation
  // 2. Articles from the last 24h
  // 3. Articles from the last 72h
  // 4. Historical backlog (oldest last)
  const { rows: pending } = await query(`
    SELECT ma.id, ma.url
    FROM monitored_articles ma
    WHERE ma.extraction_method IS NULL
    ORDER BY
      (EXISTS(
        SELECT 1 FROM story_cluster_articles sca
        JOIN story_clusters sc ON sc.id = sca.story_id
        WHERE sca.article_id = ma.id
          AND sc.status IN ('active','summarizing','ready','followed')
          AND sc.last_seen > now() - interval '24 hours'
      ))::int DESC,
      (ma.detected_at > now() - interval '24 hours')::int DESC,
      (ma.detected_at > now() - interval '72 hours')::int DESC,
      ma.detected_at DESC
    LIMIT ${CONTENT_FETCH_LIMIT}
  `);

  if (pending.length === 0) return;
  console.log(`[Monitor] Fetching content for ${pending.length} articles…`);

  let fetched = 0, playwright = 0, paywall = 0, failed = 0;

  for (const article of pending) {
    try {
      const result = await fetchArticleContentForMonitor(article.url);

      if (result?.method === 'paywall') {
        await query(
          `UPDATE monitored_articles SET extraction_method='paywall', extracted_at=now() WHERE id=$1`,
          [article.id]
        );
        paywall++;
      } else if (result?.content) {
        await query(
          `UPDATE monitored_articles
           SET content_text=$1, content_words=$2, extraction_method=$3, extracted_at=now()
           WHERE id=$4`,
          [result.content, result.word_count, result.method, article.id]
        );
        if (result.method === 'playwright') playwright++;
        else fetched++;
      } else {
        await query(
          `UPDATE monitored_articles SET extraction_method='rss_only', extracted_at=now() WHERE id=$1`,
          [article.id]
        );
        failed++;
      }
    } catch (e) {
      console.error(`[Monitor] Content fetch failed for ${article.url}:`, e.message);
      await query(
        `UPDATE monitored_articles SET extraction_method='rss_only', extracted_at=now() WHERE id=$1`,
        [article.id]
      ).catch(() => {});
      failed++;
    }
  }

  console.log(`[Monitor] Content: ${fetched} fetch, ${playwright} playwright, ${paywall} paywall, ${failed} rss_only`);
}

// ── Main job ──────────────────────────────────────────────────────────────────

export async function runNewsMonitor() {
  // Respect pause flag — lets the CMS pause AI consumption without stopping the process
  const { rows: pauseFlag } = await query(`SELECT value FROM settings WHERE key = 'news_monitor_paused'`).catch(() => ({ rows: [] }));
  if (pauseFlag[0]?.value === 'true') {
    console.log('[Monitor] ⏸ Pausado — ciclo omitido');
    // Record skipped run so health endpoint can confirm worker is alive
    const runId = await startRun('news_monitor');
    await finishRun(runId, { status: 'skipped' });
    return;
  }

  // Self-healing: add last_summarized_at if missing (replaces broken 'summarizing' status)
  await query(`ALTER TABLE event_clusters ADD COLUMN IF NOT EXISTS last_summarized_at TIMESTAMP`).catch(() => {});

  const runId = await startRun('news_monitor');
  let sourcesProcessed = 0;
  let itemsFound = 0;

  try {
    const { rows: sources } = await query(`
      SELECT * FROM tracked_sources
      WHERE enabled = true
        AND (last_checked IS NULL
             OR last_checked < now() - (check_interval || ' seconds')::interval)
    `);

    if (sources.length === 0) {
      await finishRun(runId, { status: 'success' });
      return;
    }

    const allNewIds = [];
    for (const source of sources) {
      const ids = await processSource(source);
      allNewIds.push(...ids);
      sourcesProcessed++;
    }

    itemsFound = allNewIds.length;

    if (allNewIds.length === 0) {
      await finishRun(runId, { status: 'success', sources_processed: sourcesProcessed });
      return;
    }

    console.log(`[Monitor] ${allNewIds.length} new articles from ${sources.length} sources`);

    // Sprint 5.8 — fetch full article content in background (does not block intelligence pipeline)
    fetchPendingArticleContent().catch(e => console.error('[Monitor] Content fetch error:', e.message));

    // Research entity matching (knowledge base context)
    await matchResearchEntities(allNewIds);
    // Monitor NER → MONITOR entities → clusters
    await discoverMonitorEntities(allNewIds);

    await refreshTrendingTopics();
    await checkAutoResearchTriggers();

    // Sprint 5.3 — trend clusters
    await markStaleClusters();
    summarizePendingClusters().catch(e => console.error('[Monitor] Cluster summarization error:', e.message));

    // Sprint 5.5 — story intelligence
    await detectStories(allNewIds);
    await markStaleStories();
    summarizePendingStories().catch(e => console.error('[Monitor] Story summarization error:', e.message));

    // Sprint 5.6.1 — editorial opportunity engine
    generateOpportunitiesForStories().catch(e => console.error('[Monitor] Opportunity generation error:', e.message));

    // Sprint 5.6 — event intelligence
    const { rows: recentStories } = await query(`
      SELECT id FROM story_clusters
      WHERE status IN ('active','ready','followed')
        AND is_recurring = false
        AND last_seen > now() - interval '2 hours'
    `);
    const recentStoryIds = recentStories.map(r => r.id);
    await detectEvents(recentStoryIds);
    await markStaleEvents();
    summarizePendingEvents().catch(e => console.error('[Monitor] Event summarization error:', e.message));

    await finishRun(runId, { status: 'success', sources_processed: sourcesProcessed, items_found: itemsFound });

  } catch (e) {
    console.error('[Monitor] Job error:', e.message);
    await finishRun(runId, { status: 'error', sources_processed: sourcesProcessed, items_found: itemsFound, errors_count: 1, error_message: e.message.slice(0, 500) });
  }
}
