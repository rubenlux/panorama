import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  const clusters = await query(`SELECT count(*) as n FROM social_clusters WHERE status = 'active'`);
  const posts = await query(`SELECT count(*) as n FROM social_posts WHERE captured_at >= now() - interval '24 hours'`);
  const clustersSample = await query(`SELECT id, title, viral_score, total_engagement, source_count FROM social_clusters ORDER BY viral_score DESC LIMIT 5`);

  console.log('=== SOCIAL DEBUG ===');
  console.log('clusters_active:', clusters.rows[0].n);
  console.log('posts_last_24h:', posts.rows[0].n);
  console.log('\nTop 5 Clusters:');
  clustersSample.rows.forEach((c, i) => {
    console.log(`  ${i+1}. "${c.title.substring(0,50)}" | VS:${c.viral_score} | ENG:${c.total_engagement}`);
  });
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
