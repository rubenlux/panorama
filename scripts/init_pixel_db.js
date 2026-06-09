import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function initPixelDB() {
    const client = await pool.connect();
    try {
        console.log("Initializing Pixel Database Schema...");

        // Enable pgcrypto if not exists (likely already enabled)
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // 1. Pixel Events Table (Raw Truth)
        // High write volume, immutable facts.
        console.log("Creating table: pixel_events...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS pixel_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                
                -- Identity
                visitor_id TEXT NOT NULL,         -- UUID v4 from client
                session_id TEXT NOT NULL,         -- UUID v4 from client (renewed every 30m)
                
                -- Event Context
                event TEXT NOT NULL,              -- e.g., 'page_view', 'scroll_depth'
                url TEXT,                         -- Full URL for easy filtering
                referrer TEXT,                    -- Source
                
                -- Device / Tech (Sanitized)
                user_agent TEXT,
                ip_hash TEXT,                     -- SHA256 of IP (Privacy compliant)
                device_type VARCHAR(50),          -- 'desktop', 'mobile', 'tablet'
                
                -- Data
                payload JSONB DEFAULT '{}',       -- Flexible data (e.g., scroll %, article_id)
                
                -- Timestamp
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Indexes for Performance
        console.log("Creating indexes for pixel_events...");
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor ON pixel_events(visitor_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pixel_events_session ON pixel_events(session_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pixel_events_event ON pixel_events(event);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pixel_events_created_at ON pixel_events(created_at DESC);`);
        // Index for real-time article stats (optimizes aggregations on recent data)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pixel_events_article_time ON pixel_events ((payload->>'content_id'), created_at DESC) WHERE event = 'content_view';`);


        // 2. Visitor Profiles (Async / Derived)
        // NOT written by Pixel directly. Populated by background jobs.
        console.log("Creating table: visitor_profiles...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS visitor_profiles (
                visitor_id TEXT PRIMARY KEY,
                
                -- Derived Metrics
                first_seen_at TIMESTAMPTZ,
                last_seen_at TIMESTAMPTZ,
                total_sessions INT DEFAULT 0,
                
                -- Intelligence (JSONB for flexibility)
                category_affinity JSONB DEFAULT '{}', -- e.g. {"politics": 10, "sports": 2}
                engagement_score FLOAT DEFAULT 0.0,
                
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Pixel Database Initialized Successfully!");

    } catch (err) {
        console.error("❌ Error initializing Pixel DB:", err);
    } finally {
        client.release();
        pool.end();
    }
}

initPixelDB();
