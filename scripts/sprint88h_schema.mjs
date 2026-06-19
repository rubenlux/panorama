import pg from 'pg';
import 'dotenv/config';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const rows = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'social_posts' ORDER BY ordinal_position`);
rows.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
await pool.end();
