import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { query } from '../routes/db.js';
import { AiService } from '../services/AiService.js';
import { fetchArticleContentForMonitor, fetchArticleContent, playwrightMetrics } from '../services/ArticleFetcher.js';
import { startRun, finishRun } from './workerUtils.js';
import { browserAudit } from '../services/browserLifecycleLogger.js';
import { MonitorProfiler } from './monitorProfiler.js';
import { DiscoveryFactory, initializeFactory } from '../services/DiscoveryFactory.js';
import { processEntityExtraction, processStoryDetection, processEventDetection, processOpportunityGeneration } from './newsMonitor/workers/index.js';
import { browserPool } from './newsMonitor/playwright/BrowserPool.js';

const ai = new AiService();

let isNewsRunning = false;
let newsSkippedCycles = 0;

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
  const re = new RegExp(`<([\\w-]+\\:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/([\\w-]+\\:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[2].trim()) : '';
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

// Extract an attribute value from the first matching tag (for self-closing
// tags like Atom's `<link href="..." />`, which extractTag can't handle
// since it requires a closing `</tag>`).
function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']*)["'][^>]*/?>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[1]) : '';
}

// Parse Atom feed items (<entry> tags). Atom's <link> is self-closing with
// an href attribute, unlike RSS where <link> wraps the URL as text content.
function parseAtomItems(xml) {
  const items = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    const link = extractAttr(raw, 'link', 'href') || extractTag(raw, 'id');
    items.push({
      title:       extractTag(raw, 'title').replace(/\s+/g, ' ').trim(),
      link,
      description: extractTag(raw, 'summary').replace(/<[^>]*>/g, '').trim().slice(0, 500),
      pubDate:     extractTag(raw, 'published') || extractTag(raw, 'updated'),
      guid:        extractTag(raw, 'id') || link,
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
    // extractTag now handles any prefix (news:, n:, etc.) automatically
    const title   = extractTag(block, 'title');
    const pubDate = extractTag(block, 'publication_date') || extractTag(block, 'lastmod');
    if (!title) continue;
    items.push({ title, link: loc, description: '', pubDate, guid: loc });
  }
  return items;
}

// Plain sitemap (no news: namespace, no <title>) — just <loc>+<lastmod>.
// title is left empty; processSource() backfills it from the article HTML
// since Discovery has no title to offer for this format.
function parseUrlsetItems(xml) {
  const items = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const block = m[1];
    const loc   = extractTag(block, 'loc');
    if (!loc || !loc.startsWith('http')) continue;
    const pubDate = extractTag(block, 'lastmod');
    items.push({ title: '', link: loc, description: '', pubDate, guid: loc });
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

function logQueryDebug(label, sql, params) {
  if (process.env.MONITOR_SQL_DEBUG !== '1') return;
  console.error(`[Monitor][SQL DEBUG] ${label}`);
  console.error('[Monitor][SQL DEBUG] SQL:', sql.trim());
  console.error('[Monitor][SQL DEBUG] params:', params);
  console.error('[Monitor][SQL DEBUG] param types:', params.map((value, index) => ({
    index: index + 1,
    jsType: typeof value,
    isArray: Array.isArray(value),
    value,
  })));
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
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;

  // If Content-Type is HTML (not XML), return null to trigger Playwright fallback
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) return null;

  // Some sitemaps are served as raw .gz files with Content-Type: application/x-gzip
  // and no Content-Encoding header — node-fetch only auto-decompresses when
  // Content-Encoding signals transport compression, so this case needs an
  // explicit gunzip (confirmed live: Yahoo serves its news-sitemap this way).
  if (ct.includes('gzip') || url.endsWith('.gz')) {
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      return gunzipSync(buf).toString('utf-8');
    } catch {
      return null;
    }
  }

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
    // Normalize to title-case before stopword check so ALL-CAPS titles
    // ("ESTADOS UNIDOS GANÓ") don't bypass 'De', 'En', 'Al', etc.
    const normalizedBare  = bare[0].toUpperCase() + bare.slice(1).toLowerCase();
    const isNotStopword   = !MONITOR_STOPWORDS.has(normalizedBare);
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

// ── Playwright URL discovery ──────────────────────────────────────────────────
const DISCOVERY_LIMIT = 30; // Configurable: how many URLs to open per homepage

// Check if hostname belongs to media (exact match or subdomain)
function belongsToMedia(hostname, mediaHostname) {
  if (!mediaHostname) return true; // No media context, accept everything

  const h = hostname.toLowerCase();
  const m = mediaHostname.toLowerCase();

  // Exact match: viapais.com.ar === viapais.com.ar
  if (h === m) return true;

  // Subdomain: www.viapais.com.ar, m.viapais.com.ar, amp.viapais.com.ar
  if (h.endsWith('.' + m)) return true;

  return false;
}

// Check if URL is obviously garbage (not an article)
function isGarbageUrl(url) {
  // File extensions
  if (/\.(jpg|png|webp|pdf|gif|doc|docx)$/i.test(url)) return true;

  // Broken URLs
  if (/javascript:|mailto:/.test(url)) return true;

  // Query parameters (search, pagination)
  if (/\?.*?(page|search|q)=/i.test(url)) return true;

  // Garbage paths: only match complete path segments, not text within slug
  const pathSegments = new URL(url).pathname.split('/').filter(s => s);
  const garbageSegments = ['rss', 'feed', 'sitemap', 'login', 'signin', 'logout', 'search',
                           'contacto', 'contact', 'privacy', 'about', 'terms', 'legal',
                           'help', 'faq', 'suscripci', 'subscribe', 'ads', 'jobs', 'carrera',
                           'category', 'categorias', 'tag', 'author', 'page', 'archivo'];

  if (pathSegments.some(seg => garbageSegments.includes(seg.toLowerCase()))) {
    return true;
  }

  return false;
}

// Detect Cloudflare or other blocking challenges
function isBlockedByChallenge(title, content) {
  const cloudflareIndicators = [
    title === 'Just a moment...',
    content.includes('/cdn-cgi/challenge-platform/'),
    content.includes('Checking your browser'),
    content.includes('Attention Required'),
    content.includes('cf-browser-verification'),
  ];
  return cloudflareIndicators.some(indicator => indicator);
}

// URL Candidate Check: Return true if worth opening, false if garbage
function isCandidateUrl(url, mediaHostname) {
  // Must be valid HTTP(S) URL
  if (!url.startsWith('http')) return false;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Step 1: Verify URL belongs to media domain (automatically rejects social platforms)
    if (!belongsToMedia(hostname, mediaHostname)) {
      return false;
    }

    // Step 2: Check if obviously garbage
    if (isGarbageUrl(url)) {
      return false;
    }
  } catch (e) {
    return false; // Invalid URL
  }

  return true;
}

// Validar que un artículo sea real
function validateArticle(article) {
  if (!article.title || article.title.length < 20) {
    article._skipReason = 'title_too_short';
    return false;
  }
  if (!article.url) {
    article._skipReason = 'no_url';
    return false;
  }

  // Rechazar títulos genéricos
  const badTitles = ['Article', 'Read more', 'Leer más', 'Untitled', 'Sin título'];
  if (badTitles.some(bad => article.title === bad)) {
    article._skipReason = 'generic_title';
    return false;
  }

  // Content minimum (measure by wordCount from extractor)
  if (article.wordCount !== undefined && article.wordCount < 120) {
    article._skipReason = `content_too_short:${article.wordCount}words`;
    return false;
  }

  // Validar que NO es homepage — check 1: URL itself is root
  try {
    const urlObj = new URL(article.url);
    if (!urlObj.pathname || urlObj.pathname === '/' || urlObj.pathname === '') {
      article._skipReason = 'url_is_homepage';
      return false;
    }
  } catch (e) {
    // URL parsing failed, continue
  }

  // Validar que NO es homepage — check 2: canonical vs origin
  if (article.canonical) {
    try {
      const originUrl = new URL(article.url);
      const canonicalUrl = new URL(article.canonical);

      // Si canonical es solo origin + '/', es homepage
      if (canonicalUrl.pathname === '/' && canonicalUrl.hostname === originUrl.hostname) {
        article._skipReason = 'canonical_is_homepage';
        return false;
      }
    } catch (e) {
      // URL parsing failed, continue with validation
    }
  }

  // NEW: Validar og:type
  if (article.ogType && article.ogType !== 'article') {
    article._skipReason = `og:type=${article.ogType}`;
    return false;
  }

  // NEW: Validar JSON-LD type
  if (article.jsonLdType) {
    const validTypes = ['NewsArticle', 'Article', 'BlogPosting'];
    const invalidTypes = ['WebSite', 'Organization', 'CollectionPage'];

    if (invalidTypes.includes(article.jsonLdType)) {
      article._skipReason = `jsonld=${article.jsonLdType}`;
      return false;
    }

    if (!validTypes.includes(article.jsonLdType)) {
      // Tipo no reconocido - es sospechoso pero permitir
      article._skipReason = `jsonld=${article.jsonLdType}`;
    }
  }

  // Missing publishedAt — log it but don't block (old articles may lack dates)
  if (!article.publishedAt) {
    article._skipReason = 'no_published_date';
    // Note: confidence already penalized by extractor
  }

  return true;
}

// Extraer metadata de una URL individual (con Playwright) — RICH EXTRACTOR v2
async function extractArticleMetadata(page, url) {
  try {
    // Use 'load' + fixed timeout (not networkidle — ads/analytics never end)
    // 25s timeout: some sites (Yahoo) need 20s+ to load articles
    await page.goto(url, { waitUntil: 'load', timeout: 25_000 });
    await page.waitForTimeout(1500); // Stable: let DOM settle without waiting for ads/analytics
  } catch (e) {
    console.warn(`[Extractor] Navigation failed: ${e.message}`);
    return null;
  }

  const metadata = await page.evaluate((urlParam) => {
    // CRITICAL: Capture page readiness first (may explain incomplete extraction)
    const pageReady = {
      readyState: document.readyState,
      bodyLength: document.body.innerText.length,
      h1Count: document.querySelectorAll('h1').length,
      paragraphCount: document.querySelectorAll('p').length,
    };

    let rawTitle = null;
    let titleWinner = null; // Track which source was chosen
    let cleanTitle = null;
    let description = null;
    let author = null;
    let publishedAt = null;
    let modifiedAt = null;
    let canonical = null;
    let section = null;
    let language = null;
    let images = []; // NEW: will be {url, alt, width, height}
    let keywords = [];
    let contentHtml = null;
    let contentText = null;
    let wordCount = 0;
    let paragraphCount = 0;
    let readingTime = 0; // NEW: wordCount / 220
    let confidence = 0;
    let ogType = null;
    let jsonLdType = null;
    let jsonld = null; // NEW: full schema, not just type
    let hasVideo = false; // NEW
    let hasGallery = false; // NEW
    let hasIframe = false; // NEW
    let hasEmbed = false; // NEW
    let hasTable = false; // NEW
    let entities = { people: [], organizations: [], locations: [] }; // NEW: basic extraction

    // 1. JSON-LD (most structured) — FIXED: support array, object, @graph
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      let allSchemas = [];

      for (const script of jsonLdScripts) {
        const data = JSON.parse(script.textContent);

        // Handle array of schemas
        if (Array.isArray(data)) {
          allSchemas = allSchemas.concat(data);
        }
        // Handle @graph
        else if (data['@graph']) {
          allSchemas = allSchemas.concat(Array.isArray(data['@graph']) ? data['@graph'] : [data['@graph']]);
        }
        // Handle single object
        else {
          allSchemas.push(data);
        }
      }

      // Find best schema (NewsArticle > Article > BlogPosting)
      let bestSchema = null;
      for (const schema of allSchemas) {
        const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
        if (types.includes('NewsArticle') || types.includes('Article') || types.includes('BlogPosting')) {
          bestSchema = schema;
          jsonLdType = types.includes('NewsArticle') ? 'NewsArticle'
                     : types.includes('Article') ? 'Article'
                     : 'BlogPosting';
          break;
        }
      }

      if (bestSchema) {
        jsonld = bestSchema; // NEW: save complete schema
        if (bestSchema.headline) {
          rawTitle = bestSchema.headline;
          titleSource = 'json-ld.headline';
        }
        if (bestSchema.description) description = bestSchema.description;
        if (bestSchema.datePublished) publishedAt = bestSchema.datePublished;
        if (bestSchema.dateModified) modifiedAt = bestSchema.dateModified;
        if (bestSchema.author) {
          author = typeof bestSchema.author === 'string' ? bestSchema.author
                 : bestSchema.author.name || null;
        }
        if (bestSchema.image) {
          const imgs = Array.isArray(bestSchema.image) ? bestSchema.image : [bestSchema.image];
          images = imgs.map(img => {
            if (typeof img === 'string') return { url: img, alt: null, width: null, height: null };
            return { url: img.url, alt: img.caption || img.name || null, width: img.width || null, height: img.height || null };
          }).filter(i => i.url);
        }
        if (bestSchema.keywords) keywords = typeof bestSchema.keywords === 'string'
          ? bestSchema.keywords.split(',').map(k => k.trim())
          : Array.isArray(bestSchema.keywords) ? bestSchema.keywords : [];
        confidence += 25;
      }
    } catch {}

    // 2. OpenGraph
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && !rawTitle) rawTitle = ogTitle;

    const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    if (ogDesc && !description) description = ogDesc;

    ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content');

    // NEW: Extract OG image with metadata
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage && !images.find(i => i.url === ogImage)) {
      images.push({ url: ogImage, alt: null, width: null, height: null });
    }

    if (ogType === 'article') confidence += 10;

    // 3. Meta tags
    if (!description) {
      description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    }

    if (!author) {
      author = document.querySelector('meta[name="author"]')?.getAttribute('content')
            || document.querySelector('meta[property="article:author"]')?.getAttribute('content');
    }
    if (author) confidence += 10;

    if (!publishedAt) {
      publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
                 || document.querySelector('meta[name="publish_date"]')?.getAttribute('content')
                 || document.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content');
    }
    if (publishedAt) confidence += 10;

    if (!modifiedAt) {
      modifiedAt = document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content');
    }

    canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonical) confidence += 15;

    section = document.querySelector('meta[property="article:section"]')?.getAttribute('content');

    language = document.documentElement.lang || document.querySelector('meta[name="language"]')?.getAttribute('content');

    // Extract images from multiple sources
    if (!images.length) {
      const schemaImg = document.querySelector('meta[itemprop="image"]')?.getAttribute('content');
      if (schemaImg) images.push({ url: schemaImg, alt: null, width: null, height: null });
    }

    // NEW: Extract from figure img (many news sites skip OG)
    if (images.length < 3) {
      document.querySelectorAll('figure img').forEach(img => {
        const url = img.src || img.dataset.src;
        if (url && !images.find(i => i.url === url)) {
          images.push({ url, alt: img.alt || null, width: img.naturalWidth || null, height: img.naturalHeight || null });
        }
      });
    }

    // Extract keywords from multiple sources
    if (!keywords.length) {
      const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content');
      if (metaKeywords) keywords = metaKeywords.split(',').map(k => k.trim());
    }

    // NEW: Extract from article:tag (WordPress common)
    const articleTags = document.querySelectorAll('meta[property="article:tag"]');
    articleTags.forEach(tag => {
      const val = tag.getAttribute('content');
      if (val && !keywords.includes(val)) keywords.push(val);
    });

    // 4. Title extraction — Capture ALL sources FIRST, THEN decide with clear logic
    let jsonldTitle = rawTitle; // Already captured above
    // ogTitle already captured from OG meta tag above at line 454
    let h1El = document.querySelector('h1');
    let h1Title = h1El?.textContent?.trim();
    let h1Html = h1El?.outerHTML;
    let docTitle = document.title;
    let twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');

    // Decide which source wins (explicit, not cascaded)
    if (jsonldTitle) {
      titleWinner = 'json-ld';
      rawTitle = jsonldTitle;
      confidence += 25;
    } else if (ogTitle) {
      titleWinner = 'og';
      rawTitle = ogTitle;
      confidence += 20;
    } else if (h1Title) {
      titleWinner = 'h1';
      rawTitle = h1Title;
      confidence += 20;
    } else if (docTitle) {
      titleWinner = 'document';
      rawTitle = docTitle;
      confidence += 5;
    } else if (twitterTitle) {
      titleWinner = 'twitter';
      rawTitle = twitterTitle;
      confidence += 15;
    }

    // Store ALL sources with their lengths for debugging
    const titleSources = {
      'json-ld': { value: jsonldTitle, length: jsonldTitle?.length || 0 },
      'og': { value: ogTitle, length: ogTitle?.length || 0 },
      'h1': { value: h1Title, length: h1Title?.length || 0 },
      'document': { value: docTitle, length: docTitle?.length || 0 },
      'twitter': { value: twitterTitle, length: twitterTitle?.length || 0 },
    };

    // 5. Smart content selection — NO class selectors, limit div traversal
    const candidates = [];

    // Collect potential content containers (high-priority first)
    ['article', 'main', '[role="main"]', 'section'].forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el.textContent?.trim().length > 100) candidates.push(el);
        });
      } catch {}
    });

    // Only add divs that have paragraphs (not all 20K divs)
    try {
      document.querySelectorAll('div:has(p)').forEach(el => {
        if (el.textContent?.trim().length > 100) candidates.push(el);
      });
    } catch {
      // :has() not supported, fallback to checking divs with paragraphs
      document.querySelectorAll('div').forEach(el => {
        if (el.querySelectorAll('p').length > 0 && el.textContent?.trim().length > 100) {
          candidates.push(el);
        }
      });
    }

    let bestCandidate = null;
    let bestScore = 0;

    for (const el of candidates) {
      const paragraphs = el.querySelectorAll('p').length;
      const text = el.textContent?.trim().length || 0;
      const links = el.querySelectorAll('a').length;

      // Score: paragraphs (×5), text volume (÷100), fewer links (×-2)
      // Removed DOM depth — not meaningful
      const score = (paragraphs * 5) + (text / 100) - (links * 2);

      if (score > bestScore && paragraphs > 0) { // Must have at least one paragraph
        bestScore = score;
        bestCandidate = el;
      }
    }

    if (bestCandidate) {
      // FIXED: Extract BOTH HTML and TEXT — never discard structure
      contentHtml = bestCandidate.innerHTML;
      contentText = bestCandidate.textContent?.trim() || '';

      paragraphCount = bestCandidate.querySelectorAll('p').length;
      wordCount = contentText.split(/\s+/).filter(w => w.length > 0).length;
      readingTime = Math.ceil(wordCount / 220); // NEW: reading time in minutes

      if (wordCount > 0) confidence += 5;

      // NEW: Detect media & structural elements
      hasVideo = bestCandidate.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]') !== null;
      hasGallery = bestCandidate.querySelectorAll('img').length > 3;
      hasIframe = bestCandidate.querySelector('iframe') !== null;
      hasEmbed = bestCandidate.querySelector('[class*="embed"]') !== null;
      hasTable = bestCandidate.querySelector('table') !== null;
    }

    // 6. Title cleaning — keep raw, create clean version
    cleanTitle = rawTitle;
    if (cleanTitle) {
      cleanTitle = cleanTitle.trim().slice(0, 200);
      // Only remove the most obvious suffixes — don't be aggressive
      cleanTitle = cleanTitle.replace(/ \| .+$/, '').replace(/ - .+$/, '');
    }

    // NEW: Extract basic entities from title + description (simple NER)
    if (rawTitle) {
      const titleText = rawTitle + ' ' + (description || '');
      // Look for capitalized patterns (very basic, but no AI cost)
      const namePattern = /\b([A-Z][a-z]+ (?:de |del )?[A-Z][a-záéíóú]+)\b/g;
      const matches = titleText.match(namePattern) || [];
      matches.forEach(name => {
        if (name.length > 3 && !entities.people.includes(name)) {
          entities.people.push(name);
        }
      });
    }

    return {
      // URL & Structure
      url: urlParam,
      canonical,

      // Titles (raw + clean)
      rawTitle,
      cleanTitle,
      titleWinner,
      titleSources,
      h1OuterHtml: h1Html,

      // Metadata
      description,
      author,
      publishedAt,
      modifiedAt,
      section,
      language,

      // Images & Keywords (enriched)
      images,
      keywords,

      // Content (HTML + TEXT — never lose structure)
      contentHtml,
      contentText,

      // Metrics (reading time new)
      wordCount,
      paragraphCount,
      readingTime,

      // Media & Structural elements (new)
      hasVideo,
      hasGallery,
      hasIframe,
      hasEmbed,
      hasTable,

      // Schema & OG info (jsonld now complete)
      jsonLdType,
      jsonld,
      ogType,

      // Entities (basic extraction)
      entities,

      // Page readiness (CRITICAL: helps detect incomplete rendering)
      pageReady,

      // Confidence with real weights
      confidence: Math.min(100, confidence),
    };
  }, url);  // Pass url as argument to page.evaluate()

  return metadata;
}

// Discovery: Extract URLs from homepage, filter by domain and garbage only
async function discoverArticleUrlsFromHomepage(page, homeUrl) {
  try {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.warn(`[Discovery] Navigation failed: ${e.message}`);
    return [];
  }

  // Check for Cloudflare or other blocking challenges
  const pageTitle = await page.title();
  const pageContent = await page.content();

  if (isBlockedByChallenge(pageTitle, pageContent)) {
    console.log(`[Discovery] BLOCKED_BY_CLOUDFLARE | source_url=${homeUrl} | title="${pageTitle}"`);
    return [];
  }

  const allUrls = await page.evaluate(() => {
    const urls = new Set();
    const links = document.querySelectorAll('a[href]');

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      let full;
      if (href.startsWith('http')) {
        full = href;
      } else {
        const path = href.startsWith('/') ? href : '/' + href;
        full = window.location.origin + path;
      }

      // Clean: remove query params and fragments
      full = full.split('?')[0].split('#')[0];

      // Must be same domain
      if (full.startsWith(window.location.origin) && full.length > 10) {
        urls.add(full);
      }
    });

    return Array.from(urls);
  });

  // Extract media hostname from homeUrl for domain verification
  let mediaHostname = '';
  try {
    const urlObj = new URL(homeUrl);
    mediaHostname = urlObj.hostname;
  } catch (e) {
    console.warn(`[Discovery] Could not parse homeUrl: ${e.message}`);
  }

  // Step 1: Filter by domain (must belong to media)
  const sameDomain = allUrls.filter(url => {
    try {
      const urlObj = new URL(url);
      return belongsToMedia(urlObj.hostname, mediaHostname);
    } catch {
      return false;
    }
  });

  // Step 2: Filter by garbage (reject obvious non-articles)
  const notGarbage = sameDomain.filter(url => !isGarbageUrl(url));

  // Step 3: Remove duplicates (keep first occurrence in DOM order)
  const deduped = [];
  const seen = new Set();
  notGarbage.forEach(url => {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  });

  // Step 4: Take first DISCOVERY_LIMIT candidates
  const topUrls = deduped.slice(0, DISCOVERY_LIMIT);

  // Log discovery summary with detailed breakdown
  const externalCount = allUrls.length - sameDomain.length;
  const garbageFiltered = sameDomain.length - notGarbage.length;
  const duplicateCount = notGarbage.length - deduped.length;

  console.log(`\n[Discovery] Summary`);
  console.log(`[Discovery]   Found links ............ ${allUrls.length}`);
  console.log(`[Discovery]   Same domain ........... ${sameDomain.length}`);
  if (externalCount > 0) console.log(`[Discovery]   External domain ....... ${externalCount}`);
  console.log(`[Discovery]   After garbage filter .. ${notGarbage.length}`);
  if (garbageFiltered > 0) console.log(`[Discovery]   Garbage removed ....... ${garbageFiltered}`);
  console.log(`[Discovery]   After dedup ........... ${deduped.length}`);
  if (duplicateCount > 0) console.log(`[Discovery]   Duplicates removed .... ${duplicateCount}`);
  console.log(`[Discovery]   Final candidates ..... ${topUrls.length}`);
  console.log(`[Discovery]   Opening .............. ${Math.min(DISCOVERY_LIMIT, topUrls.length)}`);

  return topUrls;
}

// Extract metadata from multiple URLs with concurrency limit
async function extractArticlesWithConcurrency(browser, urls, workerCount = 5) {
  const articles = [];
  let metadataOk = 0;
  const rejectStats = {
    title_too_short: 0,
    content_too_short: 0,
    generic_title: 0,
    url_is_homepage: 0,
    canonical_is_homepage: 0,
    no_published_date: 0,
    og_type_invalid: 0,
    jsonld_invalid: 0,
    no_url: 0,
    extraction_failed: 0
  };
  const queue = [...urls];
  const workers = [];

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;

      const page = await browser.newPage();
      try {
        const metadata = await extractArticleMetadata(page, url);

        if (metadata) {
          metadataOk++;

          // Map extractor output to article fields (title = cleanTitle)
          const article = {
            ...metadata,
            url,
            title: metadata.cleanTitle || metadata.rawTitle,
          };

          if (validateArticle(article)) {
            articles.push({
              title: article.title,
              link: url,
              description: metadata.description || '',
              pubDate: metadata.publishedAt || new Date().toISOString(),
              guid: url
            });
          } else if (article._skipReason) {
            const reason = article._skipReason.split(':')[0];
            if (rejectStats.hasOwnProperty(reason)) {
              rejectStats[reason]++;
            }
          }
        } else {
          rejectStats.extraction_failed++;
        }
      } catch (e) {
        rejectStats.extraction_failed++;
      } finally {
        await page.close();
      }
    }
  };

  // Launch workers
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Log extraction summary
  console.log(`\n[Extraction] Summary`);
  console.log(`[Extraction]   Opened ............... ${urls.length}`);
  console.log(`[Extraction]   Metadata OK ......... ${metadataOk}`);
  console.log(`[Extraction]   Validate OK ......... ${articles.length}`);

  // Log rejections
  let totalRejected = 0;
  Object.values(rejectStats).forEach(count => totalRejected += count);

  if (totalRejected > 0) {
    console.log(`[Extraction]   Rejected breakdown:`);
    Object.entries(rejectStats).forEach(([reason, count]) => {
      if (count > 0) {
        console.log(`[Extraction]     - ${reason}: ${count}`);
      }
    });
  }

  console.log(`[Extraction]   Accepted ............ ${articles.length}`);

  return articles;
}

async function discoverArticlesViaPlaywright(source) {
  console.log(`[Playwright Discovery] Starting for: ${source.name}`);
  const isTraceSource = source.name === 'Guau Formosa';

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // Determine homepage URL
    let homeUrl = source.home_url || source.rss_url?.replace(/\/rss.*/, '').replace(/\/feed.*/, '');
    if (!homeUrl || !homeUrl.startsWith('http')) {
      homeUrl = `https://${source.name.split(/\s+/)[0].toLowerCase()}.com`;
    }

    // STEP 1: Discover URLs from homepage
    console.log(`[Playwright Discovery] Discovering URLs from ${homeUrl}`);
    const topUrls = await discoverArticleUrlsFromHomepage(page, homeUrl);
    console.log(`[Playwright Discovery] Found ${topUrls.length} candidate URLs from ${source.name}`);

    if (isTraceSource) {
      console.log(`\n[TRACE] URLs descubiertas (${topUrls.length}):`);
      topUrls.slice(0, 25).forEach((url, i) => {
        console.log(`  ${i+1}. ${url}`);
      });
      if (topUrls.length > 25) console.log(`  ... y ${topUrls.length - 25} más`);
    }

    if (topUrls.length === 0) {
      await browser.close();
      return [];
    }

    // STEP 2: Extract metadata from top URLs with concurrency
    console.log(`[Playwright Discovery] Extracting metadata from ${topUrls.length} URLs`);
    const articles = await extractArticlesWithConcurrency(browser, topUrls.slice(0, 20), 5);
    console.log(`[Playwright Discovery] Extracted ${articles.length} valid articles from ${source.name}`);

    if (isTraceSource) {
      console.log(`\n[TRACE] Artículos aceptados (${articles.length}):`);
      articles.forEach((art, i) => {
        console.log(`  ${i+1}. "${art.title.substring(0, 50)}..." (${art.wordCount} words)`);
      });
    }

    await browser.close();
    return articles;
  } catch (err) {
    console.error(`[Playwright Discovery] Error for ${source.name}: ${err.message}`);
    return [];
  }
}

// ── Discovery Strategy (Sprint 2) ─────────────────────────────────────────────
// DiscoveryFactory pattern: operator chooses method, worker executes

async function discoverArticlesForSource(source) {
  let articles = [];
  let status = 'OK';
  let errorMessage = null;
  let format = null;
  const startTime = Date.now();

  try {
    const discoveryType = source.discovery_type || 'RSS';
    const strategy = DiscoveryFactory.get(discoveryType);
    const result = await strategy.execute(source);
    articles = result.articles;
    format = result.format;

    if (articles.length === 0) {
      status = 'EMPTY';
    } else {
      status = 'OK';
    }

  } catch (error) {
    const classification = DiscoveryFactory.classifyError(error);
    status = classification.status;
    errorMessage = classification.error;
    articles = [];
  }

  const durationMs = Date.now() - startTime;

  // Update discovery status and metrics in database
  try {
    await query(
      `UPDATE rss_sources
       SET last_discovery_status = $1,
           last_discovery_error = $2,
           last_discovery_duration_ms = $3,
           last_articles_found = $4,
           last_discovery_at = NOW(),
           consecutive_discovery_failures = CASE WHEN $1::varchar = 'OK' THEN 0 ELSE consecutive_discovery_failures + 1 END
       WHERE id = $5`,
      [status, errorMessage, durationMs, articles.length, source.id]
    );
  } catch (dbError) {
    console.error(`[Monitor] Failed to update discovery status for "${source.name}": ${dbError.message}`);
  }

  return { articles, status, errorMessage, format };
}

// ── Source processing ─────────────────────────────────────────────────────────

async function processSource(source) {
  const newIds = [];
  let format = null;
  let items = [];
  let discoveryStatus = 'OK';

  try {
    // Use discovery strategy (Sprint 2): single switch statement, no fallbacks
    const discovery = await discoverArticlesForSource(source);
    items = discovery.articles;
    discoveryStatus = discovery.status;
    format = discovery.format;

    if (discoveryStatus === 'OK' || discoveryStatus === 'EMPTY') {
      console.log(`[Monitor] "${source.name}" (${source.discovery_type}): ${items.length} items found`);
    } else {
      console.log(`[Monitor] "${source.name}" discovery failed: ${discoveryStatus} - ${discovery.errorMessage || 'unknown error'}`);
    }

    // Insert discovered items into DB
    const isTraceSource = source.name === 'Guau Formosa';
    if (isTraceSource) console.log(`\n[TRACE] Insertando ${items.length} items...\n`);

    // Some sitemap formats (e.g. Guau Formosa's urlset children) carry only
    // <loc>+<lastmod>, no title — Discovery has nothing to offer, so the title
    // is backfilled from the real article page instead of dropping the URL.
    // Capped per source per cycle (sequential fetches) to avoid hammering a
    // single small site; already-stored URLs are skipped before spending a
    // fetch so the budget goes to genuinely new items each cycle.
    const TITLE_BACKFILL_LIMIT = 15;
    let titleBackfillsUsed = 0;
    const titlelessUrls = items.filter(i => i.link && !i.title).map(i => hashUrl(i.link));
    let backfillExistingHashes = new Set();
    if (titlelessUrls.length > 0) {
      const { rows } = await query(`SELECT hash FROM monitored_articles WHERE hash = ANY($1::text[])`, [titlelessUrls]);
      backfillExistingHashes = new Set(rows.map(r => r.hash));
    }

    for (const item of items) {
      const url = item.link;
      if (!url) continue;

      if (!item.title) {
        if (backfillExistingHashes.has(hashUrl(url))) continue;
        if (titleBackfillsUsed >= TITLE_BACKFILL_LIMIT) continue;
        titleBackfillsUsed++;
        try {
          const fetched = await fetchArticleContent(url);
          if (fetched?.title) item.title = fetched.title;
        } catch {}
      }
      if (!item.title) continue;

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
      if (rows[0]) {
        newIds.push(rows[0].id);
        if (isTraceSource) {
          console.log(`  ✅ INSERT: ${rows[0].id.substring(0, 8)}... "${item.title.substring(0, 40)}..."`);
        }
      } else {
        if (isTraceSource) {
          console.log(`  ⚠️  DUPLICATE: "${item.title.substring(0, 40)}..."`);
        }
      }
    }

    if (isTraceSource) {
      console.log(`\n[TRACE] IDs realmente insertados (${newIds.length}):`);
      newIds.forEach((id, i) => {
        console.log(`  ${i+1}. ${id}`);
      });
      console.log();
    }

    if (format) {
      await query(
        `UPDATE rss_sources SET last_checked = now(), last_format_detected = $2 WHERE id = $1`,
        [source.id, format]
      );
    }
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

// [Cost Killer 2+3] Algorithmic Engine — no IA required

async function ensureOpportunityTriggerColumn() {
  await query(`ALTER TABLE story_opportunities ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) DEFAULT 'ai'`).catch(() => {});
}

async function ensureAlgorithmicSummaryColumn() {
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS algorithmic_summary TEXT`).catch(() => {});
}

async function ensureClusteringSchema2() {
  // Story Clustering 2.0 — category gate + explainable scores
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS detected_category VARCHAR(20)`).catch(() => {});
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS contamination_flag BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_match BOOLEAN DEFAULT TRUE`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS category_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS entity_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE story_cluster_articles ADD COLUMN IF NOT EXISTS keyword_score FLOAT DEFAULT 0`).catch(() => {});
}

async function ensureFreshnessSchema() {
  await query(`ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS freshness_score FLOAT DEFAULT 1.0`).catch(() => {});
  await query(`ALTER TABLE event_clusters ADD COLUMN IF NOT EXISTS freshness_score FLOAT DEFAULT 1.0`).catch(() => {});
}

async function ensureDiscoveryFailureColumn() {
  await query(`ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS consecutive_discovery_failures INTEGER DEFAULT 0`).catch(() => {});
}

// Freshness Sprint — recalculates time-decay multipliers for stories and events.
// Decay curve: 0-2h=100%, 2-6h=90%, 6-12h=75%, 12-24h=50%, 24-48h=25%, 48h+=10%
// Exported so worker.js can run it on a 30-min cron independent of article ingestion.
export async function recalcFreshness() {
  await ensureFreshnessSchema();

  await query(`
    UPDATE story_clusters SET
      freshness_score = CASE
        WHEN last_seen > now() - interval '2 hours'  THEN 1.00
        WHEN last_seen > now() - interval '6 hours'  THEN 0.90
        WHEN last_seen > now() - interval '12 hours' THEN 0.75
        WHEN last_seen > now() - interval '24 hours' THEN 0.50
        WHEN last_seen > now() - interval '48 hours' THEN 0.25
        ELSE 0.10
      END,
      updated_at = now()
    WHERE status IN ('active', 'ready', 'followed', 'stale')
  `);

  await query(`
    UPDATE event_clusters SET
      freshness_score = CASE
        WHEN last_updated_at > now() - interval '2 hours'  THEN 1.00
        WHEN last_updated_at > now() - interval '6 hours'  THEN 0.90
        WHEN last_updated_at > now() - interval '12 hours' THEN 0.75
        WHEN last_updated_at > now() - interval '24 hours' THEN 0.50
        WHEN last_updated_at > now() - interval '48 hours' THEN 0.25
        ELSE 0.10
      END,
      updated_at = now()
    WHERE status IN ('active', 'followed', 'stale')
  `);

  console.log('[Freshness] Scores recalculated for stories + events');
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

  // [AUDIT] Log pending articles
  console.log(`\n[AUDIT] fetchPendingArticleContent() procesando (${pending.length} artículos):`);
  pending.slice(0, 10).forEach(a => {
    const marker = a.id === 'd36fc24b-d390-4998-8d70-9781d8510066' ? ' ← TRACE ARTICLE' : '';
    console.log(`  ${a.id.substring(0, 8)}... ${a.url.substring(0, 50)}${marker}`);
  });
  if (pending.length > 10) console.log(`  ... y ${pending.length - 10} más`);

  let fetched = 0, playwright = 0, paywall = 0, failed = 0;

  for (const article of pending) {
    try {
      const result = await fetchArticleContentForMonitor(article.url, article.id);

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
  if (isNewsRunning) {
    newsSkippedCycles++;
    console.log('[NewsMonitor] A cycle is already in progress. Skipping this run.');
    return;
  }
  isNewsRunning = true;
  const cycleStart = Date.now();
  const profiler = new MonitorProfiler();
  profiler.start();
  browserAudit.resetPeaks();

  // Respect pause flag — lets the CMS pause AI consumption without stopping the process
  const { rows: pauseFlag } = await query(`SELECT value FROM settings WHERE key = 'news_monitor_paused'`).catch(() => ({ rows: [] }));
  if (pauseFlag[0]?.value === 'true') {
    console.log('[Monitor] ⏸ Pausado — ciclo omitido');
    // Record skipped run so health endpoint can confirm worker is alive
    const runId = await startRun('news_monitor');
    await finishRun(runId, { status: 'skipped' });
    isNewsRunning = false;
    return;
  }

  // Self-healing: ensure all columns exist before any processing runs
  await query(`ALTER TABLE event_clusters ADD COLUMN IF NOT EXISTS last_summarized_at TIMESTAMP`).catch(() => {});
  await ensureOpportunityTriggerColumn();
  await ensureAlgorithmicSummaryColumn();
  await ensureClusteringSchema2();
  await ensureFreshnessSchema();
  await ensureDiscoveryFailureColumn();

  const runId = await startRun('news_monitor');
  let sourcesProcessed = 0;
  let itemsFound = 0;

  // Reset metrics
  playwrightMetrics.pagesOpened = 0;
  playwrightMetrics.browsersLaunched = 0;

  console.log('\n=== Perf Profile: News Monitor Cycle Start ===');
  console.time('Full Cycle');

  try {
    console.time('1. Feed (Sources + Fetching)');
    profiler.begin('RSS + Playwright Discovery');

    // Initialize DiscoveryFactory with helper functions
    initializeFactory({
      fetchFeedXml,
      parseRssItems,
      parseAtomItems,
      parseNewsSitemapItems,
      parseUrlsetItems,
      parseSitemapIndexUrls,
      detectFeedFormat,
      discoverArticlesViaPlaywright
    });

    const { rows: sources } = await query(`
      SELECT * FROM rss_sources
      WHERE enabled = true
        AND (last_checked IS NULL
             OR last_checked < now() - (check_interval || ' seconds')::interval)
    `);

    if (sources.length === 0) {
      profiler.end('RSS + Playwright Discovery');
      console.timeEnd('1. Feed (Sources + Fetching)');
      console.timeEnd('Full Cycle');
      await finishRun(runId, { status: 'success' });
      isNewsRunning = false;
      return;
    }

    const allNewIds = [];
    for (const source of sources) {
      const ids = await processSource(source);
      allNewIds.push(...ids);
      sourcesProcessed++;
    }

    itemsFound = allNewIds.length;
    profiler.end('RSS + Playwright Discovery');
    console.timeEnd('1. Feed (Sources + Fetching)');

    if (allNewIds.length === 0) {
      console.log('[Monitor] No new articles. Skipping intelligence blocks.');
      // Display empty timers for profiling consistency
      const skipped = ['2. Content Extraction', '3. Entities & Trends', '4. Story Intelligence (Stories)', '5. Opportunities (Algo)', '6. Event Intelligence (Events)'];
      for (const s of skipped) { console.time(s); console.timeEnd(s); }
      console.timeEnd('Full Cycle');

      // Resource metrics
      console.log('\n--- Resource Metrics ---');
      console.log(`Artículos nuevos en este ciclo: ${itemsFound}`);
      console.log(`Páginas Playwright abiertas:    ${playwrightMetrics.pagesOpened}`);
      console.log(`Instancias Chromium abiertas:  ${playwrightMetrics.browsersLaunched}`);
      console.log(`News Monitor duration:          ${Date.now() - cycleStart}ms`);
      console.log(`Ciclos omitidos por lock:       ${newsSkippedCycles}`);
      console.log('=== Perf Profile: Cycle End ===\n');
      browserAudit.report('NewsMonitor');

      await finishRun(runId, { status: 'success', sources_processed: sourcesProcessed });
      isNewsRunning = false;
      return;
    }

    console.log(`[Monitor] ${allNewIds.length} new articles from ${sources.length} sources`);

    // [AUDIT] Log allNewIds
    if (allNewIds.length > 0) {
      console.log(`\n[AUDIT] allNewIds (${allNewIds.length} artículos):`);
      const { rows: newArticles } = await query(
        `SELECT id, title FROM monitored_articles WHERE id = ANY($1::uuid[]) ORDER BY detected_at DESC LIMIT 10`,
        [allNewIds]
      );
      newArticles.forEach(a => {
        const marker = a.id === 'd36fc24b-d390-4998-8d70-9781d8510066' ? ' ← TRACE ARTICLE' : '';
        console.log(`  ${a.id.substring(0, 8)}... "${a.title.substring(0, 40)}..."${marker}`);
      });
      if (allNewIds.length > 10) console.log(`  ... y ${allNewIds.length - 10} más`);
    }

    // Sprint 5.8 — fetch full article content in background (does not block intelligence pipeline)
    console.time('2. Content Extraction');
    profiler.begin('HTTP Fetch');
    await fetchPendingArticleContent().catch(e => console.error('[Monitor] Content fetch error:', e.message));
    profiler.end('HTTP Fetch');
    console.timeEnd('2. Content Extraction');

    // ── DECOUPLED EXECUTION (Sprint 3)
    // Monitor completes after Discovery + Persistence.
    // Entity, Story, Event, Opportunity workers run independently via setImmediate

    // Research entity matching (knowledge base context)
    await matchResearchEntities(allNewIds);
    await refreshTrendingTopics();
    await checkAutoResearchTriggers();
    await markStaleClusters();

    // Get data needed for async workers
    const { rows: recentForOpps } = await query(`
      SELECT id FROM story_clusters
      WHERE status IN ('active','ready') AND is_recurring = false
        AND last_seen > now() - interval '2 hours'
    `);

    const { rows: recentStories } = await query(`
      SELECT id FROM story_clusters
      WHERE status IN ('active','ready','followed')
        AND is_recurring = false
        AND last_seen > now() - interval '2 hours'
    `);
    const recentStoryIds = recentStories.map(r => r.id);

    // Enqueue workers for independent execution (no await, no blocking)
    console.log('[Monitor] Enqueueing workers for async execution...');

    // Entity extraction (independent)
    setImmediate(() => {
      processEntityExtraction(allNewIds)
        .catch(e => console.error('[EntityWorker] Failed:', e.message));
    });

    // Story detection (independent)
    setImmediate(() => {
      processStoryDetection(allNewIds, recentStoryIds)
        .catch(e => console.error('[StoryWorker] Failed:', e.message));
    });

    // Opportunity generation (independent)
    if (recentForOpps.length > 0) {
      setImmediate(() => {
        processOpportunityGeneration(recentForOpps.map(r => r.id))
          .catch(e => console.error('[OpportunityWorker] Failed:', e.message));
      });
    }

    // Event detection (independent)
    setImmediate(() => {
      processEventDetection(recentStoryIds)
        .then(eventStats => {
          if (eventStats && eventStats.stats) {
            console.log('\n=== Event Clustering Report (Async) ===');
            console.log(`Stories analyzed:               ${eventStats.stats.storiesAnalyzed}`);
            console.log(`Stories matched to event:       ${eventStats.stats.storiesMatched}`);
            console.log(`New events created:             ${eventStats.stats.newEventsCreated}`);
            console.log(`Single-entity stories skipped:  ${eventStats.stats.singleEntityStoriesSkipped}`);
            console.log('================================\n');
          }
        })
        .catch(e => console.error('[EventWorker] Failed:', e.message));
    });

    console.timeEnd('Full Cycle');

    // Add metrics before reporting
    profiler.setMetrics({
      browsers: playwrightMetrics.browsersLaunched,
      pages: playwrightMetrics.pagesOpened,
      articlesFound: itemsFound,
      articlesValid: itemsFound, // All found were valid (already filtered)
    });

    // Profiling report (includes JSON export)
    const profileJson = profiler.report();

    // Export to JSON for analysis
    try {
      const fs = await import('fs').then(m => m.promises);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = `./logs/monitor-profile-${timestamp}.json`;

      // Ensure logs directory exists
      await fs.mkdir('./logs', { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(profileJson, null, 2));
      console.log(`[Monitor] Profile saved to ${filePath}`);
    } catch (e) {
      console.warn(`[Monitor] Could not save profile JSON: ${e.message}`);
    }

    // Ranking summary
    console.log('\n--- Resource Metrics ---');
    console.log(`Artículos nuevos en este ciclo: ${itemsFound}`);
    console.log(`Páginas Playwright abiertas:    ${playwrightMetrics.pagesOpened}`);
    console.log(`Instancias Chromium abiertas:  ${playwrightMetrics.browsersLaunched}`);
    console.log(`News Monitor duration:          ${Date.now() - cycleStart}ms`);
    console.log(`Ciclos omitidos por lock:       ${newsSkippedCycles}`);
    console.log('=== Perf Profile: Cycle End ===\n');

    // BrowserPool stats (Sprint 4)
    const bp = browserPool.stats();
    console.log('==============================');
    console.log('BrowserPool');
    console.log(`Created: ${bp.created}`);
    console.log(`Peak: ${bp.peak}`);
    console.log(`Reused: ${bp.reused}`);
    console.log(`Waiting: ${bp.waiting}`);
    console.log(`Idle: ${bp.idle}`);
    console.log('==============================');

    await finishRun(runId, { status: 'success', sources_processed: sourcesProcessed, items_found: itemsFound });

  } catch (e) {
    console.error('[Monitor] Job error:', e.message);
    await finishRun(runId, { status: 'error', sources_processed: sourcesProcessed, items_found: itemsFound, errors_count: 1, error_message: e.message.slice(0, 500) });
  }
  isNewsRunning = false;
}
