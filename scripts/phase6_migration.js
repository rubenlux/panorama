import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 6 Migration (SEO Architecture)...");

        // 1. Articles: Add 'epigraph'
        console.log("Adding 'epigraph' to articles...");
        await client.query(`
            ALTER TABLE articles 
            ADD COLUMN IF NOT EXISTS epigraph TEXT;
        `);

        // 2. SEO: Add 'keywords' (JSON structure preferred for main/secondary)
        console.log("Adding 'keywords' to article_seo...");
        // We will store as JSON text e.g. { "main": [..], "secondary": [..] }
        await client.query(`
            ALTER TABLE article_seo 
            ADD COLUMN IF NOT EXISTS keywords TEXT; 
        `);

        // 3. Stats: Add 'bounce_rate'
        console.log("Adding 'bounce_rate' to article_stats...");
        await client.query(`
            ALTER TABLE article_stats 
            ADD COLUMN IF NOT EXISTS bounce_rate REAL DEFAULT 0;
        `);

        console.log("Migration Phase 6 completed successfully! 🚀");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
