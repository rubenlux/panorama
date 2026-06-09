import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 5 Migration (Featured Image)...");

        // Add image_url to articles
        console.log("Adding 'image_url' to articles...");
        await client.query(`
            ALTER TABLE articles 
            ADD COLUMN IF NOT EXISTS image_url TEXT;
        `);

        console.log("Migration Phase 5 completed successfully! 🚀");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
