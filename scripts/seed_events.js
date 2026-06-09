import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function seed() {
    const client = await pool.connect();
    try {
        console.log("Seeding dummy events for Dashboard...");

        // Get articles
        const res = await client.query("SELECT id FROM articles LIMIT 10");
        const articles = res.rows;
        if (articles.length === 0) {
            console.log("No articles found to seed events.");
            return;
        }

        const events = [];
        const now = Date.now();
        const types = ['view', 'view', 'view', 'view', 'like', 'share']; // mostly views

        // Generate 200 events in last 24h
        for (let i = 0; i < 200; i++) {
            const article = articles[Math.floor(Math.random() * articles.length)];
            const type = types[Math.floor(Math.random() * types.length)];

            // Random time in last 24h
            const timeOffset = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
            const createdAt = new Date(now - timeOffset).toISOString();

            events.push(`('${article.id}', '${type}', '${createdAt}')`);
        }

        await client.query(`
            INSERT INTO events (article_id, type, created_at)
            VALUES ${events.join(', ')}
        `);

        console.log(`Inserted ${events.length} dummy events! 🚀`);

    } catch (err) {
        console.error("Seeding failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

seed();
