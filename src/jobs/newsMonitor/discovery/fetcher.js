/**
 * Feed fetching and format detection for discovery
 */

import fetch from 'node-fetch';

/**
 * Detect feed format from XML content
 * @param {string} xml
 * @returns {string} Format: 'sitemap-index', 'news-sitemap', 'urlset', 'rss', 'atom', or 'rss' (fallback)
 */
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

/**
 * Fetch feed XML from URL
 * @param {string} url
 * @returns {Promise<string|null>} XML content or null if not available
 */
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

export {
  detectFeedFormat,
  fetchFeedXml,
};
