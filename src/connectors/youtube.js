import fetch from 'node-fetch';

const getApiKey = () => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not defined in environment variables.');
  return key;
};

/**
 * Resolves a YouTube handle, URL, or channelId into standard channel metadata.
 * Useful for when an editor adds a new source in the CMS.
 * @param {string} input - Can be '@handle', 'https://youtube.com/@handle', or a 'UC...' channel ID
 * @returns {Promise<{ platform_id: string, name: string, handle: string, thumbnail_url: string }>}
 */
export async function resolveYouTubeChannel(input) {
  const key = getApiKey();
  let query = input.trim();
  
  // Clean URL if provided
  if (query.startsWith('http')) {
    const url = new URL(query);
    query = url.pathname.replace(/^\//, ''); // e.g. '@handle' or 'channel/UC...'
    if (query.startsWith('channel/')) {
      query = query.replace('channel/', '');
    }
  }

  // If it's starting with UC, it's likely a channel ID
  if (query.startsWith('UC') && query.length === 24) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${key}&id=${query}&part=snippet`);
    const data = await res.json();
    if (!data.items?.length) throw new Error('YouTube channel not found by ID');
    
    const snippet = data.items[0].snippet;
    return {
      platform_id: data.items[0].id,
      name: snippet.title,
      handle: snippet.customUrl || '',
      thumbnail_url: snippet.thumbnails?.default?.url || ''
    };
  }

  // IF it starts with @, use forHandle
  if (query.startsWith('@')) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${key}&forHandle=${encodeURIComponent(query)}&part=snippet`);
    const data = await res.json();
    if (data.error) {
      console.error("[YouTube API forHandle Error]:", JSON.stringify(data.error));
    }
    if (data.items?.length) {
      const snippet = data.items[0].snippet;
      return {
        platform_id: data.items[0].id,
        name: snippet.title,
        handle: snippet.customUrl || query,
        thumbnail_url: snippet.thumbnails?.default?.url || ''
      };
    }
  }

  // Si no la encontramos por forHandle o ID, NO usamos search (regla de oro del Sprint 7.1: cuesta 100x mas cuota).
  throw new Error(`YouTube channel no encontrado nativamente para: ${query}. (Búsqueda por texto desactivada por costos de cuota)`);
}

/**
 * Fetches the latest videos for a given channel ID.
 * Optimized: Gets the 'uploads' playlist ID first, then fetches playlist items (1 unit each)
 * instead of using the Search API (100 units).
 * @param {string} channelId - The 'UC...' platform ID
 * @param {number} maxResults - Max videos to fetch
 */
export async function fetchYouTubeLatest(channelId, maxResults = 10) {
  const key = getApiKey();

  // 1. Get the uploads playlist ID
  const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${key}&id=${channelId}&part=contentDetails`);
  const channelData = await channelRes.json();
  
  if (!channelData.items?.length) throw new Error('YouTube channel not found when fetching uploads');
  
  const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
  if (!uploadsPlaylistId) throw new Error('YouTube channel has no uploads playlist');

  // 2. Fetch the items from the uploads playlist
  const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${key}&playlistId=${uploadsPlaylistId}&part=snippet,contentDetails&maxResults=${maxResults}`);
  const itemsData = await itemsRes.json();

  if (!itemsData.items) return [];

  // Map to the social_posts schema standard in our app
  const posts = itemsData.items.map(item => {
    const snippet = item.snippet;
    const videoId = item.contentDetails.videoId;
    return {
      platform: 'youtube',
      external_id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published_at: snippet.publishedAt,
      title: snippet.title,
      content: snippet.description, // Can be long, might truncate or store full
      thumbnail_url: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      // Views/Likes/Comments demand an extra API call to videos endpoint. We proxy 0 for now
      // or we can batch fetch stats for all these videoId's in one call if needed.
    };
  });

  return posts;
}

/**
 * Utility to batch-fetch stats (views, likes, comments) for an array of video IDs.
 * (1 quota unit per call, up to 50 ids at once).
 */
export async function fetchYouTubeStats(videoIds) {
  if (!videoIds || videoIds.length === 0) return {};
  
  const key = getApiKey();
  const idsParam = videoIds.join(',');
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${key}&id=${idsParam}&part=statistics`);
  const data = await res.json();
  
  if (!data.items) return {};

  const statsMap = {};
  for (const item of data.items) {
    statsMap[item.id] = {
      views: parseInt(item.statistics.viewCount || '0', 10),
      likes: parseInt(item.statistics.likeCount || '0', 10),
      comments: parseInt(item.statistics.commentCount || '0', 10),
      shares: 0 // YouTube API doesn't expose shares natively via list API
    };
  }
  
  return statsMap;
}
