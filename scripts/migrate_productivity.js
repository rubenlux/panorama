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
            CREATE TABLE IF NOT EXISTS user_activity (
                id SERIAL PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                event TEXT NOT NULL,
                payload JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_activity_event ON user_activity(event);
            CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at);
        `);

        console.log("Table 'user_activity' and indexes created successfully.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await client.end();
    }
}

migrate();
