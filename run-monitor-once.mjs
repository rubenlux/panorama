#!/usr/bin/env node

/**
 * EJECUTAR MONITOR UNA SOLA VEZ
 * Con logging activo para rastrear detectStories()
 */

import dotenv from 'dotenv';
import { createPool } from 'generic-pool';
import pg from 'pg';

dotenv.config();

// Importar el código del monitor
import { runNewsMonitor } from './src/jobs/newsMonitor.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  EJECUTANDO NEWS MONITOR CON LOGGING INSTRUMENTAL              ║`);
  console.log(`║  Rastreando: d36fc24b-d390-4998-8d70-9781d8510066              ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  try {
    console.log(`[MONITOR] Iniciando ciclo completo...`);
    await runNewsMonitor();
    console.log(`[MONITOR] Ciclo completado`);
  } catch (e) {
    console.error(`[MONITOR] ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
