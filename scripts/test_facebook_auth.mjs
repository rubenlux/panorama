/**
 * test_facebook_auth.mjs
 *
 * Compara artículos detectados en sesión anónima vs autenticada para 3 páginas de Facebook.
 * Intercepta llamadas GraphQL en sesión autenticada para identificar doc_ids de feed.
 *
 * Setup:
 *   1. Instalar Cookie-Editor en Chrome: https://cookie-editor.com
 *   2. Ir a facebook.com (logueado), abrir Cookie-Editor → Export → JSON
 *   3. Guardar como facebook_cookies.json en la raíz del proyecto
 *   4. node scripts/test_facebook_auth.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = join(__dirname, '../facebook_cookies.json');

const PAGES = [
  { name: 'Noticias Formosa', url: 'https://www.facebook.com/NoticiasFormosa' },
  { name: 'TN - Todo Noticias',  url: 'https://www.facebook.com/tnoficial' },
  { name: 'Infobae',             url: 'https://www.facebook.com/infobae' },
];

const SCROLL_ROUNDS  = 8;
const SCROLL_PX      = 900;
const SCROLL_WAIT_MS = 2200;

// ─── helpers ────────────────────────────────────────────────────────────────

async function scroll(page) {
  let prev = 0;
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await new Promise(r => setTimeout(r, SCROLL_WAIT_MS));
    const count = await page.evaluate(
      () => document.querySelectorAll('[role="article"]').length
    );
    process.stdout.write(`\r    Scroll ${i + 1}/${SCROLL_ROUNDS}: ${count} artículos en DOM`);
    if (i >= 2 && count === prev) {
      process.stdout.write(' — sin cambio, stop\n');
      return count;
    }
    prev = count;
  }
  process.stdout.write('\n');
  return prev;
}

async function extractPosts(page) {
  return page.evaluate(() => {
    const articles = [...document.querySelectorAll('[role="article"]')];
    return articles.map(el => {
      const textEl  = el.querySelector('[data-ad-preview="message"], [dir="auto"]');
      const linkEl  = el.querySelector('a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]');
      const timeEl  = el.querySelector('abbr[data-utime], time');
      return {
        text:  (textEl?.innerText || '').slice(0, 80).trim(),
        url:   linkEl?.href || null,
        time:  timeEl?.getAttribute('data-utime') || timeEl?.dateTime || null,
      };
    }).filter(p => p.text || p.url);
  });
}

// ─── test one page ───────────────────────────────────────────────────────────

async function testPage(browser, url, name, cookies) {
  const graphqlCalls = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:    'es-AR',
    viewport:  { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
  });

  // Stealth patches — remover fingerprints de automatización
  await context.addInitScript(() => {
    // navigator.webdriver = undefined (no true)
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Plugins realistas
    const makePlugin = (name, filename, desc) => {
      const p = { name, filename, description: desc, length: 0, item: () => null, namedItem: () => null };
      p.__proto__ = Plugin.prototype;
      return p;
    };
    const pluginArr = [
      makePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
      makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
      makePlugin('Native Client', 'internal-nacl-plugin', ''),
    ];
    Object.defineProperty(navigator, 'plugins', { get: () => pluginArr });
    Object.defineProperty(navigator, 'mimeTypes', { get: () => [] });

    // Idiomas consistentes con locale
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'language',  { get: () => 'es-ES' });

    // chrome runtime object (ausente en headless puro)
    if (!window.chrome) {
      window.chrome = {
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
        runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
      };
    }

    // Permissions — notificaciones devuelven estado real en lugar de error
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (p) =>
      p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : origQuery(p);

    // Hardware concurrency realista
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

    // WebGL vendor
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return getParam.call(this, param);
    };
  });

  if (cookies && cookies.length) await context.addCookies(cookies);

  // Interceptar GraphQL solo en sesión autenticada
  if (cookies) {
    await context.route('**/api/graphql**', async route => {
      const req  = route.request();
      const body = req.postData() || '';
      const docId = (body.match(/doc_id=(\d+)/) || [])[1];
      try {
        const response = await route.fetch();
        const text     = await response.text();
        // Solo guardamos si tiene data de posts (contiene "message" o "edges")
        if (text.includes('"edges"') || text.includes('"message"')) {
          graphqlCalls.push({ docId, size: text.length, preview: text.slice(0, 200) });
        }
        await route.fulfill({ response, body: text });
      } catch {
        await route.continue();
      }
    });
  }

  const page = await context.newPage();
  let loadOk = true;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`\n    ⚠ Timeout/error al cargar: ${e.message}`);
    loadOk = false;
  }

  const hasLoginForm = await page.evaluate(
    () => !!document.querySelector('form[data-testid="royal_login_form"], [data-pagelet="login_form"]')
  );
  const hasLoginWall = await page.evaluate(
    () => !!(document.querySelector('[data-login-wall]') ||
             document.body.innerHTML.includes('LoginWall') ||
             document.body.innerHTML.includes('LoggedOut'))
  );

  console.log(`    Login form: ${hasLoginForm} | Login wall: ${hasLoginWall}`);

  const articleCountBefore = await page.evaluate(
    () => document.querySelectorAll('[role="article"]').length
  );
  console.log(`    Artículos antes de scroll: ${articleCountBefore}`);

  const finalCount = await scroll(page);
  const posts      = await extractPosts(page);

  await context.close();

  return {
    articleCount: finalCount,
    postsSampled: posts,
    hasLoginForm,
    hasLoginWall,
    graphqlCalls,
    loadOk,
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  // Cargar cookies
  let cookies = null;
  if (existsSync(COOKIES_FILE)) {
    const raw = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
    // Cookie-Editor exporta [{name, value, domain, path, ...}]
    // Normalizar domain a .facebook.com si viene sin el punto
    const normalizeSameSite = v => {
      if (!v) return 'None';
      const m = { 'no_restriction': 'None', 'lax': 'Lax', 'strict': 'Strict', 'none': 'None' };
      return m[v.toLowerCase()] || 'None';
    };
    cookies = raw.map(c => ({
      ...c,
      domain:   c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      sameSite: normalizeSameSite(c.sameSite),
    })).filter(c => c.domain.includes('facebook.com'));
    console.log(`✓ Cookies cargadas: ${cookies.length} entradas de facebook.com`);
    const hasDatr  = cookies.find(c => c.name === 'datr');
    const hasC_user = cookies.find(c => c.name === 'c_user');
    console.log(`  datr: ${hasDatr ? '✓' : '✗'}  c_user: ${hasC_user ? `✓ (${hasC_user.value})` : '✗'}`);
    if (!hasC_user) {
      console.log('\n⚠ c_user cookie no encontrada — probablemente no estás logueado.');
      console.log('  Verifica que exportaste las cookies desde una sesión activa en facebook.com.');
    }
  } else {
    console.log(`⚠ ${COOKIES_FILE} no encontrado.`);
    console.log('  Solo se ejecutará sesión anónima.');
    console.log('  Para sesión autenticada:');
    console.log('    1. Instalar Cookie-Editor en Chrome');
    console.log('    2. Ir a facebook.com (logueado)');
    console.log('    3. Cookie-Editor → Export → JSON');
    console.log('    4. Guardar como facebook_cookies.json en la raíz del proyecto');
  }

  console.log('\nIniciando Playwright...\n');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  const results = [];

  for (const { name, url } of PAGES) {
    console.log(`\n━━━ ${name.toUpperCase()} ━━━`);
    console.log(`    URL: ${url}`);

    console.log('\n  [ANÓNIMO]');
    const anon = await testPage(browser, url, name, null);

    let auth = null;
    if (cookies && cookies.length) {
      console.log('\n  [AUTENTICADO]');
      auth = await testPage(browser, url, name, cookies);
    }

    results.push({ name, url, anon, auth });
  }

  await browser.close();

  // ─── Informe ─────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                       RESULTADOS                            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const anonCount = r.anon.articleCount;
    const authCount = r.auth ? r.auth.articleCount : 'N/A';
    const delta     = r.auth ? `Δ=${r.auth.articleCount - r.anon.articleCount >= 0 ? '+' : ''}${r.auth.articleCount - r.anon.articleCount}` : '';

    console.log(`║ ${r.name.padEnd(22)} │ ANÓN: ${String(anonCount).padStart(3)}  │ AUTH: ${String(authCount).padStart(3)}  ${delta.padEnd(7)} ║`);
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Posts de muestra
  for (const r of results) {
    if (r.auth?.postsSampled?.length) {
      console.log(`\n📌 ${r.name} — posts detectados (AUTH):`);
      r.auth.postsSampled.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i + 1}. "${p.text || '(sin texto)'}"`);
        if (p.url) console.log(`     ${p.url.slice(0, 80)}`);
      });
    } else if (r.anon?.postsSampled?.length) {
      console.log(`\n📌 ${r.name} — posts detectados (ANÓN):`);
      r.anon.postsSampled.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i + 1}. "${p.text || '(sin texto)'}"`);
      });
    }
  }

  // GraphQL calls
  const allGql = results.flatMap(r => (r.auth?.graphqlCalls || []).map(g => ({ ...g, page: r.name })));
  if (allGql.length) {
    console.log('\n🔌 Llamadas GraphQL interceptadas (sesión autenticada):');
    const byDocId = {};
    for (const g of allGql) {
      if (!byDocId[g.docId]) byDocId[g.docId] = { count: 0, pages: [], size: g.size };
      byDocId[g.docId].count++;
      if (!byDocId[g.docId].pages.includes(g.page)) byDocId[g.docId].pages.push(g.page);
    }
    for (const [docId, info] of Object.entries(byDocId)) {
      console.log(`  doc_id=${docId || '?'} | ${info.count}x | páginas: ${info.pages.join(', ')} | size: ${info.size}b`);
    }

    // Guardar evidencia para análisis posterior
    const outFile = join(__dirname, '../test_out_graphql.json');
    writeFileSync(outFile, JSON.stringify({ allGql, byDocId }, null, 2));
    console.log(`\n  Evidencia guardada en: test_out_graphql.json`);
  } else if (cookies) {
    console.log('\n⚠ Sin llamadas GraphQL con payload de posts en sesión autenticada.');
    console.log('  Posibles causas: cookies expiradas, Facebook usa SSR inicial, o sesión no reconocida.');
  }
}

main().catch(e => {
  console.error('Error fatal:', e);
  process.exit(1);
});
