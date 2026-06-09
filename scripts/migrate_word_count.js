import 'dotenv/config';
import pg from 'pg';

async function migrate() {
    const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log("Connected to DB for migration...");

        await client.query(`
            ALTER TABLE articles ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
            
            -- Optional: Initialize word_count for existing articles based on body
            -- This is simple estimation: counting spaces
            UPDATE articles 
            SET word_count = array_length(regexp_split_to_array(body, '\\s+'), 1)
            WHERE word_count = 0 OR word_count IS NULL;
        `);

        console.log("Column 'word_count' added and initialized successfully.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await client.end();
    }
}

migrate();
