import { query } from './src/routes/db.js';
import fs from 'fs';

async function run() {
  try {
    const { rows } = await query(`
      SELECT 
        ed.id, ed.status, ed.executive_summary, ed.verified_facts, ed.timeline, ed.suggested_angles, ed.suggested_headlines
      FROM editorial_dossiers ed
      JOIN research_topics rt ON ed.topic_id = rt.id
      WHERE rt.title ILIKE '%Florencia Peña%'
      ORDER BY ed.created_at DESC LIMIT 1
    `);
    
    if (rows.length === 0) {
      console.log("No se encontró el dossier.");
      process.exit(0);
    }
    
    const dossier = rows[0];
    
    const { rows: angles } = await query(`
      SELECT * FROM editorial_angles WHERE dossier_id = $1 ORDER BY position ASC
    `, [dossier.id]);
    
    fs.writeFileSync('dossier_florencia.json', JSON.stringify({ dossier, angles }, null, 2));
    console.log("Dossier extraído a dossier_florencia.json");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
