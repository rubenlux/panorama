import fetch from 'node-fetch';

// Default RSS feeds — mix of international + Argentine sources
const DEFAULT_FEEDS = [
  // International Spanish
  { name: 'BBC Mundo',        url: 'https://feeds.bbci.co.uk/mundo/rss.xml' },
  { name: 'DW Español',       url: 'https://rss.dw.com/rdf/rss-es-all' },
  // Argentine nationals
  { name: 'Infobae',          url: 'https://www.infobae.com/feeds/rss/' },
  { name: 'La Nación',        url: 'https://www.lanacion.com.ar/arcio/rss/' },
  { name: 'Clarin',           url: 'https://www.clarin.com/rss/lo-ultimo/' },
  { name: 'Telam',            url: 'https://www.telam.com.ar/rss/portada.xml' },
  { name: 'Perfil',           url: 'https://www.perfil.com/feed' },
];

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    items.push({
      title:       extractTag(raw, 'title'),
      link:        extractTag(raw, 'link') || extractTag(raw, 'guid'),
      description: extractTag(raw, 'description'),
      pubDate:     extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date'),
    });
  }
  return items;
}

// Common words that inflate relevance scores when matched against query stopwords (W2 fix)
const RELEVANCE_STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'en', 'a', 'y', 'o', 'que',
  'por', 'con', 'del', 'al', 'se', 'su', 'sus', 'es', 'son', 'ha', 'han',
  'no', 'si', 'más', 'ya', 'pero', 'como', 'cuando', 'donde', 'cual',
  'the', 'of', 'is', 'in', 'and', 'or', 'to', 'for', 'at', 'by', 'on',
]);

function scoreRelevance(item, query) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !RELEVANCE_STOPWORDS.has(w));
  if (words.length === 0) return 0;
  const matches = words.filter(w => text.includes(w)).length;
  return matches / words.length;
}

export async function fetchRSS(query, feeds = DEFAULT_FEEDS, { minScore = 0.2, maxPerFeed = 5 } = {}) {
  const results = [];

  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'Panorama-Research/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseItems(xml);

        let count = 0;
        for (const item of items) {
          if (count >= maxPerFeed) break;
          const score = scoreRelevance(item, query);
          if (score >= minScore) {
            results.push({
              url:         item.link,
              title:       item.title,
              source_name: feed.name,
              published_at: item.pubDate ? new Date(item.pubDate) : null,
              content:     item.description.replace(/<[^>]*>/g, '').trim(),
              relevance_score: parseFloat(score.toFixed(3)),
              connector:   'rss',
            });
            count++;
          }
        }
      } catch {
        // Individual feed failure is non-fatal
      }
    })
  );

  return results.sort((a, b) => b.relevance_score - a.relevance_score);
}

export { DEFAULT_FEEDS };
