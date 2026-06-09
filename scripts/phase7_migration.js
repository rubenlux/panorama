import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 7 Migration (Events Intelligence)...");

        // 1. Create events table
        console.log("Creating 'events' table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
                type VARCHAR(50) NOT NULL, -- view, scroll_25, like, share
                session_id VARCHAR(100),   -- Anonymous tracking
                metadata JSONB,            -- { referer, device, etc }
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Index for fast querying by time and article
        console.log("Creating indexes...");
        await client.query(`CREATE INDEX IF NOT EXISTS idx_events_article_id ON events(article_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`);

        console.log("Migration Phase 7 completed successfully! 🚀");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
