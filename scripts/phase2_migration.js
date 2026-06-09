import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Starting Phase 2 Migration...");

        // Add total_read_time_seconds to article_stats
        console.log("Adding 'total_read_time_seconds' to article_stats...");
        await client.query(`
            ALTER TABLE article_stats 
            ADD COLUMN IF NOT EXISTS total_read_time_seconds BIGINT DEFAULT 0;
        `);

        console.log("Migration Phase 2 completed successfully! 🚀");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
