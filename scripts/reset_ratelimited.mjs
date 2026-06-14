import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Reset videos that were wrongly marked false due to rate-limiting (last 2 hours)
const res = await pool.query(`
  UPDATE social_posts
  SET transcript_available = NULL, transcript_fetched_at = NULL
  WHERE transcript_available = false
    AND transcript_fetched_at > NOW() - INTERVAL '2 hours'
`);
console.log('Reset', res.rowCount, 'videos back to pending (were rate-limited, not actually missing captions)');

// Also keep the 2 legit "no_captions" videos from earlier (ESPN Shorts and Infobae)
// Those had reason=no_captions so they're fine as false

const { rows: [s] } = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE transcript_available=true)  AS ok,
    COUNT(*) FILTER (WHERE transcript_available=false) AS no,
    COUNT(*) FILTER (WHERE transcript_fetched_at IS NULL AND sp.platform='youtube') AS pending
  FROM social_posts sp
  JOIN social_sources ss ON ss.id=sp.source_id
  WHERE ss.content_type IN ('videos','shorts')
`);
console.log('Current state: with_transcript='+s.ok+' no_transcript='+s.no+' pending='+s.pending);

await pool.end();
