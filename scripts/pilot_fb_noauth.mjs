/**
 * Sprint 8.8K — Pilot: Facebook vista pública (sin login) vs DB autenticada
 *
 * HIPÓTESIS: Facebook sirve <article> con pfbid links en vista pública (no-auth).
 * Vista autenticada (scraper actual) no tiene <article> pero carga más posts.
 *
 * OBJETIVO: medir cuántos pfbid links obtenemos en vista pública y qué % matchea
 * con los posts ya guardados por el scraper autenticado.
 *
 * NO modifica el scraper actual. Contexto Playwright completamente separado.
 * Ejecutar: node scripts/pilot_fb_noauth.mjs
 */

import { chromium } from 'playwright';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p = []) => pool.query(sql, p).then(r => r.rows);

const TARGETS = [
  { name: 'Diario Olé',       url: 'https://www.facebook.com/diarioole',       dbUrl: 'https://www.facebook.com/diarioole' },
  { name: 'TN',               url: 'https://www.facebook.com/todonoticias',    dbUrl: 'https://www.facebook.com/todonoticias' },
  { name: 'Noticias Formosa', url: 'https://www.facebook.com/NoticiasFormosa', dbUrl: 'https://www.facebook.com/NoticiasFormosa' },
];

function normalizeText(t) {
  return (t || '').toLowerCase().replace(/[^a-záéíóúñ0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a, b) {
  const wa = new Set(normalizeText(a).split(' ').filter(w => w.length > 3));
  const wb = new Set(normalizeText(b).split(' ').filter(w => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w));
  return inter.length / Math.min(wa.size, wb.size);
}

// ── FASE 1: Scrape vista pública (sin login) ─────────────────────────────────

async function scrapePublic(page, target) {
  console.log(`\n  → ${target.url} (sin login)`);

  // Navegar sin cookies, sin perfil persistente
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(4000);

  // Cerrar popup inicial — intentar varias veces
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const sel of [
      'div[aria-label="Cerrar"]',
      'div[aria-label="Close"]',
      '[data-testid="modal_close_button"]',
      'div[aria-label="Cerrar sesión"]',
    ]) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          await page.waitForTimeout(800);
        }
      } catch {}
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2000);

  const allPosts = new Map(); // url → { url, text, timeText, type }
  let scrollCount = 0;
  let loginWallHit = false;
  let zeroArticleStreak = 0;

  for (let i = 0; i < 12; i++) {
    // ── Extraer articles PRIMERO, antes de cualquier verificación ──────────
    const articles = await page.locator('article').all();

    let newThisRound = 0;
    for (const art of articles) {
      try {
        // Buscar link pfbid o reel DENTRO del article
        const linkEl = art.locator('a[href*="/posts/pfbid"], a[href*="/posts/"], a[href*="/reel/"], a[href*="/videos/"]').first();
        const href = await linkEl.getAttribute('href', { timeout: 1000 }).catch(() => null);
        if (!href) continue;

        const fullUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;

        // Evitar duplicados
        if (allPosts.has(fullUrl)) continue;

        // Texto del article
        const text = await art.innerText({ timeout: 2000 }).catch(() => '');
        if (text.length < 20) continue;

        // Tiempo relativo (si hay abbr o time)
        const timeEl = art.locator('abbr, time').first();
        const timeText = await timeEl.innerText({ timeout: 500 }).catch(() => '');

        // Tipo de contenido
        const type = fullUrl.includes('/reel/') ? 'reel' :
                     fullUrl.includes('/videos/') ? 'video' :
                     fullUrl.includes('/posts/pfbid') ? 'pfbid_post' : 'post';

        allPosts.set(fullUrl, { url: fullUrl, text: text.trim(), timeText: timeText.trim(), type });
        newThisRound++;
      } catch {}
    }

    scrollCount = i + 1;
    console.log(`  Scroll ${i + 1}: ${articles.length} articles en DOM, +${newThisRound} nuevos, ${allPosts.size} total acumulados`);

    // Detectar login wall SOLO si el feed dejó de crecer (evitar falsos positivos iniciales)
    if (articles.length === 0 && i >= 1) {
      zeroArticleStreak++;
    } else {
      zeroArticleStreak = 0;
    }

    // Login wall = feed congelado: 0 artículos por 2 scrolls + overlay de login visible
    if (zeroArticleStreak >= 2 || (articles.length === 0 && i >= 3)) {
      const isOverlay = await page.evaluate(() => {
        // Buscar overlay modal con login (no el login form embebido en la página)
        return !!(
          document.querySelector('[role="dialog"] form[action*="/login/"]') ||
          document.querySelector('[role="dialog"] #login_form') ||
          document.querySelector('.login_form_container') ||
          document.querySelector('[data-testid="royal_registration_dialog"]')
        );
      });
      if (isOverlay || articles.length === 0) {
        loginWallHit = true;
        console.log(`  ⚠ Login wall bloqueando — deteniendo (${allPosts.size} posts ya capturados)`);
        break;
      }
    }

    // Scroll
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(2500);

    // Cerrar modal si reaparece
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  const posts = [...allPosts.values()];
  return { posts, scrollCount, loginWallHit };
}

// ── FASE 2: Match contra DB ──────────────────────────────────────────────────

async function matchAgainstDB(publicPosts, dbPosts) {
  const results = [];

  for (const pub of publicPosts) {
    let bestMatch = null, bestScore = 0;
    for (const db of dbPosts) {
      const score = wordOverlap(pub.text, db.title);
      if (score > bestScore) { bestScore = score; bestMatch = db; }
    }
    results.push({
      publicUrl:      pub.url,
      publicType:     pub.type,
      publicTextSnip: pub.text.split('\n')[0].slice(0, 80),
      publicTime:     pub.timeText,
      matched:        bestScore >= 0.35,
      matchScore:     bestScore,
      dbTitle:        bestMatch?.title?.slice(0, 80),
      dbExtId:        bestMatch?.external_id,
    });
  }

  return results;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('SPRINT 8.8K — PILOT: Vista pública vs DB autenticada');
  console.log('═'.repeat(60));

  // Contexto LIMPIO — sin perfil persistente, sin cookies (vista pública)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-419',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const globalStats = {
    totalPublic: 0, totalMatched: 0,
    pfbidCount: 0, reelCount: 0, postCount: 0,
    loginWalls: 0,
  };

  for (const target of TARGETS) {
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`FUENTE: ${target.name}`);
    console.log('════════════════════════════════════════════════════════');

    // Scrape público
    let publicResult;
    try {
      publicResult = await scrapePublic(page, target);
    } catch (e) {
      console.log(`  ERROR scraping: ${e.message}`);
      continue;
    }

    const { posts: publicPosts, loginWallHit } = publicResult;
    if (loginWallHit) globalStats.loginWalls++;

    console.log(`\n  Posts capturados (vista pública): ${publicPosts.length}`);
    if (publicPosts.length === 0) {
      console.log('  Sin posts → saltando matching');
      continue;
    }

    // Contar tipos
    const pfbids = publicPosts.filter(p => p.type === 'pfbid_post').length;
    const reels  = publicPosts.filter(p => p.type === 'reel').length;
    const posts  = publicPosts.filter(p => p.type === 'post').length;
    console.log(`  Tipos: pfbid=${pfbids}  reel=${reels}  post_legacy=${posts}`);
    globalStats.pfbidCount += pfbids;
    globalStats.reelCount  += reels;
    globalStats.postCount  += posts;

    // Posts de DB para esta fuente (recientes, últimas 48h)
    const dbPosts = await q(`
      SELECT sp.title, sp.external_id, sp.captured_at
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.profile_url = $1
        AND sp.platform = 'facebook'
        AND sp.captured_at > NOW() - INTERVAL '48 hours'
      ORDER BY sp.captured_at DESC
      LIMIT 50
    `, [target.dbUrl]);

    console.log(`  Posts en DB (últimas 48h): ${dbPosts.length}`);

    if (dbPosts.length === 0) {
      console.log('  Sin datos en DB para comparar');
      // Mostrar posts públicos de todos modos
      console.log('\n  Posts capturados (sin match posible):');
      publicPosts.forEach((p, i) => {
        console.log(`  [${i+1}] ${p.type}  "${p.publicTextSnip || p.text.split('\n')[0].slice(0,70)}"`);
        console.log(`       ${p.url}`);
      });
      globalStats.totalPublic += publicPosts.length;
      continue;
    }

    // Matching
    const matchResults = await matchAgainstDB(publicPosts, dbPosts);

    console.log('\n  Resultados de matching:');
    let matched = 0;
    for (const r of matchResults) {
      const icon = r.matched ? '✅' : '❌';
      console.log(`\n  ${icon} [${r.publicType}] score=${r.matchScore.toFixed(2)}`);
      console.log(`     público: "${r.publicTextSnip}"`);
      console.log(`     url:     ${r.publicUrl}`);
      if (r.matched) {
        console.log(`     db:      "${r.dbTitle}"`);
        matched++;
      }
    }

    const pct = Math.round(matched / matchResults.length * 100);
    console.log(`\n  SUBTOTAL: ${matched}/${matchResults.length} matcheados (${pct}%)`);

    globalStats.totalPublic  += publicPosts.length;
    globalStats.totalMatched += matched;
  }

  await browser.close();

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('RESUMEN EJECUTIVO');
  console.log('════════════════════════════════════════════════════════\n');

  const pctMatch = globalStats.totalPublic > 0
    ? Math.round(globalStats.totalMatched / globalStats.totalPublic * 100)
    : 0;

  console.log(`  Posts capturados (vista pública total): ${globalStats.totalPublic}`);
  console.log(`    pfbid posts:  ${globalStats.pfbidCount}`);
  console.log(`    reels:        ${globalStats.reelCount}`);
  console.log(`    posts legacy: ${globalStats.postCount}`);
  console.log(`  Login walls encontrados:                ${globalStats.loginWalls}/3`);
  console.log(`  Matcheados contra DB:                   ${globalStats.totalMatched}/${globalStats.totalPublic} (${pctMatch}%)`);

  console.log('\n  Evaluación:');
  if (globalStats.totalPublic === 0) {
    console.log('  ❌ Sin posts capturados — Facebook bloquea vista pública sin auth');
  } else if (pctMatch >= 80) {
    console.log('  ✅ Vista pública provee URLs confiables y matcheables con DB');
    console.log('  → VIABLE como resolver paralelo de URLs');
  } else if (pctMatch >= 50) {
    console.log('  ⚠ Cobertura parcial — no suficiente para resolver el 80% requerido');
  } else {
    console.log('  ❌ Cobertura insuficiente');
  }

  if (globalStats.loginWalls > 0) {
    console.log(`\n  ⚠ Login wall apareció en ${globalStats.loginWalls}/3 fuentes`);
    console.log('    → La vista pública está limitada antes de las 24h de contenido');
    console.log('    → Usar login persistente + esta técnica = más posts + URLs');
  }

  console.log('\n  Ventajas del approach artículo (vista pública):');
  console.log('    + pfbid links directos, sin walk-up');
  console.log('    + Estructura DOM simple (<article> con links internos)');
  console.log('    - Solo ~7-15 posts por página antes del login wall');
  console.log('    - No reemplaza el scraper autenticado (cobertura menor)');
  console.log('    - Podría complementarlo como resolver de URL para posts recientes');
}

main()
  .catch(e => { console.error('\nERROR FATAL:', e.message); process.exit(1); })
  .finally(() => pool.end());
