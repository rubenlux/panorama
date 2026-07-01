/**
 * Article metadata extraction via Playwright
 * RICH EXTRACTOR v2 - Comprehensive metadata from multiple sources
 */

import pLimit from 'p-limit';

/**
 * Extract article metadata from a URL using Playwright
 * @param {Page} page - Playwright page object
 * @param {string} url - Article URL to extract
 * @returns {Promise<Object|null>} Metadata object or null if extraction failed
 */
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
          titleWinner = 'json-ld.headline';
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
    // ogTitle already captured from OG meta tag above
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

export {
  extractArticleMetadata,
};
