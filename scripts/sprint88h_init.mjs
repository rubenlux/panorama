import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const ts = new Date().toISOString();
console.log('TIMESTAMP_INICIO:', ts);

const r = await pool.query(`SELECT id, name FROM social_sources WHERE platform='facebook' ORDER BY name`);
console.log('\nFUENTES FB:');
r.rows.forEach(row => console.log(row.id, '|', row.name, '|', row.url));

await pool.end();
