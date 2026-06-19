/**
 * Sprint 8.8K — Auditoría: ¿article contiene permalinks de Facebook?
 * Testea www.facebook.com (no mbasic). Solo lectura, no modifica nada.
 * Ejecutar: node scripts/audit_article_sel.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import 'dotenv/config';

const FB_PROFILE_DIR = process.env.FB_PROFILE_DIR || './facebook-profile';

const POST_BODY_SEL = 'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl';

// misma regex que el scraper actual
const VALID_POST = /\/(posts\/\w|reel\/\d|videos\/\d)/;
// pfbid es la variante moderna del permalink
const PFBID_RE   = /\/posts\/pfbid[A-Za-z0-9]+/;

const TARGETS = [
  { name: 'Diario Olé',       url: 'https://www.facebook.com/diarioole'       },
  { name: 'TN',               url: 'https://www.facebook.com/todonoticias'    },
  { name: 'Noticias Formosa', url: 'https://www.facebook.com/NoticiasFormosa' },
];

async function auditPage(page, target) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`AUDITANDO: ${target.name} — ${target.url}`);
  console.log('═'.repeat(60));

  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Scrollear 5 veces para cargar suficientes posts
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(2000);
  }

  const result = await page.evaluate(({ postBodySel, pfbidRe, validPostRe }) => {
    const PFBID   = new RegExp(pfbidRe);
    const VALID   = new RegExp(validPostRe);
    const CHROME  = '[role="navigation"],[role="banner"],[role="dialog"],[role="complementary"],[aria-modal="true"]';
    // NOTA: deliberadamente NO excluir [role="article"] aquí para medir ambas variantes

    // ── Estadísticas de elementos ──────────────────────────────────────────

    // 1. HTML <article> elements (elemento tag, independiente de atributo role)
    const htmlArticles = [...document.querySelectorAll('article')];

    // 2. Elements with role="article" attribute (puede ser <div role="article">)
    const roleArticleEls = [...document.querySelectorAll('[role="article"]')];

    // 3. <article> elements WITHOUT role="article" (los que no son bloqueados por el CHROME filter)
    const pureHtmlArticles = [...document.querySelectorAll('article:not([role="article"])')];

    // 4. Stylex body selector (método actual)
    const stylexBodies = [...document.querySelectorAll(postBodySel)];

    // ── Muestreo de article links ──────────────────────────────────────────

    const articlesToInspect = htmlArticles.filter(a => !a.closest(CHROME));

    const articleData = articlesToInspect.slice(0, 30).map((art, idx) => {
      const text = (art.innerText || '').trim();
      const firstLine = text.split('\n')[0].slice(0, 80);

      // Buscar todos los links de post dentro del article
      const allLinks = [...art.querySelectorAll('a[href]')].map(a => a.href);
      const postLinks = allLinks.filter(h => VALID.test(h) && !h.includes('comment_id='));
      const pfbidLinks = allLinks.filter(h => PFBID.test(h));
      const reelLinks  = allLinks.filter(h => h.includes('/reel/'));
      const videoLinks = allLinks.filter(h => h.includes('/videos/'));

      // Buscar time element (para timestamp)
      const timeEl = art.querySelector('time');
      const timeAnchor = art.querySelector('a[href]:has(time)');
      const timeHref = timeAnchor?.href || '';

      // ¿Tiene role="article" el propio elemento?
      const hasRoleAttr = art.hasAttribute('role') && art.getAttribute('role') === 'article';

      // Contar Stylex bodies DENTRO de este article
      const innerStylexCount = art.querySelectorAll(postBodySel).length;

      return {
        idx,
        hasRoleAttr,
        textLen: text.length,
        firstLine,
        allLinksCount: allLinks.length,
        postLinksCount: postLinks.length,
        pfbidLinks: pfbidLinks.slice(0, 3),
        reelLinks:  reelLinks.slice(0, 3),
        videoLinks: videoLinks.slice(0, 3),
        firstPostLink: postLinks[0] || null,
        timeHref,
        innerStylexCount,
        isNested: art.closest('article') !== null && art.closest('article') !== art,
      };
    });

    // ── Para los articles con permalink, clasificar por tipo ─────────────
    const withPermalink  = articleData.filter(a => a.firstPostLink);
    const withPfbid      = articleData.filter(a => a.pfbidLinks.length > 0);
    const withReel       = articleData.filter(a => a.reelLinks.length > 0);
    const withVideo      = articleData.filter(a => a.videoLinks.length > 0);
    const withTimeHref   = articleData.filter(a => a.timeHref && VALID.test(a.timeHref));
    const withAnyLink    = articleData.filter(a => a.postLinksCount > 0 || a.pfbidLinks.length > 0);

    // ── Comparativa Stylex vs Article ─────────────────────────────────────
    // Para cada Stylex body, ¿cuántos están DENTRO de un article?
    const stylexInsideArticle = stylexBodies.filter(b => b.closest('article'));
    const stylexOutsideArticle = stylexBodies.filter(b => !b.closest('article'));

    return {
      counts: {
        htmlArticles:       htmlArticles.length,
        roleArticleEls:     roleArticleEls.length,
        pureHtmlArticles:   pureHtmlArticles.length,
        stylexBodies:       stylexBodies.length,
        stylexInsideArt:    stylexInsideArticle.length,
        stylexOutsideArt:   stylexOutsideArticle.length,
      },
      articleSample: articleData.slice(0, 20),
      summary: {
        inspected:       articlesToInspect.length,
        withPermalink:   withPermalink.length,
        withPfbid:       withPfbid.length,
        withReel:        withReel.length,
        withVideo:       withVideo.length,
        withTimeHref:    withTimeHref.length,
        withAnyLink:     withAnyLink.length,
        pct: articlesToInspect.length > 0
          ? Math.round(withAnyLink.length / Math.min(articlesToInspect.length, 30) * 100)
          : 0,
      },
    };
  }, { postBodySel: POST_BODY_SEL, pfbidRe: PFBID_RE.source, validPostRe: VALID_POST.source });

  // ── Imprimir resultados ─────────────────────────────────────────────────

  console.log('\n── FASE 1: Conteo de elementos ────────────────────────────');
  const c = result.counts;
  console.log(`  HTML <article> tag:          ${c.htmlArticles}`);
  console.log(`  [role="article"] attribute:  ${c.roleArticleEls}`);
  console.log(`  <article>:not([role]):       ${c.pureHtmlArticles}`);
  console.log(`  Stylex bodies (método actual): ${c.stylexBodies}`);
  console.log(`    → dentro de <article>:     ${c.stylexInsideArt}`);
  console.log(`    → fuera de <article>:      ${c.stylexOutsideArt}`);

  console.log('\n── FASE 2: Links dentro de <article> ──────────────────────');
  const s = result.summary;
  console.log(`  Articles inspeccionados:     ${s.inspected}`);
  console.log(`  Con cualquier post-link:     ${s.withAnyLink}  (${s.pct}%)`);
  console.log(`  Con /posts/pfbid...:         ${s.withPfbid}`);
  console.log(`  Con /reel/:                  ${s.withReel}`);
  console.log(`  Con /videos/:                ${s.withVideo}`);
  console.log(`  Con time-anchor permalink:   ${s.withTimeHref}`);

  console.log('\n── FASE 3: Muestra de 20 articles ─────────────────────────');
  let correctoCount = 0, sinLinkCount = 0, nestedCount = 0;

  for (const a of result.articleSample) {
    const roleTag  = a.hasRoleAttr ? ' [role=article]' : '';
    const nestTag  = a.isNested   ? ' NESTED' : '';
    const bestLink = a.pfbidLinks[0] || a.reelLinks[0] || a.videoLinks[0] || a.firstPostLink;
    const linkType = a.pfbidLinks.length > 0 ? 'pfbid' :
                     a.reelLinks.length > 0  ? 'reel'  :
                     a.videoLinks.length > 0 ? 'video' :
                     a.firstPostLink         ? 'legacy': 'NONE';

    if (a.isNested) { nestedCount++; continue; }

    if (bestLink) {
      correctoCount++;
      console.log(`  [${a.idx}]${roleTag}${nestTag} ✅ ${linkType}`);
      console.log(`       texto="${a.firstLine}"`);
      console.log(`       url=${bestLink.slice(0, 100)}`);
    } else {
      sinLinkCount++;
      console.log(`  [${a.idx}]${roleTag}${nestTag} ❌ SIN LINK`);
      console.log(`       texto="${a.firstLine}" (${a.textLen} chars)`);
    }
  }

  console.log(`\n  RESULTADO: ✅ ${correctoCount} con permalink | ❌ ${sinLinkCount} sin permalink | ⏭ ${nestedCount} nested`);
  const total = correctoCount + sinLinkCount;
  const pct   = total > 0 ? Math.round(correctoCount / total * 100) : 0;
  console.log(`  PORCENTAJE: ${pct}% de articles no-nested tienen permalink`);

  // Mostrar URLs sample para verificación manual
  const sampleWithLinks = result.articleSample.filter(a => !a.isNested && (a.pfbidLinks.length > 0 || a.reelLinks.length > 0 || a.firstPostLink));
  if (sampleWithLinks.length > 0) {
    console.log('\n── URLs para verificación manual ───────────────────────────');
    sampleWithLinks.slice(0, 10).forEach(a => {
      const url = a.pfbidLinks[0] || a.reelLinks[0] || a.firstPostLink;
      console.log(`  "${a.firstLine.slice(0,60)}"`.padEnd(65));
      console.log(`  → ${url}`);
    });
  }

  return result;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('SPRINT 8.8K — AUDITORÍA article vs Stylex en Facebook');
  console.log('═'.repeat(60));

  const browser = await chromium.launchPersistentContext(
    path.resolve(FB_PROFILE_DIR),
    {
      headless: true,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    }
  );

  await browser.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const allResults = {};

  for (const target of TARGETS) {
    try {
      allResults[target.name] = await auditPage(page, target);
    } catch (e) {
      console.log(`\nERROR en ${target.name}: ${e.message}`);
    }
  }

  await browser.close();

  // ── FASE 5: Resumen comparativo ────────────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('RESUMEN COMPARATIVO — article vs Stylex');
  console.log('════════════════════════════════════════════════════════\n');

  for (const [name, r] of Object.entries(allResults)) {
    const c = r.counts;
    const s = r.summary;
    console.log(`  ${name}:`);
    console.log(`    <article> HTML:    ${c.htmlArticles}  (${s.pct}% con permalink)`);
    console.log(`    Stylex bodies:     ${c.stylexBodies}  (0% con permalink - método actual)`);
    console.log(`    Stylex en article: ${c.stylexInsideArt} / ${c.stylexBodies}`);
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log('CONCLUSIÓN');
  console.log('═'.repeat(60));

  const allPcts = Object.values(allResults).map(r => r.summary.pct);
  const avgPct = allPcts.length > 0 ? Math.round(allPcts.reduce((a,b)=>a+b,0)/allPcts.length) : 0;

  console.log(`\n  Porcentaje promedio de <article> con permalink: ${avgPct}%`);
  if (avgPct >= 80) {
    console.log('  → ✅ CRITERIO CUMPLIDO (≥80%) — article es viable para extraer permalinks');
  } else if (avgPct >= 50) {
    console.log('  → ⚠ PARCIAL — article extrae algunos permalinks pero no suficientes');
  } else {
    console.log('  → ❌ CRITERIO NO CUMPLIDO (<50%) — article no resuelve el problema');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
