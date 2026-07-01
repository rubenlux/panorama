#!/usr/bin/env node

import dotenv from 'dotenv';
import { runNewsMonitor } from './src/jobs/newsMonitor.js';

dotenv.config();

console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
console.log(`║  EJECUTANDO UN CICLO DEL MONITOR (CON AUDIT LOGGING)           ║`);
console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

try {
  await runNewsMonitor();
  console.log(`\n✅ Ciclo completado\n`);
  process.exit(0);
} catch (e) {
  console.error(`\n❌ Error:`, e.message);
  console.error(e.stack);
  process.exit(1);
}
