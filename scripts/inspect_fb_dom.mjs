/**
 * inspect_fb_dom.mjs — datos crudos de [role="article"] en la pestaña /posts/
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROFILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../facebook-profile');
const TARGET_URL  = 'https://www.facebook.com/NoticiasFormosa/posts/';

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true, viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'es-419', args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

const page = await context.newPage();
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('[role="article"]', { timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => window.scrollBy(0, 900));
await new Promise(r => setTimeout(r, 2500));

// Capturar screenshot para ver qué está cargado
await page.screenshot({ path: join(dirname(fileURLToPath(import.meta.url)), '../facebook-screenshots/posts_tab.png') });

const data = await page.evaluate(() => {
  const articles = [...document.querySelectorAll('[role="article"]')];
  const htmlDivsPage = document.querySelectorAll('div.html-div').length;

  return {
    totalArticles: articles.length,
    htmlDivsPage,
    pageTitle: document.title,
    articles: articles.slice(0, 8).map((el, i) => {
      const nestDepth = (() => {
        let depth = 0, cur = el.parentElement;
        while (cur) { if (cur.getAttribute('role') === 'article') depth++; cur = cur.parentElement; }
        return depth;
      })();

      const htmlDivs = el.querySelectorAll('div.html-div').length;
      const htmlDivText = (el.querySelector('div.html-div')?.innerText || '').trim().slice(0, 80);

      const dirAutoTexts = [...el.querySelectorAll('[dir="auto"]')]
        .map(n => ({ inAnchor: !!n.closest('a'), text: (n.innerText || '').trim().slice(0, 60) }))
        .filter(n => n.text.length > 0).slice(0, 4);

      const links = [...el.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && (h.includes('/posts/') || h.includes('/reel/') || h.includes('/videos/')))
        .map(h => h.split('?')[0])
        .slice(0, 2);

      const hasCommentId = [...el.querySelectorAll('a[href]')]
        .some(a => (a.href || '').includes('comment_id='));

      return { i, nestDepth, htmlDivs, htmlDivText, dirAutoTexts, links, hasCommentId };
    })
  };
});

console.log(`\n═══ /posts/ tab — ${data.pageTitle} ═══\n`);
console.log(`Total [role="article"]: ${data.totalArticles}`);
console.log(`Total div.html-div en página: ${data.htmlDivsPage}`);
console.log();

for (const d of data.articles) {
  const flag = d.hasCommentId ? '💬 COMMENT' : d.htmlDivs > 0 ? '📄 POST' : '❓';
  console.log(`Article [${d.i}] depth=${d.nestDepth} ${flag}`);
  console.log(`  html-div count: ${d.htmlDivs}  text: "${d.htmlDivText || '(none)'}"`);
  if (d.links.length) console.log(`  links: ${d.links.join(' | ')}`);
  d.dirAutoTexts.forEach(n => console.log(`  dir="auto" ${n.inAnchor ? '[<a>]' : '[   ]'} "${n.text}"`));
  console.log();
}

await page.close();
await context.close();
