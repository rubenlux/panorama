/**
 * SPRINT 7.2B — Playwright-based social fetchers.
 * YouTube: videos (fixed networkidle→domcontentloaded), shorts (oEmbed enrichment), community posts.
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logBrowserLifecycle } from '../../services/browserLifecycleLogger.js';
import { query } from '../../routes/db.js';

// Sprint Performance 10.0 — incremental fetching metrics
export const incrementalStats = {
  facebookSmartStops: 0,
  youtubeSmartStops: 0,
  reset() { this.facebookSmartStops = 0; this.youtubeSmartStops = 0; }
};

// Thrown when a scrape finds a login wall instead of content (cookies expired/invalid).
// Deliberately NOT swallowed by the generic per-fetcher try/catch — it must propagate
// so socialMonitor.js's error_message capture (already existing, no changes needed there)
// records it distinctly in social_fetch_logs, surfaced later by GET /social/stats.
export class SessionExpiredError extends Error {}

let facebookPersistentProfileLock = Promise.resolve();

async function withFacebookPersistentProfileLock(fn) {
  const previous = facebookPersistentProfileLock.catch(() => {});
  let release;
  facebookPersistentProfileLock = new Promise(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export class SocialFetcherBase {
  constructor(source) {
    this.source = source;
  }

  async fetchLatest() {
    throw new Error('Not implemented.');
  }

  async _launchBrowser(source = this.constructor.name) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    logBrowserLifecycle('BROWSER_CREATED', source);
    return browser;
  }
}

export class SocialFetcherPlaywrightX extends SocialFetcherBase {
  async fetchLatest() {
    console.log(`[X/Twitter] Fetching via Playwright for ${this.source.handle}...`);

    const browser = await this._launchBrowser('X/Twitter');
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    });
    logBrowserLifecycle('CONTEXT_CREATED', 'X/Twitter');
    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'X/Twitter');
    const posts = [];

    try {
      const targetUrl = `https://x.com/${this.source.handle.replace('@', '')}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {
        throw new Error('Timeout waiting for tweets (possible login wall or empty profile)');
      });

      const tweets = await page.$$('article[data-testid="tweet"]');

      for (const tweet of tweets) {
        if (posts.length >= 10) break;
        try {
          const contentEl = await tweet.$('[data-testid="tweetText"]');
          const content = contentEl ? await contentEl.innerText() : '';
          const timeEl = await tweet.$('time');
          const published_at = timeEl ? await timeEl.getAttribute('datetime') : new Date().toISOString();
          const aEl = await tweet.$('a:has(time)');
          const urlPath = aEl ? await aEl.getAttribute('href') : '';
          const fullUrl = urlPath ? `https://x.com${urlPath}` : targetUrl;
          const external_id = urlPath ? urlPath.split('/').pop() : Date.now().toString();
          const repliesEl = await tweet.$('[data-testid="reply"]');
          const replies = parseInt(((repliesEl ? await repliesEl.getAttribute('aria-label') : '') || '').replace(/[^0-9]/g, '')) || 0;
          const repostsEl = await tweet.$('[data-testid="retweet"]');
          const reposts = parseInt(((repostsEl ? await repostsEl.getAttribute('aria-label') : '') || '').replace(/[^0-9]/g, '')) || 0;
          const likesEl = await tweet.$('[data-testid="like"]');
          const likes = parseInt(((likesEl ? await likesEl.getAttribute('aria-label') : '') || '').replace(/[^0-9]/g, '')) || 0;

          posts.push({
            platform: 'x', external_id, url: fullUrl, published_at,
            title: content.substring(0, 100), content, thumbnail_url: '',
            views: 0, likes, comments: replies, shares: reposts,
            engagement_score: likes + replies + reposts
          });
        } catch (e) {
          console.error('[X/Twitter] Error parsing tweet:', e.message);
        }
      }
    } finally {
      logBrowserLifecycle('PAGE_CLOSED', 'X/Twitter');
      await page.close().catch(() => { });
      logBrowserLifecycle('CONTEXT_CLOSED', 'X/Twitter');
      await context.close().catch(() => { });
      logBrowserLifecycle('BROWSER_CLOSED', 'X/Twitter');
      await browser.close().catch(() => { });
    }

    return posts;
  }
}

export const SocialFetcherX = SocialFetcherPlaywrightX;

// Instagram post nodes are anchored structurally (has `code` + `pk` + `media_type`),
// NOT by a fixed top-level connection name — the profile grid uses
// `xdt_api__v1__feed__user_timeline_graphql_connection` while the Reels tab uses
// `xdt_api__v1__clips__user__connection_v2` (verified live, both shapes hold the
// same node fields). Same anchor-by-shape principle as Facebook's story walker.
function _walkInstagramPosts(root) {
  const posts = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const v of n) walk(v); return; }
    if (typeof n.code === 'string' && typeof n.pk === 'string' && n.media_type !== undefined && !seen.has(n.pk)) {
      seen.add(n.pk);
      posts.push({
        pk: n.pk,
        code: n.code,
        product_type: n.product_type || '',
        media_type: n.media_type,
        taken_at: n.taken_at || 0,
        caption: n.caption?.text || '',
        like_count: n.like_count || 0,
        comment_count: n.comment_count || 0,
        view_count: n.view_count || 0,
        thumbnail: n.image_versions2?.candidates?.[0]?.url || '',
        video: n.video_versions?.[0]?.url || '',
      });
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(root);
  return posts;
}

export class SocialFetcherPlaywrightInstagram extends SocialFetcherBase {
  async fetchLatest() {
    const profileUrl = this.source.profile_url;
    const sourceName = this.source.name;
    console.log(`[Instagram] Fetching ${sourceName} → ${profileUrl}`);

    const cookiesFile = process.env.IG_COOKIES_FILE || join(process.cwd(), 'instagram_cookies.json');

    const browser = await this._launchBrowser('Instagram');
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
    });
    logBrowserLifecycle('CONTEXT_CREATED', 'Instagram');

    if (existsSync(cookiesFile)) {
      try {
        const raw = JSON.parse(readFileSync(cookiesFile, 'utf-8'));
        const normSS = v => ({ no_restriction: 'None', lax: 'Lax', strict: 'Strict' })[v?.toLowerCase()] || 'None';
        await context.addCookies(raw.map(c => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
          secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: normSS(c.sameSite),
        })));
      } catch (e) {
        console.warn(`[Instagram] cookie injection warning: ${e.message}`);
      }
    }

    const postMap = new Map(); // pk → post fields, dedup across scrolls/pagination
    context.on('response', (response) => {
      if (!response.url().includes('/graphql')) return;
      response.text()
        .then(body => {
          if (!body || body.length < 200) return;
          let obj;
          try { obj = JSON.parse(body); } catch { return; }
          for (const p of _walkInstagramPosts(obj)) {
            if (!postMap.has(p.pk)) postMap.set(p.pk, p);
          }
        })
        .catch(() => { /* body already consumed / not JSON — ignore */ });
    });

    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'Instagram');
    const posts = [];

    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 40000 })
        .catch(e => console.warn(`[Instagram] goto warning: ${e.message}`));
      await new Promise(r => setTimeout(r, 4000));

      let lastHeight = 0;
      let noGrowthStreak = 0;
      for (let i = 0; i < 8; i++) {
        const h = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; });
        await new Promise(r => setTimeout(r, 2500));

        const grew = h > lastHeight;
        console.log(`[Instagram] Scroll ${i + 1}: ${postMap.size} posts capturados${grew ? '' : ' (sin crecimiento)'}`);
        lastHeight = h;

        if (i >= 2) {
          noGrowthStreak = grew ? 0 : noGrowthStreak + 1;
          if (noGrowthStreak >= 2) {
            console.log(`[Instagram] Sin crecimiento 2 scrolls seguidos — deteniendo`);
            break;
          }
        }
      }

      for (const p of postMap.values()) {
        const caption = (p.caption || '').trim();
        if (!caption) {
          console.log(`[Instagram] ⚠️  Sin caption (pk=${p.pk}) — omitido`);
          continue;
        }

        const isReel = p.product_type === 'clips';
        const url = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${p.code}/`;
        const contentType = isReel ? 'reel' : p.media_type === 8 ? 'carousel' : p.media_type === 2 ? 'video' : 'post';

        posts.push({
          platform: 'instagram',
          external_id:      `ig${p.pk}`,
          url,
          title:            caption.substring(0, 300),
          content:          caption,
          thumbnail_url:    p.thumbnail || '',
          video_url:        p.video || '',
          views: p.view_count || 0, likes: p.like_count || 0, comments: p.comment_count || 0, shares: 0,
          engagement_score: p.like_count || 0,
          published_at:     p.taken_at ? new Date(p.taken_at * 1000).toISOString() : new Date().toISOString(),
          keywords:         [contentType],
        });
      }

      // Zero posts is anomalous for an active profile — check for the login-wall
      // signature confirmed live (2026-07-02): redirected off the profile path,
      // a real login form, or the near-empty unauthenticated shell
      // (bodyLen~900, scrollHeight~966, 0 post links — vs 2400+ when logged in).
      if (posts.length === 0) {
        const state = await page.evaluate(() => ({
          url: location.href,
          hasLoginForm: !!document.querySelector('input[name="username"], input[name="password"]'),
          scrollHeight: document.body.scrollHeight,
          postLinks: document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length,
        })).catch(() => null);
        if (state && (state.hasLoginForm || /accounts\/login/.test(state.url) || (state.scrollHeight <= 1200 && state.postLinks === 0))) {
          throw new SessionExpiredError('SESSION_EXPIRED: cookies de Instagram vencidas o inválidas — renovar instagram_cookies.json');
        }
      }

    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      console.error(`[Instagram] Error scraping ${sourceName}: ${e.message}`);
    } finally {
      logBrowserLifecycle('PAGE_CLOSED', 'Instagram');
      await page.close().catch(() => {});
      logBrowserLifecycle('CONTEXT_CLOSED', 'Instagram');
      await context.close().catch(() => {});
      logBrowserLifecycle('BROWSER_CLOSED', 'Instagram');
      await browser.close().catch(() => {});
    }

    console.log(`[Instagram] Extraídos: ${posts.length} posts de ${sourceName}`);
    return posts;
  }
}

export class SocialFetcherPlaywrightFacebook extends SocialFetcherBase {
  async fetchLatest() {
    const profileUrl = this.source.profile_url;
    const sourceName = this.source.name;
    const lockRequestAt = Date.now();
    return withFacebookPersistentProfileLock(async () => {
    const lockWaitMs = Date.now() - lockRequestAt;
    const scrapeStart = Date.now();
    console.log(`[Facebook] ${sourceName}: lock_wait=${lockWaitMs}ms`);
    console.log(`[Facebook] Fetching ${sourceName} → ${profileUrl}`);

    const baseUrl = profileUrl.replace('mbasic.facebook.com', 'www.facebook.com').replace(/\/$/, '');

    const profileDir  = process.env.FB_PROFILE_DIR  || join(process.cwd(), 'facebook-profile');
    const cookiesFile = process.env.FB_COOKIES_FILE || join(process.cwd(), 'facebook_cookies.json');

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    });
    logBrowserLifecycle('BROWSER_CREATED', 'Facebook Persistent');
    // context.browser() returns null for launchPersistentContext — no browser object to watch
    logBrowserLifecycle('CONTEXT_CREATED', 'Facebook Persistent');

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // launchPersistentContext IGNORES the storageState option, so the session must
    // be established by injecting the cookies directly into the live context. Without
    // a valid session Facebook serves a login wall with only ~1 public preview post
    // (verified: logged-out scrollHeight=900 vs logged-in 4692). Cookies are refreshed
    // from facebook_cookies.json every run so a renewed `xs`/`c_user` takes effect.
    if (existsSync(cookiesFile)) {
      try {
        const raw = JSON.parse(readFileSync(cookiesFile, 'utf-8'));
        const normSS = v => ({ no_restriction: 'None', lax: 'Lax', strict: 'Strict' })[v?.toLowerCase()] || 'None';
        await context.addCookies(raw.map(c => {
          const o = {
            name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
            secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: normSS(c.sameSite),
          };
          if (c.expirationDate) o.expires = Math.floor(c.expirationDate);
          return o;
        }));
      } catch (e) {
        console.warn(`[Facebook] cookie injection warning: ${e.message}`);
      }
    }

    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'Facebook');
    const posts = [];

    // BUG-001 fix — anchor the parser on Facebook's structured GraphQL feed payload
    // instead of scraping DOM anchors. Register the response listener BEFORE goto so
    // the initial feed request is captured. storyMap dedupes by the stable post_id.
    const storyMap = new Map();          // post_id → { url, message, creation_time, thumbnail, video, likes }
    const pendingBodies = [];
    context.on('response', (response) => {
      const u = response.url();
      if (!u.includes('/api/graphql')) return;
      const p = response.text()
        .then(body => {
          for (const obj of _parseGraphQLBody(body)) {
            for (const st of _walkGraphQLStories(obj)) {
              if (st.post_id && !storyMap.has(st.post_id)) storyMap.set(st.post_id, st);
            }
          }
        })
        .catch(() => { /* body already consumed / not text — ignore */ });
      pendingBodies.push(p);
    });

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 40000 })
        .catch(e => console.warn(`[Facebook] goto warning: ${e.message}`));

      // Wait for the feed shell to render (this also triggers the first /api/graphql feed request).
      const POST_BODY_SEL = 'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl';
      await page.waitForSelector(POST_BODY_SEL, {
        state: 'attached', timeout: 20000,
      }).catch(() => console.warn('[Facebook] No post body selector in DOM after 20s'));

      const knownIds = this.source._knownIds || new Set();
      let noGrowthStreak = 0;
      let seqKnownStreak = 0;

      for (let i = 0; i < 8; i++) {
        const beforeIds = new Set(storyMap.keys());

        // scrollHeight (not a fixed pixel delta) is required to cross Facebook's
        // pagination threshold so it fires the next /api/graphql feed request.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2500));
        // Let in-flight response handlers settle so storyMap reflects this scroll.
        await Promise.allSettled(pendingBodies.splice(0));

        const newIds = [...storyMap.keys()].filter(id => !beforeIds.has(id));
        const grew = newIds.length > 0;
        console.log(`[Facebook] Scroll ${i + 1}: ${storyMap.size} posts capturados (GraphQL)${grew ? ` +${newIds.length}` : ' (sin nuevos)'}`);

        // Smart stop: if every newly captured post this round is already known, stop.
        if (knownIds.size > 0 && grew && newIds.every(id => knownIds.has(`fb${id}`))) {
          seqKnownStreak++;
          if (seqKnownStreak >= 2) {
            console.log(`[Facebook] Smart stop — solo posts conocidos (scroll ${i + 1})`);
            incrementalStats.facebookSmartStops++;
            break;
          }
        } else {
          seqKnownStreak = 0;
        }

        // Stop when no new posts have appeared for 2 consecutive scrolls.
        if (i >= 2) {
          noGrowthStreak = grew ? 0 : noGrowthStreak + 1;
          if (noGrowthStreak >= 2) {
            console.log(`[Facebook] Sin posts nuevos 2 scrolls seguidos — deteniendo`);
            break;
          }
        }
      }

      // Final settle for any last responses still parsing.
      await Promise.allSettled(pendingBodies.splice(0));

      // Second source: the initial feed is server-rendered with post data embedded
      // in <script> blobs (RelayPrefetchedStreamCache). Parse them with the same
      // walker so we still capture posts even when pagination XHR doesn't fire.
      try {
        const scriptBodies = await page.evaluate(() =>
          [...document.querySelectorAll('script')]
            .map(s => s.textContent || '')
            .filter(t => t.includes('post_id') || t.includes('permalink_url'))
        );
        for (const body of scriptBodies) {
          for (const obj of _parseGraphQLBody(body)) {
            for (const st of _walkGraphQLStories(obj)) {
              if (st.post_id && !storyMap.has(st.post_id)) storyMap.set(st.post_id, st);
            }
          }
        }
      } catch (e) {
        console.warn(`[Facebook] embedded script parse warning: ${e.message}`);
      }

      for (const st of storyMap.values()) {
        const message = (st.message || '').trim();
        // Feed posts without a text message can't be clustered downstream — skip them.
        if (!message) {
          console.log(`[Facebook] ⚠️  Sin texto (post_id=${st.post_id}) — omitido`);
          continue;
        }

        let url = st.url;
        if (url && url.startsWith('/')) url = `https://www.facebook.com${url}`;
        if (!url) url = `https://www.facebook.com/${st.post_id}`;  // stable fallback from post_id

        const contentType = st.video || /\/videos\//.test(url) ? 'video' : /\/reel\//.test(url) ? 'reel' : 'post';

        posts.push({
          platform: 'facebook',
          external_id:      `fb${st.post_id}`,   // stable numeric Facebook post id
          url,
          title:            message.substring(0, 300),
          content:          message,
          thumbnail_url:    st.thumbnail || '',
          video_url:        st.video || '',
          views: 0, likes: st.likes || 0, comments: 0, shares: 0,
          engagement_score: st.likes || 0,
          published_at:     st.creation_time ? new Date(st.creation_time * 1000).toISOString() : new Date().toISOString(),
          keywords:         [contentType],
        });
      }

      // Zero posts is anomalous for an active page — check for the login-wall
      // signature confirmed live during BUG-001 (2026-07-02): a real login form,
      // or the near-empty unauthenticated shell (scrollHeight~900 vs 4692+ logged in).
      if (posts.length === 0) {
        const state = await page.evaluate(() => ({
          hasLoginForm: !!document.querySelector('input[name="email"], input[type="password"]'),
          scrollHeight: document.body.scrollHeight,
        })).catch(() => null);
        if (state && (state.hasLoginForm || state.scrollHeight <= 1200)) {
          throw new SessionExpiredError('SESSION_EXPIRED: cookies de Facebook vencidas o inválidas — renovar facebook_cookies.json');
        }
      }

    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      console.error(`[Facebook] Error scraping ${sourceName}: ${e.message}`);
    } finally {
      logBrowserLifecycle('PAGE_CLOSED', 'Facebook');
      await page.close().catch(() => {});
      logBrowserLifecycle('CONTEXT_CLOSED', 'Facebook Persistent');
      await context.close().catch(() => {});
    }

    console.log(`[Facebook] Extraídos: ${posts.length} posts de ${sourceName}`);
    console.log(`[Facebook] ${sourceName}: scraping=${Date.now() - scrapeStart}ms`);
    return posts;
    });
  }
}

function _parseFbMetric(str = '') {
  if (!str) return 0;
  const s = str.toLowerCase().replace(/[,\.]/g, '').trim();
  const n = parseFloat(s) || 0;
  if (s.endsWith('k') || s.includes('mil')) return Math.floor(n * 1000);
  if (s.endsWith('m') || s.includes('millon')) return Math.floor(n * 1_000_000);
  return Math.floor(n);
}

// BUG-001 — Facebook exposes each feed post's permalink/post_id/message/timestamp
// only inside /api/graphql responses, NOT in the DOM (verified: DOM shows 2 carousel
// permalinks vs 39 in the GraphQL payload). These two helpers parse those responses.

// A single /api/graphql response may be one JSON object, a "for(;;);"-prefixed object,
// or several JSON objects concatenated by newlines (@defer streaming). Return all.
function _parseGraphQLBody(body) {
  const objs = [];
  let text = (body || '').replace(/^for\s*\(;;\);/, '').trim();
  if (!text) return objs;
  try { objs.push(JSON.parse(text)); return objs; } catch { /* fall through to JSONL */ }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { objs.push(JSON.parse(t)); } catch { /* skip non-JSON chunk */ }
  }
  return objs;
}

// Walk a parsed GraphQL object collecting feed stories. Anchor on any object that
// owns a numeric `post_id`; extract url/message/timestamp/image/reactions from its
// own subtree without descending into a nested story (different post_id). Field
// search is by NAME, not fixed path — resilient to Facebook layout reshuffles.
function _walkGraphQLStories(root) {
  const stories = [];
  const seen = new Set();

  const extractFields = (node, ownPostId) => {
    const acc = { url: '', message: '', creation_time: 0, thumbnail: '', video: '', likes: 0 };
    const visit = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n !== node && typeof n.post_id === 'string' && /^\d+$/.test(n.post_id) && n.post_id !== ownPostId) return;
      if (Array.isArray(n)) { for (const v of n) visit(v); return; }
      for (const [k, v] of Object.entries(n)) {
        if (!acc.url && typeof v === 'string' && v.includes('facebook.com') && /\/(posts|videos|reel)\//.test(v) && !v.includes('comment_id=')) {
          if (k === 'url' || k === 'permalink_url' || k === 'wwwURL') acc.url = v.split('?')[0];
        }
        if (k === 'message' && v && typeof v === 'object' && typeof v.text === 'string') {
          if (v.text.length > acc.message.length) acc.message = v.text;
        }
        if (k === 'creation_time' && typeof v === 'number' && !acc.creation_time) acc.creation_time = v;
        if (k === 'reaction_count' && v && typeof v === 'object' && typeof v.count === 'number') {
          if (v.count > acc.likes) acc.likes = v.count;
        }
        if (k === 'image' && v && typeof v === 'object' && typeof v.uri === 'string' && !acc.thumbnail) acc.thumbnail = v.uri;
        if (!acc.video && typeof v === 'string' && (k === 'playable_url' || k === 'browser_native_hd_url' || k === 'browser_native_sd_url')) acc.video = v;
        if (v && typeof v === 'object') visit(v);
      }
    };
    visit(node);
    return acc;
  };

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const v of n) walk(v); return; }
    if (typeof n.post_id === 'string' && /^\d+$/.test(n.post_id) && !seen.has(n.post_id)) {
      seen.add(n.post_id);
      const f = extractFields(n, n.post_id);
      if (f.url || f.message) stories.push({ post_id: n.post_id, ...f });
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };

  walk(root);
  return stories;
}

// Facebook Graph API fetcher — uses FB_PAGE_ACCESS_TOKEN when available.
// Falls back to SocialFetcherPlaywrightFacebook if no token is set.
// Fetches posts from the last 24 hours natively via the `since` param.
export class SocialFetcherGraphApiFacebook extends SocialFetcherBase {
  async fetchLatest() {
    // Skip API entirely if previously confirmed inaccessible for this page
    if (this.source.graph_api_supported === false) {
      return new SocialFetcherPlaywrightFacebook(this.source).fetchLatest();
    }

    const token      = process.env.FB_PAGE_ACCESS_TOKEN;
    const apiVersion = process.env.FB_API_VERSION || 'v21.0';
    const pageSlug   = this._extractPageSlug(this.source.profile_url);

    if (!token || !pageSlug) {
      console.warn('[Facebook/GraphAPI] No token or page slug — falling back to Playwright');
      return new SocialFetcherPlaywrightFacebook(this.source).fetchLatest();
    }

    const since  = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const fields = 'id,message,story,created_time,permalink_url,full_picture,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares';
    const url    = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pageSlug)}/posts`
      + `?access_token=${token}&fields=${fields}&since=${since}&limit=100`;

    console.log(`[Facebook/GraphAPI] ${pageSlug} — fetching posts desde hace 24h`);

    const res  = await fetch(url);
    const data = await res.json();

    if (data.error) {
      // Code 10 = permissions error — this page is not managed by the token owner
      if (data.error.code === 10 || data.error.type === 'OAuthException') {
        console.warn(`[Facebook/GraphAPI] Sin acceso a '${pageSlug}' — marcando Playwright-only`);
        await query(`UPDATE social_sources SET graph_api_supported = false WHERE id = $1`, [this.source.id]).catch(() => {});
        this.source.graph_api_supported = false;
        return new SocialFetcherPlaywrightFacebook(this.source).fetchLatest();
      }
      console.error(`[Facebook/GraphAPI] API error: ${data.error.message}`);
      return [];
    }

    const items = data.data || [];
    console.log(`[Facebook/GraphAPI] ${pageSlug}: ${items.length} posts de las últimas 24h`);

    // Cache successful API access so future cycles skip the API check
    if (this.source.graph_api_supported !== true) {
      await query(`UPDATE social_sources SET graph_api_supported = true WHERE id = $1`, [this.source.id]).catch(() => {});
    }

    return items
      .filter(p => (p.message || p.story || '').trim().length > 5)
      .map(p => {
        const text = (p.message || p.story || '').trim();
        const likes    = p.reactions?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count  || 0;
        const shares   = p.shares?.count || 0;
        const contentType = (p.permalink_url || '').includes('/reel/') ? 'reel'
          : (p.permalink_url || '').includes('/videos/') ? 'video'
          : 'post';
        return {
          platform:         'facebook',
          external_id:      p.id,
          url:              p.permalink_url || `https://www.facebook.com/${p.id}`,
          title:            text.substring(0, 300),
          content:          text,
          thumbnail_url:    p.full_picture || '',
          video_url:        '',
          views:            0,
          likes,
          comments,
          shares,
          engagement_score: likes + comments,
          published_at:     p.created_time,
          keywords:         [contentType],
        };
      });
  }

  _extractPageSlug(profileUrl) {
    if (!profileUrl) return null;
    const m = profileUrl.replace('mbasic.facebook.com', 'www.facebook.com')
      .match(/facebook\.com\/([^/?#]+)/);
    return m?.[1] || null;
  }
}

export class SocialFetcherPlaywrightTikTok extends SocialFetcherBase {
  async fetchLatest() {
    console.log(`[TikTok] Fetching via Playwright for ${this.source.handle}...`);
    return [];
  }
}

export class SocialFetcherPlaywrightYouTube extends SocialFetcherBase {
  async fetchLatest() {
    const targetUrl = this.source.profile_url;
    const contentType = this.source.content_type || 'videos';

    console.log(`[YouTube/${contentType.toUpperCase()}] → ${targetUrl}`);

    const browser = await this._launchBrowser(`YouTube/${contentType}`);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    logBrowserLifecycle('CONTEXT_CREATED', `YouTube/${contentType}`);
    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', `YouTube/${contentType}`);
    const posts = [];

    try {
      // 'load' fires after JS runs and YouTube hydrates items; 'networkidle' never settles on YouTube
      const waitStrategy = contentType === 'videos' ? 'load' : 'domcontentloaded';
      await page.goto(targetUrl, { waitUntil: waitStrategy, timeout: 40000 })
        .catch(e => console.warn(`[YouTube/${contentType.toUpperCase()}] goto warning: ${e.message}`));

      const lastExternalId = this.source.last_external_id || null;
      if (contentType === 'videos') {
        await _fetchVideos(page, targetUrl, posts, lastExternalId);
      } else if (contentType === 'shorts') {
        await _fetchShorts(page, targetUrl, posts, lastExternalId);
      } else if (contentType === 'posts') {
        await _fetchPosts(page, targetUrl, posts, lastExternalId);
      }

    } finally {
      logBrowserLifecycle('PAGE_CLOSED', `YouTube/${contentType}`);
      await page.close().catch(() => {});
      logBrowserLifecycle('CONTEXT_CLOSED', `YouTube/${contentType}`);
      await context.close().catch(() => {});
      logBrowserLifecycle('BROWSER_CLOSED', `YouTube/${contentType}`);
      await browser.close().catch(() => {});
    }

    console.log(`[YouTube/${contentType.toUpperCase()}] Extraídos: ${posts.length} items`);
    return posts;
  }
}

// ── VIDEOS ────────────────────────────────────────────────────────────────────

async function _fetchVideos(page, targetUrl, posts, lastExternalId = null) {
  // YouTube new layout: ytd-rich-item-renderer > yt-lockup-view-model, no more a#video-title-link
  await page.waitForSelector('ytd-rich-item-renderer a[href*="/watch?v="]', { state: 'attached', timeout: 20000 })
    .catch(() => console.warn('[YouTube/VIDEOS] No video links in DOM after 20s'));

  const items = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('ytd-rich-item-renderer').forEach((el, i) => {
      if (i >= 12) return;

      // Find all watch links; pick the one with the longest text (= title link, not duration link)
      const watchLinks = [...el.querySelectorAll('a[href*="/watch?v="]')];
      if (!watchLinks.length) return;
      const titleLink = watchLinks.reduce((best, a) =>
        (a.textContent?.trim()?.length || 0) > (best.textContent?.trim()?.length || 0) ? a : best,
        watchLinks[0]
      );

      // h3 is the most reliable title element in the new layout
      const title = (el.querySelector('h3')?.textContent?.trim() ||
                     titleLink.textContent?.trim() || '').replace(/\s+/g, ' ');
      if (!title || title.length < 3) return;

      const href = titleLink.getAttribute('href') || '';
      const spans = [...el.querySelectorAll('span')].map(s => s.textContent?.trim()).filter(Boolean);
      const viewsStr = spans.find(s => s.match(/(vistas?|views?|\d+\s*[kKmM]?\s*(de\s*)?vistas?)/i)) || '0';
      const thumbEl = el.querySelector('img');
      const thumbnail_url = thumbEl?.src?.startsWith('http') ? thumbEl.src : '';

      results.push({ title, href, viewsStr, thumbnail_url });
    });
    return results;
  });

  for (const item of items) {
    const url = item.href ? `https://www.youtube.com${item.href}` : targetUrl;
    const views = parseYTViews(item.viewsStr);
    let external_id;
    try { external_id = new URL(url).searchParams.get('v') || ''; } catch { external_id = ''; }
    if (!external_id) external_id = `yt-vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Thumbnail via predictable YouTube CDN pattern — reliable regardless of DOM lazy-loading
    const thumbnail_url = external_id
      ? `https://i.ytimg.com/vi/${external_id}/hqdefault.jpg`
      : (item.thumbnail_url || '');
    posts.push({
      platform: 'youtube', external_id, url,
      title: item.title.substring(0, 500), content: '',
      thumbnail_url, views, likes: 0, comments: 0, shares: 0,
      engagement_score: views, published_at: new Date().toISOString(), keywords: ['videos']
    });
  }
  if (lastExternalId) {
    const cutIdx = posts.findIndex(p => p.external_id === lastExternalId);
    if (cutIdx !== -1) {
      console.log(`[YouTube/VIDEOS] Smart stop — ${cutIdx} new items (known: ${lastExternalId})`);
      incrementalStats.youtubeSmartStops++;
      posts.splice(cutIdx);
    }
  }
}

// ── SHORTS ────────────────────────────────────────────────────────────────────

async function _fetchShorts(page, targetUrl, posts, lastExternalId = null) {
  await page.waitForSelector('a[href*="/shorts/"]', { state: 'attached', timeout: 20000 })
    .catch(() => console.warn('[YouTube/SHORTS] No shorts links in DOM'));

  await page.evaluate(() => window.scrollBy(0, 400));
  await new Promise(r => setTimeout(r, 1000));

  const rawItems = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('ytd-rich-item-renderer, ytd-reel-item-renderer').forEach((el, i) => {
      if (i >= 20) return; // oversample; invalid titles will be discarded

      const linkEl = el.querySelector('a[href*="/shorts/"]');
      if (!linkEl) return;
      const href = linkEl.getAttribute('href');
      if (!href) return;

      // textContent reads from DOM regardless of CSS visibility:hidden
      const titleAttr = (linkEl.getAttribute('title') || '').trim();
      const titleSpan = el.querySelector('span#video-title, yt-formatted-string#video-title');
      const titleText = (titleSpan?.textContent || '').trim();
      // Intentionally NOT using el.querySelector('[aria-label]') — it captures UI buttons like "Más acciones"
      const titleAriaLink = (linkEl.getAttribute('aria-label') || '').trim();

      const title = titleAttr || titleText || titleAriaLink || '';

      const thumbEl = el.querySelector('img');
      const thumbnail_url = thumbEl?.src?.startsWith('http') ? thumbEl.src : '';
      // Shorts don't expose view counts in the shelf DOM; left as 0 (known limitation)
      const viewSpan = el.querySelector('yt-view-count-renderer, #metadata-line span');
      const viewsStr = viewSpan?.textContent?.trim() || '0';

      results.push({ title, href, viewsStr, thumbnail_url });
    });
    return results;
  });

  // Enrich items that lack a real title via YouTube oEmbed (no API key needed)
  const enriched = await _enrichShortsOembed(rawItems);

  // Filter: discard any item that still has no usable title
  const BANNED_TITLES = new Set(['', 'short', 'sin título', 'sin titulo', 'untitled', 'más acciones', 'mas acciones']);
  const validItems = enriched.filter(item => {
    const t = (item.title || '').trim().toLowerCase();
    return t.length > 0 && !BANNED_TITLES.has(t);
  });

  for (const item of validItems.slice(0, 15)) {
    const url = `https://www.youtube.com${item.href}`;
    const views = parseYTViews(item.viewsStr);
    const external_id = item.href.split('/shorts/')[1]?.split('?')[0] ||
                        `yt-short-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Thumbnail via predictable YouTube CDN pattern
    const thumbnail_url = external_id && !external_id.startsWith('yt-short-')
      ? `https://i.ytimg.com/vi/${external_id}/hqdefault.jpg`
      : (item.thumbnail_url || '');
    posts.push({
      platform: 'youtube', external_id, url,
      title: item.title.substring(0, 500), content: '',
      thumbnail_url, views, likes: 0, comments: 0, shares: 0,
      engagement_score: views, published_at: new Date().toISOString(), keywords: ['shorts']
    });
  }
  if (lastExternalId) {
    const cutIdx = posts.findIndex(p => p.external_id === lastExternalId);
    if (cutIdx !== -1) {
      console.log(`[YouTube/SHORTS] Smart stop — ${cutIdx} new items (known: ${lastExternalId})`);
      incrementalStats.youtubeSmartStops++;
      posts.splice(cutIdx);
    }
  }
}

const OEMBED_TRIGGER = new Set(['', 'short', 'sin título', 'sin titulo', 'más acciones', 'mas acciones', 'untitled']);

async function _enrichShortsOembed(items) {
  const needEnrichment = items.filter(item => {
    const t = (item.title || '').trim().toLowerCase();
    return OEMBED_TRIGGER.has(t);
  });

  if (!needEnrichment.length) return items;

  await Promise.all(needEnrichment.map(async item => {
    const shortId = item.href.split('/shorts/')[1]?.split('?')[0];
    if (!shortId) return;
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${shortId}&format=json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const data = await r.json();
        if (data.title && data.title.toLowerCase() !== 'short') {
          item.title = data.title;
          if (data.thumbnail_url && !item.thumbnail_url) item.thumbnail_url = data.thumbnail_url;
        }
      }
    } catch { /* oEmbed failed — item will be filtered out if title still generic */ }
  }));

  return items;
}

// ── COMMUNITY POSTS ───────────────────────────────────────────────────────────

async function _fetchPosts(page, targetUrl, posts, lastExternalId = null) {
  await page.waitForSelector('ytd-backstage-post-thread-renderer', { state: 'attached', timeout: 15000 })
    .catch(() => console.warn('[YouTube/POSTS] No community posts in DOM'));

  const items = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('ytd-backstage-post-thread-renderer').forEach((el, i) => {
      if (i >= 10) return;
      const textEl = el.querySelector('#content-text yt-formatted-string, #content-text');
      const text = textEl?.innerText?.trim() || textEl?.textContent?.trim() || '';
      if (!text) return;

      const dateEl = el.querySelector('#published-time-text a');
      const href = dateEl?.getAttribute('href') || '';
      const imgEl = el.querySelector('img.backstage-image, ytd-backstage-image-renderer img');
      const thumbnail_url = imgEl?.src?.startsWith('http') ? imgEl.src : '';
      const likeBtn = el.querySelector('ytd-toggle-button-renderer #text');
      const likesStr = likeBtn?.innerText?.trim() || '0';

      results.push({ text, href, thumbnail_url, likesStr });
    });
    return results;
  });

  for (const item of items) {
    const url = item.href ? `https://www.youtube.com${item.href}` : targetUrl;
    const external_id = url.split('/post/')[1]?.split('?')[0] ||
                        `yt-post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const likes = parseYTViews(item.likesStr);
    posts.push({
      platform: 'youtube', external_id, url,
      title: item.text.substring(0, 300), content: item.text,
      thumbnail_url: item.thumbnail_url, views: 0, likes, comments: 0, shares: 0,
      engagement_score: likes, published_at: new Date().toISOString(), keywords: ['posts']
    });
  }
  if (lastExternalId) {
    const cutIdx = posts.findIndex(p => p.external_id === lastExternalId);
    if (cutIdx !== -1) {
      console.log(`[YouTube/POSTS] Smart stop — ${cutIdx} new items (known: ${lastExternalId})`);
      incrementalStats.youtubeSmartStops++;
      posts.splice(cutIdx);
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseYTViews(str = '') {
  if (!str) return 0;
  const s = str.toLowerCase().replace(/\s+/g, '');
  let num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  if (s.includes('mil') || s.includes('k')) num *= 1_000;
  if (s.includes('m') || (s.includes('millon'))) num *= 1_000_000;
  return Math.floor(num);
}

export class SocialFetcherWhatsAppChannels extends SocialFetcherBase {
  async fetchLatest() {
    console.log(`[WhatsApp] Fetching channel: ${this.source.name}...`);
    return [];
  }
}
