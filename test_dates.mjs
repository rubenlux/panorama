import cheerio from 'cheerio';

const url = 'https://www.tycsports.com/seleccion-argentina/rival-grupo-h-16vos-de-final-seleccion-argentina-uruguay-espana-cabo-verde-id737497.html';

try {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  // Buscar meta tags de fecha
  const pubDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="article:published_time"]').attr('content') ||
    $('meta[property="datePublished"]').attr('content');

  console.log('🔍 Meta article:published_time:', pubDate || 'NOT FOUND');

  // Buscar en JSON-LD
  try {
    const jsonLd = $('script[type="application/ld+json"]').first().text();
    if (jsonLd) {
      const data = JSON.parse(jsonLd);
      console.log('🔍 JSON-LD datePublished:', data.datePublished || data[0]?.datePublished || 'NOT FOUND');
    } else {
      console.log('🔍 JSON-LD: NOT FOUND');
    }
  } catch (e) {
    console.log('🔍 JSON-LD parse error:', e.message);
  }
} catch (e) {
  console.error('Error:', e.message);
}
