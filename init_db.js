import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function init() {
    const client = await pool.connect();
    try {
        console.log("Initializing database schema...");

        // Enable UUID extension
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // Users
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'editor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Categories
        await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Articles
        await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id UUID REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        excerpt TEXT,
        body TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Article Categories
        await client.query(`
      CREATE TABLE IF NOT EXISTS article_categories (
        article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
        category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (article_id, category_id)
      );
    `);

        // Comments
        await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(100),
        author_email VARCHAR(120),
        body TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        ip_hash VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Media
        await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime VARCHAR(100),
        size_bytes BIGINT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log("Schema initialized successfully! 🚀");

    } catch (err) {
        console.error("Error initializing DB:", err);
    } finally {
        client.release();
        pool.end();
    }
}

init();
