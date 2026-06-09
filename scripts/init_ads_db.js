
import { query } from "../src/routes/db.js";

async function initAdsDB() {
    console.log("🚀 Initializing Ads System Database...");

    try {
        // 1. Advertisers Table
        await query(`
            CREATE TABLE IF NOT EXISTS advertisers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                contact_email TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'advertisers' created.");

        // 2. Campaigns Table
        await query(`DROP TABLE IF EXISTS campaigns CASCADE;`); // RESET for Development
        await query(`
            CREATE TABLE campaigns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'active', -- active, paused, archived
                start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                end_date TIMESTAMPTZ,
                
                -- Delivery Settings
                target_impressions INTEGER,
                priority INTEGER DEFAULT 1,
                
                -- Creative
                banner_url TEXT NOT NULL,
                target_url TEXT NOT NULL,
                position TEXT NOT NULL, -- 'home_top', 'article_sidebar', 'article_bottom'
                
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'campaigns' created.");

        // 3. Indexes for performance
        // Separate indexes to avoid complex multi-col issues if types differ, simplified for now
        await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_position ON campaigns(position);`);

        console.log("✅ Indexes created.");

        // 4. Seed Data (Optional - just to have something)
        const check = await query(`SELECT count(*) FROM advertisers`);
        if (parseInt(check.rows[0].count) === 0) {
            console.log("🌱 Seeding initial data...");
            const adv = await query(`INSERT INTO advertisers (name, contact_email) VALUES ('Empresa Ejemplo', 'contacto@ejemplo.com') RETURNING id`);
            const advId = adv.rows[0].id;

            await query(`
                INSERT INTO campaigns (advertiser_id, name, status, banner_url, target_url, position, start_date, end_date)
                VALUES 
                ($1, 'Campaña Lanzamiento', 'active', 'https://via.placeholder.com/728x90.png?text=Anuncio+Demo', 'https://ejemplo.com', 'home_top', NOW(), NOW() + INTERVAL '30 days'),
                ($1, 'Promo Lateral', 'active', 'https://via.placeholder.com/300x250.png?text=Promo+Sidebar', 'https://ejemplo.com/promo', 'article_sidebar', NOW(), NOW() + INTERVAL '30 days')
            `, [advId]);
            console.log("✅ Seed data inserted.");
        }

    } catch (e) {
        console.error("❌ Error initializing Ads DB:", e);
    }
}

initAdsDB();
