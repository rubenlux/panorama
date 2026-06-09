import { query } from "../src/routes/db.js";

async function run() {
    try {
        console.log("Migrating Community Tables...");

        // 1. Subscribers Table
        await query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'active', -- active, unsubscribed
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log("✅ Created subscribers table");

        // Indexes
        await query(`CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);`);

        console.log("Migration Complete.");
        process.exit(0);
    } catch (e) {
        console.error("Migration Failed", e);
        process.exit(1);
    }
}

run();
