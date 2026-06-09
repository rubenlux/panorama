import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function runBackfill() {
    const client = await pool.connect();
    try {
        console.log("Starting Backfill: Copying og_image to image_url...");

        // Update articles setting image_url = article_seo.og_image where image_url is null
        const images = await client.query("SELECT COUNT(*) FROM article_seo WHERE og_image IS NOT NULL");
        const cats = await client.query("SELECT COUNT(*) FROM article_categories");
        console.log(`Debug: ${images.rows[0].count} SEO images, ${cats.rows[0].count} Category links.`);


    } catch (err) {
        console.error("Backfill failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

runBackfill();
