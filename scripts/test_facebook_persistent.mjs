/**
 * test_facebook_persistent.mjs
 *
 * FASE 1–7: Perfil persistente real de Chromium.
 *
 * Diferencia clave vs cookies inyectadas:
 *   - localStorage, IndexedDB, service workers, historial — todo persiste en disco
 *   - Facebook "recuerda" el browser entre sesiones
 *   - Primera ejecución: bootstrap con cookies desde facebook_cookies.json
 *   - Ejecuciones posteriores: sesión ya instalada, sin inyección
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR   = join(__dirname, '../facebook-profile');
const COOKIES_FILE  = join(__dirname, '../facebook_cookies.json');
const SHOTS_DIR     = join(__dirname, '../facebook-screenshots');
const INIT_MARKER   = join(PROFILE_DIR, '.initialized');
const GQL_OUT       = join(__dirname, '../test_out_persistent_graphql.json');

mkdirSync(SHOTS_DIR, { recursive: true });

const PAGES = [
  { name: 'Noticias Formosa', url: 'https://www.facebook.com/NoticiasFormosa' },
  { name: 'TN',               url: 'https://www.facebook.com/tnoficial' },
  { name: 'Infobae',          url: 'https://www.facebook.com/infobae' },
];

const SCROLL_ROUNDS  = 8;
const SCROLL_WAIT_MS = 2200;

// ─── stealth patch — se inyecta en cada página antes de que cargue ──────────

const STEALTH_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  const makePlugin = (n, f, d) => {
    const p = Object.create(Plugin.prototype);
    Object.assign(p, { name: n, filename: f, description: d, length: 0,
      item: () => null, namedItem: () => null });
    return p;
  };
  const plugins = [
    makePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
    makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
    makePlugin('Native Client', 'internal-nacl-plugin', ''),
  ];
  Object.defineProperty(navigator, 'plugins',             { get: () => plugins });
  Object.defineProperty(navigator, 'mimeTypes',           { get: () => [] });
  Object.defineProperty(navigator, 'languages',           { get: () => ['es-ES', 'es', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'language',            { get: () => 'es-ES' });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8 });

  if (!window.chrome) {
    window.chrome = { runtime: {}, app: {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    }};
  }

  const origQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = p =>
    p.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(p);

  const origGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(p) {
    if (p === 37445) return 'Intel Inc.';
    if (p === 37446) return 'Intel Iris OpenGL Engine';
    return origGetParam.call(this, p);
  };
};

// ─── helpers ────────────────────────────────────────────────────────────────

const normalizeSameSite = v => {
  if (!v) return 'None';
  return ({ no_restriction: 'None', lax: 'Lax', strict: 'Strict', none: 'None' })[v.toLowerCase()] || 'None';
};

async function checkLogin(page) {
  return page.evaluate(() => {
    // c_user es la cookie de sesión no-httpOnly — visible en document.cookie
    const cookies = document.cookie;
    if (cookies.includes('c_user=')) {
      const uid = (cookies.match(/c_user=(\d+)/) || [])[1];
      return { loggedIn: true, method: 'c_user_cookie', uid };
    }
    if (document.querySelector('form[data-testid="royal_login_form"]')) {
      return { loggedIn: false, method: 'login_form' };
    }
    // Buscar el menu de cuenta (navbar)
    const menuEl = document.querySelector(
      '[aria-label*="perfil"], [aria-label*="cuenta"], [data-pagelet="navBarProfileDropdown"]'
    );
    if (menuEl) return { loggedIn: true, method: 'nav_menu', label: menuEl.getAttribute('aria-label') };
    // Botón "Iniciar sesión" visible = logged out
    const loginBtn = [...document.querySelectorAll('a, button')].find(
      el => el.textContent.trim().toLowerCase() === 'iniciar sesión'
    );
    if (loginBtn) return { loggedIn: false, method: 'login_btn' };
    return { loggedIn: null, method: 'inconclusive' };
  });
}

async function scrollAndCount(page, label) {
  let prev = 0;
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await new Promise(r => setTimeout(r, SCROLL_WAIT_MS));
    const count = await page.evaluate(() =>
      document.querySelectorAll('[role="article"]').length
    );
    process.stdout.write(`\r    [${label}] Scroll ${i + 1}/${SCROLL_ROUNDS}: ${count} artículos`);
    if (i >= 2 && count === prev) {
      process.stdout.write(' — estable, stop\n');
      return count;
    }
    prev = count;
  }
  process.stdout.write('\n');
  return prev;
}

async function extractPosts(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('[role="article"]')].map(el => {
      const textEl = el.querySelector('[data-ad-preview="message"], [dir="auto"]');
      const linkEl = el.querySelector('a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]');
      const likeEl = el.querySelector('[aria-label*="Me gusta"], [aria-label*="reaction"]');
      return {
        text:  (textEl?.innerText || '').slice(0, 100).trim(),
        url:   linkEl?.href?.split('?')[0] || null,
        likes: likeEl?.getAttribute('aria-label') || null,
      };
    }).filter(p => p.text || p.url);
  });
}

// ─── auditPage ───────────────────────────────────────────────────────────────

async function auditPage(context, { name, url }, gqlStore) {
  console.log(`\n━━━ ${name.toUpperCase()} ━━━`);
  console.log(`    ${url}`);

  const page = await context.newPage();

  // Interceptar GraphQL
  await page.route('**/*graphql*', async route => {
    const req  = route.request();
    const body = req.postData() || '';
    const docId = (body.match(/doc_id=(\d+)/) || [])[1];
    try {
      const response = await route.fetch();
      const text     = await response.text();
      if (text.includes('"edges"') || text.includes('"message"') || text.includes('"story"')) {
        gqlStore.push({ page: name, docId, size: text.length, preview: text.slice(0, 300) });
        console.log(`    🔌 GraphQL doc_id=${docId || '?'} size=${text.length}b`);
      }
      await route.fulfill({ response, body: text });
    } catch { await route.continue(); }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const beforeCount = await page.evaluate(
    () => document.querySelectorAll('[role="article"]').length
  );
  const login = await checkLogin(page);
  console.log(`    Login: ${login.loggedIn} (${login.method}${login.uid ? ` uid=${login.uid}` : ''})`);
  console.log(`    Artículos antes de scroll: ${beforeCount}`);

  // Screenshot
  await page.screenshot({
    path: join(SHOTS_DIR, `${name.replace(/\s+/g, '_').toLowerCase()}.png`),
    fullPage: false,
  });

  const afterCount = await scrollAndCount(page, name);
  const posts      = await extractPosts(page);

  await page.close();
  return { name, url, beforeCount, afterCount, login, posts };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const isFirstRun = !existsSync(INIT_MARKER);
  console.log(`Perfil: ${PROFILE_DIR}`);
  console.log(`Primera ejecución: ${isFirstRun}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:   'es-ES',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
    ],
  });

  await context.addInitScript(STEALTH_SCRIPT);

  // ── FASE 1+2: Bootstrap de perfil en primera ejecución ──────────────────
  if (isFirstRun) {
    if (!existsSync(COOKIES_FILE)) {
      console.error('ERROR: facebook_cookies.json no encontrado — necesario para primera ejecución');
      await context.close();
      process.exit(1);
    }
    const raw     = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
    const cookies = raw.map(c => ({ ...c, sameSite: normalizeSameSite(c.sameSite) }));
    await context.addCookies(cookies);
    console.log(`✓ Bootstrap: ${cookies.length} cookies instaladas en perfil persistente`);

    // Calentar sesión — navegar a FB home para que el JS popule localStorage/IndexedDB
    console.log('  Calentando sesión (localStorage + IndexedDB)...');
    const warmPage = await context.newPage();
    await warmPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000)); // dar tiempo al JS de FB para escribir localStorage
    const warmLogin = await checkLogin(warmPage);
    console.log(`  Estado tras calentamiento: loggedIn=${warmLogin.loggedIn} (${warmLogin.method})`);
    await warmPage.screenshot({ path: join(SHOTS_DIR, '00_facebook_home.png'), fullPage: false });
    console.log(`  Screenshot: facebook-screenshots/00_facebook_home.png`);
    await warmPage.close();

    writeFileSync(INIT_MARKER, new Date().toISOString());
    console.log('  Perfil marcado como inicializado');
  } else {
    console.log('✓ Perfil ya inicializado — usando sesión persistida');
    const warmPage = await context.newPage();
    await warmPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const warmLogin = await checkLogin(warmPage);
    console.log(`  Estado de sesión: loggedIn=${warmLogin.loggedIn} (${warmLogin.method})`);
    await warmPage.screenshot({ path: join(SHOTS_DIR, '00_facebook_home.png'), fullPage: false });
    await warmPage.close();
  }

  // ── FASE 3–5: Auditoría por página ──────────────────────────────────────
  const gqlStore = [];
  const results  = [];

  for (const pageDef of PAGES) {
    const r = await auditPage(context, pageDef, gqlStore);
    results.push(r);
  }

  await context.close();

  // ── FASE 6: Comparativa ─────────────────────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                COMPARATIVA — PERFIL PERSISTENTE                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ Página               │ Antes scroll │ Después scroll │ Login    ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  for (const r of results) {
    const logged = r.login.loggedIn === true ? '✓' : r.login.loggedIn === false ? '✗' : '?';
    const n = r.name.padEnd(20);
    const b = String(r.beforeCount).padStart(12);
    const a = String(r.afterCount).padStart(14);
    console.log(`║ ${n} │ ${b} │ ${a} │ ${logged}        ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Posts de muestra
  for (const r of results) {
    if (r.posts.length) {
      console.log(`\n📌 ${r.name} — posts detectados (${r.posts.length} total, mostrando 5):`);
      r.posts.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i + 1}. "${p.text || '(sin texto)'}"`);
        if (p.url)   console.log(`     URL: ${p.url}`);
        if (p.likes) console.log(`     ${p.likes}`);
      });
    } else {
      console.log(`\n📌 ${r.name}: 0 posts extraíbles`);
    }
  }

  // GraphQL
  if (gqlStore.length) {
    console.log('\n🔌 Llamadas GraphQL con payload de feed:');
    const byDoc = {};
    for (const g of gqlStore) {
      const k = `${g.docId || '?'}`;
      if (!byDoc[k]) byDoc[k] = { count: 0, pages: [], maxSize: 0 };
      byDoc[k].count++;
      byDoc[k].maxSize = Math.max(byDoc[k].maxSize, g.size);
      if (!byDoc[k].pages.includes(g.page)) byDoc[k].pages.push(g.page);
    }
    for (const [docId, info] of Object.entries(byDoc)) {
      console.log(`  doc_id=${docId} | ${info.count}x | max_size=${info.maxSize}b | páginas: ${info.pages.join(', ')}`);
    }
    writeFileSync(GQL_OUT, JSON.stringify({ calls: gqlStore, byDoc }, null, 2));
    console.log(`\n  Evidencia completa guardada en: test_out_persistent_graphql.json`);
  } else {
    console.log('\n  Sin llamadas GraphQL con payload de feed detectadas');
  }

  // Screenshots
  console.log('\n📸 Screenshots guardados en: facebook-screenshots/');
  const shotFiles = [
    '00_facebook_home.png',
    ...PAGES.map(p => `${p.name.replace(/\s+/g, '_').toLowerCase()}.png`),
  ];
  shotFiles.forEach(f => console.log(`  ${f}`));

  // ── FASE 7: Conclusión ───────────────────────────────────────────────────
  console.log('\n═══ CONCLUSIÓN TÉCNICA ════════════════════════════════════════════');
  const anyLoggedIn = results.some(r => r.login.loggedIn === true);
  const maxPosts    = Math.max(...results.map(r => r.afterCount));
  const hasGql      = gqlStore.length > 0;

  console.log(`  Sesión activa en páginas monitoreadas: ${anyLoggedIn ? 'SÍ' : 'NO'}`);
  console.log(`  Máximo artículos detectados: ${maxPosts}`);
  console.log(`  GraphQL de feed interceptado: ${hasGql ? 'SÍ' : 'NO'}`);

  if (anyLoggedIn && maxPosts > 6) {
    console.log('  → Perfil persistente RESUELVE la limitación. Proceder a modificar fetcher.');
  } else if (anyLoggedIn && maxPosts <= 6) {
    console.log('  → Sesión activa pero artículos siguen limitados. Posible block por IP.');
  } else {
    console.log('  → Sesión NO activa. Cookies expiradas o Facebook rechaza el perfil.');
  }
}

main().catch(e => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
