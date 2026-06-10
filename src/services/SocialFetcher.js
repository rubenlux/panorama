/**
 * SocialFetcher — platform adapters for social media monitoring.
 *
 * Architecture (Nivel 1 / Nivel 2):
 *   Nivel 1: Fast detection — fetch recent post metadata, store, score.
 *   Nivel 2: Selective enrichment — full content via Playwright only for
 *            posts above engagement threshold (future sprint).
 *
 * Active platforms:   YouTube (requires YOUTUBE_API_KEY env var)
 *                     X/Twitter  (requires NITTER_INSTANCE or uses nitter.poast.org)
 *                     Facebook / Instagram / TikTok (requires RSSHUB_INSTANCE or uses rsshub.app)
 *
 * YouTube quota cost: ~12 units per channel per run
 *   (playlist listing: 1 + stats batch: ~10 + channel resolve: 1)
 *   At 30-min intervals, 48 runs/day × 10 channels = ~5,760 units/day
 *   Free quota: 10,000 units/day — safe for initial deployment.
 */

import fetch from 'node-fetch';

// ── Shared utilities ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','al','y','e','o','u',
  'en','con','por','para','que','se','su','sus','es','son','fue','han','este','esta',
  'estos','estas','esto','eso','esa','ese','esos','esas','ha','le','les','lo','no',
  'si','más','pero','muy','ya','cuando','como','sobre','ante','bajo','desde','hasta',
  'hacia','tras','también','porque','aunque','sin','tiene','tienen','nuevo','nueva',
  'qué','cómo','quién','cuándo','dónde','por','qué',
]);

export function extractKeywords(text) {
  if (!text) return [];
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-záéíóúüñ0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )].slice(0, 25);
}

// Engagement score: 0-1000 scale (allows differentiation within platform norms)
// YouTube typical engagement rate: 1-5% of views; 5% → score 500
export function calcEngagementScore(views, likes, comments, shares) {
  const interactions = (likes || 0) * 2 + (comments || 0) * 5 + (shares || 0) * 10;
  if (!views || views === 0) {
    return Math.min(500, interactions);
  }
  const rate = interactions / views;
  return Math.min(1000, Math.round(rate * 10000));
}

// ── YouTube adapter ──────────────────────────────────────────────────────────

async function resolveYouTubeChannelId(profileUrl, apiKey) {
  const channelMatch = profileUrl.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) return channelMatch[1];

  const handleMatch = profileUrl.match(/youtube\.com\/@([\w.-]+)/i);
  if (handleMatch) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?forHandle=${handleMatch[1]}&part=id&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.id || null;
  }

  const userMatch = profileUrl.match(/youtube\.com\/user\/([\w.-]+)/i);
  if (userMatch) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?forUsername=${userMatch[1]}&part=id&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.id || null;
  }

  return null;
}

async function getUploadsPlaylistId(channelId, apiKey) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=contentDetails&key=${apiKey}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

async function fetchYouTube(source) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn(`[SocialFetcher:youtube] YOUTUBE_API_KEY not set — skipping "${source.name}"`);
    return { posts: [], resolvedPlatformId: null };
  }

  // Use cached platform_id to avoid re-resolving the channel ID on every run
  let channelId = source.platform_id;
  if (!channelId) {
    channelId = await resolveYouTubeChannelId(source.profile_url, apiKey);
    if (!channelId) {
      console.warn(`[SocialFetcher:youtube] Could not resolve channel ID for "${source.name}" — ${source.profile_url}`);
      return { posts: [], resolvedPlatformId: null };
    }
  }

  const uploadsId = await getUploadsPlaylistId(channelId, apiKey);
  if (!uploadsId) return { posts: [], resolvedPlatformId: channelId };

  // Fetch recent videos from uploads playlist (1 quota unit)
  const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  playlistUrl.searchParams.set('playlistId', uploadsId);
  playlistUrl.searchParams.set('maxResults', '10');
  playlistUrl.searchParams.set('part', 'snippet');
  playlistUrl.searchParams.set('key', apiKey);

  const playlistRes = await fetch(playlistUrl.toString());
  if (!playlistRes.ok) {
    const errText = await playlistRes.text();
    console.warn(`[SocialFetcher:youtube] Playlist fetch failed for "${source.name}": ${playlistRes.status} — ${errText.slice(0, 150)}`);
    return { posts: [], resolvedPlatformId: channelId };
  }

  const playlistData = await playlistRes.json();
  const items = playlistData.items || [];
  if (!items.length) return { posts: [], resolvedPlatformId: channelId };

  // Fetch statistics in one batch call (~10 quota units)
  const videoIds = items
    .map(i => i.snippet?.resourceId?.videoId)
    .filter(Boolean)
    .join(',');

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoIds}&part=statistics&key=${apiKey}`
  );
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
  const statsMap = {};
  for (const item of (statsData.items || [])) {
    statsMap[item.id] = item.statistics;
  }

  const posts = items
    .map(item => {
      const videoId = item.snippet?.resourceId?.videoId;
      if (!videoId) return null;
      const stats    = statsMap[videoId] || {};
      const views    = parseInt(stats.viewCount    || '0', 10);
      const likes    = parseInt(stats.likeCount    || '0', 10);
      const comments = parseInt(stats.commentCount || '0', 10);
      return {
        external_id:   videoId,
        url:           `https://www.youtube.com/watch?v=${videoId}`,
        title:         item.snippet.title || '',
        content:       (item.snippet.description || '').slice(0, 1000),
        thumbnail_url: item.snippet.thumbnails?.medium?.url || '',
        video_url:     `https://www.youtube.com/watch?v=${videoId}`,
        published_at:  item.snippet.publishedAt || null,
        views,
        likes,
        comments,
        shares: 0,
      };
    })
    .filter(Boolean);

  return { posts, resolvedPlatformId: channelId };
}

// ── RSS utilities (shared by X, Facebook, Instagram, TikTok adapters) ────────

// Minimal RSS 2.0 parser — handles CDATA sections, strips HTML from description
function parseSimpleRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    const get = tag => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const hit = raw.match(r);
      return hit ? hit[1].trim() : '';
    };
    const title = get('title');
    const link  = get('link') || get('guid');
    const desc  = get('description').replace(/<[^>]+>/g, '').trim();
    const pub   = get('pubDate') || get('published') || get('dc:date');
    const guid  = get('guid') || link;
    if (title || link) items.push({ title, link, description: desc, pubDate: pub, guid });
  }
  return items;
}

async function fetchRss(url, label) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialMonitor/1.0)' },
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${label}`);
  const xml = await res.text();
  if (!xml.includes('<item>')) throw new Error(`No RSS items from ${label}`);
  return parseSimpleRss(xml);
}

function extractHandle(source) {
  return source.handle ? source.handle.replace(/^@/, '') : null;
}

function mapRssItems(items, fallbackUrl) {
  return items.slice(0, 15).map(item => ({
    external_id:   item.guid || item.link,
    url:           item.link || fallbackUrl,
    title:         (item.title || '').slice(0, 300),
    content:       (item.description || '').slice(0, 1000),
    thumbnail_url: '', video_url: '',
    published_at:  item.pubDate ? new Date(item.pubDate).toISOString() : null,
    views: 0, likes: 0, comments: 0, shares: 0,
  }));
}

// ── X/Twitter adapter — Nitter RSS proxy ─────────────────────────────────────
// Env: NITTER_INSTANCE (default: https://nitter.poast.org)
// Monitors public accounts. No API key required.

async function fetchX(source) {
  const instance = (process.env.NITTER_INSTANCE || 'https://nitter.poast.org').replace(/\/$/, '');

  let username = extractHandle(source);
  if (!username) {
    const m = source.profile_url?.match(/(?:twitter\.com|x\.com)\/@?([\w]+)/i);
    username = m?.[1] || null;
  }
  if (!username) {
    console.warn(`[SocialFetcher:x] Cannot extract username for "${source.name}"`);
    return { posts: [], resolvedPlatformId: null };
  }

  const items = await fetchRss(`${instance}/${username}/rss`, `Nitter/${username}`);
  return {
    posts: items.slice(0, 15).map(item => ({
      external_id:   item.guid || item.link,
      url:           normalizeXUrl(item.link, username),
      title:         (item.title || '').slice(0, 300),
      content:       (item.description || '').slice(0, 1000),
      thumbnail_url: '', video_url: '',
      published_at:  item.pubDate ? new Date(item.pubDate).toISOString() : null,
      views: 0, likes: 0, comments: 0, shares: 0,
    })),
    resolvedPlatformId: username,
  };
}

function normalizeXUrl(link, username) {
  if (!link) return `https://x.com/${username}`;
  const m = link.match(/\/status\/(\d+)/);
  return m ? `https://x.com/${username}/status/${m[1]}` : link;
}

// ── Facebook / Instagram / TikTok adapters — RSSHub ──────────────────────────
// Env: RSSHUB_INSTANCE (default: https://rsshub.app, or self-hosted instance)
// Monitors public pages/accounts. No API key required.

function rsshubBase() {
  return (process.env.RSSHUB_INSTANCE || 'https://rsshub.app').replace(/\/$/, '');
}

async function fetchFacebook(source) {
  let username = extractHandle(source);
  if (!username) {
    const m = source.profile_url?.match(/facebook\.com\/(?:pages\/[^/]+\/)?([^/?#]+)/i);
    username = m?.[1]?.replace(/^@/, '') || null;
  }
  if (!username || username === 'profile.php') {
    console.warn(`[SocialFetcher:facebook] Cannot extract page name for "${source.name}"`);
    return { posts: [], resolvedPlatformId: null };
  }

  const items = await fetchRss(`${rsshubBase()}/facebook/page/${username}`, `RSSHub/facebook/${username}`);
  return { posts: mapRssItems(items, `https://www.facebook.com/${username}`), resolvedPlatformId: username };
}

async function fetchInstagram(source) {
  let username = extractHandle(source);
  if (!username) {
    const m = source.profile_url?.match(/instagram\.com\/([^/?#]+)/i);
    username = m?.[1] || null;
  }
  if (!username) {
    console.warn(`[SocialFetcher:instagram] Cannot extract username for "${source.name}"`);
    return { posts: [], resolvedPlatformId: null };
  }

  const items = await fetchRss(`${rsshubBase()}/instagram/user/${username}`, `RSSHub/instagram/${username}`);
  return { posts: mapRssItems(items, `https://www.instagram.com/${username}`), resolvedPlatformId: username };
}

async function fetchTikTok(source) {
  let username = extractHandle(source);
  if (!username) {
    const m = source.profile_url?.match(/tiktok\.com\/@([^/?#]+)/i);
    username = m?.[1] || null;
  }
  if (!username) {
    console.warn(`[SocialFetcher:tiktok] Cannot extract username for "${source.name}"`);
    return { posts: [], resolvedPlatformId: null };
  }

  const items = await fetchRss(`${rsshubBase()}/tiktok/user/@${username}`, `RSSHub/tiktok/${username}`);
  return { posts: mapRssItems(items, `https://www.tiktok.com/@${username}`), resolvedPlatformId: username };
}

// ── Main entry point ─────────────────────────────────────────────────────────

const ADAPTERS = { youtube: fetchYouTube, instagram: fetchInstagram, facebook: fetchFacebook, x: fetchX, tiktok: fetchTikTok };

export async function fetchRecentPosts(source) {
  const adapter = ADAPTERS[source.platform];
  if (!adapter) {
    console.warn('[SocialFetcher] Unknown platform:', source.platform);
    return { posts: [], resolvedPlatformId: null };
  }
  try {
    return await adapter(source);
  } catch (err) {
    console.error(`[SocialFetcher:${source.platform}] Error for "${source.name}":`, err.message);
    return { posts: [], resolvedPlatformId: null };
  }
}

export const PLATFORM_INFO = {
  youtube:   { label: 'YouTube',   active: true },
  instagram: { label: 'Instagram', active: true },
  facebook:  { label: 'Facebook',  active: true },
  x:         { label: 'X',         active: true },
  tiktok:    { label: 'TikTok',    active: true },
};
