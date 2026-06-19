/**
 * Sprint 8.8I — Auditoría de story_fbid en datos embebidos de Facebook
 * Investiga qué identificadores de post están disponibles sin depender del DOM walk-up.
 * NO modifica nada. Solo inspecciona.
 * Ejecutar: node scripts/audit_fb_story_id.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import 'dotenv/config';

const FB_PROFILE_DIR = process.env.FB_PROFILE_DIR || './facebook-profile';
const POST_BODY_SEL  = 'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl';
const CHROME_SEL     = '[role="navigation"],[role="banner"],[role="dialog"],[role="complementary"],[aria-modal="true"],[role="article"]';

const TARGETS = [
  { name: 'Diario Olé', url: 'https://www.facebook.com/diarioole',      handle: 'diarioole' },
  { name: 'TN',         url: 'https://www.facebook.com/todonoticias',   handle: 'todonoticias' },
  { name: 'TyC Sports', url: 'https://www.facebook.com/tycsports',      handle: 'tycsports' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNoise(text) {
  const lines = text.split('\n');
  if (lines.filter(l => l.trim().length <= 1).length > lines.length * 0.3) return true;
  if (/^(Detalles|Siempre abierto|Ver todas las|Fotos\b|Publicaciones\b|Reels\b|Destacados|Información|Transparencia)/.test(text)) return true;
  if (/^(Datos personales|Facebook\nFacebook|Ver más comentarios)/.test(text)) return true;
  if (/\n(Canal|Página|Grupo)\s*·\s*[\d]/.test(text)) return true;
  if (/\n\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(text)) return true;
  if (/^[a-zA-Z0-9+/]{2,25}\.(com|me|net|ar|org)/.test(text)) return true;
  if (/^m\.me/.test(text)) return true;
  return false;
}

// ── FASE 1: Buscar datos embebidos en el HTML de la página ───────────────────

async function scanEmbeddedData(page, target) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FUENTE: ${target.name}`);
  console.log('═'.repeat(60));

  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Scroll para cargar el feed
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1800);
  }

  // ── ESTRATEGIA A: data-ft en contenedores cercanos ──────────────────────
  console.log('\n── ESTRATEGIA A: data-ft ───────────────────────────────────');
  const dataFtResults = await page.evaluate(({ sel, chrome, noiseCheck }) => {
    // Obtener posts reales del feed (con isNoise aplicado)
    const bodies = [...document.querySelectorAll(sel)]
      .filter(el => !el.closest(chrome))
      .filter(el => {
        const txt = (el.innerText || '').trim();
        if (txt.length < 30) return false;
        if (txt.startsWith('Notificaciones') || txt.startsWith('Destacados') ||
            txt.startsWith('Datos personales') || txt.startsWith('Siempre abierto') ||
            txt.startsWith('Información') || txt.startsWith('Facebook') ||
            /^[a-zA-Z0-9]+$/.test(txt.split('\n')[0])) return false;
        return true;
      })
      .slice(0, 10);

    const results = [];
    for (const body of bodies) {
      const firstLine = (body.innerText || '').split('\n')[0].trim().slice(0, 80);
      const entry = { firstLine, dataFt: null, dataFtSource: null, storyFbid: null, pageId: null };

      // Buscar data-ft en el body mismo y sus ancestros (máx 20 niveles)
      let cur = body;
      for (let d = 0; d < 20 && cur; d++) {
        const ft = cur.getAttribute('data-ft');
        if (ft) {
          try {
            const parsed = JSON.parse(ft);
            entry.dataFt = parsed;
            entry.dataFtSource = `depth ${d}, tag=${cur.tagName}`;
            entry.storyFbid = parsed.story_fbid || parsed.mf_story_key || null;
            entry.pageId = parsed.content_owner_id_new || parsed.page_id || null;
          } catch(e) { entry.dataFt = ft.slice(0, 100); }
          break;
        }
        cur = cur.parentElement;
      }
      results.push(entry);
    }
    return results;
  }, { sel: POST_BODY_SEL, chrome: CHROME_SEL });

  for (const r of dataFtResults) {
    if (r.storyFbid) {
      console.log(`  ✅ "${r.firstLine.slice(0,60)}"`);
      console.log(`     story_fbid=${r.storyFbid}  page_id=${r.pageId}  source=${r.dataFtSource}`);
      console.log(`     URL: https://www.facebook.com/story.php?story_fbid=${r.storyFbid}&id=${r.pageId}`);
    } else if (r.dataFt) {
      console.log(`  ⚠  "${r.firstLine.slice(0,60)}"`);
      console.log(`     data-ft encontrado pero sin story_fbid: ${JSON.stringify(r.dataFt).slice(0, 120)}`);
    } else {
      console.log(`  ❌ "${r.firstLine.slice(0,60)}" — sin data-ft`);
    }
  }

  // ── ESTRATEGIA B: Scraping de scripts inline con story_fbid ──────────────
  console.log('\n── ESTRATEGIA B: scripts inline ────────────────────────────');
  const scriptResults = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script:not([src])')];
    const hits = [];

    for (const script of scripts) {
      const text = script.textContent || '';
      // Buscar story_fbid en JSON inline
      const matches = [...text.matchAll(/"story_fbid"\s*:\s*"?(\d+)"?/g)];
      if (matches.length > 0) {
        hits.push({
          type: 'story_fbid_in_script',
          ids: matches.slice(0, 5).map(m => m[1]),
          snippet: text.slice(Math.max(0, text.indexOf(matches[0][0]) - 30), text.indexOf(matches[0][0]) + 80),
        });
      }

      // Buscar feedback_id (reels tienen este formato)
      const feedbackMatches = [...text.matchAll(/"feedback_id"\s*:\s*"([^"]+)"/g)];
      if (feedbackMatches.length > 0 && hits.length < 10) {
        hits.push({
          type: 'feedback_id_in_script',
          ids: feedbackMatches.slice(0, 3).map(m => m[1]),
        });
      }
    }

    return { total_scripts: scripts.length, hits: hits.slice(0, 5) };
  });

  console.log(`  Scripts totales: ${scriptResults.total_scripts}`);
  if (scriptResults.hits.length === 0) {
    console.log('  ❌ No se encontraron story_fbid ni feedback_id en scripts inline');
  } else {
    for (const h of scriptResults.hits) {
      console.log(`  ✅ ${h.type}: [${h.ids.join(', ')}]`);
      if (h.snippet) console.log(`     snippet: ...${h.snippet}...`);
    }
  }

  // ── ESTRATEGIA C: aria-labels y data attributes en post cards ────────────
  console.log('\n── ESTRATEGIA C: aria-label / data-* en botones de post ───');
  const ariaResults = await page.evaluate(({ sel, chrome }) => {
    const bodies = [...document.querySelectorAll(sel)]
      .filter(el => !el.closest(chrome))
      .filter(el => (el.innerText || '').trim().length >= 30)
      .filter(el => {
        const t = (el.innerText || '').trim();
        return !t.startsWith('Notificaciones') && !t.startsWith('Destacados') &&
               !t.startsWith('Datos personales') && !t.startsWith('Siempre abierto') &&
               !t.startsWith('Facebook') && !t.startsWith('Información');
      })
      .slice(0, 5);

    return bodies.map(body => {
      const firstLine = (body.innerText || '').split('\n')[0].trim().slice(0, 70);

      // Buscar en el contenedor inmediato del post (hasta 8 niveles)
      let cur = body.parentElement;
      const dataAttrs = [];
      for (let d = 0; d < 10 && cur; d++) {
        if (cur.querySelectorAll(sel).length > 1) break;

        // Recolectar todos los data-* que podrían contener IDs
        const attrs = [...cur.attributes || []].filter(a => a.name.startsWith('data-'));
        if (attrs.length) {
          dataAttrs.push({ depth: d, attrs: attrs.map(a => ({ name: a.name, val: a.value.slice(0, 100) })) });
        }

        // Buscar time[datetime] → parent <a> href
        const timeLink = [...cur.querySelectorAll('a[href]')].find(a => a.querySelector('time'));
        if (timeLink) {
          dataAttrs.push({ depth: d, timeHref: timeLink.href, timeText: timeLink.querySelector('time')?.getAttribute('datetime') });
        }

        cur = cur.parentElement;
      }

      return { firstLine, dataAttrs };
    });
  }, { sel: POST_BODY_SEL, chrome: CHROME_SEL });

  for (const r of ariaResults) {
    console.log(`\n  Post: "${r.firstLine}"`);
    if (r.dataAttrs.length === 0) {
      console.log('  → Sin data-* relevantes en el contenedor del post');
    } else {
      for (const da of r.dataAttrs) {
        if (da.timeHref) {
          console.log(`  → depth=${da.depth} TIME_HREF: ${da.timeHref}`);
        } else {
          for (const a of da.attrs) {
            console.log(`  → depth=${da.depth} ${a.name}: ${a.val}`);
          }
        }
      }
    }
  }

  // ── ESTRATEGIA D: Buscar story_fbid en __bbox / __relay state ────────────
  console.log('\n── ESTRATEGIA D: window.__bbox / __relay / __INITIAL_STATE ─');
  const bboxResult = await page.evaluate(() => {
    const findings = [];

    // __bbox
    try {
      if (typeof window.__bbox !== 'undefined') {
        findings.push({ key: '__bbox', type: typeof window.__bbox, keys: Object.keys(window.__bbox).slice(0, 10) });
      }
    } catch(e) {}

    // __INITIAL_STATE__
    try {
      if (typeof window.__INITIAL_STATE__ !== 'undefined') {
        findings.push({ key: '__INITIAL_STATE__', type: 'object', available: true });
      }
    } catch(e) {}

    // Relay internals
    try {
      if (typeof window.__relay_internal__ !== 'undefined') {
        findings.push({ key: '__relay_internal__', type: typeof window.__relay_internal__ });
      }
    } catch(e) {}

    // Buscar en todos los scripts por __bbox
    const scripts = [...document.querySelectorAll('script:not([src])')];
    const bboxScripts = scripts.filter(s => s.textContent.includes('"story_fbid"') && s.textContent.includes('"page_id"'));
    if (bboxScripts.length) {
      findings.push({ key: 'scripts_con_story_fbid_y_page_id', count: bboxScripts.length });
      // Extraer un ejemplo con contexto completo
      const sample = bboxScripts[0].textContent;
      const match = sample.match(/"story_fbid"\s*:\s*"?(\d+)"?.{0,200}"page_id"\s*:\s*"?(\d+)"?/);
      if (match) findings.push({ key: 'ejemplo_story+page', story_fbid: match[1], page_id: match[2] });
    }

    return findings;
  });

  if (bboxResult.length === 0) {
    console.log('  ❌ Sin __bbox, __INITIAL_STATE__ ni relay state detectados');
  } else {
    for (const b of bboxResult) console.log(`  ✅ ${b.key}:`, JSON.stringify(b).slice(0, 200));
  }

  // ── ESTRATEGIA E: Correlacionar texto → story_fbid desde scripts ─────────
  console.log('\n── ESTRATEGIA E: correlación texto↔story_fbid desde scripts ─');
  const correlResult = await page.evaluate(({ sel, chrome }) => {
    // Extraer los primeros 5 cuerpos de posts reales
    const bodies = [...document.querySelectorAll(sel)]
      .filter(el => !el.closest(chrome))
      .filter(el => {
        const t = (el.innerText || '').trim();
        return t.length >= 30 && !t.startsWith('Notificaciones') && !t.startsWith('Destacados') &&
               !t.startsWith('Datos personales') && !t.startsWith('Siempre abierto') &&
               !t.startsWith('Facebook') && !t.startsWith('Información');
      })
      .slice(0, 5);

    // Extraer todos los story_fbid de los scripts inline
    const scripts = [...document.querySelectorAll('script:not([src])')];
    const allStoryFbids = new Map(); // fbid → surrounding text snippet
    for (const script of scripts) {
      const text = script.textContent || '';
      for (const match of text.matchAll(/"story_fbid"\s*:\s*"?(\d+)"?/g)) {
        const pos = match.index;
        const snippet = text.slice(Math.max(0, pos - 200), pos + 200);
        if (!allStoryFbids.has(match[1])) {
          allStoryFbids.set(match[1], snippet);
        }
      }
    }

    const correlations = [];
    for (const body of bodies) {
      const firstLine = (body.innerText || '').split('\n')[0].trim().slice(0, 60);
      const words = firstLine.toLowerCase().split(/\s+/).filter(w => w.length > 4);

      // Buscar qué fbid tiene texto cercano que coincida con palabras del post
      let bestMatch = null, bestScore = 0;
      for (const [fbid, ctx] of allStoryFbids) {
        const ctxLow = ctx.toLowerCase();
        const score = words.filter(w => ctxLow.includes(w)).length;
        if (score > bestScore) { bestScore = score; bestMatch = { fbid, ctx: ctx.slice(0, 150) }; }
      }

      correlations.push({ firstLine, totalFbids: allStoryFbids.size, bestMatch, bestScore });
    }

    return correlations;
  }, { sel: POST_BODY_SEL, chrome: CHROME_SEL });

  if (correlResult.length === 0) {
    console.log('  ❌ Sin datos para correlacionar');
  } else {
    console.log(`  Total story_fbids en scripts: ${correlResult[0]?.totalFbids ?? 0}`);
    for (const c of correlResult) {
      if (c.bestMatch && c.bestScore >= 2) {
        console.log(`  ✅ "${c.firstLine}"`);
        console.log(`     fbid=${c.bestMatch.fbid}  score=${c.bestScore} palabras coincidentes`);
        console.log(`     ctx: ...${c.bestMatch.ctx.slice(0, 100)}...`);
      } else {
        console.log(`  ❌ "${c.firstLine}" — sin match confiable (best score=${c.bestScore})`);
      }
    }
  }

  return { target, dataFtResults, scriptResults, ariaResults, bboxResult, correlResult };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('SPRINT 8.8I — AUDITORÍA story_fbid EN FACEBOOK');
  console.log('════════════════════════════════════════════════════════');

  const browser = await chromium.launchPersistentContext(
    path.resolve(FB_PROFILE_DIR),
    {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-419',
    }
  );

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const allResults = [];
  for (const target of TARGETS) {
    try {
      const result = await scanEmbeddedData(page, target);
      allResults.push(result);
    } catch(e) {
      console.log(`\nERROR en ${target.name}: ${e.message}`);
    }
  }

  await browser.close();

  // ── RESUMEN FINAL ──────────────────────────────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('RESUMEN: VIABILIDAD DE story_fbid');
  console.log('════════════════════════════════════════════════════════\n');

  let totalPosts = 0, totalConFbid = 0;
  for (const r of allResults) {
    const con = r.dataFtResults.filter(x => x.storyFbid).length;
    console.log(`${r.target.name}: ${con}/${r.dataFtResults.length} posts con story_fbid via data-ft`);
    totalPosts += r.dataFtResults.length;
    totalConFbid += con;
  }
  console.log(`\nTotal: ${totalConFbid}/${totalPosts} (${totalPosts > 0 ? Math.round(totalConFbid/totalPosts*100) : 0}%)`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
