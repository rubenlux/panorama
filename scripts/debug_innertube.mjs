/**
 * Tests YouTube Innertube API for transcripts
 * Alternative to /api/timedtext that might not be rate-limited
 */
import fetch from 'node-fetch';

const videoId = process.argv[2] || 'oM0QvQG4MeI';

// Step 1: get page and extract necessary tokens
const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9',
  },
  timeout: 15000,
});
console.log('Page status:', pageRes.status);
const cookies = pageRes.headers.raw()['set-cookie']?.map(c => c.split(';')[0]).join('; ') ?? '';
console.log('Cookies:', cookies.slice(0, 100));

const html = await pageRes.text();

// Extract API key from page
const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
const apiKey = apiKeyMatch?.[1];
console.log('API key:', apiKey?.slice(0, 20) + '...');

// Extract client version
const clientVersionMatch = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);
const clientVersion = clientVersionMatch?.[1] || '2.20240101.00.00';
console.log('Client version:', clientVersion);

if (!apiKey) {
  console.log('No API key found in page');
  process.exit(1);
}

// Step 2: Try get_transcript via Innertube
// params = base64 of protobuf: field 1 (string) = videoId
// Simple encode: "\x0a" + varint(len) + videoId bytes
const videoIdBuf = Buffer.from(videoId, 'utf8');
const paramsBuf  = Buffer.concat([Buffer.from([0x0a, videoIdBuf.length]), videoIdBuf]);
const params     = paramsBuf.toString('base64');

console.log('\nTrying Innertube get_transcript...');
const transcriptRes = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
  method: 'POST',
  headers: {
    'Content-Type':  'application/json',
    'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'X-YouTube-Client-Name':    '1',
    'X-YouTube-Client-Version': clientVersion,
    'Cookie': cookies,
    'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    'Origin':  'https://www.youtube.com',
  },
  body: JSON.stringify({
    context: {
      client: {
        hl:            'es',
        gl:            'AR',
        clientName:    'WEB',
        clientVersion: clientVersion,
        userAgent:     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    },
    params: params,
  }),
  timeout: 15000,
});

console.log('Innertube status:', transcriptRes.status);
const body = await transcriptRes.text();
console.log('Body length:', body.length);
if (transcriptRes.status === 200) {
  const data = JSON.parse(body);
  // Find transcript segments
  const actions = data.actions || [];
  console.log('Actions count:', actions.length);
  const transcriptAction = actions.find(a => a.updateEngagementPanelAction);
  const content = transcriptAction?.updateEngagementPanelAction?.content;
  console.log('Content keys:', Object.keys(content || {}));
  // Try to find text segments
  const segments = content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body
    ?.transcriptSegmentListRenderer?.initialSegments;
  if (segments) {
    console.log('Segments found:', segments.length);
    const text = segments
      .map(s => s.transcriptSegmentRenderer?.snippet?.runs?.map(r => r.text).join(''))
      .filter(Boolean)
      .join(' ');
    console.log('Text preview:', text.slice(0, 300));
  } else {
    console.log('No segments found. Full response (first 500):', body.slice(0, 500));
  }
} else {
  console.log('Error body:', body.slice(0, 300));
}
