/**
 * SPRINT 7.2B — Playwright-based social fetchers.
 * YouTube: videos (fixed networkidle→domcontentloaded), shorts (oEmbed enrichment), community posts.
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { logBrowserLifecycle } from '../../services/browserLifecycleLogger.js';
import { query } from '../../routes/db.js';

// Sprint Performance 10.0 — incremental fetching metrics
export const incrementalStats = {
  facebookSmartStops: 0,
  youtubeSmartStops: 0,
  reset() { this.facebookSmartStops = 0; this.youtubeSmartStops = 0; }
};

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

export class SocialFetcherPlaywrightInstagram extends SocialFetcherBase {
  async fetchLatest() {
    console.log(`[Instagram] Fetching via Playwright for ${this.source.handle}...`);
    return [];
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
    const stateFile   = join(profileDir, 'state.json');

    // First-run bootstrap: inject cookies once so they persist to disk via storageState.
    if (!existsSync(stateFile)) {
      const browser = await chromium.launch({ headless: true });
      logBrowserLifecycle('BROWSER_CREATED', 'Facebook Bootstrap');
      const context = await browser.newContext();
      logBrowserLifecycle('CONTEXT_CREATED', 'Facebook Bootstrap');
      const page = await context.newPage();
      logBrowserLifecycle('PAGE_CREATED', 'Facebook Bootstrap');
      try {
        if (existsSync(cookiesFile)) {
          const raw = JSON.parse(readFileSync(cookiesFile, 'utf-8'));
          const normSS = v => ({ no_restriction: 'None', lax: 'Lax', strict: 'Strict' })[v?.toLowerCase()] || 'None';
          await context.addCookies(raw.map(c => ({ ...c, sameSite: normSS(c.sameSite) })));
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
          await new Promise(r => setTimeout(r, 3000));
          await context.storageState({ path: stateFile });
          console.log('[Facebook] Perfil persistente (state.json) inicializado');
        }
      } finally {
        logBrowserLifecycle('BROWSER_CLOSED', 'Facebook Bootstrap');
        await browser.close();
      }
    }

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
      storageState: existsSync(stateFile) ? stateFile : undefined,
    });
    logBrowserLifecycle('BROWSER_CREATED', 'Facebook Persistent');
    // context.browser() returns null for launchPersistentContext — no browser object to watch
    logBrowserLifecycle('CONTEXT_CREATED', 'Facebook Persistent');

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'Facebook');
    const posts = [];

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 40000 })
        .catch(e => console.warn(`[Facebook] goto warning: ${e.message}`));

      // Full Stylex class list confirmed via browser inspector on diarioole and NoticiasFormosa
      // (two separate pages, 2026-06-13). These 8 classes together uniquely identify post body
      // containers — sidebar, timestamps, and comment elements use different class combinations.
      const POST_BODY_SEL = 'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl';
      await page.waitForSelector(POST_BODY_SEL, {
        state: 'attached', timeout: 20000,
      }).catch(() => console.warn('[Facebook] No post body selector in DOM after 20s'));

      // Extraction logic reused each scroll step to capture posts before DOM recycling removes them.
      // Facebook's virtual list removes top elements as you scroll down, so a single querySelectorAll
      // at the end only sees what's visible at that moment — earlier posts are lost.
      const EXTRACT_FN = (sel) => {
        const CHROME = '[role="navigation"],[role="banner"],[role="dialog"],[role="complementary"],[aria-modal="true"],[role="article"]';
        const VALID_POST = /\/(posts\/\w|reel\/\d|videos\/\d)/;

        const isNoise = (text) => {
          const lines = text.split('\n');
          if (lines.filter(l => l.trim().length <= 1).length > lines.length * 0.3) return true;
          if (/^(Detalles|Siempre abierto|Ver todas las|Fotos\b|Publicaciones\b|Reels\b|Recomendado por)/.test(text)) return true;
          if (text.includes('\nCentro de suscriptores') || text.includes('\nSiempre abierto')) return true;
          if (/^\d{3,4}[\s-]\d{3}[\s-]\d{3,4}/.test(text)) return true;
          if (/^Facebook\nFacebook/.test(text)) return true;
          if (/^Ver más comentarios/.test(text)) return true;
          if (/\n\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(text)) return true;
          if (/\n(Me gusta|Responder)\n/.test(text) && text.length < 400) return true;
          if (/^m\.me/.test(text)) return true;
          if (/^[a-zA-Z0-9+/]{2,25}\.(com|me|net|ar|org)/.test(text)) return true;
          if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Za-z\s]+\.COM\n/.test(text)) return true;
          if (/\n(Canal|Página|Grupo)\s*·\s*[\d]/.test(text)) return true;
          return false;
        };

        const snapshot = [];
        const candidates = [...document.querySelectorAll(sel)]
          .filter(el => !el.closest(CHROME))
          .map(el => ({ text: (el.innerText || '').trim(), el }))
          .filter(({ text }) => text.length >= 30 && !isNoise(text));

        candidates.sort((a, b) => a.text.length - b.text.length);

        for (const { text, el } of candidates) {
          const key = text.split('\n')[0].trim().slice(0, 70);
          if (!key) continue;

          let thumbnail_url = '';
          let video_url = '';
          let href = '';
          let likesStr = '0';
          let cur = el.parentElement;
          for (let depth = 0; depth < 25 && cur; depth++) {
            if (!thumbnail_url) {
              const img = [...cur.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]')]
                .find(i => !i.src.includes('emoji.php') && !i.src.includes('rsrc.php'));
              if (img) thumbnail_url = img.src;
            }
            if (!video_url) {
              const vid = cur.querySelector('video');
              if (vid) video_url = vid.src;
            }
            if (!href) {
              const postLink = [...cur.querySelectorAll('a[href]')].find(a => {
                const h = a.href || '';
                return VALID_POST.test(h) && !h.includes('comment_id=');
              });
              if (postLink) href = postLink.href.split('?')[0];
            }
            if (likesStr === '0') {
              const spans = [...cur.querySelectorAll('span')].map(s => s.innerText?.trim()).filter(Boolean);
              const found = spans.find(t => /^\d+[kKmM.,]?$/.test(t.replace(/[,\.]/g, '')) && t !== '0');
              if (found) likesStr = found;
            }
            if (thumbnail_url && href) break;
            cur = cur.parentElement;
          }

          const contentType = video_url ? 'video' : href.includes('/reel/') ? 'reel' : 'post';
          snapshot.push({ key, text, href, thumbnail_url, video_url, likesStr, contentType });
        }
        return snapshot;
      };

      // accumulated across all scroll steps — keyed by first-line dedup key
      const knownIds = this.source._knownIds || new Set();
      const accumulated = new Map();
      let noGrowthStreak = 0;

      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 900));
        await new Promise(r => setTimeout(r, 2200));

        const sizeBefore = accumulated.size;
        const snapshot = await page.evaluate(EXTRACT_FN, POST_BODY_SEL);

        // Phase 2 — smart stop: count consecutive known posts in this scroll step
        let seqKnown = 0;
        let triggerSmartStop = false;
        for (const item of snapshot) {
          if (!accumulated.has(item.key)) accumulated.set(item.key, item);
          if (knownIds.size > 0) {
            const eid = `fb${createHash('md5').update(`${this.source.id}:${item.text.slice(0, 200)}`).digest('hex').slice(0, 14)}`;
            if (knownIds.has(eid)) {
              seqKnown++;
              if (seqKnown >= 3) { triggerSmartStop = true; break; }
            } else {
              seqKnown = 0;
            }
          }
        }

        const grew = accumulated.size > sizeBefore;
        console.log(`[Facebook] Scroll ${i + 1}: ${snapshot.length} en DOM, ${accumulated.size} acumulados${grew ? '' : ' (sin nuevos)'}`);

        if (triggerSmartStop) {
          console.log(`[Facebook] Smart stop — 3 posts conocidos consecutivos (scroll ${i + 1})`);
          incrementalStats.facebookSmartStops++;
          break;
        }

        // Stop when no new unique posts have appeared for 2 consecutive scrolls
        if (i >= 2) {
          noGrowthStreak = grew ? 0 : noGrowthStreak + 1;
          if (noGrowthStreak >= 2) {
            console.log(`[Facebook] Sin posts nuevos 2 scrolls seguidos — deteniendo`);
            break;
          }
        }
      }

      const items = [...accumulated.values()];

      for (const item of items) {
        let url = item.href;
        if (url && url.startsWith('/')) url = `https://www.facebook.com${url}`;
        if (!url) url = baseUrl;

        // Always use content hash: the DOM walk-up (depth ≤ 25) becomes a common
        // ancestor across multiple post bodies, returning the same sibling post URL
        // for every post — making URL-derived IDs unreliable.
        const external_id = `fb${createHash('md5').update(`${this.source.id}:${item.text.slice(0, 200)}`).digest('hex').slice(0, 14)}`;
        const likes = _parseFbMetric(item.likesStr);

        posts.push({
          platform: 'facebook', external_id, url,
          title:            item.text.substring(0, 300),
          content:          item.text,
          thumbnail_url:    item.thumbnail_url || '',
          video_url:        item.video_url || '',
          views: 0, likes, comments: 0, shares: 0,
          engagement_score: likes,
          published_at:     new Date().toISOString(),
          keywords:         [item.contentType],
        });
      }

    } catch (e) {
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
