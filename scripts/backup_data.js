import pg from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function backup() {
    const client = await pool.connect();
    try {
        console.log("📦 Starting Backup...");

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.resolve('backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

        const tables = [
            'users',
            'articles',
            'categories',
            'article_categories',
            'media',
            'comments',
            'subscribers',
            'advertisers',
            'campaigns',
            'ad_slots',
            'ads',
            'ad_events',
            'article_stats',
            'article_seo'
        ];

        const data = {};

        for (const table of tables) {
            // Check if table exists
            const check = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [table]);

            if (check.rows[0].exists) {
                const res = await client.query(`SELECT * FROM "${table}"`);
                data[table] = res.rows;
                console.log(`✅ ${table}: ${res.rowCount} rows`);
            } else {
                console.log(`⚠️ ${table}: Skipped (Does not exist)`);
            }
        }

        const filename = path.join(backupDir, `backup_${timestamp}.json`);
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));

        console.log(`\n💾 Backup saved to: ${filename}`);

    } catch (err) {
        console.error("❌ Backup Failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

backup();
