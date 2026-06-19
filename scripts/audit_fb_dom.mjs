/**
 * Sprint 8.8I — Auditoría DOM Facebook: localización de permalinks
 * Mapea la estructura DOM alrededor del contenedor Stylex para cada post.
 * NO modifica nada. Solo inspecciona.
 * Ejecutar: node scripts/audit_fb_dom.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import 'dotenv/config';

const FB_PROFILE_DIR = process.env.FB_PROFILE_DIR || './facebook-profile';
const POST_BODY_SEL = 'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl';
const VALID_POST_RE = /\/(posts\/\w|reel\/\d|videos\/\d)/;

// Páginas a inspeccionar: Diario Olé (tiene reels) y TN (link posts)
const TARGETS = [
  { name: 'Diario Olé', url: 'https://www.facebook.com/diarioole' },
  { name: 'TN',         url: 'https://www.facebook.com/todonoticias' },
];

async function inspectPage(page, target) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`INSPECCIONANDO: ${target.name}`);
  console.log(`URL: ${target.url}`);
  console.log('═'.repeat(60));

  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);

  // Cerrar cualquier diálogo/overlay
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Scrollear 3 veces para cargar el feed real
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
  }

  const report = await page.evaluate(({ sel, validRe }) => {
    const VALID_POST = new RegExp(validRe);

    // Mismo filtro CHROME que el scraper de producción
    const CHROME = '[role="navigation"],[role="banner"],[role="dialog"],[role="complementary"],[aria-modal="true"],[role="article"]';

    // Tomar los primeros 4 contenedores Stylex, excluyendo chrome
    const bodies = [...document.querySelectorAll(sel)]
      .filter(el => !el.closest(CHROME))
      .filter(el => {
        const txt = (el.innerText || '').trim();
        // Filtrar el panel de notificaciones
        if (txt.startsWith('Notificaciones')) return false;
        return txt.length >= 30;
      })
      .slice(0, 4);

    if (!bodies.length) return [{ error: 'No se encontraron contenedores Stylex' }];

    return bodies.map((body, idx) => {
      const firstLine = (body.innerText || '').split('\n')[0].trim().slice(0, 80);
      const result = {
        idx,
        firstLine,
        walkUp: [],
        timeElements: [],
        innerLinks: [],
        verdict: null,
      };

      // ── PARTE A: Walk-up desde el Stylex body ──────────────────────────
      // Para cada nivel de ancestro, registrar:
      // - qué permalinks encuentra (href patterns)
      // - cuántos posts body contiene (para detectar ancestro común)
      let cur = body.parentElement;
      for (let depth = 0; depth < 30 && cur; depth++) {
        const bodyCount = cur.querySelectorAll(sel).length;

        // Buscar links válidos (reel, posts, videos) en ESTE nodo y sus hijos
        const validLinks = [...cur.querySelectorAll('a[href]')]
          .map(a => a.href)
          .filter(h => VALID_POST.test(h));

        // También links de timestamp: <a> que contiene un <time>
        const timeLinks = [...cur.querySelectorAll('a[href]')]
          .filter(a => a.querySelector('time'))
          .map(a => ({ href: a.href, timeText: a.querySelector('time')?.textContent?.trim() }));

        const entry = { depth, bodyCount, validLinksCount: validLinks.length, timeLinks };
        if (validLinks.length > 0) entry.validLinks = validLinks.slice(0, 3);

        result.walkUp.push(entry);

        // Parar si ya llegamos a un ancestro común (bodyCount > 1) con al menos 1 link válido
        if (bodyCount > 1 && validLinks.length > 0) {
          entry.note = '⚠ ANCESTRO COMÚN — múltiples posts aquí';
          break;
        }

        // Si encontramos link válido en nodo que solo contiene ESTE post
        if (bodyCount <= 1 && validLinks.length > 0 && !result.verdict) {
          result.verdict = { depth, url: validLinks[0], type: 'valid_link_in_single_post_container' };
        }

        cur = cur.parentElement;
      }

      // ── PARTE B: Links de timestamp en el walk-up ──────────────────────
      // Buscar <a> que envuelve <time> más cercano al post body
      let cur2 = body.parentElement;
      for (let depth = 0; depth < 20 && cur2; depth++) {
        const timeAnchorInThisLevel = [...cur2.querySelectorAll('a[href]')]
          .filter(a => a.querySelector('time') && VALID_POST.test(a.href))
          .map(a => ({ depth, href: a.href, time: a.querySelector('time')?.getAttribute('datetime') }));

        if (timeAnchorInThisLevel.length > 0) {
          // Verificar si es en un contenedor de un solo post
          const bodiesHere = cur2.querySelectorAll(sel).length;
          result.timeElements.push({ depth, bodiesInContainer: bodiesHere, links: timeAnchorInThisLevel });
          if (bodiesHere <= 1) {
            if (!result.verdict) result.verdict = { depth, url: timeAnchorInThisLevel[0].href, type: 'time_anchor_single_container' };
            break;
          }
        }
        cur2 = cur2.parentElement;
      }

      // ── PARTE C: Links DENTRO del body (descendentes) ──────────────────
      const innerValidLinks = [...body.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(h => VALID_POST.test(h))
        .slice(0, 3);
      result.innerLinks = innerValidLinks;

      // ── PARTE D: Profundidad del contenedor inmediato (antes de ancestro común)
      let cur3 = body.parentElement;
      for (let depth = 0; depth < 30 && cur3; depth++) {
        const bodiesHere = cur3.querySelectorAll(sel).length;
        if (bodiesHere > 1) {
          result.ancestorCommonDepth = depth;
          break;
        }
        cur3 = cur3.parentElement;
      }

      return result;
    });
  }, { sel: POST_BODY_SEL, validRe: VALID_POST_RE.source });

  // Imprimir reporte estructurado
  for (const r of report) {
    if (r.error) { console.log('\n  ERROR:', r.error); continue; }

    console.log(`\n── POST ${r.idx + 1}: "${r.firstLine}"`);
    console.log(`   Links dentro del body (descendentes): ${r.innerLinks.length ? r.innerLinks.join(', ') : 'ninguno'}`);
    console.log(`   Ancestro común aparece a profundidad: ${r.ancestorCommonDepth ?? 'no detectado'}`);

    if (r.verdict) {
      console.log(`\n   ✅ PERMALINK ENCONTRADO (depth ${r.verdict.depth}):`);
      console.log(`      ${r.verdict.url}`);
      console.log(`      Tipo: ${r.verdict.type}`);
    } else {
      console.log('\n   ❌ Sin permalink fiable detectado');
    }

    console.log('\n   Walk-up:');
    for (const w of r.walkUp) {
      const note = w.note ? ` ← ${w.note}` : '';
      const links = w.validLinks ? `  links=[${w.validLinks.map(u => u.split('/').slice(-2).join('/')).join(', ')}]` : '';
      const timeL = w.timeLinks?.length ? `  ⏱️ time-anchors=${w.timeLinks.length}` : '';
      console.log(`     depth=${w.depth}  bodies=${w.bodyCount}  valid=${w.validLinksCount}${links}${timeL}${note}`);
    }

    if (r.timeElements.length) {
      console.log('\n   Time-anchor links:');
      for (const t of r.timeElements) {
        console.log(`     depth=${t.depth}  bodies-in-container=${t.bodiesInContainer}`);
        for (const l of t.links) {
          console.log(`       ${l.href}  datetime=${l.time}`);
        }
      }
    }
  }
}

async function main() {
  const browser = await chromium.launchPersistentContext(
    path.resolve(FB_PROFILE_DIR),
    { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  );

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  for (const target of TARGETS) {
    try {
      await inspectPage(page, target);
    } catch (e) {
      console.log(`\nERROR en ${target.name}:`, e.message);
    }
  }

  await browser.close();

  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('AUDITORÍA COMPLETA');
  console.log('════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
