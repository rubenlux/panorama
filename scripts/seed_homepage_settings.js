import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function seedSettings() {
    await client.connect();
    try {
        const settings = [
            ['section_entertainment_tabs', 'Celebrities, Movies, Music', 'string', 'homepage'],
            ['section_grid_categories', 'Travel, Fashion, Food', 'string', 'homepage']
        ];

        for (const [key, value, type, group] of settings) {
            await client.query(
                `INSERT INTO settings (key, value, type, group_name) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [key, value, type, group]
            );
        }

        console.log("Homepage settings seeded successfully.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

seedSettings();
