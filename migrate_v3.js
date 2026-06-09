
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    await client.connect();

    // 1. Update categories table
    console.log("Updating categories table...");
    await client.query(`
        ALTER TABLE categories 
        ADD COLUMN IF NOT EXISTS show_in_menu BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS is_tag BOOLEAN DEFAULT false
    `);

    // 2. Initialize settings if they don't exist
    const defaultSettings = [
        ['breaking_news_title', 'Breaking News', 'string', 'home'],
        ['breaking_news_bg_color', '#1f2937', 'color', 'home'],
        ['media_day_title', 'Media of the Day', 'string', 'home'],
        ['media_day_bg_color', '#1f2937', 'color', 'home'],
        ['sponsors_title', 'Sponsors', 'string', 'home'],
        ['sponsors_bg_color', '#ffffff', 'color', 'home'],
        ['sponsors_line_color', '#e2e8f0', 'color', 'home'],
        ['reels_section_title', 'Los tenés que ver', 'string', 'home'],
        ['latest_articles_title', 'Latest Articles', 'string', 'home'],
        ['all_topics_title', 'All Topics', 'string', 'home'],
        ['all_topics_bg_color', '#1f2937', 'color', 'home'],
        ['section_grid_label_text_color', '#ffffff', 'color', 'home'],
        ['section_grid_label_bg_color', '#2563eb', 'color', 'home'],
        ['section_grid_line_color', '#2563eb', 'color', 'home'],

        // Footer Settings
        ['footer_col2_title', 'Most Popular', 'string', 'footer'],
        ['footer_col2_category', 'politica', 'string', 'footer'],
        ['footer_col3_title', 'Most Discussed', 'string', 'footer'],
        ['footer_col3_category', 'deportes', 'string', 'footer'],
        ['footer_tags_title', 'Tags', 'string', 'footer'],
        ['footer_selected_tags', '', 'string', 'footer'],
        ['footer_copyright_text', '© 2026. Todos los derechos reservados.', 'string', 'footer'],
        ['social_youtube', '', 'string', 'social']
    ];

    console.log("Initializing settings...");
    for (const [key, value, type, group] of defaultSettings) {
        await client.query(`
            INSERT INTO settings (key, value, type, group_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (key) DO NOTHING
        `, [key, value, type, group]);
    }

    console.log("Migration completed!");
    await client.end();
}

migrate();
