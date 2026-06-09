import { query, pool } from "./routes/db.js";

async function run() {
    try {
        console.log("Creating folders table...");
        await query(`
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log("Seeding initial folders...");
        // Ensure generic 'general' folder exists
        await query(`INSERT INTO folders(name) VALUES ('general') ON CONFLICT (name) DO NOTHING`);

        // Sync any other existing folders from media table
        await query(`
            INSERT INTO folders(name) 
            SELECT DISTINCT folder FROM media 
            WHERE folder IS NOT NULL 
            ON CONFLICT (name) DO NOTHING
        `);

        console.log("Done!");
        await pool.end();
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}

run();
