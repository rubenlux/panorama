/**
 * Tests alternative YouTube timedtext URL formats
 * to find one that bypasses the rate-limit.
 */
import fetch from 'node-fetch';

const videoId = process.argv[2] || 'oM0QvQG4MeI'; // TN video

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function tryUrl(label, url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9', 'Referer': `https://www.youtube.com/watch?v=${videoId}` },
      timeout: 10000,
    });
    const body = await r.text();
    console.log(`${label}: status=${r.status} bodyLen=${body.length} preview="${body.slice(0,100)}"`);
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

// Try different URL patterns
await tryUrl('json3_simple',  `https://www.youtube.com/api/timedtext?lang=es-419&v=${videoId}&fmt=json3`);
await new Promise(r => setTimeout(r, 1000));
await tryUrl('json3_name',    `https://www.youtube.com/api/timedtext?lang=es&v=${videoId}&fmt=json3&name=`);
await new Promise(r => setTimeout(r, 1000));
await tryUrl('vtt_simple',    `https://www.youtube.com/api/timedtext?lang=es-419&v=${videoId}&fmt=vtt`);
await new Promise(r => setTimeout(r, 1000));
await tryUrl('srv3_simple',   `https://www.youtube.com/api/timedtext?lang=es-419&v=${videoId}&fmt=srv3`);
await new Promise(r => setTimeout(r, 1000));
await tryUrl('no_fmt',        `https://www.youtube.com/api/timedtext?lang=es-419&v=${videoId}`);
