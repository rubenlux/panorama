import 'dotenv/config';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const url = 'https://www.espn.com.ar/sitemap.xml';
console.log('Testing ESPN sitemap...\n');

try {
  const res = await fetch(url);
  const html = await res.text();
  console.log('✓ Fetched. Length:', html.length);

  const $ = cheerio.load(html);
  console.log('\nParsed XML. Looking for <loc> tags...');

  let found = 0;
  $('loc').each((i, el) => {
    if (found >= 3) return;
    let href = $(el).text().trim();
    console.log(`  [${i}] text(): "${href.substring(0, 80)}..."`);
    if (!href) {
      const html = $(el).html();
      console.log(`  [${i}] html(): "${html?.substring(0, 80)}..."`);
      const cdataMatch = html?.match(/<!\[CDATA\[(.*?)\]\]>/);
      if (cdataMatch) {
        href = cdataMatch[1].trim();
        console.log(`  [${i}] CDATA extracted: "${href.substring(0, 80)}..."`);
      }
    }
    found++;
  });

  console.log('\nNow checking sub-sitemap...');
  const subUrl = 'https://www.espn.com.ar/googlenewssitemap';
  const subRes = await fetch(subUrl);
  const subHtml = await subRes.text();
  console.log('✓ Fetched sub-sitemap. Length:', subHtml.length);

  const $sub = cheerio.load(subHtml);
  console.log('\nLooking for <loc> in sub-sitemap...');

  let subFound = 0;
  $sub('loc').each((i, el) => {
    if (subFound >= 3) return;
    let href = $sub(el).text().trim();
    if (!href) {
      const html = $sub(el).html();
      const cdataMatch = html?.match(/<!\[CDATA\[(.*?)\]\]>/);
      if (cdataMatch) {
        href = cdataMatch[1].trim();
      }
    }
    if (href) {
      console.log(`  [${subFound}] "${href.substring(0, 80)}..."`);
      subFound++;
    }
  });

  console.log(`\nTotal <loc> in sub-sitemap: ${$sub('loc').length}`);

} catch (e) {
  console.error('Error:', e.message);
}
