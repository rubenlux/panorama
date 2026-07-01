/**
 * Shared utilities used across all newsMonitor modules
 * Includes: HTML parsing, RSS parsing, URL validation, NER, hashing
 */

import { createHash } from 'crypto';

// ── HTML entity decoder ───────────────────────────────────────────────────────

export function decodeHtmlEntities(str) {
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

// ── RSS/XML Tag extraction ─────────────────────────────────────────────────────

export function extractTag(xml, tag) {
  const re = new RegExp(`<([\\w-]+\\:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/([\\w-]+\\:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[2].trim()) : '';
}

// ── RSS Parser ─────────────────────────────────────────────────────────────────

export function parseRssItems(xml) {
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

// ── Google News Sitemap parser ─────────────────────────────────────────────────

export function parseNewsSitemapItems(xml) {
  const items = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const block   = m[1];
    const loc     = extractTag(block, 'loc');
    if (!loc || !loc.startsWith('http')) continue;
    const title   = extractTag(block, 'title');
    const pubDate = extractTag(block, 'publication_date') || extractTag(block, 'lastmod');
    if (!title) continue;
    items.push({ title, link: loc, description: '', pubDate, guid: loc });
  }
  return items;
}

export function parseSitemapIndexUrls(xml) {
  const urls = [];
  const re = /<loc>([\s\S]*?)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = decodeHtmlEntities(m[1].trim());
    if (u.startsWith('http')) urls.push(u);
  }
  return urls;
}

// ── Feed format detection ──────────────────────────────────────────────────────

export function detectFeedFormat(xml) {
  const t = xml.trimStart().slice(0, 2000);
  if (t.includes('<sitemapindex'))  return 'sitemap-index';
  if (t.includes('<urlset')) {
    return (t.includes('xmlns:news') || t.includes('news.google.com')) ? 'news-sitemap' : 'urlset';
  }
  if (t.includes('<rss') || t.includes('<channel')) return 'rss';
  if (t.includes('<feed') && t.includes('xmlns'))   return 'atom';
  return 'rss';
}

// ── URL hashing for deduplication ─────────────────────────────────────────────

export function hashUrl(url) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

// ── Monitor NER — extract proper-noun sequences from titles ───────────────────

export const MONITOR_STOPWORDS = new Set([
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
  // Generic topic nouns
  'Horóscopo', 'Horoscopo',
  'Salud', 'Amor', 'Dinero', 'Trabajo', 'Economía',
  'Selección',
  // English stopwords
  'The', 'This', 'That', 'These', 'Those',
  'New', 'Old', 'Big', 'How', 'Why', 'What', 'When', 'Where', 'Who',
  'Its', 'Their', 'Your', 'Our',
]);

export function extractMonitorEntities(title) {
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

// ── URL domain validation ──────────────────────────────────────────────────────

export function belongsToMedia(hostname, mediaHostname) {
  if (!mediaHostname) return true;

  const h = hostname.toLowerCase();
  const m = mediaHostname.toLowerCase();

  if (h === m) return true;
  if (h.endsWith('.' + m)) return true;

  return false;
}

export function isGarbageUrl(url) {
  if (/\.(jpg|png|webp|pdf|gif|doc|docx)$/i.test(url)) return true;
  if (/javascript:|mailto:/.test(url)) return true;
  if (/\?.*?(page|search|q)=/i.test(url)) return true;

  const pathSegments = new URL(url).pathname.split('/').filter(s => s);
  const garbageSegments = ['rss', 'feed', 'sitemap', 'login', 'signin', 'logout', 'search',
                           'contacto', 'contact', 'privacy', 'about', 'terms', 'legal',
                           'help', 'faq', 'suscripci', 'subscribe', 'ads', 'jobs', 'carrera',
                           'category', 'tag', 'author', 'page', 'archivo'];

  if (pathSegments.some(seg => garbageSegments.includes(seg.toLowerCase()))) {
    return true;
  }

  return false;
}

export function isBlockedByChallenge(title, content) {
  const cloudflareIndicators = [
    title === 'Just a moment...',
    content.includes('/cdn-cgi/challenge-platform/'),
    content.includes('Checking your browser'),
    content.includes('Attention Required'),
    content.includes('cf-browser-verification'),
  ];
  return cloudflareIndicators.some(indicator => indicator);
}

export const DISCOVERY_LIMIT = 30;

export function isCandidateUrl(url, mediaHostname) {
  if (!url.startsWith('http')) return false;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (!belongsToMedia(hostname, mediaHostname)) {
      return false;
    }

    if (isGarbageUrl(url)) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}

// ── Query debugging ───────────────────────────────────────────────────────────

export function logQueryDebug(label, sql, params) {
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
