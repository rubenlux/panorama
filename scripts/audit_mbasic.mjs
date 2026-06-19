/**
 * Sprint 8.8J — Auditoría mbasic.facebook.com como resolver de URLs
 * SOLO AUDITORÍA. No modifica nada.
 * Ejecutar: node scripts/audit_mbasic.mjs
 */

import { chromium } from 'playwright';
import pg from 'pg';
import path from 'path';
import 'dotenv/config';

const FB_PROFILE_DIR = process.env.FB_PROFILE_DIR || './facebook-profile';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p = []) => pool.query(sql, p).then(r => r.rows);

// ── Páginas a auditar ────────────────────────────────────────────────────────
const SOURCES = [
  { name: 'Diario Olé',       slug: 'diarioole',       fbUrl: 'https://www.facebook.com/diarioole' },
  { name: 'TN',               slug: 'todonoticias',    fbUrl: 'https://www.facebook.com/todonoticias' },
  { name: 'Noticias Formosa', slug: 'NoticiasFormosa', fbUrl: 'https://www.facebook.com/NoticiasFormosa' },
  { name: 'TyC Sports FB',    slug: 'tycsports',       fbUrl: 'https://www.facebook.com/tycsports' },
];

// Regex para URLs de post en mbasic
const MBASIC_POST_RE = /\/story\.php\?story_fbid=(\d+)&id=(\d+)|\/permalink\/(\d+)\/?|\/(?:[^/?#]+)\/(?:posts|videos|photos|reels)\/(\d+)/;
// También: /photo.php?fbid=X, /video.php?v=X

// ── FASE 0: Test HTTP sin auth ───────────────────────────────────────────────
async function testNoAuth(slug) {
  try {
    const url = `https://mbasic.facebook.com/${slug}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.text();
    const isLoginWall = body.includes('id="login_form"') || body.includes('id="login"') ||
                        body.includes('/login/?next=') || res.url.includes('/login/');
    const hasPostLinks = MBASIC_POST_RE.test(body);
    const postLinkCount = (body.match(/story_fbid=\d+/g) || []).length;
    return { status: res.status, finalUrl: res.url, isLoginWall, hasPostLinks, postLinkCount, bodyLen: body.length };
  } catch (e) {
    return { error: e.message };
  }
}

// ── FASE 1: Scrape mbasic con Playwright (sesión autenticada) ────────────────
async function scrapeMbasic(page, source) {
  const url = `https://mbasic.facebook.com/${source.slug}`;
  console.log(`\n  → Abriendo: ${url}`);

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3000);
  const elapsed = Date.now() - t0;

  const result = await page.evaluate(({ postRe }) => {
    const body = document.body.innerHTML;
    const text = document.body.innerText;

    // ¿Estamos en una login wall?
    const isLoginWall = text.includes('Inicia sesión en Facebook') ||
                        text.includes('Log in to Facebook') ||
                        document.querySelector('#login_form') !== null ||
                        document.querySelector('form[action*="/login"]') !== null;

    // Buscar artículos/posts en mbasic
    // mbasic estructura: div[data-ft] o article o secciones con id de artículo
    const articles = [...document.querySelectorAll('article')];
    const divDataFt = [...document.querySelectorAll('div[data-ft]')];
    const divStory  = [...document.querySelectorAll('div[data-store]')];

    // Extraer todos los links de la página
    const allLinks = [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.includes('facebook.com'));

    // Filtrar links de posts
    const postRE = new RegExp(postRe);
    const postLinks = [...new Set(
      allLinks.filter(h => postRE.test(h))
    )];

    // Extraer story_fbid de links
    const storyIds = postLinks.map(h => {
      const m = h.match(/story_fbid=(\d+)/);
      const m2 = h.match(/\/posts\/(\d+)/);
      const m3 = h.match(/\/videos\/(\d+)/);
      const m4 = h.match(/\/permalink\/(\d+)/);
      const m5 = h.match(/\/reels\/(\d+)/);
      const m6 = h.match(/\/photos\/[^/]+\.(\d+)/);
      const id = (m?.[1]) || (m2?.[1]) || (m3?.[1]) || (m4?.[1]) || (m5?.[1]) || (m6?.[1]);
      return id ? { url: h, id } : null;
    }).filter(Boolean);

    // Extraer textos de posts en mbasic
    // En mbasic los posts están en: #root > div > div > div > article > div > div > div > p
    // O simplemente: article p, article div[data-content-type]
    const postTexts = articles.map(art => {
      const paragraphs = [...art.querySelectorAll('p')].map(p => p.innerText).join(' ');
      const headerEl = art.querySelector('h3, h4, strong');
      const header = headerEl ? headerEl.innerText : '';
      // Link de "Full Story" o permalink
      const storyLink = [...art.querySelectorAll('a[href]')]
        .find(a => a.href && postRE.test(a.href));
      const storyId = storyLink ? (() => {
        const h = storyLink.href;
        const m = h.match(/story_fbid=(\d+)/);
        const m2 = h.match(/\/posts\/(\d+)/);
        const m3 = h.match(/\/videos\/(\d+)/);
        return (m?.[1]) || (m2?.[1]) || (m3?.[1]);
      })() : null;

      return { header, text: paragraphs.slice(0, 200), storyId, storyUrl: storyLink?.href };
    }).filter(t => t.text.length > 10 || t.storyId);

    return {
      isLoginWall,
      pageTitle: document.title,
      articleCount: articles.length,
      divDataFtCount: divDataFt.length,
      divStoryCount: divStory.length,
      postLinksCount: postLinks.length,
      storyIds: storyIds.slice(0, 20),
      postTexts: postTexts.slice(0, 10),
      htmlSnippet: document.body.innerHTML.slice(0, 2000),
    };
  }, { postRe: MBASIC_POST_RE.source });

  return { ...result, elapsed };
}

// ── FASE 2: Matching mbasic posts vs DB posts ────────────────────────────────
function normalizeText(t) {
  return (t || '').toLowerCase().replace(/[^a-záéíóúñ0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a, b) {
  const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 3));
  const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 3));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

function substringMatch(a, b) {
  const an = normalizeText(a).slice(0, 80);
  const bn = normalizeText(b).slice(0, 80);
  if (!an || !bn) return 0;
  // Check if first 40 chars of one appear in the other
  const chunk = Math.min(40, an.length, bn.length);
  return an.slice(0, chunk) === bn.slice(0, chunk) ? 1 : 0;
}

async function matchMbasicVsDB(mbasicPosts, dbPosts) {
  const results = [];
  for (const mPost of mbasicPosts) {
    const mText = mPost.text || '';
    let bestMatch = null, bestScore = 0;
    for (const dbPost of dbPosts) {
      const score = Math.max(
        wordOverlap(mText, dbPost.title),
        substringMatch(mText, dbPost.title)
      );
      if (score > bestScore) { bestScore = score; bestMatch = dbPost; }
    }
    results.push({
      mbasicText: mText.slice(0, 80),
      storyId: mPost.storyId,
      storyUrl: mPost.storyUrl,
      matchScore: bestScore,
      matchedDbTitle: bestMatch?.title?.slice(0, 80),
      matched: bestScore >= 0.3,
    });
  }
  return results;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(60));
  console.log('SPRINT 8.8J — AUDITORÍA MBASIC.FACEBOOK.COM');
  console.log('═'.repeat(60));

  // ── FASE 0: Test sin autenticación ────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 0 — TEST HTTP SIN AUTENTICACIÓN');
  console.log('════════════════════════════════════════════════════════\n');

  for (const s of SOURCES) {
    const r = await testNoAuth(s.slug);
    if (r.error) {
      console.log(`  ${s.name}: ERROR ${r.error}`);
    } else {
      const auth = r.isLoginWall ? '🔒 LOGIN WALL' : '✅ ACCESIBLE';
      const posts = r.hasPostLinks ? `✅ post-links (${r.postLinkCount})` : '❌ sin post-links';
      console.log(`  ${s.name}: HTTP ${r.status} | ${auth} | ${posts} | body=${r.bodyLen} bytes`);
    }
  }

  // ── FASE 1: Playwright con sesión autenticada ──────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 1 — PLAYWRIGHT CON SESIÓN AUTENTICADA');
  console.log('════════════════════════════════════════════════════════\n');

  const browser = await chromium.launchPersistentContext(
    path.resolve(FB_PROFILE_DIR),
    { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const scrapeResults = {};

  for (const source of SOURCES) {
    console.log(`\n── ${source.name} ${'─'.repeat(40)}`);
    try {
      const r = await scrapeMbasic(page, source);
      scrapeResults[source.name] = r;

      if (r.isLoginWall) {
        console.log(`  ❌ LOGIN WALL (sesión no válida en mbasic)`);
        continue;
      }

      console.log(`  Título página:    ${r.pageTitle}`);
      console.log(`  Tiempo de carga:  ${r.elapsed}ms`);
      console.log(`  <article> count:  ${r.articleCount}`);
      console.log(`  div[data-ft]:     ${r.divDataFtCount}`);
      console.log(`  Post links total: ${r.postLinksCount}`);
      console.log(`  Story IDs únicos: ${r.storyIds.length}`);

      if (r.storyIds.length > 0) {
        console.log('\n  Story URLs encontradas:');
        r.storyIds.slice(0, 8).forEach(s => {
          console.log(`    id=${s.id}  url=${s.url.slice(0, 100)}`);
        });
      }

      if (r.postTexts.length > 0) {
        console.log(`\n  Posts con texto: ${r.postTexts.length}`);
        r.postTexts.slice(0, 5).forEach((p, i) => {
          console.log(`  [${i+1}] storyId=${p.storyId || 'NONE'}`);
          console.log(`       texto="${p.text.slice(0, 80)}"`);
        });
      }

      // Mostrar fragmento HTML para diagnóstico si hay pocos posts
      if (r.storyIds.length === 0 && r.articleCount === 0) {
        console.log('\n  HTML snippet (primeros 1500 chars):');
        console.log(r.htmlSnippet.slice(0, 1500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
      }

    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      scrapeResults[source.name] = { error: e.message };
    }
  }

  await browser.close();

  // ── FASE 2: Matching mbasic vs DB ─────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 2 — MATCHING MBASIC VS DB (10 posts por fuente)');
  console.log('════════════════════════════════════════════════════════\n');

  let totalPosts = 0, totalMatched = 0, totalWithStoryId = 0;
  let totalMatchedWithStoryId = 0;

  for (const source of SOURCES) {
    const r = scrapeResults[source.name];
    if (!r || r.isLoginWall || r.error) {
      console.log(`  ${source.name}: SALTADO (sin datos)`);
      continue;
    }
    if (!r.postTexts || r.postTexts.length === 0) {
      console.log(`  ${source.name}: 0 posts con texto extraídos de mbasic`);
      continue;
    }

    // Obtener posts recientes de DB para esta fuente
    const dbPosts = await q(`
      SELECT sp.title, sp.external_id
      FROM social_posts sp
      JOIN social_sources ss ON ss.id = sp.source_id
      WHERE ss.profile_url = $1 AND sp.platform = 'facebook'
      ORDER BY sp.captured_at DESC LIMIT 30
    `, [source.fbUrl]);

    const matches = await matchMbasicVsDB(r.postTexts, dbPosts);

    console.log(`\n── ${source.name} (mbasic=${r.postTexts.length} posts, db=${dbPosts.length} posts)`);
    for (const m of matches) {
      const icon = m.matched ? '✅' : '❌';
      const idIcon = m.storyId ? `id=${m.storyId}` : 'NO_ID';
      console.log(`  ${icon} [score=${m.matchScore.toFixed(2)} ${idIcon}]`);
      console.log(`     mbasic: "${m.mbasicText}"`);
      if (m.matched) console.log(`     db:     "${m.matchedDbTitle}"`);
    }

    const matched = matches.filter(m => m.matched).length;
    const withId = matches.filter(m => m.storyId).length;
    const matchedWithId = matches.filter(m => m.matched && m.storyId).length;

    totalPosts += matches.length;
    totalMatched += matched;
    totalWithStoryId += withId;
    totalMatchedWithStoryId += matchedWithId;

    console.log(`\n  Subtotal ${source.name}: ${matched}/${matches.length} matched, ${withId}/${matches.length} con storyId`);
  }

  // ── FASE 3: Métricas de éxito ─────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 3 — PORCENTAJE DE ÉXITO');
  console.log('════════════════════════════════════════════════════════\n');

  const pctMatch = totalPosts > 0 ? Math.round(totalMatched / totalPosts * 100) : 0;
  const pctId    = totalPosts > 0 ? Math.round(totalWithStoryId / totalPosts * 100) : 0;
  const pctBoth  = totalPosts > 0 ? Math.round(totalMatchedWithStoryId / totalPosts * 100) : 0;

  console.log(`  Posts analizados:           ${totalPosts}`);
  console.log(`  Matcheados en DB:           ${totalMatched} / ${totalPosts} (${pctMatch}%)`);
  console.log(`  Con story_fbid extraído:    ${totalWithStoryId} / ${totalPosts} (${pctId}%)`);
  console.log(`  Matcheados + con ID:        ${totalMatchedWithStoryId} / ${totalPosts} (${pctBoth}%)`);
  console.log('');
  console.log(`  Criterio de éxito (≥80%): ${pctBoth >= 80 ? '✅ CUMPLIDO' : pctBoth >= 50 ? '⚠ PARCIAL' : '❌ NO CUMPLIDO'}`);

  // ── FASE 4: Costo técnico ─────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('FASE 4 — COSTO TÉCNICO');
  console.log('════════════════════════════════════════════════════════\n');

  const tiempos = SOURCES.map(s => scrapeResults[s.name]?.elapsed).filter(Boolean);
  if (tiempos.length > 0) {
    const avg = Math.round(tiempos.reduce((a,b) => a+b, 0) / tiempos.length);
    const max = Math.max(...tiempos);
    const min = Math.min(...tiempos);
    console.log(`  Tiempo promedio por fuente: ${avg}ms`);
    console.log(`  Rango: ${min}ms – ${max}ms`);
    console.log(`  Tiempo adicional total (4 fuentes): ~${Math.round(avg * 4 / 1000)}s`);
    console.log(`  Requiere Playwright: SÍ (misma instancia reutilizable)`);
    console.log(`  Requiere cookies FB: ${Object.values(scrapeResults).some(r => !r.isLoginWall) ? 'SÍ (sesión persistente)' : 'NO DETERMINADO'}`);
  } else {
    console.log('  No hay datos de timing (todas las páginas fallaron)');
  }
}

main()
  .catch(e => { console.error('\nERROR FATAL:', e.message); process.exit(1); })
  .finally(() => pool.end());
