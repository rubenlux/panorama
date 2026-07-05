/**
 * RSS and Sitemap XML parsers for feed discovery
 * Extracts articles from various feed formats (RSS, Atom, Google News Sitemaps)
 */

/**
 * Decode HTML entities (&amp;, &lt;, etc.)
 * @param {string} str
 * @returns {string}
 */
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

/**
 * Extract a tag value from raw XML
 * Handles namespace prefixes (e.g., dc:date, news:title)
 * @param {string} xml
 * @param {string} tag
 * @returns {string}
 */
function extractTag(xml, tag) {
  const re = new RegExp(`<([\\w-]+\\:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/([\\w-]+\\:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[2].trim()) : '';
}

/**
 * Extract an attribute value from the first matching tag (for self-closing
 * tags like Atom's `<link href="..." />`, which extractTag can't handle
 * since it requires a closing `</tag>`).
 * @param {string} xml
 * @param {string} tag
 * @param {string} attr
 * @returns {string}
 */
function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']*)["'][^>]*/?>`, 'i');
  const m = xml.match(re);
  return m ? decodeHtmlEntities(m[1]) : '';
}

/**
 * Parse RSS feed items (<item> tags)
 * @param {string} xml
 * @returns {Array} Items with {title, link, description, pubDate, guid}
 */
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

/**
 * Parse Atom feed items (<entry> tags)
 * Atom's <link> is a self-closing tag with an href attribute (rel="alternate"
 * is the article URL), unlike RSS where <link> wraps the URL as text content —
 * hence extractAttr instead of extractTag for the link.
 * @param {string} xml
 * @returns {Array} Items with {title, link, description, pubDate, guid}
 */
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

/**
 * Parse Google News Sitemap items
 * @param {string} xml
 * @returns {Array} Items with {title, link, description, pubDate, guid}
 */
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

/**
 * Parse sitemap index URLs
 * @param {string} xml
 * @returns {Array} URLs
 */
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

export {
  decodeHtmlEntities,
  extractTag,
  extractAttr,
  parseRssItems,
  parseAtomItems,
  parseNewsSitemapItems,
  parseSitemapIndexUrls,
};
