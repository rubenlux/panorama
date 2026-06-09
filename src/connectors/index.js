import { fetchRSS, DEFAULT_FEEDS } from './rss.js';

export const CONNECTORS = {
  rss: {
    name: 'RSS Feeds',
    fetch: fetchRSS,
  },
  // Future connectors registered here:
  // newsapi: { name: 'NewsAPI', fetch: fetchNewsAPI },
  // youtube: { name: 'YouTube', fetch: fetchYouTube },
  // reddit:  { name: 'Reddit',  fetch: fetchReddit },
};

export async function investigate(query, connectorIds = ['rss'], options = {}) {
  const sources = [];

  await Promise.allSettled(
    connectorIds.map(async (id) => {
      const connector = CONNECTORS[id];
      if (!connector) return;
      const results = await connector.fetch(query, options.feeds, options);
      sources.push(...results);
    })
  );

  return sources.sort((a, b) => b.relevance_score - a.relevance_score);
}

export { DEFAULT_FEEDS };
