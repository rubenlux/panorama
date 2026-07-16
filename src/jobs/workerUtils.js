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

// ============================================================================
// OBSERVABILITY LAYER (P0 Instrumentation)
// NOTE: Tables are created by scripts/migrate_observability_layer.sql (runs once, manually)
// This section contains ONLY recording functions, no schema creation code
// ============================================================================

export async function recordCrawlSession({
  articleId,
  domain,
  strategy = 'HTTP_ONLY',
}) {
  try {
    const { rows } = await query(
      `INSERT INTO crawl_session (article_id, domain, strategy)
       VALUES ($1, $2, $3) RETURNING id`,
      [articleId, domain, strategy]
    );
    return rows[0]?.id;
  } catch (e) {
    console.warn(`[recordCrawlSession] Failed: ${e.message}`);
    return null;
  }
}

export async function recordCrawlAttempt({
  sessionId,
  articleId,
  domain,
  attemptNumber = 1,
  stage,
  status,
  reason = null,
  httpStatus = null,
  durationMs = 0,
  bytesDownloaded = 0,
  contentLength = null,
  contentHash = null,
  retryable = null,
  details = {},
}) {
  try {
    await query(
      `INSERT INTO crawl_attempts
       (session_id, article_id, domain, attempt_number, stage, status, reason, http_status, duration_ms, bytes_downloaded, content_length, content_hash, retryable, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [sessionId, articleId, domain, attemptNumber, stage, status, reason, httpStatus, durationMs, bytesDownloaded, contentLength, contentHash, retryable, JSON.stringify(details)]
    );
  } catch (e) {
    console.warn(`[recordCrawlAttempt] Failed: ${e.message}`);
  }
}

export async function recordPipelineDecision({
  module,
  pipeline = 'v1',
  entityId = null,
  entityType = null,
  decision,
  accepted,
  reason = null,
  score = null,
  threshold = null,
  metadata = {},
}) {
  try {
    await query(
      `INSERT INTO pipeline_decisions
       (module, pipeline, entity_id, entity_type, decision, accepted, reason, score, threshold, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [module, pipeline, entityId, entityType, decision, accepted, reason, score, threshold, JSON.stringify(metadata)]
    );
  } catch (e) {
    console.warn(`[recordPipelineDecision] Failed: ${e.message}`);
  }
}

export async function updateDomainProfile(domain, {
  stage,
  status,
  durationMs = 0,
  failureReason = null,
}) {
  try {
    const stageName = stage.toUpperCase();
    const statusName = status.toUpperCase();
    const successCol = `success_${stageName.toLowerCase()}`;
    const failedCol = `failed_${stageName.toLowerCase()}`;

    // Upsert domain profile
    await query(
      `INSERT INTO domain_profiles (domain) VALUES ($1)
       ON CONFLICT (domain) DO UPDATE SET updated_at = NOW()`,
      [domain]
    );

    // Update counters and timings
    await query(
      `UPDATE domain_profiles
       SET total_attempts = total_attempts + 1,
           ${statusName === 'SUCCESS' ? `${successCol} = ${successCol} + 1` : `${failedCol} = ${failedCol} + 1`},
           last_attempt_at = NOW(),
           last_failure_reason = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE last_failure_reason END,
           last_failure_at = CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE last_failure_at END,
           consecutive_failures = CASE WHEN $2 = 'SUCCESS' THEN 0 ELSE consecutive_failures + 1 END
       WHERE domain = $1`,
      [domain, statusName, failureReason]
    );
  } catch (e) {
    console.warn(`[updateDomainProfile] Failed for ${domain}: ${e.message}`);
  }
}

export async function updateDomainFailures(domain, failureReason) {
  try {
    // Increment count and recalculate percentage
    await query(
      `INSERT INTO domain_failures (domain, reason, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (domain, reason) DO UPDATE
       SET count = count + 1, updated_at = NOW()`,
      [domain, failureReason]
    );

    // Recalculate percentages for this domain
    await query(
      `UPDATE domain_failures SET
         percentage = ROUND(100.0 * count / (SELECT SUM(count) FROM domain_failures WHERE domain = $1), 1)
       WHERE domain = $1`,
      [domain]
    );
  } catch (e) {
    console.warn(`[updateDomainFailures] Failed for ${domain}/${failureReason}: ${e.message}`);
  }
}
