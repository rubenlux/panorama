import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('--- rss_sources ---');
    const { rows: r1 } = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rss_sources'");
    console.log(r1);

    console.log('--- tracked_sources ---');
    const { rows: r2 } = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tracked_sources'");
    console.log(r2);
    
    console.log('--- tracked_source_snapshots ---');
    const { rows: r3 } = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tracked_source_snapshots'");
    console.log(r3);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
