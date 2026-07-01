/**
 * Article validation and URL screening for extraction
 */

/**
 * Check if hostname belongs to media domain (exact match or subdomain)
 * @param {string} hostname
 * @param {string} mediaHostname
 * @returns {boolean}
 */
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

/**
 * Check if URL is obviously garbage (not an article)
 * @param {string} url
 * @returns {boolean}
 */
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
                           'category', 'tag', 'author', 'page', 'archivo'];

  if (pathSegments.some(seg => garbageSegments.includes(seg.toLowerCase()))) {
    return true;
  }

  return false;
}

/**
 * Detect Cloudflare or other blocking challenges
 * @param {string} title - Page title
 * @param {string} content - Page HTML content
 * @returns {boolean}
 */
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

/**
 * Check if URL is a candidate for extraction (passes basic screening)
 * @param {string} url
 * @param {string} mediaHostname
 * @returns {boolean}
 */
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

/**
 * Validate that an extracted article meets content requirements
 * Mutates article with _skipReason if validation fails
 * @param {Object} article
 * @returns {boolean}
 */
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

export {
  belongsToMedia,
  isGarbageUrl,
  isBlockedByChallenge,
  isCandidateUrl,
  validateArticle,
};
