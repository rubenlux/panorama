import 'dotenv/config';
import {
  SocialFetcherGraphApiFacebook,
  SocialFetcherPlaywrightFacebook,
  SocialFetcherPlaywrightInstagram,
  SocialFetcherPlaywrightYouTube,
  SocialFetcherX,
} from '../src/connectors/social/fetchers.js';
import { fetchYouTubeTranscriptViaPlaywright } from '../src/connectors/social/transcripts.js';

const TEST_TIMEOUT_MS = parseInt(process.env.SOCIAL_VALIDATE_TIMEOUT_MS || '70000', 10);

function source(overrides) {
  return {
    id: overrides.id || `validate-${overrides.platform}-${overrides.content_type || 'posts'}`,
    region: 'nacional',
    category: 'medio',
    priority: 5,
    enabled: true,
    ...overrides,
  };
}

async function withTimeout(label, fn) {
  let timer;
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout_${TEST_TIMEOUT_MS}ms`)), TEST_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
    const count = Array.isArray(result) ? result.length : result?.available ? 1 : 0;
    if (count > 0) {
      console.log(`PASS ${label}: count=${count}`);
    } else {
      console.log(`FAIL ${label}: returned_empty`);
    }
  } catch (error) {
    clearTimeout(timer);
    console.log(`FAIL ${label}: ${error.message}`);
  }
}

const samples = {
  facebook: source({
    platform: 'facebook',
    name: 'Noticias Formosa',
    profile_url: process.env.VALIDATE_FACEBOOK_URL || 'https://www.facebook.com/NoticiasFormosa',
    content_type: 'posts',
  }),
  youtubeVideos: source({
    platform: 'youtube',
    name: 'TN videos',
    profile_url: process.env.VALIDATE_YOUTUBE_VIDEOS_URL || 'https://www.youtube.com/@todonoticias/videos',
    content_type: 'videos',
  }),
  youtubeShorts: source({
    platform: 'youtube',
    name: 'TN shorts',
    profile_url: process.env.VALIDATE_YOUTUBE_SHORTS_URL || 'https://www.youtube.com/@todonoticias/shorts',
    content_type: 'shorts',
  }),
  youtubePosts: source({
    platform: 'youtube',
    name: 'TN posts',
    profile_url: process.env.VALIDATE_YOUTUBE_POSTS_URL || 'https://www.youtube.com/@todonoticias/community',
    content_type: 'posts',
  }),
  x: source({
    platform: 'x',
    name: 'TN X',
    profile_url: process.env.VALIDATE_X_URL || 'https://x.com/todonoticias',
    handle: process.env.VALIDATE_X_HANDLE || '@todonoticias',
    content_type: 'tweets',
  }),
  instagram: source({
    platform: 'instagram',
    name: 'TN Instagram',
    profile_url: process.env.VALIDATE_INSTAGRAM_URL || 'https://www.instagram.com/todonoticias/',
    handle: process.env.VALIDATE_INSTAGRAM_HANDLE || 'todonoticias',
    content_type: 'posts',
  }),
};

console.log(`SOCIAL_VALIDATE_TIMEOUT_MS=${TEST_TIMEOUT_MS}`);

await withTimeout('Facebook public pages', async () => {
  const previousProfileDir = process.env.FB_PROFILE_DIR;
  const previousCookiesFile = process.env.FB_COOKIES_FILE;
  process.env.FB_PROFILE_DIR = './tmp/fb-public-validation-profile';
  process.env.FB_COOKIES_FILE = './tmp/fb-public-validation-missing-cookies.json';
  try {
    return await new SocialFetcherPlaywrightFacebook(samples.facebook).fetchLatest();
  } finally {
    if (previousProfileDir === undefined) delete process.env.FB_PROFILE_DIR;
    else process.env.FB_PROFILE_DIR = previousProfileDir;
    if (previousCookiesFile === undefined) delete process.env.FB_COOKIES_FILE;
    else process.env.FB_COOKIES_FILE = previousCookiesFile;
  }
});

await withTimeout('Facebook Graph API mode', async () => {
  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    throw new Error('FB_PAGE_ACCESS_TOKEN_missing');
  }
  return await new SocialFetcherGraphApiFacebook(samples.facebook).fetchLatest();
});

await withTimeout('Facebook authenticated mode', async () => {
  return await new SocialFetcherPlaywrightFacebook(samples.facebook).fetchLatest();
});

console.log('FAIL Facebook GraphQL mode: no production GraphQL fetcher exported');

await withTimeout('YouTube videos', async () => {
  return await new SocialFetcherPlaywrightYouTube(samples.youtubeVideos).fetchLatest();
});

await withTimeout('YouTube shorts', async () => {
  return await new SocialFetcherPlaywrightYouTube(samples.youtubeShorts).fetchLatest();
});

await withTimeout('YouTube posts', async () => {
  return await new SocialFetcherPlaywrightYouTube(samples.youtubePosts).fetchLatest();
});

await withTimeout('YouTube transcripts', async () => {
  const url = process.env.VALIDATE_TRANSCRIPT_URL || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const result = await fetchYouTubeTranscriptViaPlaywright(url);
  if (result === null) throw new Error('transient_null');
  if (!result.available) throw new Error(result.reason || 'not_available');
  return result;
});

await withTimeout('X timeline', async () => {
  return await new SocialFetcherX(samples.x).fetchLatest();
});

console.log('FAIL X GraphQL: no production GraphQL fetcher exported');

await withTimeout('Instagram posts', async () => {
  return await new SocialFetcherPlaywrightInstagram(samples.instagram).fetchLatest();
});
