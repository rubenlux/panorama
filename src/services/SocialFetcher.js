/**
 * SocialFetcher — platform adapters for social media monitoring.
 *
 * Architecture (Nivel 1 / Nivel 2):
 *   Nivel 1: Fast detection — fetch recent post metadata, store, score.
 *   Nivel 2: Selective enrichment — full content via Playwright only for
 *            posts above engagement threshold (future sprint).
 *
 * Active platforms:   YouTube (requires YOUTUBE_API_KEY env var)
 * Stubbed platforms:  Instagram, Facebook, X, TikTok (credentials needed)
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

// ── Platform stubs ────────────────────────────────────────────────────────────
// Each returns { posts: [], resolvedPlatformId: null }
// Requires platform credentials to activate:
//   Instagram / Facebook: Meta Graph API (app review required)
//   X:                    X API v2 Basic tier ($100/mo) or elevated access
//   TikTok:               TikTok Research API (academic/business application)

async function fetchInstagram(source) {
  console.warn(`[SocialFetcher:instagram] Not implemented — "${source.name}". Requires Meta Graph API credentials.`);
  return { posts: [], resolvedPlatformId: null };
}

async function fetchFacebook(source) {
  console.warn(`[SocialFetcher:facebook] Not implemented — "${source.name}". Requires Meta Graph API credentials.`);
  return { posts: [], resolvedPlatformId: null };
}

async function fetchX(source) {
  console.warn(`[SocialFetcher:x] Not implemented — "${source.name}". Requires X API v2 credentials.`);
  return { posts: [], resolvedPlatformId: null };
}

async function fetchTikTok(source) {
  console.warn(`[SocialFetcher:tiktok] Not implemented — "${source.name}". Requires TikTok Research API credentials.`);
  return { posts: [], resolvedPlatformId: null };
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
  youtube:   { label: 'YouTube',   active: true  },
  instagram: { label: 'Instagram', active: false },
  facebook:  { label: 'Facebook',  active: false },
  x:         { label: 'X',         active: false },
  tiktok:    { label: 'TikTok',    active: false },
};
