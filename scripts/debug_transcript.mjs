import fetch from 'node-fetch';

const videoId = process.argv[2] || 'dQw4w9WgXcQ';

// Step 1: fetch watch page
const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml',
  },
  timeout: 15000,
});
console.log('Page status:', pageRes.status);
const html = await pageRes.text();
console.log('HTML length:', html.length);

// Step 2: find ytInitialPlayerResponse
const marker = 'ytInitialPlayerResponse';
const idx = html.indexOf(marker);
console.log('marker found at:', idx);
if (idx === -1) { console.log('NO PLAYER RESPONSE'); process.exit(1); }

const jsonStart = html.indexOf('{', idx);
let depth = 0, jsonEnd = jsonStart;
for (let i = jsonStart; i < Math.min(html.length, jsonStart + 3_000_000); i++) {
  const c = html[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
}

let playerResponse;
try {
  playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd));
} catch (e) {
  console.log('JSON parse error:', e.message);
  process.exit(1);
}

const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
console.log('tracks count:', tracks?.length ?? 0);

if (!tracks?.length) {
  // Show what captions key exists
  console.log('captions key:', JSON.stringify(Object.keys(playerResponse?.captions ?? {})));
  console.log('NO CAPTIONS');
  process.exit(1);
}

for (const t of tracks) {
  console.log(`track: lang=${t.languageCode} kind=${t.kind||'official'} name=${t.name?.simpleText}`);
}

const track = tracks[0];
const baseUrl = track.baseUrl;
console.log('baseUrl (first 150):', baseUrl?.slice(0, 150));

// Step 3: fetch transcript JSON3
const transcriptUrl = `${baseUrl}&fmt=json3`;
console.log('\nFetching transcript...');
const transcriptRes = await fetch(transcriptUrl, { timeout: 15000 });
console.log('Transcript status:', transcriptRes.status);
console.log('Transcript ok:', transcriptRes.ok);

if (!transcriptRes.ok) {
  const body = await transcriptRes.text();
  console.log('Error body (first 500):', body.slice(0, 500));
} else {
  const rawBody = await transcriptRes.text();
  console.log('Raw body length:', rawBody.length);
  console.log('Raw body (first 300):', rawBody.slice(0, 300));
  let data;
  try { data = JSON.parse(rawBody); } catch(e) { console.log('JSON parse error:', e.message); process.exit(1); }
  const events = data.events || [];
  const text = events
    .filter(e => e.segs)
    .map(e => e.segs.map(s => s.utf8 ?? '').join(''))
    .join(' ')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('Text length:', text.length);
  console.log('Preview:', text.slice(0, 300));
}
