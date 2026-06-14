import fetch from 'node-fetch';
import { chromium } from 'playwright';

const LANG_PRIORITY = ['es', 'es-419', 'es-US', 'en', 'pt'];
const FETCH_TIMEOUT = 20_000;

// ── Video ID extraction ───────────────────────────────────────────────────────

export function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

// ── Transcript text from timed events (JSON3 format) ─────────────────────────

function eventsToText(events) {
  if (!Array.isArray(events)) return '';
  return events
    .filter(e => e.segs)
    .map(e => e.segs.map(s => s.utf8 ?? '').join(''))
    .join(' ')
    .replace(/\[.*?\]/g, '')   // strip [Music] [Applause] etc.
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extract ytInitialPlayerResponse from page HTML ───────────────────────────

function extractPlayerResponse(html) {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const jsonStart = html.indexOf('{', idx);
  if (jsonStart === -1) return null;

  // Walk matching braces
  let depth = 0;
  let jsonEnd = jsonStart;
  for (let i = jsonStart; i < Math.min(html.length, jsonStart + 3_000_000); i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
  }

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

// ── Pick the best caption track ───────────────────────────────────────────────

function pickTrack(tracks) {
  // 1. Official captions in priority languages
  for (const lang of LANG_PRIORITY) {
    const t = tracks.find(t => t.languageCode?.startsWith(lang) && !t.kind);
    if (t) return { track: t, source: 'official' };
  }
  // 2. Auto-generated (ASR) in priority languages
  for (const lang of LANG_PRIORITY) {
    const t = tracks.find(t => t.languageCode?.startsWith(lang) && t.kind === 'asr');
    if (t) return { track: t, source: 'auto' };
  }
  // 3. Any official
  const official = tracks.find(t => !t.kind);
  if (official) return { track: official, source: 'official' };
  // 4. Any track
  if (tracks[0]) return { track: tracks[0], source: tracks[0].kind === 'asr' ? 'auto' : 'official' };
  return null;
}

// ── Extract cookies from a page response ─────────────────────────────────────

function extractCookies(response) {
  const raw = response.headers.raw()['set-cookie'] ?? [];
  return raw.map(c => c.split(';')[0]).join('; ');
}

// ── Quality score (FASE 3) ────────────────────────────────────────────────────

/**
 * 100  = official transcript, long
 * 70-99 = auto-generated, useful
 * 30-69 = incomplete
 * 0-29  = garbage / too short
 */
export function calculateQualityScore(text, source) {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount < 10) return 5;
  if (wordCount < 30) return 15;
  if (wordCount < 80) return 25;

  if (source === 'official') {
    if (wordCount >= 800) return 100;
    if (wordCount >= 400) return 92;
    if (wordCount >= 150) return 82;
    return 70;
  }
  // ASR auto-generated
  if (wordCount >= 800) return 90;
  if (wordCount >= 400) return 82;
  if (wordCount >= 150) return 72;
  if (wordCount >= 80)  return 55;
  return 35;
}

// ── Editorial type detection (FASE 4) ────────────────────────────────────────

const TYPE_PATTERNS = [
  ['INTERVIEW', /\bentrevist[ao]\b|declaracion|habla con|dijo que|afirmó|aseguró|conferencia de prensa/i],
  ['SPORTS',    /\bgol\b|partido\b|copa\b|torneo\b|fútbol|tenis|basquet|rugby|formula 1|moto ?gp|clásico\b/i],
  ['LIVE',      /\ben vivo\b|en directo\b|ahora mismo|transmisión en|streaming\b/i],
  ['PODCAST',   /\bpodcast\b|episodio\b|\bep\.\s*\d|temporada\s*\d/i],
  ['OPINION',   /\bopinión\b|análisis\b|perspectiva\b|punto de vista|columna\b|editorial\b/i],
  ['NEWS',      /\búltimas noticias|breaking\b|urgente\b|alerta\b|se confirmó|se informó|informamos/i],
];

export function detectEditorialType(title = '', text = '') {
  const sample = (title + ' ' + text.slice(0, 1000)).toLowerCase();
  for (const [type, re] of TYPE_PATTERNS) {
    if (re.test(sample)) return type;
  }
  return 'OTHER';
}

// ── Playwright UI transcript fetcher ─────────────────────────────────────────
//
// Uses the YouTube "Mostrar transcripción" button instead of the timedtext
// endpoint, which is IP-rate-limited (429) regardless of cookies or client.
// Proven to work: 233–9765 words extracted in ~12s across 3 tested videos.
//
// Returns same shape as fetchYouTubeTranscript:
//   { available: true,  text, language, source: 'ui' }
//   { available: false, source: 'none', reason }
//   null  — transient error, retry
//
export async function fetchYouTubeTranscriptViaPlaywright(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return { available: false, source: 'none', reason: 'no_video_id' };

  let browser;
  const t0 = Date.now();
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 40_000,
    });
    await new Promise(r => setTimeout(r, 2500));

    // Scroll down to trigger lazy-load of description + transcript button
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await new Promise(r => setTimeout(r, 400));
    }

    // Expand description if collapsed
    await page.locator('tp-yt-paper-button#expand, #expand').first()
      .click({ force: true }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));

    // Find "Mostrar transcripción" / "Show transcript" button
    const btn = page.locator('button[aria-label*="ranscripci"], button[aria-label*="ranscript"]').first();
    const btnCount = await btn.count();

    if (!btnCount) {
      return { available: false, source: 'none', reason: 'no_transcript_button' };
    }

    await btn.click({ force: true });
    await new Promise(r => setTimeout(r, 3500));

    // Extract text from transcript segment DOM elements
    const raw = await page.evaluate(() => {
      // New YouTube UI (2024+): transcript-segment-view-model
      const segs = Array.from(document.querySelectorAll('transcript-segment-view-model'));
      if (segs.length > 0) {
        return segs
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 2)
          .join(' ');
      }
      // Legacy UI
      const legacy = Array.from(document.querySelectorAll('.segment-text'));
      if (legacy.length > 0) {
        return legacy.map(el => (el.textContent || '').trim()).join(' ');
      }
      return '';
    });

    if (!raw || raw.length < 30) {
      return { available: false, source: 'none', reason: 'empty_transcript_panel' };
    }

    // Clean: strip timestamps and duration chips injected by YouTube's transcript DOM.
    // YouTube concatenates timestamp + text without a space inside each segment element,
    // so word-boundary anchors (\b) fail. Replace with a space to avoid merging words.
    const text = raw
      .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')   // "0:00", "1:23:45"
      .replace(/\d+\s*segundo[s]?/gi, ' ')          // "1 segundo", "3 segundos"
      .replace(/\[.*?\]/g, ' ')                      // [Music] etc.
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 30) {
      return { available: false, source: 'none', reason: 'empty_after_cleaning' };
    }

    const elapsed = Date.now() - t0;
    console.log(`[Transcript/UI] ${videoId}: ${text.split(/\s+/).length} palabras en ${elapsed}ms`);

    return { available: true, text, language: 'es', source: 'ui', elapsed };

  } catch (e) {
    console.error(`[Transcript/UI] Error for ${videoId}: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Legacy: fetch via HTTP (timedtext endpoint) ───────────────────────────────
//
// Left intact as fallback. Subject to IP-level 429 from YouTube under load.
//
// Returns:
//   { available: true,  text, language, source }
//   { available: false, source: 'none', reason }
//   null  — transient error, retry
//
export async function fetchYouTubeTranscript(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return { available: false, source: 'none', reason: 'no_video_id' };

  try {
    const browserHeaders = {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // Step 1: fetch watch page + collect session cookies
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: browserHeaders,
      timeout: FETCH_TIMEOUT,
    });

    if (!pageRes.ok) return { available: false, source: 'none', reason: `http_${pageRes.status}` };

    const cookies = extractCookies(pageRes);
    const html = await pageRes.text();
    const playerResponse = extractPlayerResponse(html);

    if (!playerResponse) return { available: false, source: 'none', reason: 'no_player_response' };

    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) return { available: false, source: 'none', reason: 'no_captions' };

    // Step 2: pick best track
    const picked = pickTrack(tracks);
    if (!picked) return { available: false, source: 'none', reason: 'no_usable_track' };

    const { track, source } = picked;

    // Step 3: fetch transcript JSON — include cookies + referer so YouTube doesn't 429
    const transcriptRes = await fetch(`${track.baseUrl}&fmt=json3`, {
      headers: {
        ...browserHeaders,
        'Accept':   'application/json, */*',
        'Referer':  `https://www.youtube.com/watch?v=${videoId}`,
        'Origin':   'https://www.youtube.com',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      timeout: FETCH_TIMEOUT,
    });

    if (!transcriptRes.ok) {
      // 429 = rate-limited → transient, retry later
      if (transcriptRes.status === 429) {
        console.error(`[Transcript] 429 on timedtext for ${videoId} (IP-level block)`);
        return null;
      }
      return { available: false, source: 'none', reason: `transcript_${transcriptRes.status}` };
    }

    // YouTube sometimes returns 200 with empty/truncated body under rate pressure
    let data;
    try {
      data = await transcriptRes.json();
    } catch (parseErr) {
      console.error(`[Transcript] JSON parse failed for ${videoId}: ${parseErr.message}`);
      return null; // transient, retry next cycle
    }
    const text = eventsToText(data.events);

    if (!text || text.length < 30) return { available: false, source: 'none', reason: 'empty_transcript' };

    return {
      available: true,
      text,
      language: track.languageCode,
      source,
    };

  } catch (e) {
    // Transient error: network, timeout, etc. Return null to retry next cycle.
    console.error(`[Transcript] Error for ${videoId}: ${e.message}`);
    return null;
  }
}
