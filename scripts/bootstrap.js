import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Env initialization
const envPath = path.resolve(__dirname, '../.env');
const envExamplePath = path.resolve(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
  console.log('[bootstrap] .env file not found. Copying .env.example...');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('[bootstrap] ✓ .env created from .env.example');
  } else {
    console.warn('[bootstrap] ⚠️ .env.example not found. Please create .env manually.');
  }
}

// Reload env
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function parseDbUrl(url) {
  const match = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d*)\/?([^?]*)/);
  if (!match) throw new Error('Invalid DATABASE_URL format');
  return { user: match[1], password: match[2], host: match[3], port: match[4] || '5432', database: match[5] || 'postgres' };
}

async function run() {
  console.log('[bootstrap] Checking database connection...');
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[bootstrap] ❌ Failed to connect to database:', err.message);
    process.exit(1);
  }

  try {
    // 2. Check if tables already exist
    const { rows: tableRows } = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);

    if (tableRows.length === 0) {
      console.log('[bootstrap] Database is empty. Loading schema_baseline.sql via psql...');
      const baselinePath = path.resolve(__dirname, '../schema_baseline.sql');
      if (!fs.existsSync(baselinePath)) {
        throw new Error('schema_baseline.sql not found at repository root.');
      }

      const db = parseDbUrl(process.env.DATABASE_URL);
      const { spawnSync } = await import('child_process');
      const psqlResult = spawnSync('psql', [
        '-h', db.host,
        '-p', db.port,
        '-U', db.user,
        '-d', db.database,
        '-f', baselinePath,
        '-v', 'ON_ERROR_STOP=1',
        '--quiet',
      ], {
        env: { ...process.env, PGPASSWORD: db.password },
        encoding: 'utf8',
      });

      if (psqlResult.status !== 0) {
        throw new Error(`psql failed loading schema_baseline.sql:\n${psqlResult.stderr}`);
      }
      console.log('[bootstrap] ✓ schema_baseline.sql loaded successfully.');
    } else {
      console.log(`[bootstrap] Database already initialized with ${tableRows.length} tables. Skipping baseline load.`);
    }

    // 3. Post-baseline migrations
    // schema_version table: create if not exists, then record this bootstrap run
    console.log('[bootstrap] Registering schema version...');
    const baselinePath2 = path.resolve(__dirname, '../schema_baseline.sql');
    const baselineContent = fs.existsSync(baselinePath2) ? fs.readFileSync(baselinePath2, 'utf8') : '';
    const baselineHash = crypto.createHash('sha256').update(baselineContent).digest('hex');

    let gitCommit = null;
    try { gitCommit = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim(); } catch {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id                SERIAL PRIMARY KEY,
        version           VARCHAR(50) NOT NULL,
        baseline_hash     VARCHAR(64) NOT NULL,
        generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        git_commit        VARCHAR(40),
        generator_version VARCHAR(50) DEFAULT 'bootstrap.js v1',
        applied_at        TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version_hash ON schema_version(baseline_hash);
    `);
    await client.query(`
      INSERT INTO schema_version (version, baseline_hash, git_commit)
      VALUES ($1, $2, $3)
      ON CONFLICT (baseline_hash) DO NOTHING
    `, ['2026.07.15', baselineHash, gitCommit]);
    console.log(`[bootstrap] ✓ Schema version recorded (hash: ${baselineHash.slice(0, 12)}...)`);

    // 4. Seeding Core Data
    console.log('[bootstrap] Seeding core database values...');

    // Categories seed
    const categories = [
      ['Entertainment', 'entertainment'],
      ['Travel', 'travel'],
      ['Fashion', 'fashion'],
      ['Food & Drinks', 'food']
    ];
    for (const [name, slug] of categories) {
      await client.query(`
        INSERT INTO categories (id, name, slug)
        VALUES (gen_random_uuid(), $1, $2)
        ON CONFLICT (slug) DO NOTHING
      `, [name, slug]);
    }
    console.log('[bootstrap] ✓ Core categories seeded.');

    // Settings seed
    const defaults = [
      ['site_title', 'News CMS', 'string', 'general'],
      ['site_description', 'El mejor sitio de noticias', 'string', 'general'],
      ['site_logo', '', 'image', 'appearance'],
      ['site_favicon', '', 'image', 'appearance'],
      ['footer_logo', '', 'image', 'appearance'],
      ['social_facebook', 'https://facebook.com', 'string', 'social'],
      ['social_twitter', 'https://twitter.com', 'string', 'social'],
      ['social_instagram', 'https://instagram.com', 'string', 'social'],
      ['contact_email', 'contacto@ejemplo.com', 'string', 'contact'],
      ['maintenance_mode', 'false', 'boolean', 'system']
    ];
    for (const [k, v, t, g] of defaults) {
      await client.query(`
        INSERT INTO settings (key, value, type, group_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO NOTHING
      `, [k, v, t, g]);
    }
    console.log('[bootstrap] ✓ Core settings seeded.');

    console.log('[bootstrap] 🎉 Database bootstrap completed successfully!');

  } catch (err) {
    console.error('[bootstrap] ❌ Bootstrap failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
