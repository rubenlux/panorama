import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function createProductsTable() {
    const client = await pool.connect();
    try {
        console.log("Creating products table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                price DECIMAL(10,2) NOT NULL,
                old_price DECIMAL(10,2),
                image_url TEXT,
                target_url TEXT,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert some sample products
        const sampleProducts = [
            ['Woo Single #2', 'MUSIC>SINGLES', 2.00, 3.00, 'https://placehold.co/400x400?text=Single+2', '#'],
            ['Woo Album #4', 'ALBUMS>MUSIC', 3.00, null, 'https://placehold.co/400x400?text=Album+4', '#'],
            ['Woo Single #1', 'MUSIC>SINGLES', 3.00, 4.50, 'https://placehold.co/400x400?text=Single+1', '#'],
            ['Woo Album #3', 'ALBUMS>MUSIC', 3.00, null, 'https://placehold.co/400x400?text=Album+3', '#'],
            ['Hoodie with Logo', 'CLOTHING>HOODIES', 15.00, 20.00, 'https://placehold.co/400x400?text=Hoodie', '#']
        ];

        for (const p of sampleProducts) {
            await client.query(
                `INSERT INTO products (name, category, price, old_price, image_url, target_url) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT DO NOTHING`,
                p
            );
        }

        console.log("✅ Products table created successfully!");
    } catch (err) {
        console.error("❌ Error creating products table:", err);
    } finally {
        client.release();
        pool.end();
    }
}

createProductsTable();
