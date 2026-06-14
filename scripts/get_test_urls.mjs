import 'dotenv/config';
import { Pool } from 'pg';
import { fetchYouTubeTranscript } from '../src/connectors/social/transcripts.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(`
  SELECT sp.url, sp.title, ss.name, ss.content_type
  FROM social_posts sp
  JOIN social_sources ss ON ss.id = sp.source_id
  WHERE sp.platform='youtube' AND ss.content_type='videos'
    AND sp.url IS NOT NULL AND sp.transcript_fetched_at IS NULL
  ORDER BY RANDOM() LIMIT 3
`);

console.log('Testing', rows.length, 'real videos...\n');

for (const r of rows) {
  console.log(`Testing: ${r.name} — "${r.title?.slice(0,60)}"`);
  console.log(`URL: ${r.url}`);
  const result = await fetchYouTubeTranscript(r.url);
  if (!result) console.log('→ null (rate-limited)\n');
  else if (result.available) console.log(`→ ✅ lang=${result.language} src=${result.source} len=${result.text.length}\n   Preview: "${result.text.slice(0,200)}"\n`);
  else console.log(`→ ✗ reason=${result.reason}\n`);
  await new Promise(r => setTimeout(r, 2000));
}

await pool.end();
