import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 1 Migration...");

        // 1. Add Volanta to articles
        console.log("Adding 'volanta' to articles...");
        await client.query(`
            ALTER TABLE articles 
            ADD COLUMN IF NOT EXISTS volanta VARCHAR(255);
        `);

        // 2. Create article_seo
        console.log("Creating article_seo table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS article_seo (
                article_id UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
                meta_title VARCHAR(255),
                meta_description TEXT,
                canonical_url TEXT,
                og_title VARCHAR(255),
                og_description TEXT,
                og_image TEXT,
                schema_json TEXT
            );
        `);

        // 3. Create article_stats
        console.log("Creating article_stats table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS article_stats (
                article_id UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
                views INTEGER DEFAULT 0,
                unique_views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                comments_count INTEGER DEFAULT 0,
                avg_read_time INTEGER DEFAULT 0,
                last_viewed_at TIMESTAMP
            );
        `);

        // 4. Backfill article_stats for existing articles
        console.log("Backfilling stats for existing articles...");
        await client.query(`
            INSERT INTO article_stats (article_id)
            SELECT id FROM articles
            ON CONFLICT (article_id) DO NOTHING;
        `);

        console.log("Migration Phase 1 completed successfully! 🚀");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
