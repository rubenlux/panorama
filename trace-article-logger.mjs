/**
 * ARTICLE TRACER - Logger centralizado
 *
 * Registra CADA paso de un artículo específico desde discovery hasta story_cluster_articles
 *
 * Uso:
 * import { traceArticle } from './trace-article-logger.mjs';
 * traceArticle(articleId, 'DISCOVERY', { url: '...', score: 45 });
 * traceArticle(articleId, 'INSERT_MONITORED', { id: '...', title: '...' });
 */

import fs from 'fs';
import path from 'path';

const TRACE_ARTICLE_ID = 'd36fc24b-d390-4998-8d70-9781d8510066';
const LOG_FILE = path.join(process.cwd(), 'trace-article-complete.log');

// Limpiar log anterior
if (fs.existsSync(LOG_FILE)) {
  fs.unlinkSync(LOG_FILE);
}

export function traceArticle(articleId, stage, details) {
  // Solo registrar si es el artículo que estamos trazando
  if (articleId !== TRACE_ARTICLE_ID) return;

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${stage.padEnd(25)}] ${JSON.stringify(details)}\n`;

  fs.appendFileSync(LOG_FILE, line);
  console.log(`[TRACE] ${stage} → ${JSON.stringify(details)}`);
}

export function printTraceLog() {
  if (fs.existsSync(LOG_FILE)) {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    console.log('\n' + content);
  }
}
