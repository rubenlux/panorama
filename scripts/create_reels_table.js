import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function createReelsTable() {
    const client = await pool.connect();
    try {
        console.log("Creating reels table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS reels (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                url TEXT NOT NULL,
                thumbnail TEXT,
                platform VARCHAR(50) DEFAULT 'instagram',
                status VARCHAR(20) DEFAULT 'active',
                order_index INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reels_status ON reels(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reels_order ON reels(order_index);
        `);

        // Create settings table for reel configuration
        await client.query(`
            CREATE TABLE IF NOT EXISTS reel_settings (
                id SERIAL PRIMARY KEY,
                background_color VARCHAR(20) DEFAULT '#1e3a8a',
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert default settings if not exists
        await client.query(`
            INSERT INTO reel_settings (background_color)
            SELECT '#1e3a8a'
            WHERE NOT EXISTS (SELECT 1 FROM reel_settings);
        `);

        console.log("✅ Reels table created successfully!");
    } catch (err) {
        console.error("❌ Error creating reels table:", err);
    } finally {
        client.release();
        pool.end();
    }
}

createReelsTable();
