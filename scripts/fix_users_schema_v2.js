import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    const client = await pool.connect();
    try {
        console.log("Fixing users schema...");

        // 1. updated_at
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        console.log("Checked/Added updated_at");

        // 2. name
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        `);
        console.log("Checked/Added name");

        // 3. bio
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS bio TEXT;
        `);
        console.log("Checked/Added bio");

        // 4. avatar_url
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        `);
        console.log("Checked/Added avatar_url");

        // 5. social_links
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS social_links JSONB;
        `);
        console.log("Checked/Added social_links");

        console.log("Schema fix completed successfully!");

    } catch (err) {
        console.error("Error fixing schema:", err);
    } finally {
        client.release();
        pool.end();
    }
}

run();
