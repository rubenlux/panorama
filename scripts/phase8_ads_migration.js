import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 8 Ads Migration...");
        await client.query("BEGIN");

        // 1. Advertisers (Clientes)
        await client.query(`
            CREATE TABLE IF NOT EXISTS advertisers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                email TEXT,
                contact_name TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'advertisers' created.");

        // 2. Ad Slots (Inventario)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ad_slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                position TEXT NOT NULL, -- 'header', 'sidebar', 'in_article'
                device TEXT DEFAULT 'all', -- 'desktop', 'mobile', 'all'
                width INT,
                height INT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'ad_slots' created.");

        // Seed Default Slots
        const slots = [
            { name: "Header Banner", position: "home_top", device: "all" },
            { name: "Sidebar Right", position: "sidebar_right", device: "desktop" },
            { name: "Article Bottom", position: "article_bottom", device: "all" }
        ];

        for (const s of slots) {
            await client.query(`
                INSERT INTO ad_slots (name, position, device, width, height)
                VALUES ($1, $2, $3, 0, 0)
                ON CONFLICT DO NOTHING -- No conflict constraint on name, relying on implementation checks or just inserting duplicates handled manually later
            `, [s.name, s.position, s.device]);
        }
        console.log("✅ Default Ad Slots seeded.");


        // 3. Campaigns
        await client.query(`
            CREATE TABLE IF NOT EXISTS campaigns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                advertiser_id UUID REFERENCES advertisers(id),
                name TEXT NOT NULL,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                budget DECIMAL(10, 2) DEFAULT 0,
                status TEXT DEFAULT 'draft', -- 'active', 'paused', 'finished', 'draft'
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'campaigns' created.");

        // 4. Upgrade 'ads' table (Creatives)
        // We keep existing ads working, but add references
        await client.query(`
            ALTER TABLE ads 
            ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
            ADD COLUMN IF NOT EXISTS ad_slot_id UUID REFERENCES ad_slots(id),
            ADD COLUMN IF NOT EXISTS alt_text TEXT,
            ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP;
        `);
        console.log("✅ Table 'ads' upgraded.");

        // 5. Ad Events (Tracking)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ad_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                ad_id UUID REFERENCES ads(id),
                type TEXT NOT NULL, -- 'impression', 'click'
                ip TEXT,
                user_agent TEXT,
                article_id UUID REFERENCES articles(id), -- Optional context
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id);
            CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(type);
        `);
        console.log("✅ Table 'ad_events' created.");

        await client.query("COMMIT");
        console.log("🚀 Phase 8 Migration Complete!");

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
