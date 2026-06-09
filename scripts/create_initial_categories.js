import { query } from "../src/routes/db.js";

async function createNewCategories() {
    try {
        const cats = [
            ['Entertainment', 'entertainment'],
            ['Travel', 'travel'],
            ['Fashion', 'fashion'],
            ['Food & Drinks', 'food']
        ];

        for (const [name, slug] of cats) {
            await query(
                `INSERT INTO categories(id, name, slug) 
                 VALUES (gen_random_uuid(), $1, $2) 
                 ON CONFLICT (slug) DO NOTHING`,
                [name, slug]
            );
        }
        console.log("✅ Categories created or already exist.");
    } catch (err) {
        console.error("❌ Error creating categories:", err);
    }
}

createNewCategories();
