import { chromium } from 'playwright';

async function extractArticleMetadata(url) {
  console.log(`Extracting from: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const metadata = await page.evaluate(() => {
    let title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
               document.title ||
               document.querySelector('h1')?.textContent?.trim();
    if (title) title = title.split('|')[0].trim();
    return { title };
  });

  await browser.close();
  return metadata;
}

extractArticleMetadata('https://www.xn--lamaanaonline-lkb.com.ar/noticia/105045/investigan-el-robo-de-dinero-de-un-comercio-en-el-eva-pern/').then(r => {
  console.log('Result:', r);
});
