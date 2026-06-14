import { query } from '../routes/db.js';

export async function ensureObservabilitySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS worker_runs (
      id                SERIAL PRIMARY KEY,
      worker_name       TEXT NOT NULL,
      started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at       TIMESTAMPTZ,
      duration_ms       INTEGER,
      status            TEXT NOT NULL DEFAULT 'running',
      sources_processed INTEGER DEFAULT 0,
      items_found       INTEGER DEFAULT 0,
      items_saved       INTEGER DEFAULT 0,
      errors_count      INTEGER DEFAULT 0,
      error_message     TEXT
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_worker_runs_lookup ON worker_runs(worker_name, started_at DESC)`).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS system_events (
      id          SERIAL PRIMARY KEY,
      event_type  TEXT NOT NULL,
      actor       TEXT DEFAULT 'system',
      metadata    JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_system_events_lookup ON system_events(event_type, created_at DESC)`).catch(() => {});
}

export async function startRun(workerName) {
  try {
    const { rows } = await query(
      `INSERT INTO worker_runs (worker_name, started_at) VALUES ($1, NOW()) RETURNING id`,
      [workerName]
    );
    return rows[0].id;
  } catch { return null; }
}

export async function finishRun(runId, {
  status = 'success',
  sources_processed = 0,
  items_found = 0,
  items_saved = 0,
  errors_count = 0,
  error_message = null,
} = {}) {
  if (runId == null) return;
  try {
    await query(`
      UPDATE worker_runs
      SET finished_at       = NOW(),
          duration_ms       = EXTRACT(EPOCH FROM (NOW() - started_at))::int * 1000,
          status            = $2,
          sources_processed = $3,
          items_found       = $4,
          items_saved       = $5,
          errors_count      = $6,
          error_message     = $7
      WHERE id = $1
    `, [runId, status, sources_processed, items_found, items_saved, errors_count, error_message]);
  } catch (e) {
    console.warn(`[workerUtils] finishRun failed: ${e.message}`);
  }
}

export async function logEvent(eventType, actor = 'system', metadata = {}) {
  try {
    await query(
      `INSERT INTO system_events (event_type, actor, metadata) VALUES ($1, $2, $3)`,
      [eventType, actor, JSON.stringify(metadata)]
    );
  } catch (e) {
    console.warn(`[workerUtils] logEvent failed: ${e.message}`);
  }
}
