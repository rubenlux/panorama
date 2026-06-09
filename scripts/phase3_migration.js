import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 3 Migration (Subscribers & Ads)...");

        // 1. Create subscribers table
        console.log("Creating subscribers table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS subscribers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                source VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create ads table
        console.log("Creating ads table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS ads (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sponsor_name VARCHAR(255) NOT NULL,
                type VARCHAR(50) DEFAULT 'banner', -- banner, sidebar, popup
                position VARCHAR(50), -- home_top, article_bottom, sidebar_right
                image_url TEXT NOT NULL,
                link_url TEXT,
                impressions INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                active BOOLEAN DEFAULT TRUE,
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Migration Phase 3 completed successfully! 🚀");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
