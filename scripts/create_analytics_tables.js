import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        const client = await pool.connect();
        console.log("Creating Analytics Tables...");

        // 1. Events Table (Raw Logs)
        await client.query(`
            CREATE TABLE IF NOT EXISTS events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL, -- view, scroll_25, like, share, heartbeat
                session_id VARCHAR(100),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'events' ready.");

        // 2. Article Stats (Aggregated)
        await client.query(`
            CREATE TABLE IF NOT EXISTS article_stats (
                article_id UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
                views INT DEFAULT 0,
                last_viewed_at TIMESTAMP,
                total_read_time_seconds INT DEFAULT 0,
                avg_read_time FLOAT DEFAULT 0,
                likes INT DEFAULT 0,
                shares INT DEFAULT 0
            );
        `);
        console.log("✅ Table 'article_stats' ready.");

        // 3. Index for speed
        await client.query(`CREATE INDEX IF NOT EXISTS idx_events_article_id ON events(article_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`);

        client.release();
    } catch (e) {
        console.error("Error:", e);
    } finally {
        pool.end();
    }
}

run();
