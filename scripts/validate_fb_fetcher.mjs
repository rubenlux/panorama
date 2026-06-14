/**
 * validate_fb_fetcher.mjs
 * Llama directamente a SocialFetcherPlaywrightFacebook con una fuente real.
 * No modifica la DB. Solo imprime los posts que extrae.
 */

import { SocialFetcherPlaywrightFacebook } from '../src/connectors/social/fetchers.js';

const TEST_SOURCES = [
  { id: 1, platform: 'facebook', name: 'Noticias Formosa', profile_url: 'https://www.facebook.com/NoticiasFormosa', content_type: 'posts' },
  { id: 2, platform: 'facebook', name: 'Infobae',          profile_url: 'https://www.facebook.com/infobae',          content_type: 'posts' },
];

for (const source of TEST_SOURCES) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FUENTE: ${source.name}`);
  console.log(`${'═'.repeat(60)}`);

  const fetcher = new SocialFetcherPlaywrightFacebook(source);
  const t0 = Date.now();

  try {
    const posts = await fetcher.fetchLatest();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`\n✓ ${posts.length} posts en ${elapsed}s`);

    if (posts.length === 0) {
      console.log('  (0 posts — posible problema de sesión o selector)');
      continue;
    }

    posts.forEach((p, i) => {
      console.log(`\n  [${i + 1}] ${p.title?.slice(0, 80) || '(sin título)'}`);
      console.log(`      URL:       ${p.url?.slice(0, 70) || '(sin URL)'}`);
      console.log(`      Tipo:      ${p.keywords?.[0] || '?'}`);
      console.log(`      Likes:     ${p.likes}`);
      console.log(`      Thumbnail: ${p.thumbnail_url ? '✓' : '✗'}`);
    });

  } catch (e) {
    console.error(`\n✗ Error: ${e.message}`);
  }
}
