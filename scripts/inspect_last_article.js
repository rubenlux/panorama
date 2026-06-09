
import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function debug() {
    try {
        const res = await pool.query("SELECT title, body, image_url FROM articles ORDER BY created_at DESC LIMIT 1");
        if (res.rows.length === 0) {
            console.log("No articles found.");
            return;
        }
        const a = res.rows[0];
        console.log("TITLE:", a.title);
        console.log("IMAGE URL:", a.image_url);
        console.log("BODY HTML FULL:");
        console.log(a.body);

        const imgMatches = a.body?.match(/<img[^>]+>/g);
        console.log("\nIMAGES FOUND IN BODY:", imgMatches ? imgMatches.length : 0);
        if (imgMatches) {
            imgMatches.forEach((img, i) => console.log(`IMAGE ${i + 1}:`, img));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
