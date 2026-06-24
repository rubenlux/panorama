import pg from "pg";
import "dotenv/config";


export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// Prevent unhandled 'error' events from crashing the process when an idle
// client is terminated by the DB server (e.g. Docker restart, 57P01).
pool.on('error', (err) => {
  console.error('[DB Pool] Idle client error (connection lost):', err.message);
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export async function logActivity(userId, event, payload = {}) {
  try {
    await query(
      "INSERT INTO user_activity (user_id, event, payload) VALUES ($1, $2, $3)",
      [userId, event, payload]
    );
  } catch (err) {
    console.error(`[ActivityLog] Failed to log ${event} for ${userId}:`, err);
  }
}
