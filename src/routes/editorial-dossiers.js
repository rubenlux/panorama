import { Router } from 'express';
import { query } from './db.js';
import { chromium } from 'playwright';
import { logBrowserLifecycle } from '../services/browserLifecycleLogger.js';

const router = Router();

router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT e.*, 
       (SELECT json_agg(n.*) FROM news_articles n WHERE n.event_id = e.id) as articles
       FROM events e WHERE e.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  const { id } = req.params;
  let browser;
  let page;
  try {
    const result = await query(
      `SELECT e.*, 
       (SELECT json_agg(n.*) FROM news_articles n WHERE n.event_id = e.id) as articles
       FROM events e WHERE e.id = $1`,
      [id]
    );

    const event = result.rows[0];
    if (!event) return res.status(404).send('Event not found');

    const html = `<!DOCTYPE html><html><head>
<style>
  body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a202c; line-height: 1.6; }
  .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
  .headline { font-size: 28px; font-weight: 800; color: #2d3748; margin: 0; }
  .meta { color: #718096; font-size: 14px; margin-top: 8px; }
  .section { margin-bottom: 40px; }
  .section-title { font-size: 18px; font-weight: 700; color: #4a5568; text-transform: uppercase; letter-spacing: 0.05em; border-left: 4px solid #3182ce; padding-left: 12px; margin-bottom: 20px; }
  .article { margin-bottom: 25px; padding: 15px; background: #f7fafc; border-radius: 8px; }
  .article-title { font-weight: 700; font-size: 16px; margin-bottom: 6px; color: #2d3748; }
  .article-meta { font-size: 12px; color: #a0aec0; margin-bottom: 8px; }
  .content { font-size: 14px; white-space: pre-wrap; color: #4a5568; }
  .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; text-align: center; }
</style>
</head><body>
<div class="header">
  <h1 class="headline">${event.headline}</h1>
  <div class="meta">Panorama Intelligence Report · Event #${id} · ${new Date().toLocaleDateString('es-AR')}</div>
</div>
<div class="section">
  <div class="section-title">Contexto del Evento</div>
  <p>${event.summary || 'Sin resumen disponible.'}</p>
</div>
${event.articles ? `
<div class="section">
  <div class="section-title">Artículos Relacionados (${event.articles.length})</div>
  ${event.articles.map(a => `
    <div class="article">
      <div class="article-title">${a.title}</div>
      <div class="article-meta">${a.source_name || 'Desconocido'} · ${new Date(a.published_at).toLocaleString('es-AR')}</div>
      <div class="content">${(a.content || '').slice(0, 800)}${(a.content || '').length > 800 ? '...' : ''}</div>
    </div>
  `).join('')}` : ''}

  <div class="footer">Generado por Panorama CMS · ${new Date().toLocaleString('es-AR')} · Confidencial</div>
</div></body></html>`;

    browser = await chromium.launch({ headless: true });
    logBrowserLifecycle('BROWSER_CREATED', 'PDF Export');
    page = await browser.newPage();
    logBrowserLifecycle('PAGE_CREATED', 'PDF Export');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', bottom: '0', left: '0', right: '0' },
    });

    const slug = event.headline.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="dossier-${id}-${slug}.pdf"`);
    res.send(pdf);
  } catch (e) {
    next(e);
  } finally {
    if (page) {
      logBrowserLifecycle('PAGE_CLOSED', 'PDF Export');
      await page.close().catch(() => {});
    }
    if (browser) {
      logBrowserLifecycle('BROWSER_CLOSED', 'PDF Export');
      await browser.close().catch(() => {});
    }
  }
});

export default router;
