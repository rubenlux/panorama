/**
 * DiscoveryFactory - Pluggable discovery strategy pattern
 *
 * Decouples newsMonitor from specific discovery implementations.
 * Each discovery method is a separate strategy. Monitor only calls:
 *
 *   const discovery = DiscoveryFactory.get(source.discovery_type);
 *   const articles = await discovery.execute(source);
 *
 * Future methods (GOOGLE_NEWS, ATOM, API) plug in without modifying newsMonitor.
 */

import {
  fetchFeedXml,
  parseRssItems,
  parseNewsSitemapItems,
  parseSitemapIndexUrls,
  detectFeedFormat,
  discoverArticlesViaPlaywright,
} from './index.js';

// Abstract base class for all discovery strategies
class DiscoveryStrategy {
  async execute(source) {
    throw new Error('execute() must be implemented');
  }

  classifyError(error) {
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      return {
        status: 'TIMEOUT',
        error: `Timeout after ${error.timeout || 30000} ms`
      };
    }
    if (error.message.includes('Cloudflare') || error.message.includes('403')) {
      return {
        status: 'BLOCKED',
        error: 'Cloudflare challenge detected'
      };
    }
    if (error.message.includes('XML') || error.message.includes('parse')) {
      return {
        status: 'ERROR',
        error: `XML malformed: ${error.message}`
      };
    }
    if (error.code === 'ENOTFOUND') {
      return {
        status: 'ERROR',
        error: 'DNS lookup failed'
      };
    }
    return {
      status: 'ERROR',
      error: error.message
    };
  }
}

// Legacy compatibility: initializeFactory is now a no-op (imports happen at module load)
export function initializeFactory() {
  // No-op: All functions now imported directly from module
}

class RssDiscovery extends DiscoveryStrategy {
  async execute(source) {
    const articles = [];
    let format = null;

    // Map: current schema uses rss_url, not discovery_url (Sprint 2 schema mismatch fix)
    const discoveryUrl = source.discovery_url || source.rss_url;

    if (!discoveryUrl) {
      return { articles: [], format: null };
    }

    const xml = await fetchFeedXml(discoveryUrl);
    if (!xml) {
      return { articles: [], format: null };
    }

    format = detectFeedFormat(xml);
    if (format === 'news-sitemap') {
      articles.push(...parseNewsSitemapItems(xml));
    } else if (format === 'sitemap-index') {
      const childUrls = parseSitemapIndexUrls(xml).slice(-3).reverse();
      for (const childUrl of childUrls) {
        try {
          const childXml = await fetchFeedXml(childUrl);
          if (!childXml) continue;
          const childFmt = detectFeedFormat(childXml);
          articles.push(...(childFmt === 'news-sitemap'
            ? parseNewsSitemapItems(childXml)
            : parseRssItems(childXml)));
        } catch {}
        if (articles.length >= 60) break;
      }
    } else {
      articles.push(...parseRssItems(xml));
    }

    return { articles, format };
  }
}

class SitemapDiscovery extends DiscoveryStrategy {
  async execute(source) {
    const articles = [];
    let format = null;

    // Map: current schema uses rss_url, not discovery_url
    const discoveryUrl = source.discovery_url || source.rss_url;

    if (!discoveryUrl) {
      return { articles: [], format: null };
    }

    const xml = await fetchFeedXml(discoveryUrl);
    if (!xml) {
      return { articles: [], format: null };
    }

    format = detectFeedFormat(xml);
    if (format === 'news-sitemap') {
      articles.push(...parseNewsSitemapItems(xml));
    } else if (format === 'sitemap-index') {
      const childUrls = parseSitemapIndexUrls(xml).slice(-3).reverse();
      for (const childUrl of childUrls) {
        try {
          const childXml = await fetchFeedXml(childUrl);
          if (!childXml) continue;
          const childFmt = detectFeedFormat(childXml);
          articles.push(...(childFmt === 'news-sitemap'
            ? parseNewsSitemapItems(childXml)
            : parseRssItems(childXml)));
        } catch {}
        if (articles.length >= 60) break;
      }
    }

    return { articles, format };
  }
}

class PlaywrightDiscovery extends DiscoveryStrategy {
  async execute(source) {
    const articles = await discoverArticlesViaPlaywright(source);
    return { articles, format: 'playwright-discovery' };
  }
}

// Factory registry
const strategies = {
  'RSS': new RssDiscovery(),
  'SITEMAP': new SitemapDiscovery(),
  'PLAYWRIGHT': new PlaywrightDiscovery()
};

export class DiscoveryFactory {
  static get(discoveryType) {
    const strategy = strategies[discoveryType];
    if (!strategy) {
      throw new Error(`Unsupported discovery type: ${discoveryType}`);
    }
    return strategy;
  }

  static register(type, strategy) {
    if (!strategies[type]) {
      strategies[type] = strategy;
    }
  }

  static supportedTypes() {
    return Object.keys(strategies);
  }

  static classifyError(error) {
    const strategy = new DiscoveryStrategy();
    return strategy.classifyError(error);
  }
}

export { DiscoveryStrategy };
