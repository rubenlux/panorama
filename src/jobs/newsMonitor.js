import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { query } from '../routes/db.js';
import { AiService } from '../services/AiService.js';
import { fetchArticleContentForMonitor, playwrightMetrics } from '../services/ArticleFetcher.js';
import { startRun, finishRun } from './workerUtils.js';
import { browserAudit } from '../services/browserLifecycleLogger.js';

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

// URL Candidate Check: Return true if worth opening, false if garbage
function isCandidateUrl(url, mediaHostname) {
  // Must be valid HTTP(S) URL
  if (!url.startsWith('http')) return false;

  // Social media exclusion: reject known social platforms
  const socialDomains = ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com', 'linkedin.com'];
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // If URL is from a social platform, reject
    if (socialDomains.some(social => hostname.includes(social))) {
      return false;
    }

    // If mediaHostname provided, verify URL belongs to that media
    if (mediaHostname) {
      const mediaDomain = mediaHostname.toLowerCase();
      // Accept same domain (including www, m, amp variants)
      if (!hostname.includes(mediaDomain.replace(/^www\./, ''))) {
        return false;
      }
    }
  } catch (e) {
    return false; // Invalid URL
  }

  // Garbage filters: explicitly reject certain patterns
  const badPatterns = [
    /\/(rss|feed|sitemap|login|search|contacto|privacy|about|terms|autor|author|category|tag|page)\/?$/i,
    /\?.*?(page|cat|author|tag|search)=/i,
    /javascript:|mailto:/,
    /\.(jpg|png|webp|pdf|gif|doc|docx)$/i,
  ];

  if (badPatterns.some(pattern => pattern.test(url))) {
    return false;
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

// Discovery: Extract URLs from homepage with garbage filtering
async function discoverArticleUrlsFromHomepage(page, homeUrl) {
  try {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.warn(`[Discovery] Navigation failed: ${e.message}`);
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

  // Filter candidates and track rejection reasons
  const discardStats = {
    rss_feed: 0,
    social_media: 0,
    images: 0,
    javascript_mailto: 0,
    login_privacy_search: 0,
    external_domain: 0,
    invalid_url: 0
  };

  const candidates = allUrls.filter(url => {
    if (!isCandidateUrl(url, mediaHostname)) {
      // Categorize the rejection reason
      if (/\.(jpg|png|webp|gif|pdf|doc|docx)$/i.test(url)) {
        discardStats.images++;
      } else if (/\/(rss|feed|sitemap)\/?$/i.test(url)) {
        discardStats.rss_feed++;
      } else if (/javascript:|mailto:/.test(url)) {
        discardStats.javascript_mailto++;
      } else if (/\/(login|search|contacto|privacy|about|terms|author|category|tag|page)\/?$/i.test(url)) {
        discardStats.login_privacy_search++;
      } else if (/\?.*?(page|cat|author|tag|search)=/i.test(url)) {
        discardStats.login_privacy_search++;
      } else if (['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com', 'linkedin.com'].some(social => url.includes(social))) {
        discardStats.social_media++;
      } else if (!url.startsWith('http')) {
        discardStats.invalid_url++;
      } else {
        discardStats.external_domain++;
      }
      return false;
    }
    return true;
  });

  // Log discovery summary
  console.log(`[Discovery] Summary:`);
  console.log(`[Discovery]   Found: ${allUrls.length} links`);
  console.log(`[Discovery]   Accepted (same domain): ${candidates.length}`);
  console.log(`[Discovery]   Discarded breakdown:`);
  if (discardStats.social_media > 0) console.log(`[Discovery]     - social media: ${discardStats.social_media}`);
  if (discardStats.rss_feed > 0) console.log(`[Discovery]     - rss/feed: ${discardStats.rss_feed}`);
  if (discardStats.images > 0) console.log(`[Discovery]     - images: ${discardStats.images}`);
  if (discardStats.javascript_mailto > 0) console.log(`[Discovery]     - javascript/mailto: ${discardStats.javascript_mailto}`);
  if (discardStats.login_privacy_search > 0) console.log(`[Discovery]     - login/privacy/search: ${discardStats.login_privacy_search}`);
  if (discardStats.external_domain > 0) console.log(`[Discovery]     - external domain: ${discardStats.external_domain}`);
  if (discardStats.invalid_url > 0) console.log(`[Discovery]     - invalid url: ${discardStats.invalid_url}`);
  console.log(`[Discovery]   Processing: ${Math.min(30, candidates.length)}`);

  // Take first 30 in DOM order (no scoring)
  const topUrls = candidates.slice(0, 30);

  return topUrls;
}

// Extract metadata from multiple URLs with concurrency limit
async function extractArticlesWithConcurrency(browser, urls, workerCount = 5) {
  const articles = [];
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
        // Map extractor output to article fields (title = cleanTitle)
        const article = {
          ...metadata,
          url,
          title: metadata.cleanTitle || metadata.rawTitle,
        };

        if (metadata && validateArticle(article)) {
          articles.push({
            title: metadata.title,
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
          console.log(`[Extractor] REJECT: ${article._skipReason} | ${url}`);
        }
      } catch (e) {
        rejectStats.extraction_failed++;
        console.warn(`[Extractor] Error processing ${url}: ${e.message}`);
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
  console.log(`[Extractor] Summary:`);
  console.log(`[Extractor]   URLs processed: ${urls.length}`);
  console.log(`[Extractor]   Articles accepted: ${articles.length}`);
  console.log(`[Extractor]   Rejected breakdown:`);
  Object.entries(rejectStats).forEach(([reason, count]) => {
    if (count > 0) {
      console.log(`[Extractor]     - ${reason}: ${count}`);
    }
  });

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

// ── Source processing ─────────────────────────────────────────────────────────

async function processSource(source) {
  const newIds = [];
  let format = null;
  let items = [];

  try {
    // Try RSS (or provided rss_url)
    if (source.rss_url) {
      const xml = await fetchFeedXml(source.rss_url);
      if (xml) {
        format = detectFeedFormat(xml);
        if (format === 'news-sitemap') {
          items = parseNewsSitemapItems(xml);
        } else if (format === 'sitemap-index') {
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
      }
    }

    // Fallback: Try sitemap_url if RSS failed
    if (items.length === 0 && source.sitemap_url) {
      const xml = await fetchFeedXml(source.sitemap_url);
      if (xml) {
        format = detectFeedFormat(xml);
        if (format === 'news-sitemap') {
          items = parseNewsSitemapItems(xml);
        } else if (format === 'sitemap-index') {
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
        }
      }
    }

    // Fallback: Use Playwright to discover URLs from homepage
    if (items.length === 0) {
      console.log(`[Monitor] "${source.name}" RSS/Sitemap failed → trying Playwright discovery`);
      const articles = await discoverArticlesViaPlaywright(source);
      console.log(`[Monitor] "${source.name}" Playwright found ${articles.length} articles`);
      items = articles;
      format = format || 'playwright-discovery';
    }

    // Insert discovered items into DB
    const isTraceSource = source.name === 'Guau Formosa';
    if (isTraceSource) console.log(`\n[TRACE] Insertando ${items.length} items...\n`);

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
      JOIN rss_sources ts    ON ts.id = ma.source_id
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
  // Tournament context words — identify domain (World Cup, Copa) but cannot
  // distinguish between different facts within the same tournament.
  // Named entities ("Copa América") are matched via NER/Gate 2, not Gate 3 keywords.
  'copa','mundial','torneo','campeonato','fixture','grupo','fase',
  'final','semifinal','cuartos','octavos','16avos','32avos',
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

// ── Story Clustering 2.0 ─────────────────────────────────────────────────────
// Three-layer gate: Category → Entity → Keyword (in that order).
// Signatures are FROZEN from the cluster title only — no cascade contamination.
//
// Gate 1 (hard): article category must equal story category. "estados unidos"
//   in a sports headline cannot merge with an international-politics story.
// Gate 2 (hard): if the story has ≥3 named entities AND the article has ≥1
//   named entity AND their intersection is empty → reject.
// Gate 3 (threshold): Jaccard on title-only keywords ≥ STORY_MATCH_THRESHOLD.
//
// Scores stored per article link for full auditability:
//   category_score, entity_score, keyword_score → relevance_score (composite)

const STORY_ENTITY_GATE_MIN_STORY   = 3; // min story entities to activate gate
const STORY_ENTITY_GATE_MIN_ARTICLE = 1; // min article entities to activate gate

async function detectStories(newArticleIds) {
  if (newArticleIds.length === 0) return;

  // [AUDIT] Log what detectStories receives
  console.log(`\n[AUDIT] detectStories() recibió ${newArticleIds.length} artículos`);
  const { rows: auditArticles } = await query(
    `SELECT id, title, extraction_method, content_words FROM monitored_articles WHERE id = ANY($1::uuid[]) LIMIT 10`,
    [newArticleIds]
  );
  auditArticles.forEach(a => {
    const marker = a.id === 'd36fc24b-d390-4998-8d70-9781d8510066' ? ' ← TRACE ARTICLE' : '';
    const state = `[${a.extraction_method || 'NULL'}, ${a.content_words || 0} words]`;
    console.log(`  ${a.id.substring(0, 8)}... ${state} "${a.title.substring(0, 40)}..."${marker}`);
  });
  if (newArticleIds.length > 10) console.log(`  ... y ${newArticleIds.length - 10} más`);

  const { rows: articles } = await query(
    `SELECT id, title, source_id, detected_at FROM monitored_articles WHERE id = ANY($1::uuid[])`,
    [newArticleIds]
  );

  // Separate recurring content — flag them but don't cluster into editorial stories
  const storyArticles = articles.filter(a => !isRecurringContent(a.title));
  const recurringOnes = articles.filter(a =>  isRecurringContent(a.title));

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

  // ── Load active stories with FROZEN title keywords + entity names ──────────
  // Signature is built from the cluster TITLE only — never from accumulated
  // article titles. This prevents cascade contamination where one wrong match
  // inflates the keyword pool and attracts more wrong articles.
  const { rows: activeStories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.story_type,
      COALESCE(sc.detected_category, '') AS detected_category,
      COALESCE(
        array_agg(DISTINCT lower(ke.name)) FILTER (WHERE ke.name IS NOT NULL),
        ARRAY[]::text[]
      ) AS entity_names
    FROM story_clusters sc
    LEFT JOIN story_entities se ON se.story_id = sc.id
    LEFT JOIN knowledge_entities ke ON ke.id = se.entity_id AND ke.entity_origin = 'MONITOR'
    WHERE sc.status IN ('active','summarizing','ready')
      AND sc.is_recurring = false
      AND sc.last_seen > now() - interval '${STORY_WINDOW_HOURS} hours'
    GROUP BY sc.id, sc.title, sc.story_type, sc.detected_category
  `);

  // Pre-compute category for each active story (use stored value when available)
  const signatures = activeStories.map(s => {
    const catResult = s.detected_category ? { category: s.detected_category } : detectStoryCategory(s.title, s.story_type);
    const category = catResult.category;
    return {
      id:       s.id,
      category,
      // FROZEN: title keywords only — never grows during this cycle
      keywords: extractStoryKeywords(s.title),
      entities: s.entity_names || [],
    };
  });

  // ── Load MONITOR entity names for the new articles (one batch query) ───────
  const { rows: artEntityRows } = await query(`
    SELECT aem.article_id::text AS article_id, lower(ke.name) AS entity_name
    FROM article_entity_matches aem
    JOIN knowledge_entities ke ON ke.id = aem.entity_id
    WHERE aem.article_id = ANY($1::uuid[])
      AND ke.entity_origin = 'MONITOR'
  `, [newArticleIds]);

  const artEntityMap = new Map(); // article_id → Set<entity_name>
  for (const row of artEntityRows) {
    if (!artEntityMap.has(row.article_id)) artEntityMap.set(row.article_id, new Set());
    artEntityMap.get(row.article_id).add(row.entity_name);
  }

  const affectedIds = new Set();

  for (const article of storyArticles) {
    const artKw       = extractStoryKeywords(article.title);
    if (artKw.length < 2) continue;

    const artEntities = artEntityMap.get(article.id) || new Set();
    const artCatResult = detectStoryCategory(article.title, null, artEntities);
    const artCategory = artCatResult.category;

    let bestId     = null;
    let bestComposite = 0;
    let bestScores    = null;

    for (const sig of signatures) {
      // ── Gate 1: category must match ──────────────────────────────────────
      if (sig.category !== artCategory) continue;

      // ── Gate 2: entity intersection (only when both sides have enough data)
      const sharedEntities = sig.entities.filter(e => artEntities.has(e));
      if (
        sig.entities.length >= STORY_ENTITY_GATE_MIN_STORY &&
        artEntities.size    >= STORY_ENTITY_GATE_MIN_ARTICLE &&
        sharedEntities.length === 0
      ) continue;

      // ── Gate 3: keyword Jaccard on frozen title signature ─────────────────
      const kwScore = jaccardSim(artKw, sig.keywords);
      if (kwScore < STORY_MATCH_THRESHOLD) continue;

      // Composite score: keyword 60%, entity 40% (entity defaults to 0.5 when no data)
      const entityScore = sig.entities.length > 0
        ? sharedEntities.length / sig.entities.length
        : 0.5;
      const composite = parseFloat((kwScore * 0.6 + entityScore * 0.4).toFixed(3));

      if (composite > bestComposite) {
        bestComposite = composite;
        bestId        = sig.id;
        bestScores    = { kwScore, entityScore, sharedEntities, sharedKw: jaccardShared(artKw, sig.keywords) };
      }
    }

    let assignedId;

    if (bestId) {
      // ── Assign to existing story ──────────────────────────────────────────
      const { kwScore, entityScore, sharedEntities, sharedKw } = bestScores;
      const storyClusterArticleSql = `
        INSERT INTO story_cluster_articles
          (story_id, article_id, relevance_score, matching_reason,
           shared_keywords, shared_entities, keyword_similarity, title_similarity, entity_similarity,
           category_match, category_score, entity_score, keyword_score)
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::numeric,
          'keyword_jaccard',
          $4::jsonb,
          $5::jsonb,
          $6::numeric,
          $7::numeric,
          $8::numeric,
          true,
          1.0,
          $9::float8,
          $10::float8
        )
        ON CONFLICT DO NOTHING
      `;
      const storyClusterArticleParams = [
        bestId, 
        article.id, 
        Number(bestComposite.toFixed(3)),
        JSON.stringify(sharedKw),
        JSON.stringify(sharedEntities),
        Number(kwScore.toFixed(3)),
        Number(kwScore.toFixed(3)),
        Number(entityScore.toFixed(3)),
        Number(entityScore.toFixed(3)),
        Number(kwScore.toFixed(3))
      ];
      logQueryDebug('assign article to existing story_cluster_articles', storyClusterArticleSql, storyClusterArticleParams);
      await query(storyClusterArticleSql, storyClusterArticleParams);
      assignedId = bestId;
      // ── NO sig.keywords.push here — signatures are frozen this cycle ──────
    } else {
      // ── Create new story cluster ──────────────────────────────────────────
      const slug = generateStorySlug(article.title);
      const { rows } = await query(`
        INSERT INTO story_clusters (title, slug, keywords, is_recurring, detected_category)
        VALUES ($1, $2, $3, false, $4) RETURNING id
      `, [article.title, slug, JSON.stringify(artKw), artCategory]);
      assignedId = rows[0].id;

      await query(`
        INSERT INTO story_cluster_articles
          (story_id, article_id, relevance_score, matching_reason,
           shared_keywords, keyword_similarity, title_similarity, entity_similarity,
           category_match, category_score, entity_score, keyword_score)
        VALUES ($1,$2,1.0,'story_seed',$3,1.0,1.0,1.0,true,1.0,1.0,1.0)
        ON CONFLICT DO NOTHING
      `, [assignedId, article.id, JSON.stringify(artKw)]);

      // Add this new story to the in-memory signatures for later articles in the batch
      signatures.push({
        id:       assignedId,
        category: artCategory,
        keywords: artKw,       // title keywords of the founding article
        entities: [...artEntities],
      });
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

  // ── Backfill detected_category for existing stories that lack it ───────────
  await query(`
    UPDATE story_clusters
    SET detected_category = 'unknown'
    WHERE detected_category IS NULL AND is_recurring = false
  `).catch(() => {});

  // Run contamination detector on affected stories
  if (affectedIds.size > 0) {
    await detectContaminatedStories([...affectedIds]);
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
          base.articles_last_1h,
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
            COUNT(DISTINCT ma.source_id)::integer                                               AS cnt_sources,
            COUNT(sca.article_id) FILTER (WHERE ma.detected_at > now() - interval '1 hour')::integer AS articles_last_1h
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
        -- [Cost Killer 2] Algorithmic coverage_status — no IA needed
        coverage_status         = CASE
          WHEN m.articles_last_1h >= 3 AND m.cnt_sources >= 2 THEN 'breaking'
          WHEN m.articles_last_1h >= 2                         THEN 'growing'
          WHEN m.cnt_articles > 5 AND m.cnt_sources <= 1       THEN 'cooling'
          ELSE 'monitoring'
        END,
        -- [Cost Killer 2] Algorithmic importance_score — no IA needed
        importance_score        = LEAST(10, GREATEST(1, (
          LEAST(m.cnt_sources * 2.5, 5.0)
          + LEAST(m.cnt_articles * 0.5, 3.0)
          + CASE
              WHEN m.articles_last_1h >= 3 AND m.cnt_sources >= 2 THEN 2
              WHEN m.articles_last_1h >= 2                         THEN 1
              ELSE 0
            END
        )::integer)),
        last_seen  = now(),
        updated_at = now()
      FROM m
      WHERE sc.id = $1
    `, [storyId]);
  }
}

// ── Contamination detector (Story Clustering 2.0) ────────────────────────────
// Marks stories where the majority of articles belong to a category different
// from the story's own category. These are likely contamination victims.
// Sets contamination_flag = true; does NOT delete associations (human review first).
async function detectContaminatedStories(storyIds) {
  if (!storyIds.length) return;
  for (const storyId of storyIds) {
    const { rows } = await query(`
      SELECT
        sc.detected_category,
        sc.article_count,
        COUNT(sca.article_id) FILTER (WHERE sca.category_match = false) AS mismatched
      FROM story_clusters sc
      LEFT JOIN story_cluster_articles sca ON sca.story_id = sc.id
      WHERE sc.id = $1
      GROUP BY sc.id, sc.detected_category, sc.article_count
    `, [storyId]);

    if (!rows[0] || !rows[0].article_count) continue;
    const total     = Number(rows[0].article_count);
    const mismatched = Number(rows[0].mismatched || 0);
    // Flag when ≥25% of articles are from a different category
    const contaminated = total >= 4 && mismatched / total >= 0.25;
    await query(
      `UPDATE story_clusters SET contamination_flag = $1, updated_at = now() WHERE id = $2`,
      [contaminated, storyId]
    );
    if (contaminated) {
      console.log(`[Monitor] Contaminación detectada en story ${storyId}: ${mismatched}/${total} artículos con categoría incorrecta`);
    }
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

// Pure: detect editorial category from title and story_type (no AI)
// Scores each category by matching keyword patterns; precedence breaks ties.
// Categories (CK4): judicial > security > international > politics > economy >
//                   health > technology > sports > entertainment > society
// detectStoryCategory v2: Context-aware classification with confidence scores
// Fixes fragmentação bug by understanding sports context (e.g., "revisión médica" in transfer context = sports, not health)
function detectStoryCategory(title, storyType, entities = new Set()) {
  if (storyType === 'sports')   return { category: 'sports', confidence: 1.0, matched_rules: ['storyType_override'] };
  if (storyType === 'politics') return { category: 'politics', confidence: 1.0, matched_rules: ['storyType_override'] };

  const t = (title || '').toLowerCase();
  const entityNames = new Set([...(entities || [])].map(e => String(e).toLowerCase()));

  // Sports context: clubes argentinos, competiciones, términos de mercado
  const SPORTS_CONTEXT = {
    clubs: new Set(['boca', 'river', 'racing', 'independiente', 'san lorenzo', 'vélez', 'estudiantes', 'quilmes', 'atlético tucumán', 'lanús', 'defensa y justicia', 'talleres', 'colón', 'gimnasia', 'argentinos juniors']),
    competitions: new Set(['mundial', 'copa', 'liga', 'superliga', 'torneo', 'champions', 'libertadores', 'sudamericana']),
    transfer: new Set(['refuerzo', 'fichaje', 'contratación', 'transferencia', 'mercado de pases', 'mercado', 'acuerdo', 'firmará', 'contrato', 'jugador', 'delantero', 'defensor', 'lateral', 'portero', 'centrocampista']),
  };

  // Entertainment context: personas públicas no deportistas
  const ENTERTAINMENT_CONTEXT = new Set(['andrea del boca', 'actor', 'actriz', 'cantante', 'músico', 'artista', 'película', 'serie', 'show', 'gran hermano', 'reality']);

  const PATTERNS = {
    judicial:      [
      /\bjuicio\b/, /\bsentenci[ao]\b/, /\bcondena\b/, /\bfall[oó]\b/,
      /\bveredicto\b/, /\btribunal\b/, /\bjuzgad[ao]\b/, /\bprocesad[ao]\b/,
      /\bimputad[ao]\b/, /\bacusad[ao]\b/, /\bfiscal\b/, /\bextradici[oó]n\b/,
      /\bjuez[ao]?\b/, /\bquerella\b/, /\bamparo\b/, /\bperitaje\b/,
      /\bindagatori/, /\bc[aá]mara.*penal/, /\bdelitos.*econ/,
    ],
    security:      [
      /\bcrimen\b/, /\brobo\b/, /\basalto\b/, /\basesinato\b/, /\bhomicidio\b/,
      /\bmatan\b/, /\bmat[oó] a\b/, /\bsecuestro\b/, /\bbalacera\b/, /\btiroteo\b/,
      /\bnarco[^s]/, /\baccidente\b/, /\bincendio\b/, /\bexplosi[oó]n\b/,
      /\bv[ií]ctima/, /\bcolisi[oó]n\b/, /\bderrumb/, /\bmuertos\b/,
      /\bheridos\b/, /\bfalleci/, /\batropell/, /\boperativo.*polici/,
    ],
    international: [
      /\binternacional\b/, /\bmundial\b/, /\bglobal\b/, /\bonu\b/,
      /\beeuu\b/, /\bestados unidos\b/, /\beuropa\b/, /\bchina\b/,
      /\brusia\b/, /\bbrasil\b/, /\bguerra\b/, /\bdiplom[aá]tic/,
      /\bcanciller[ií]a\b/, /\bembajad/, /\bcumbre.*internaci/, /\bmigrante\b/,
      /\brefugiado\b/, /\bucrania\b/, /\bisrael\b/, /\bgaza\b/,
      /\botan\b/, /\bg7\b/, /\bg20\b/,
    ],
    politics:      [
      /\belecci[oó]n\b/, /\bpresidente\b/, /\bcongreso\b/, /\bgobierno\b/,
      /\bministr[ao]\b/, /\bsenad[ao]\b/, /\bdiputad[ao]\b/, /\bpol[ií]tic[ao]\b/,
      /\belectoral\b/, /\bvotaci[oó]n\b/, /\bcandidato\b/, /\blegisla/,
      /\bgobernador\b/, /\bintendente\b/, /\bdecreto\b/, /\bveto\b/,
      /\bsesi[oó]n\b/, /\boficialismo\b/, /\boposici[oó]n\b/,
    ],
    economy:       [
      /\beconom[ií]a\b/, /\becon[oó]mic[ao]\b/, /\bd[oó]lar\b/, /\binflaci[oó]n\b/,
      /\bprecios\b/, /\bbanco\b/, /\bpodría irse\b/, /\binversi[oó]n\b/,
      /\bdeuda\b/, /\bmoneda\b/, /\bpbi\b/, /\bpib\b/, /\bbolsa\b/,
      /\bexportaci[oó]n\b/, /\bimportaci[oó]n\b/, /\bimpuesto\b/,
      /\barancel\b/, /\bpresupuesto\b/, /\breservas\b/, /\bfinanci[ae]r/,
      /\bd[eé]ficit\b/, /\bsuperh[aá]vit\b/,
    ],
    health:        [
      /\bsalud\b/, /\benfermedad\b/, /\bpandemia\b/, /\bepidemia\b/,
      /\bvacun[ao]\b/, /\bhospital\b/, /\bm[eé]dic[ao]\b/, /\bcl[ií]nica\b/,
      /\bvirus\b/, /\bbacteria\b/, /\bbrote\b/, /\bcontagio\b/,
      /\bc[aá]ncer\b/, /\bdiabetes\b/, /\bcard[ií]ac/, /\bcirug[ií]a\b/,
      /\bf[aá]rmaco\b/, /\bmedicamento\b/, /\boms\b/, /\bterapia\b/,
      /\bpaciente\b/, /\bsanitari[ao]\b/,
    ],
    technology:    [
      /\btecnolog[ií]a\b/, /\bdigital\b/, /\binteligencia artificial\b/,
      /\bsoftware\b/, /\binternet\b/, /\bstartup\b/, /\binnovaci[oó]n\b/,
      /\bciberseguridad\b/, /\bhackeo\b/, /\bhacker\b/, /\bredes sociales\b/,
      /\bcriptomoneda\b/, /\bbitcoin\b/, /\bopenai\b/, /\bchatgpt\b/,
      /\b5g\b/, /\bdrone\b/, /\bblockchain\b/, /\bapp\b/,
    ],
    sports:        [
      /\bgol\b/, /\bpartido\b/, /\bliga\b/, /\bcopa\b/, /\bequipo\b/,
      /\bselecci[oó]n\b/, /\bf[uú]tbol\b/, /\brugby\b/, /\btenis\b/,
      /\bbasket\b/, /\bdeport/, /\bcancha\b/, /\btorneo\b/,
      /\bcampe[oó]n\b/, /\bfixture\b/, /\bcl[aá]sico\b/, /\bsuperliga\b/,
      /\bpremier\b/, /\bchampions\b/, /\briver\b/, /\bboca\b/,
    ],
    entertainment: [
      /\bespect[aá]culo\b/, /\bcine\b/, /\bm[uú]sica\b/, /\bartista\b/,
      /\bactor\b/, /\bactriz\b/, /\bcantante\b/, /\bshow\b/, /\bconcierto\b/,
      /\bfestival\b/, /\bserie\b/, /\bpel[ií]cula\b/, /\bstreaming\b/,
      /\bnetflix\b/, /\btelevisi[oó]n\b/, /\bfamoso\b/, /\bcelebridad\b/,
      /\breality\b/, /\bteatro\b/, /\bgrammy\b/, /\bemmy\b/, /\boscar\b/,
    ],
    society:       [
      /\beducaci[oó]n\b/, /\bescuela\b/, /\buniversidad\b/, /\bdocente\b/,
      /\bcultura\b/, /\bderechos\b/, /\bg[eé]nero\b/, /\bpobreza\b/,
      /\bvivienda\b/, /\bfamilia\b/, /\binfancia\b/, /\bdiscapacidad\b/,
      /\breligi[oó]n\b/, /\becolog[ií]a\b/, /\binundaci[oó]n\b/,
      /\bhuelga\b/, /\bprotesta\b/, /\bmarcha\b/, /\bbarrio\b/,
      /\bcomunidad\b/, /\bambiente\b/, /\bclim[aá]tic/,
    ],
  };

  // Calculate pattern matches
  const scores = {};
  const matched_rules = {};
  for (const [cat, patterns] of Object.entries(PATTERNS)) {
    const matches = patterns.filter(p => p.test(t));
    scores[cat] = matches.length;
    matched_rules[cat] = [];
  }

  // Check entertainment context FIRST — Andrea del Boca should not be sports
  const hasEntertainmentContext = [...ENTERTAINMENT_CONTEXT].some(e => t.includes(e));

  // Check sports context: if any sports context keyword present, prioritize sports
  // BUT: exclude "boca" if "del boca" is in the title (it's a person's name)
  let hasSportsClub = [...SPORTS_CONTEXT.clubs].some(c => {
    if (c === 'boca' && t.includes('del boca')) return false; // Andrea del Boca exclusion
    return t.includes(c);
  });
  const hasSportsCompetition = [...SPORTS_CONTEXT.competitions].some(c => t.includes(c));
  const hasSportsTransfer = [...SPORTS_CONTEXT.transfer].some(c => t.includes(c));

  // Context rule: if sports context detected, health/economy/international keywords become supporting evidence only
  // BUT: skip if entertainment context is strong
  if ((hasSportsClub || hasSportsCompetition || hasSportsTransfer) && !hasEntertainmentContext) {
    const contextRules = [];
    if (hasSportsClub) contextRules.push('sports_club');
    if (hasSportsCompetition) contextRules.push('sports_competition');
    if (hasSportsTransfer) contextRules.push('sports_transfer');

    // Reduce health/economy/international scores if sports context is strong
    if (scores['health'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['health'] = Math.max(0, scores['health'] - 1);
    }
    if (scores['economy'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['economy'] = Math.max(0, scores['economy'] - 1);
    }
    if (scores['international'] > 0 && hasSportsCompetition && !t.includes('guerra') && !t.includes('diplomat')) {
      scores['international'] = Math.max(0, scores['international'] - 1);
    }

    scores['sports'] = (scores['sports'] || 0) + 2; // Boost sports if context detected
    matched_rules['sports'] = contextRules;
  }

  // Entertainment check: if entertainment context detected, prioritize entertainment
  if (hasEntertainmentContext) {
    scores['entertainment'] = Math.max(scores['entertainment'], (scores['sports'] || 0) + 1);
    matched_rules['entertainment'].push('entertainment_context');
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return { category: 'society', confidence: 0.5, matched_rules: ['default'] };

  // When entertainment context is strong, entertainment gets priority
  const PRECEDENCE = hasEntertainmentContext
    ? ['judicial', 'security', 'international', 'politics', 'economy', 'entertainment', 'sports', 'health', 'technology', 'society']
    : ['judicial', 'security', 'international', 'politics', 'economy', 'sports', 'health', 'technology', 'entertainment', 'society'];
  const winner = PRECEDENCE.find(cat => scores[cat] === maxScore) || 'society';
  const confidence = maxScore / (Object.values(scores).reduce((a, b) => a + b, 0) || 1);

  return {
    category: winner,
    confidence: Math.min(1, confidence),
    matched_rules: matched_rules[winner] || []
  };
}

// Test cases (v2 — context-aware classification) — run with: detectStoryCategory('title', null, entitiesSet)
// BEFORE (broken v1): 'Boca confirmó al primer refuerzo: Leandro Lozano se hará la REVISIÓN MÉDICA...' → health (BUG!)
// AFTER (v2 fixed):  same title → sports ✓ (because has 'boca' + 'refuerzo' + 'contrato' context)
//
// BEFORE: 'Merentiel podría irse de Boca' → economy (matches 'podría irse' + 'mercado' regex)
// AFTER:  same title → sports ✓ (because 'boca' entity detected)
//
// BEFORE: 'Oficial: Boca debut en la Copa Argentina' → international (matches 'copa' + 'internacional' regex)
// AFTER:  same title → sports ✓ (because 'boca' + 'copa' + 'deportes' context)
//
// BEFORE: 'Andrea del Boca en Gran Hermano' → sports (matches 'boca')
// AFTER:  same title → entertainment ✓ (because 'gran hermano' + 'reality' context overrides 'boca' match)
//
// Confidence scores allow downstream filtering: entries with confidence < 0.7 can be manually reviewed
// matched_rules[] enables auditing: if a story gets misclassified, the log shows which rules fired

// Pure: build algorithmic summary sentence (no AI)
function buildAlgorithmicSummary(story, entities = []) {
  const arts = story.article_count;
  const srcs = story.source_count;
  const artW = arts === 1 ? 'artículo' : 'artículos';
  const srcW = srcs === 1 ? 'fuente' : 'fuentes';
  const verb = story.coverage_status === 'breaking' ? 'reportan en tiempo real'
              : story.coverage_status === 'growing'  ? 'siguen de cerca'
              : 'informan sobre';
  let s = `${arts} ${artW} de ${srcs} ${srcW} ${verb} "${story.title}".`;
  if (entities.length > 0) s += ` Involucra a: ${entities.slice(0, 3).join(', ')}.`;
  return s;
}

// Pure: category-specific editorial templates (10 categories — CK4)
function getCategoryOpportunityTemplates(story, category, sourceList) {
  const title    = story.title || 'Esta historia';
  const arts     = story.article_count;
  const srcs     = story.source_count;
  const firstSrc = sourceList[0] || 'una fuente';
  const srcW     = srcs === 1 ? 'fuente' : 'fuentes';
  const templates = [];

  if (category === 'judicial') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `En vivo: audiencia del caso "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. Cobertura de la audiencia en curso.`,
        urgency: 92, editorial: 90, traffic: 82, seo: 68 });
    }
    templates.push({ type: 'ANALYSIS',
      title: `Qué se decidió y por qué importa: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis del fallo o resolución judicial.`,
      urgency: 78, editorial: 92, traffic: 72, seo: 78 });
    templates.push({ type: 'EXPLAINER',
      title: `Cronología del caso: de la denuncia a hoy — "${title}"`,
      desc: `Contexto completo para lectores que llegaron tarde al caso. Base: ${arts} artículos.`,
      urgency: 55, editorial: 85, traffic: 75, seo: 82 });
    templates.push({ type: 'NEWS',
      title: `Cuáles son los próximos pasos judiciales: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza de seguimiento de la causa.`,
      urgency: 65, editorial: 80, traffic: 68, seo: 70 });
  }

  if (category === 'security') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `Última hora: "${title}" — lo que se sabe`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW} en la última hora.`,
        urgency: 95, editorial: 85, traffic: 88, seo: 62 });
    }
    templates.push({ type: 'NEWS',
      title: `Qué pasó: cronología de "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Reconstrucción del hecho para lectores.`,
      urgency: 80, editorial: 82, traffic: 78, seo: 68 });
    if (srcs >= 2) {
      templates.push({ type: 'ANALYSIS',
        title: `Contexto y antecedentes: "${title}"`,
        desc: `${srcs} fuentes informan. Pieza de profundidad sobre el hecho y su entorno.`,
        urgency: 65, editorial: 78, traffic: 70, seo: 72 });
    }
  }

  if (category === 'international') {
    templates.push({ type: 'ANALYSIS',
      title: `Qué significa para Argentina: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis del impacto local de un hecho global.`,
      urgency: 60, editorial: 88, traffic: 72, seo: 80 });
    templates.push({ type: 'EXPLAINER',
      title: `Explicado: quiénes son los actores y qué disputan en "${title}"`,
      desc: `Pieza de contexto para lectores no especializados. ${arts} artículos disponibles.`,
      urgency: 55, editorial: 85, traffic: 75, seo: 82 });
    if (srcs >= 3) {
      templates.push({ type: 'NEWS',
        title: `Estado de situación: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del estado actual del conflicto o evento.`,
        urgency: 70, editorial: 78, traffic: 70, seo: 72 });
    }
    templates.push({ type: 'SEO',
      title: `Preguntas clave sobre "${title}": guía de contexto`,
      desc: `Alta búsqueda en eventos internacionales. ${arts} artículos como fuente.`,
      urgency: 45, editorial: 65, traffic: 78, seo: 88 });
  }

  if (category === 'politics') {
    templates.push({ type: 'ANALYSIS',
      title: `Qué cambia para los ciudadanos: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Análisis de impacto concreto en la población.`,
      urgency: 65, editorial: 88, traffic: 72, seo: 78 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Quiénes apoyan y quiénes rechazan: "${title}"`,
        desc: `${srcs} fuentes con distintos ángulos. Mapa de posiciones políticas.`,
        urgency: 60, editorial: 82, traffic: 68, seo: 74 });
    }
    templates.push({ type: 'EXPLAINER',
      title: `Explicado en simple: "${title}"`,
      desc: `Pieza de contexto para lectores no especializados. Base: ${arts} artículos.`,
      urgency: 55, editorial: 80, traffic: 70, seo: 82 });
    templates.push({ type: 'SEO',
      title: `Claves y posiciones: "${title}"`,
      desc: `Alta búsqueda en hitos políticos. ${arts} artículos como fuente.`,
      urgency: 45, editorial: 65, traffic: 75, seo: 85 });
  }

  if (category === 'economy') {
    templates.push({ type: 'EXPLAINER',
      title: `Qué significa para el bolsillo: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Explicación accesible del hecho económico.`,
      urgency: 62, editorial: 85, traffic: 72, seo: 80 });
    templates.push({ type: 'ANALYSIS',
      title: `Impacto económico: "${title}"`,
      desc: `Análisis de consecuencias a corto y mediano plazo. Base: ${arts} artículos.`,
      urgency: 58, editorial: 88, traffic: 68, seo: 76 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Qué dicen los economistas sobre "${title}"`,
        desc: `${srcs} fuentes con distintas visiones. Síntesis de opiniones expertas.`,
        urgency: 52, editorial: 82, traffic: 65, seo: 75 });
    }
    templates.push({ type: 'SEO',
      title: `Precio, datos y proyecciones: "${title}"`,
      desc: `Alta intención de búsqueda en temas económicos. Base: ${arts} artículos.`,
      urgency: 48, editorial: 62, traffic: 80, seo: 88 });
  }

  if (category === 'health') {
    templates.push({ type: 'EXPLAINER',
      title: `Qué hay que saber: síntomas, riesgos y prevención — "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza informativa de salud pública.`,
      urgency: 68, editorial: 86, traffic: 78, seo: 88 });
    templates.push({ type: 'NEWS',
      title: `Estado de situación: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Actualización del cuadro sanitario.`,
      urgency: 72, editorial: 80, traffic: 72, seo: 70 });
    templates.push({ type: 'ANALYSIS',
      title: `Qué dice la ciencia sobre "${title}"`,
      desc: `Pieza de contexto científico. Base: ${arts} artículos de ${srcs} ${srcW}.`,
      urgency: 50, editorial: 88, traffic: 68, seo: 82 });
    templates.push({ type: 'SEO',
      title: `Preguntas frecuentes sobre "${title}"`,
      desc: `Altísima intención de búsqueda en salud. ${arts} artículos disponibles.`,
      urgency: 45, editorial: 65, traffic: 82, seo: 92 });
  }

  if (category === 'technology') {
    templates.push({ type: 'NEWS',
      title: `Qué anunció y qué cambia: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del anuncio y sus implicaciones.`,
      urgency: 70, editorial: 78, traffic: 80, seo: 72 });
    templates.push({ type: 'ANALYSIS',
      title: `Qué significa para los usuarios: "${title}"`,
      desc: `Pieza de impacto para audiencia general. Base: ${arts} artículos.`,
      urgency: 58, editorial: 82, traffic: 75, seo: 78 });
    templates.push({ type: 'SEO',
      title: `Cómo funciona y para qué sirve: "${title}"`,
      desc: `Alta intención de búsqueda en tecnología e innovación. ${arts} artículos como fuente.`,
      urgency: 42, editorial: 65, traffic: 85, seo: 90 });
    if (srcs >= 2) {
      templates.push({ type: 'EXPLAINER',
        title: `Guía para no especializados: "${title}"`,
        desc: `${srcs} fuentes cubren el tema. Pieza accesible para audiencia masiva.`,
        urgency: 48, editorial: 78, traffic: 78, seo: 82 });
    }
  }

  if (category === 'sports') {
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `En vivo: "${title}"`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 92, editorial: 75, traffic: 90, seo: 65 });
    }
    templates.push({ type: 'NEWS',
      title: `Cobertura completa: "${title}"`,
      desc: `${arts} artículos en ${srcs} medios deportivos. Resumen del hecho para fans.`,
      urgency: 75, editorial: 72, traffic: 88, seo: 68 });
    if (srcs >= 3) {
      templates.push({ type: 'ANALYSIS',
        title: `Impacto en la tabla y el torneo: "${title}"`,
        desc: `${srcs} fuentes cubren las consecuencias para la competencia.`,
        urgency: 55, editorial: 68, traffic: 82, seo: 72 });
    }
    templates.push({ type: 'SEO',
      title: `Estadísticas, figuras y datos del encuentro: "${title}"`,
      desc: `Datos concretos con alto potencial de búsqueda. Base: ${arts} artículos.`,
      urgency: 48, editorial: 60, traffic: 85, seo: 88 });
  }

  if (category === 'entertainment') {
    templates.push({ type: 'NEWS',
      title: `Todo sobre "${title}": lo que hay que saber`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Cobertura completa del hecho de espectáculos.`,
      urgency: 68, editorial: 68, traffic: 85, seo: 72 });
    templates.push({ type: 'SEO',
      title: `Quién es, qué dijo y por qué es tendencia: "${title}"`,
      desc: `Alta intención de búsqueda en espectáculos. Base: ${arts} artículos.`,
      urgency: 45, editorial: 58, traffic: 88, seo: 90 });
    if (srcs >= 2) {
      templates.push({ type: 'ANALYSIS',
        title: `Por qué "${title}" genera tanta repercusión`,
        desc: `${srcs} fuentes cubren el fenómeno. Pieza de análisis cultural.`,
        urgency: 50, editorial: 72, traffic: 80, seo: 75 });
    }
  }

  if (category === 'society' || templates.length === 0) {
    templates.push({ type: 'ANALYSIS',
      title: `Por qué importa: "${title}" en contexto`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Pieza de profundidad sobre el impacto social.`,
      urgency: 55, editorial: 80, traffic: 68, seo: 72 });
    templates.push({ type: 'NEWS',
      title: `Qué pasó y quiénes se ven afectados: "${title}"`,
      desc: `${arts} artículos de ${srcs} ${srcW}. Resumen del hecho y sus protagonistas.`,
      urgency: 65, editorial: 75, traffic: 72, seo: 68 });
    templates.push({ type: 'EXPLAINER',
      title: `Explicado: "${title}" y su impacto en la comunidad`,
      desc: `Pieza accesible para audiencia general. Base: ${arts} artículos.`,
      urgency: 50, editorial: 78, traffic: 65, seo: 75 });
    if (story.coverage_status === 'breaking') {
      templates.push({ type: 'LIVE_COVERAGE',
        title: `Cobertura en vivo: "${title}"`,
        desc: `Alta actividad: ${arts} artículos de ${srcs} ${srcW}.`,
        urgency: 95, editorial: 82, traffic: 88, seo: 68 });
    }
    if (story.coverage_status === 'growing' && srcs >= 2) {
      templates.push({ type: 'NEWS',
        title: `Historia en crecimiento: "${title}"`,
        desc: `${arts} artículos de ${srcs} ${srcW}. La cobertura está aumentando.`,
        urgency: 70, editorial: 70, traffic: 75, seo: 62 });
    }
  }

  // Cross-category structural rules (always apply)
  if (story.source_count === 1 && (story.importance_score || 0) >= 5) {
    templates.push({ type: 'NEWS',
      title: `Ventana de exclusiva: solo "${firstSrc}" cubre este tema`,
      desc: `Historia con ${arts} artículos cubierta por una sola fuente. Oportunidad de ser el segundo medio.`,
      urgency: 85, editorial: 80, traffic: 62, seo: 52 });
  }
  if (arts >= 6 && srcs <= 2) {
    templates.push({ type: 'NEWS',
      title: `Cobertura concentrada: "${title}"`,
      desc: `${arts} artículos pero solo ${srcs} ${srcW}. Oportunidad para diversificar el ángulo.`,
      urgency: 60, editorial: 66, traffic: 58, seo: 52 });
  }

  return templates;
}

async function generateAlgorithmicOpportunities(storyIds) {
  if (!storyIds || storyIds.length === 0) return;
  await ensureOpportunityTriggerColumn();
  await ensureAlgorithmicSummaryColumn();
  await ensureClusteringSchema2();
  await ensureFreshnessSchema();

  const { rows: stories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.story_type,
      sc.article_count,
      sc.source_count,
      sc.coverage_status,
      sc.importance_score,
      (
        SELECT json_agg(DISTINCT ts.name)
        FROM story_cluster_articles sca2
        JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
        JOIN tracked_sources ts ON ts.id = ma2.source_id
        WHERE sca2.story_id = sc.id
      ) AS sources,
      (
        SELECT json_agg(ke.name ORDER BY ke.name)
        FROM story_entities se
        JOIN knowledge_entities ke ON ke.id = se.entity_id
        WHERE se.story_id = sc.id
        LIMIT 5
      ) AS entities,
      (
        SELECT COUNT(*)::int FROM story_opportunities
        WHERE story_cluster_id = sc.id
          AND status = 'pending'
          AND created_at > now() - interval '4 hours'
          AND "trigger" = 'algorithmic'
      ) AS existing_algo_opps
    FROM story_clusters sc
    WHERE sc.id = ANY($1::uuid[])
      AND sc.is_recurring = false
      AND sc.status IN ('active', 'ready')
  `, [storyIds]);

  for (const story of stories) {
    const sourceList = Array.isArray(story.sources) ? story.sources : [];
    const entityList = Array.isArray(story.entities) ? story.entities.filter(Boolean) : [];

    // Generate and persist algorithmic summary
    const algoSummary = buildAlgorithmicSummary(story, entityList);
    await query(
      `UPDATE story_clusters SET algorithmic_summary = $1 WHERE id = $2 AND (algorithmic_summary IS NULL OR summary IS NULL)`,
      [algoSummary, story.id]
    ).catch(() => {});

    if ((story.existing_algo_opps || 0) > 0) continue;

    const catResult = detectStoryCategory(story.title, story.story_type);
    const category = catResult.category;
    const oppsToInsert = getCategoryOpportunityTemplates(story, category, sourceList);

    for (const opp of oppsToInsert) {
      const composite = parseFloat(
        (opp.editorial * 0.4 + opp.traffic * 0.3 + opp.seo * 0.2 + opp.urgency * 0.1).toFixed(2)
      );
      await query(`
        INSERT INTO story_opportunities
          (story_cluster_id, title, description, opportunity_type,
           traffic_score, seo_score, urgency_score, editorial_score, composite_score, "trigger")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'algorithmic')
      `, [
        story.id, opp.title, opp.desc, opp.type,
        opp.traffic, opp.seo, opp.urgency, opp.editorial, composite,
      ]).catch(() => {});
    }
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
          JOIN rss_sources    ts ON ts.id = ma.source_id
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

const EVENT_WINDOW_HOURS           = 48;
const EVENT_ENTITY_THRESHOLD       = 0.35; // Jaccard on shared entities to group stories into one event
const EVENT_SUMMARY_MIN_STORIES    = 2;    // min story clusters before event gets AI summary
const MIN_EVENT_MATCH_ENTITIES     = 2;    // min story entities to qualify for event matching (mirrors creation guard)

function calcEditorialScore(importanceScore, sourceCount, articleCount, coverageStatus) {
  const impPart    = (importanceScore / 10) * 40;
  const srcPart    = Math.min(sourceCount / 5, 1) * 25;
  const livePart   = coverageStatus === 'breaking' ? 20 : coverageStatus === 'growing' ? 15 : 10;
  const artPart    = Math.min(articleCount / 20, 1) * 15;
  return Math.round(impPart + srcPart + livePart + artPart);
}

const EMPTY_EVENT_STATS = { storiesAnalyzed: 0, storiesMatched: 0, newEventsCreated: 0, singleEntityStoriesSkipped: 0 };

async function detectEvents(affectedStoryIds) {
  if (affectedStoryIds.length === 0) return EMPTY_EVENT_STATS;

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

  if (newStories.length === 0) return EMPTY_EVENT_STATS;

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
  const eventStats = {
    storiesAnalyzed:             0,
    storiesMatched:              0,
    newEventsCreated:            0,
    singleEntityStoriesSkipped:  0,
  };

  for (const story of newStories) {
    const storyEntities = new Set((story.entities || []).map(n => n.toLowerCase()));
    if (storyEntities.size === 0) continue;

    // Skip stories already linked to any active event — prevents creating duplicate events
    if (eventSigs.some(ev => ev.storyIds.has(String(story.id)))) continue;

    eventStats.storiesAnalyzed++;

    if (storyEntities.size < MIN_EVENT_MATCH_ENTITIES) {
      console.log(
        `[EventMatcher] Skip story ${story.id} "${(story.title || '').slice(0, 60)}": ` +
        `only ${storyEntities.size} entity (${[...storyEntities].join(', ')})`
      );
      eventStats.singleEntityStoriesSkipped++;
      continue;
    }

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
      eventStats.storiesMatched++;
      // Track story membership only — do NOT accumulate entities into ev.entities.
      // Cascade entity accumulation caused the same contamination bug fixed in
      // Story Clustering 2.0. DB-loaded entity set is the only source of truth;
      // next cycle re-evaluates with the full merged entity set from the DB.
      const ev = eventSigs.find(e => e.id === bestEventId);
      if (ev) {
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
      eventStats.newEventsCreated++;
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

  return eventStats;
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
          JOIN rss_sources ts ON ts.id = ma.source_id
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
    const { rows: sources } = await query(`
      SELECT * FROM rss_sources
      WHERE enabled = true
        AND (last_checked IS NULL
             OR last_checked < now() - (check_interval || ' seconds')::interval)
    `);

    if (sources.length === 0) {
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
    await fetchPendingArticleContent().catch(e => console.error('[Monitor] Content fetch error:', e.message));
    console.timeEnd('2. Content Extraction');

    // Research entity matching (knowledge base context)
    console.time('3. Entities & Trends');
    await matchResearchEntities(allNewIds);
    // Monitor NER → MONITOR entities → clusters
    await discoverMonitorEntities(allNewIds);

    await refreshTrendingTopics();
    await checkAutoResearchTriggers();
    console.timeEnd('3. Entities & Trends');

    // Sprint 5.3 — trend clusters
    await markStaleClusters();
    // [Cost Killer 1] Auto-generation disabled — use POST /trends/:id/generate-summary
    // summarizePendingClusters().catch(e => console.error('[Monitor] Cluster summarization error:', e.message));

    // Sprint 5.5 — story intelligence
    console.time('4. Story Intelligence (Stories)');
    await detectStories(allNewIds);
    await markStaleStories();
    console.timeEnd('4. Story Intelligence (Stories)');
    
    // [Cost Killer 2] Algorithmic opportunities — no IA, runs every cycle
    console.time('5. Opportunities (Algo)');
    const { rows: recentForOpps } = await query(`
      SELECT id FROM story_clusters
      WHERE status IN ('active','ready') AND is_recurring = false
        AND last_seen > now() - interval '2 hours'
    `);
    if (recentForOpps.length > 0) {
      await generateAlgorithmicOpportunities(recentForOpps.map(r => r.id))
        .catch(e => console.error('[Monitor] Algo opportunities error:', e.message));
    }
    console.timeEnd('5. Opportunities (Algo)');

    // Sprint 5.6.1 — editorial opportunity engine
    // [Cost Killer 1] Auto-generation disabled — use POST /stories/:id/generate-opportunities
    // generateOpportunitiesForStories().catch(e => console.error('[Monitor] Opportunity generation error:', e.message));

    // Sprint 5.6 — event intelligence
    console.time('6. Event Intelligence (Events)');
    const { rows: recentStories } = await query(`
      SELECT id FROM story_clusters
      WHERE status IN ('active','ready','followed')
        AND is_recurring = false
        AND last_seen > now() - interval '2 hours'
    `);
    const recentStoryIds = recentStories.map(r => r.id);
    const eventStats = await detectEvents(recentStoryIds);
    await markStaleEvents();
    console.timeEnd('6. Event Intelligence (Events)');
    console.log('\n=== Event Clustering Report ===');
    console.log(`Stories analyzed:               ${eventStats.storiesAnalyzed}`);
    console.log(`Stories matched to event:       ${eventStats.storiesMatched}`);
    console.log(`New events created:             ${eventStats.newEventsCreated}`);
    console.log(`Single-entity stories skipped:  ${eventStats.singleEntityStoriesSkipped}`);
    console.log('================================\n');

    console.timeEnd('Full Cycle');

    // Ranking summary
    console.log('\n--- Resource Metrics ---');
    console.log(`Artículos nuevos en este ciclo: ${itemsFound}`);
    console.log(`Páginas Playwright abiertas:    ${playwrightMetrics.pagesOpened}`);
    console.log(`Instancias Chromium abiertas:  ${playwrightMetrics.browsersLaunched}`);
    console.log(`News Monitor duration:          ${Date.now() - cycleStart}ms`);
    console.log(`Ciclos omitidos por lock:       ${newsSkippedCycles}`);
    console.log('=== Perf Profile: Cycle End ===\n');

    await finishRun(runId, { status: 'success', sources_processed: sourcesProcessed, items_found: itemsFound });

  } catch (e) {
    console.error('[Monitor] Job error:', e.message);
    await finishRun(runId, { status: 'error', sources_processed: sourcesProcessed, items_found: itemsFound, errors_count: 1, error_message: e.message.slice(0, 500) });
  }
  isNewsRunning = false;
}
