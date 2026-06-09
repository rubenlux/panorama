import pg from "pg";
import "dotenv/config";
import { slugify } from "./src/routes/_util.js"; // Reuse util if possible, or just reimplement simple slugify

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

// Simple slugify fallback if the import fails or to keep this script standalone-ish
function simpleSlugify(text) {
    return text.toString().toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-');  // Replace multiple - with single -
}

const CATEGORIES = [
    "Movies", "TV Series", "Life Style", "Esports", "Food",
    "Entertainment", "Health", "Money", "Travel", "Tech"
];

// Data from the image + extras
const ARTICLES = [
    {
        title: "Netflix's summer 2022 movie slate is full of star power with a...",
        category: "Movies",
        excerpt: "Check out the amazing lineup of movies coming to Netflix this summer including big blockbusters.",
        body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        status: 'published'
    },
    {
        title: "'He was revolutionary': Louisville chefs, friends honor late talented Brown Hotel chef",
        category: "Food",
        excerpt: "The culinary world pays tribute to a legend who changed the face of Louisville dining.",
        body: "Full story about the chef and his impact on the local food scene...",
        status: 'published'
    },
    {
        title: "Study reveals concerning changes to young people health and physical fitness...",
        category: "Health",
        excerpt: "Recent studies indicate a decline in physical activity among teenagers post-pandemic.",
        body: "Detailed analysis of health statistics and expert opinions...",
        status: 'published'
    },
    {
        title: "Does probiotic skin care work? Products, uses, and more for a...",
        category: "Life Style",
        excerpt: "Exploring the benefits of probiotics in your daily skincare routine.",
        body: "Dermatologists weigh in on the new trend of probiotic creams and serums...",
        status: 'published'
    },
    {
        title: "The big impact of online shopping on retail sales during COVID-19...",
        category: "Money",
        excerpt: "How e-commerce giants dominated the market during the global lockdowns.",
        body: "Economic analysis of the retail sector shift...",
        status: 'published'
    },
    {
        title: "4 ways to style your workwear this summer with your personal...",
        category: "Life Style",
        excerpt: "Summer fashion tips for the office that keep you cool and professional.",
        body: "Fashion advice and lookbook for summer 2022/2025...",
        status: 'published'
    },
    {
        title: "Is a software career right for me? 10 burning questions you...",
        category: "Tech",
        excerpt: "Guidance for aspiring developers and engineers entering the tech industry.",
        body: "answering common questions about salary, work-life balance, and skills...",
        status: 'published'
    },
    {
        title: "Warren Buffett's simple investing advice that's beaten most pros for...",
        category: "Money",
        excerpt: "The Oracle of Omaha shares wisdom that stands the test of time.",
        body: "Investment strategies that anyone can follow...",
        status: 'published'
    },
    {
        title: "Chinese banks and bad-debt managers urged to rescue real estate...",
        category: "Money",
        excerpt: "Financial regulators step in to stabilize the property market.",
        body: "Deep dive into the Asian real estate crisis and potential solutions...",
        status: 'published'
    },
    {
        title: "The romance of train travel is alive but exorbitantly expensive...",
        category: "Travel",
        excerpt: "Luxury train journeys are seeing a resurgence, but at a steep price.",
        body: "Review of the Orient Express and other luxury lines...",
        status: 'published'
    }
];

async function seed() {
    const client = await pool.connect();
    try {
        console.log("Starting seed...");

        // 1. Create a default admin user if not exists
        // We assume the user table exists.
        // For simplicity, we just look for ANY user to assign as author.
        let authorId;
        let userRes = await client.query("SELECT id FROM users LIMIT 1");
        if (userRes.rows.length > 0) {
            authorId = userRes.rows[0].id;
            console.log("Using existing user as author:", authorId);
        } else {
            console.log("No users found. Creating 'admin@example.com'...");
            // Password handling is out of scope for simple seed, we might fail on NOT NULL password.
            // Assuming 'users' table has 'email' and 'password_hash'.
            // We'll try to insert with a dummy hash string.
            try {
                const newUser = await client.query(`
          INSERT INTO users (email, password_hash) 
          VALUES ('admin@example.com', '$2a$10$DUMMYHASHFOREXAMPLEONLY') 
          RETURNING id
        `);
                authorId = newUser.rows[0].id;
                console.log("Created admin user:", authorId);
            } catch (err) {
                console.error("Error creating user. Table schema might differ.", err.message);
                return;
            }
        }

        // 2. Insert Categories
        console.log("Seeding categories...");
        const categoryMap = new Map(); // name -> id
        for (const catName of CATEGORIES) {
            const slug = simpleSlugify(catName);
            // Upsert
            const res = await client.query(`
        INSERT INTO categories (name, slug) 
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [catName, slug]);
            categoryMap.set(catName, res.rows[0].id);
        }

        // 3. Insert Articles
        console.log("Seeding articles...");
        for (const art of ARTICLES) {
            const slug = simpleSlugify(art.title);
            // Upsert article
            // NOTE: Conflict on slug might fail if title is long or whatever, but slugify handles basic text.
            // We use ON CONFLICT DO UPDATE to ensure idempotency.
            const res = await client.query(`
        INSERT INTO articles (author_id, title, slug, excerpt, body, status, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (slug) DO UPDATE SET 
          title = EXCLUDED.title,
          excerpt = EXCLUDED.excerpt,
          body = EXCLUDED.body
        RETURNING id;
      `, [authorId, art.title, slug, art.excerpt, art.body, art.status]);

            const articleId = res.rows[0].id;

            // Link to category
            if (categoryMap.has(art.category)) {
                const catId = categoryMap.get(art.category);
                await client.query(`
          INSERT INTO article_categories (article_id, category_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [articleId, catId]);
            }
        }

        console.log("Seeding complete! 🌱");
    } catch (e) {
        console.error("Seeding failed:", e);
    } finally {
        client.release();
        pool.end();
    }
}

seed();
