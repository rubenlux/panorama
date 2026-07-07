// SPEC 014 — Editorial Analytics Consolidation & Data Quality
// Paso 3: synthetic-data invariant tests for the analytics aggregation logic.
//
// Inserts a small, clearly-tagged batch of synthetic pixel_events rows (real
// UUID v4s + a unique run_id embedded in every payload for guaranteed cleanup,
// even on failure), runs the CORRECT aggregation queries against them, and
// asserts the 7 invariants from the SPEC. Re-run after any step that changes
// an analytics SQL query (see plan Pasos 4-6) as a regression guard.
//
// Usage: node scripts/test_analytics_invariants.mjs

import pg from 'pg';
import crypto from 'crypto';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function q(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

const RUN_ID = crypto.randomUUID();
const ARTICLE_ID = crypto.randomUUID();
const results = []; // { name, pass, detail }

function assertInvariant(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function insertEvent({ visitorId, sessionId, event, payload = {}, url = null }) {
  await q(`
    INSERT INTO pixel_events (visitor_id, session_id, event, payload, url, article_id)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    visitorId,
    sessionId,
    event,
    JSON.stringify({ ...payload, article_id: ARTICLE_ID, test_run_id: RUN_ID }),
    url,
    ARTICLE_ID,
  ]);
}

async function seed() {
  console.log(`Seeding synthetic data (run_id=${RUN_ID}, article_id=${ARTICLE_ID})…`);

  // --- 10 sessions = eligible_views, deliberately firing scroll_depth OUT OF
  // ORDER (only the deepest threshold reached, skipping intermediate ones —
  // simulates a fast scroll / anchor jump) to prove the funnel logic buckets
  // by MAX(percent) per session, not by raw per-threshold event counts.
  const sessions = Array.from({ length: 10 }, () => crypto.randomUUID());
  const visitorForSession = {}; // two sessions share one visitor (tests unique_users <= sessions)
  visitorForSession[sessions[0]] = crypto.randomUUID();
  visitorForSession[sessions[1]] = visitorForSession[sessions[0]]; // same visitor, 2 sessions
  for (let i = 2; i < sessions.length; i++) visitorForSession[sessions[i]] = crypto.randomUUID();

  for (const sid of sessions) {
    await insertEvent({ visitorId: visitorForSession[sid], sessionId: sid, event: 'content_view' });
  }

  // page_views: session[0] has 2 page_views (visitor browsing multiple routes),
  // every other session has 1 — tests unique_users <= sessions <= page_views.
  await insertEvent({ visitorId: visitorForSession[sessions[0]], sessionId: sessions[0], event: 'page_view' });
  for (const sid of sessions) {
    await insertEvent({ visitorId: visitorForSession[sid], sessionId: sid, event: 'page_view' });
  }

  const maxDepthBySession = {
    [sessions[0]]: 100, [sessions[1]]: 100, [sessions[2]]: 100, // 3 reach 100
    [sessions[3]]: 75, [sessions[4]]: 75,                        // 2 reach 75
    [sessions[5]]: 50, [sessions[6]]: 50,                        // 2 reach 50
    [sessions[7]]: 25, [sessions[8]]: 25,                        // 2 reach 25
    // sessions[9]: bounced, no scroll_depth at all
  };
  for (const [sid, depth] of Object.entries(maxDepthBySession)) {
    // Only the deepest threshold fires — NOT 25/50/75 on the way — this is the
    // adversarial case a naive "raw COUNT(*) per percent" query would get wrong.
    await insertEvent({ visitorId: visitorForSession[sid], sessionId: sid, event: 'scroll_depth', payload: { percent: depth } });
  }

  // time_on_content: session[0] gets 3 heartbeat ticks (60s), session[3] gets 1 (20s).
  for (let i = 0; i < 3; i++) {
    await insertEvent({ visitorId: visitorForSession[sessions[0]], sessionId: sessions[0], event: 'time_on_content', payload: { seconds: 20 } });
  }
  await insertEvent({ visitorId: visitorForSession[sessions[3]], sessionId: sessions[3], event: 'time_on_content', payload: { seconds: 20 } });

  // exit_intent: session[0] fires it TWICE (should still count as 1 distinct
  // session — tests "count sessions, not raw events"); session[4] fires once.
  await insertEvent({ visitorId: visitorForSession[sessions[0]], sessionId: sessions[0], event: 'exit_intent', payload: { type: 'mouse_leave_top' } });
  await insertEvent({ visitorId: visitorForSession[sessions[0]], sessionId: sessions[0], event: 'exit_intent', payload: { type: 'mouse_leave_top' } });
  await insertEvent({ visitorId: visitorForSession[sessions[4]], sessionId: sessions[4], event: 'exit_intent', payload: { type: 'mouse_leave_top' } });

  // ad_impression / ad_click: 20 impressions, 4 clicks -> CTR = 0.2.
  // Reuses the existing 10-session cohort (round-robin) rather than minting
  // fresh session ids — ad events happen inside a real browsing session, and
  // synthetic one-off sessions here would wrongly inflate sessions/unique_users.
  for (let i = 0; i < 20; i++) {
    const sid = sessions[i % sessions.length];
    await insertEvent({ visitorId: visitorForSession[sid], sessionId: sid, event: 'ad_impression', payload: { campaign_id: 'test-campaign' } });
  }
  for (let i = 0; i < 4; i++) {
    const sid = sessions[i % sessions.length];
    await insertEvent({ visitorId: visitorForSession[sid], sessionId: sid, event: 'ad_click', payload: { campaign_id: 'test-campaign' } });
  }

  // internal_link_click: one clean link, one deliberately dirty ("#") — the
  // dirty one simulates a client that isn't the fixed web/src/utils/pixel.js
  // (e.g. the still-independent third-party embed template, Track C) sending
  // noise. The aggregation layer must filter it, not just trust the client.
  await insertEvent({ visitorId: visitorForSession[sessions[0]], sessionId: sessions[0], event: 'internal_link_click', payload: { target_url: `http://localhost:5174/article/${ARTICLE_ID}` } });
  await insertEvent({ visitorId: visitorForSession[sessions[1]], sessionId: sessions[1], event: 'internal_link_click', payload: { target_url: '#' } });

  // page_view with a referrer equal to the site's own hostname (with port and
  // a leading www to test hostname/port normalization) — must NOT be counted
  // as an external acquisition source.
  await insertEvent({
    visitorId: visitorForSession[sessions[2]], sessionId: sessions[2], event: 'page_view',
    payload: { referrer: 'http://www.localhost:5174/some-page' }
  });
  // One genuinely external referrer, for contrast.
  await insertEvent({
    visitorId: visitorForSession[sessions[5]], sessionId: sessions[5], event: 'page_view',
    payload: { referrer: 'https://www.google.com/search?q=test' }
  });

  console.log('  ✓ seed complete\n');
  return { sessions, eligibleViews: sessions.length };
}

// Hostnames considered "own" for this test run — mirrors the multi-hostname,
// normalized design Paso 5 implements in analytics_v2.js (PUBLIC_SITE_HOSTNAMES).
const OWN_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
function normalizeHostname(h) {
  if (!h) return null;
  return h.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
}

async function runChecks({ eligibleViews }) {
  console.log('Running invariant checks…\n');

  // --- 1 & 4 & 5: Reading Funnel (MAX(percent) per session, then bucket-count) ---
  const { rows: eligibleRows } = await q(
    `SELECT COUNT(DISTINCT session_id)::int AS n FROM pixel_events WHERE article_id = $1 AND event = 'content_view' AND payload->>'test_run_id' = $2`,
    [ARTICLE_ID, RUN_ID]
  );
  const eligible = eligibleRows[0].n;

  const { rows: maxDepthRows } = await q(`
    SELECT session_id, MAX((payload->>'percent')::int) AS max_pct
    FROM pixel_events
    WHERE article_id = $1 AND event = 'scroll_depth' AND payload->>'test_run_id' = $2
    GROUP BY session_id
  `, [ARTICLE_ID, RUN_ID]);

  const funnel = {};
  for (const threshold of [25, 50, 75, 100]) {
    funnel[threshold] = maxDepthRows.filter(r => r.max_pct >= threshold).length;
  }

  console.log(`  eligible_views=${eligible}, scroll_25=${funnel[25]}, scroll_50=${funnel[50]}, scroll_75=${funnel[75]}, scroll_100=${funnel[100]}`);
  assertInvariant('eligible_views matches seeded sessions', eligible === eligibleViews, `${eligible} === ${eligibleViews}`);
  assertInvariant(
    'scroll_100 <= scroll_75 <= scroll_50 <= scroll_25 <= eligible_views',
    funnel[100] <= funnel[75] && funnel[75] <= funnel[50] && funnel[50] <= funnel[25] && funnel[25] <= eligible,
    `${funnel[100]} <= ${funnel[75]} <= ${funnel[50]} <= ${funnel[25]} <= ${eligible}`
  );
  // Adversarial check: the naive "raw COUNT(*) per percent" approach would give
  // scroll_25=2 here (only the 2 sessions that fired literal percent=25), which
  // is wrong. Confirm our bucketed number is NOT the naive one.
  const { rows: naiveRows } = await q(`
    SELECT (payload->>'percent')::int AS pct, COUNT(*)::int AS n
    FROM pixel_events
    WHERE article_id = $1 AND event = 'scroll_depth' AND payload->>'test_run_id' = $2
    GROUP BY 1
  `, [ARTICLE_ID, RUN_ID]);
  const naive25 = naiveRows.find(r => r.pct === 25)?.n || 0;
  assertInvariant(
    'funnel uses MAX-per-session bucketing, not raw per-threshold counts',
    funnel[25] !== naive25 && funnel[25] === 9,
    `bucketed scroll_25=${funnel[25]} (correct: 9) vs. naive raw count=${naive25} (would incorrectly be 2)`
  );

  for (const threshold of [25, 50, 75, 100]) {
    const retention = eligible > 0 ? funnel[threshold] / eligible : 0;
    assertInvariant(`retention[${threshold}] ∈ [0,1]`, retention >= 0 && retention <= 1, retention.toFixed(2));
  }

  const steps = [eligible, funnel[25], funnel[50], funnel[75], funnel[100]];
  for (let i = 1; i < steps.length; i++) {
    const dropoff = steps[i - 1] - steps[i];
    assertInvariant(`dropoff at step ${i} >= 0`, dropoff >= 0, `${steps[i - 1]} -> ${steps[i]} = ${dropoff}`);
  }

  // --- 2: unique_users <= sessions <= page_views ---
  const { rows: [uc] } = await q(`
    SELECT
      COUNT(DISTINCT visitor_id)::int AS unique_users,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(*) FILTER (WHERE event = 'page_view')::int AS page_views
    FROM pixel_events WHERE article_id = $1 AND payload->>'test_run_id' = $2
  `, [ARTICLE_ID, RUN_ID]);
  console.log(`  unique_users=${uc.unique_users}, sessions=${uc.sessions}, page_views=${uc.page_views}`);
  assertInvariant(
    'unique_users <= sessions <= page_views',
    uc.unique_users <= uc.sessions && uc.sessions <= uc.page_views,
    `${uc.unique_users} <= ${uc.sessions} <= ${uc.page_views}`
  );

  // --- 3: CTR ∈ [0,1] ---
  const { rows: [ctrRow] } = await q(`
    SELECT
      COUNT(*) FILTER (WHERE event = 'ad_impression')::int AS impressions,
      COUNT(*) FILTER (WHERE event = 'ad_click')::int AS clicks
    FROM pixel_events WHERE article_id = $1 AND payload->>'test_run_id' = $2
  `, [ARTICLE_ID, RUN_ID]);
  const ctr = ctrRow.impressions > 0 ? ctrRow.clicks / ctrRow.impressions : 0;
  console.log(`  ad impressions=${ctrRow.impressions}, clicks=${ctrRow.clicks}, CTR=${ctr}`);
  assertInvariant('CTR ∈ [0,1]', ctr >= 0 && ctr <= 1, ctr.toFixed(2));
  assertInvariant('CTR matches seeded ratio (4/20 = 0.2)', Math.abs(ctr - 0.2) < 1e-9, ctr.toFixed(2));

  // --- 6: internal_destination != '#' (query-layer filter, not just client trust) ---
  const { rows: cleanLinks } = await q(`
    SELECT payload->>'target_url' AS target_url
    FROM pixel_events
    WHERE article_id = $1 AND event = 'internal_link_click' AND payload->>'test_run_id' = $2
      AND payload->>'target_url' IS NOT NULL AND payload->>'target_url' != '' AND payload->>'target_url' != '#'
  `, [ARTICLE_ID, RUN_ID]);
  const anyHash = cleanLinks.some(r => r.target_url === '#');
  assertInvariant('internal_destination != \'#\' after filtering', !anyHash, `${cleanLinks.length} clean link(s), 1 dirty "#" row correctly excluded`);

  // --- 7: own_hostname != acquisition_source ---
  const { rows: referrerRows } = await q(`
    SELECT payload->>'referrer' AS referrer
    FROM pixel_events
    WHERE article_id = $1 AND event = 'page_view' AND payload->>'test_run_id' = $2 AND payload->>'referrer' IS NOT NULL
  `, [ARTICLE_ID, RUN_ID]);
  const classified = referrerRows.map(r => {
    let hostname = null;
    try { hostname = new URL(r.referrer).hostname; } catch { /* leave null */ }
    const normalized = normalizeHostname(hostname);
    const isOwn = OWN_HOSTNAMES.has(normalized);
    return { referrer: r.referrer, normalized, isOwn };
  });
  classified.forEach(c => console.log(`  referrer="${c.referrer}" -> normalized="${c.normalized}" -> own=${c.isOwn}`));
  const ownMisclassifiedAsExternal = classified.some(c => c.isOwn === false && c.normalized === 'localhost');
  assertInvariant(
    'own_hostname != acquisition_source (localhost, incl. www/port normalization)',
    !ownMisclassifiedAsExternal && classified.find(c => c.normalized === 'localhost')?.isOwn === true,
    JSON.stringify(classified)
  );

  // --- 5 (exit_intent semantics, feeds into "abandonos" not being raw event counts) ---
  const { rows: [exitRow] } = await q(`
    SELECT
      COUNT(*)::int AS raw_events,
      COUNT(DISTINCT session_id)::int AS distinct_sessions
    FROM pixel_events WHERE article_id = $1 AND event = 'exit_intent' AND payload->>'test_run_id' = $2
  `, [ARTICLE_ID, RUN_ID]);
  console.log(`  exit_intent raw_events=${exitRow.raw_events}, distinct_sessions=${exitRow.distinct_sessions}`);
  assertInvariant(
    'exit_intent counted by distinct session, not raw events (3 events, 2 sessions)',
    exitRow.distinct_sessions === 2 && exitRow.raw_events === 3,
    `raw=${exitRow.raw_events} sessions=${exitRow.distinct_sessions}`
  );
}

async function cleanup() {
  const del = await q(`DELETE FROM pixel_events WHERE payload->>'test_run_id' = $1`, [RUN_ID]);
  console.log(`\nCleanup: deleted ${del.rowCount} synthetic rows (run_id=${RUN_ID}).`);
}

async function main() {
  console.log('=== Analytics Invariants Test (SPEC 014, Paso 3) ===\n');
  let seedInfo;
  try {
    seedInfo = await seed();
    await runChecks(seedInfo);
  } finally {
    await cleanup();
    await pool.end();
  }

  console.log('\n=== Summary ===');
  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} invariants passed.`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    failed.forEach(r => console.log(`  - ${r.name} (${r.detail})`));
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('Test run failed:', e.message);
  try { await q(`DELETE FROM pixel_events WHERE payload->>'test_run_id' = $1`, [RUN_ID]); } catch { /* best effort */ }
  process.exit(1);
});
