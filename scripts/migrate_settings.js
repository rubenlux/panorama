import { query } from "../src/routes/db.js";

async function run() {
    try {
        console.log("Migrating Settings Table...");

        // Key-Value store for flexible configuration
        // key: 'site_logo', 'social_twitter', 'site_title', etc.
        // value: Text content or JSON
        // type: 'string', 'image', 'json', 'boolean'
        await query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        type VARCHAR(20) DEFAULT 'string',
        group_name VARCHAR(50) DEFAULT 'general',
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

        // Seed initial values if empty
        const exists = await query(`SELECT COUNT(*) as c FROM settings`);
        if (parseInt(exists.rows[0].c) === 0) {
            console.log("Seeding default settings...");
            const defaults = [
                ['site_title', 'News CMS', 'string', 'general'],
                ['site_description', 'El mejor sitio de noticias', 'string', 'general'],
                ['site_logo', '', 'image', 'appearance'],
                ['site_favicon', '', 'image', 'appearance'],
                ['footer_logo', '', 'image', 'appearance'],
                ['social_facebook', 'https://facebook.com', 'string', 'social'],
                ['social_twitter', 'https://twitter.com', 'string', 'social'],
                ['social_instagram', 'https://instagram.com', 'string', 'social'],
                ['contact_email', 'contacto@ejemplo.com', 'string', 'contact'],
                ['maintenance_mode', 'false', 'boolean', 'system']
            ];

            for (const [k, v, t, g] of defaults) {
                await query(
                    `INSERT INTO settings (key, value, type, group_name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                    [k, v, t, g]
                );
            }
        }

        console.log("✅ Created settings table");
        process.exit(0);
    } catch (e) {
        console.error("Migration Failed", e);
        process.exit(1);
    }
}

run();
