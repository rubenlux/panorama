const { Client } = require('pg');
require('dotenv').config({ path: 'c:/Users/ruben/Desktop/news/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    const res = await client.query(`
        SELECT 
            (payload->>'load_time_ms')::int as load_time,
            created_at
        FROM pixel_events 
        WHERE event = 'content_loaded'
        ORDER BY created_at ASC
    `);
    res.rows.forEach(r => console.log(`${r.created_at.toISOString()} | ${r.load_time}ms`));

    const stats = await client.query(`
        SELECT 
            COUNT(*) as total,
            MIN((payload->>'load_time_ms')::int) as min,
            MAX((payload->>'load_time_ms')::int) as max,
            AVG((payload->>'load_time_ms')::int) as avg
        FROM pixel_events 
        WHERE event = 'content_loaded'
    `);
    console.log("\nGlobal Stats:");
    console.table(stats.rows);

    await client.end();
}
check();
