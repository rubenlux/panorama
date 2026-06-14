import Anthropic from '@anthropic-ai/sdk';
import { query } from '../routes/db.js';
import { SocialFetcherPlaywrightYouTube, SocialFetcherPlaywrightFacebook } from '../connectors/social/fetchers.js';
import { fetchYouTubeTranscript, calculateQualityScore, detectEditorialType } from '../connectors/social/transcripts.js';
import { startRun, finishRun } from './workerUtils.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL  = 'claude-haiku-4-5-20251001';

// Self-healing schema migrations — idempotent, run on every cycle start
async function ensureSchema() {
  await query(`ALTER TABLE social_fetch_logs ADD COLUMN IF NOT EXISTS posts_saved INTEGER DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE social_clusters   ADD COLUMN IF NOT EXISTS gap_score FLOAT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE social_clusters   ADD COLUMN IF NOT EXISTS opportunity_score FLOAT DEFAULT 0`).catch(() => {});

  // Sprint 8.0 — Transcript Intelligence
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS transcript_available BOOLEAN`).catch(() => {});
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS transcript_fetched_at TIMESTAMP`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS video_transcripts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id          UUID REFERENCES social_posts(id) ON DELETE CASCADE,
      transcript_text  TEXT,
      transcript_language VARCHAR(20),
      transcript_source   VARCHAR(20),
      transcript_length   INTEGER,
      fetched_at       TIMESTAMP DEFAULT NOW(),
      UNIQUE (post_id)
    )
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS transcript_analysis (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id          UUID REFERENCES social_posts(id) ON DELETE CASCADE,
      summary          TEXT,
      entities_people  JSONB DEFAULT '[]',
      entities_places  JSONB DEFAULT '[]',
      entities_orgs    JSONB DEFAULT '[]',
      main_topics      JSONB DEFAULT '[]',
      quotes           JSONB DEFAULT '[]',
      keywords         JSONB DEFAULT '[]',
      generated_at     TIMESTAMP DEFAULT NOW(),
      UNIQUE (post_id)
    )
  `).catch(() => {});

  // Sprint 8.3 — quality + editorial columns
  await query(`ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS word_count INTEGER`).catch(() => {});
  await query(`ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS quality_score INTEGER`).catch(() => {});
  await query(`ALTER TABLE transcript_analysis ADD COLUMN IF NOT EXISTS editorial_type VARCHAR(20)`).catch(() => {});
  await query(`ALTER TABLE transcript_analysis ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'`).catch(() => {});
}

function getFetcher(source) {
  if (source.platform === 'youtube') return new SocialFetcherPlaywrightYouTube(source);
  // Facebook is on-demand only — fetched via /sources/:id/check, not the worker
  return null;
}

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra'
]);

function extractWords(title) {
  if (!title) return [];
  return [...new Set(
    title.toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP_WORDS.has(w))
  )];
}

// ── Clustering ────────────────────────────────────────────────────────────────

export async function clusterNewPosts(newPostIds) {
  if (!newPostIds.length) return { created: 0, joined: 0, clusterIds: [] };

  const { rows: posts } = await query(`
    SELECT sp.id, sp.title, sp.views, sp.source_id
    FROM social_posts sp
    WHERE sp.id = ANY($1::uuid[])
      AND sp.id NOT IN (SELECT post_id FROM social_cluster_posts)
  `, [newPostIds]);

  if (!posts.length) return { created: 0, joined: 0, clusterIds: [] };

  const { rows: activeClusters } = await query(`
    SELECT id, title FROM social_clusters WHERE status = 'active'
  `);

  let created = 0, joined = 0;
  const affectedClusterIds = new Set();

  for (const post of posts) {
    const words = extractWords(post.title);
    if (!words.length) continue;

    let matchedClusterId = null;

    for (const cluster of activeClusters) {
      const cWords = extractWords(cluster.title);
      const intersection = words.filter(w => cWords.includes(w));
      if (intersection.length >= 2) {
        matchedClusterId = cluster.id;
        break;
      }
    }

    if (matchedClusterId) {
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [matchedClusterId, post.id]);
      affectedClusterIds.add(matchedClusterId);
      joined++;
    } else {
      const topWords = words.slice(0, 8);
      const views = post.views || 0;
      const { rows: [nc] } = await query(`
        INSERT INTO social_clusters
          (title, keywords, post_count, source_count, sources_count,
           total_views, total_likes, total_engagement,
           engagement_score, viral_score, status, first_seen, last_seen)
        VALUES ($1, $2, 1, 1, 1, $3::bigint, 0, $3::bigint, $3::float,
                LEAST(GREATEST(($3::float / 500)::int, 5), 30),
                'active', now(), now())
        RETURNING id
      `, [post.title.slice(0, 200), JSON.stringify(topWords), views]);
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [nc.id, post.id]);
      activeClusters.push({ id: nc.id, title: post.title });
      affectedClusterIds.add(nc.id);
      created++;
    }
  }

  return { created, joined, clusterIds: [...affectedClusterIds] };
}

export async function recalcClusterMetrics(clusterIds) {
  if (!clusterIds.length) return;

  await query(`
    UPDATE social_clusters sc
    SET
      post_count       = stats.post_count,
      source_count     = stats.source_count,
      sources_count    = stats.source_count,
      total_views      = stats.total_views,
      total_likes      = stats.total_likes,
      total_engagement = stats.total_engagement,
      engagement_score = stats.engagement_score,
      viral_score      = LEAST(
        (stats.total_engagement / 1000 + stats.source_count * 10)::int,
        100
      ),
      last_seen        = now(),
      updated_at       = now()
    FROM (
      SELECT
        scp.cluster_id,
        COUNT(*)                                 AS post_count,
        COUNT(DISTINCT p.source_id)              AS source_count,
        COALESCE(SUM(p.views), 0)                AS total_views,
        COALESCE(SUM(p.likes), 0)                AS total_likes,
        COALESCE(SUM(p.views + p.likes), 0)      AS total_engagement,
        COALESCE(AVG(p.engagement_score), 0)     AS engagement_score
      FROM social_cluster_posts scp
      JOIN social_posts p ON p.id = scp.post_id
      WHERE scp.cluster_id = ANY($1::uuid[])
      GROUP BY scp.cluster_id
    ) stats
    WHERE sc.id = stats.cluster_id
  `, [clusterIds]);
}

async function markStaleClusters() {
  const { rowCount } = await query(`
    UPDATE social_clusters SET status = 'stale', updated_at = now()
    WHERE status = 'active' AND last_seen < now() - interval '48 hours'
  `);
  if (rowCount > 0) console.log(`[SocialMonitor] Marked ${rowCount} clusters as stale`);
}

// gap_score: 1.0 = pure editorial gap; 0.0 = fully covered by existing stories
export async function recalcGapScores() {
  try {
    const { rows: socialClusters } = await query(`
      SELECT id, keywords FROM social_clusters WHERE status = 'active' AND keywords IS NOT NULL
    `);
    const { rows: storyClusters } = await query(`
      SELECT keywords FROM story_clusters
      WHERE status IN ('active','ready','growing','breaking') AND keywords IS NOT NULL
      LIMIT 1000
    `).catch(() => ({ rows: [] }));

    if (!socialClusters.length || !storyClusters.length) return;

    for (const sc of socialClusters) {
      const kA = Array.isArray(sc.keywords) ? sc.keywords : [];
      const setA = new Set(kA.map(k => String(k).toLowerCase()));
      if (!setA.size) continue;

      let maxJaccard = 0;
      for (const st of storyClusters) {
        const kB = Array.isArray(st.keywords) ? st.keywords : [];
        const setB = new Set(kB.map(k => String(k).toLowerCase()));
        if (!setB.size) continue;
        const inter = [...setA].filter(k => setB.has(k)).length;
        const union = new Set([...setA, ...setB]).size;
        const j = union > 0 ? inter / union : 0;
        if (j > maxJaccard) maxJaccard = j;
      }

      const gap_score = Math.round((1 - maxJaccard) * 100) / 100;
      const { rows: [cur] } = await query(`SELECT viral_score FROM social_clusters WHERE id = $1`, [sc.id]);
      const opportunity_score = Math.round((gap_score * (cur?.viral_score || 0)) * 10) / 10;
      await query(
        `UPDATE social_clusters SET gap_score = $1, opportunity_score = $2 WHERE id = $3`,
        [gap_score, opportunity_score, sc.id]
      );
    }
  } catch (e) {
    console.warn('[SocialMonitor] recalcGapScores skipped:', e.message);
  }
}

// ── Sprint 8.3: Auto-analysis pipeline ───────────────────────────────────────

async function autoAnalyzeTranscript(post, result) {
  if (!process.env.ANTHROPIC_API_KEY) return;

  // Skip if analysis already exists
  const { rows: [existing] } = await query(
    `SELECT id FROM transcript_analysis WHERE post_id = $1`, [post.id]
  ).catch(() => ({ rows: [] }));
  if (existing) return;

  const editorialType = detectEditorialType(post.title, result.text);

  const prompt = `Eres un analista periodístico. Analiza esta transcripción de video y extrae la información clave.

Video: "${post.title}"

Transcripción:
${result.text.slice(0, 12_000)}

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "summary": "resumen ejecutivo en 100-150 palabras",
  "key_points": ["punto clave 1", "punto clave 2", "punto clave 3", "punto clave 4", "punto clave 5"],
  "entities_people": ["persona1", "persona2"],
  "entities_orgs": ["org1", "org2"],
  "entities_places": ["lugar1", "lugar2"],
  "main_topics": ["tema1", "tema2", "tema3"],
  "quotes": ["cita destacada 1", "cita destacada 2"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

  try {
    const msg = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1500, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const jsonMatch = msg.content[0].text.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return;
    const a = JSON.parse(jsonMatch[0]);

    await query(`
      INSERT INTO transcript_analysis
        (post_id, summary, entities_people, entities_places, entities_orgs,
         main_topics, quotes, keywords, editorial_type, key_points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (post_id) DO UPDATE SET
        summary=EXCLUDED.summary, entities_people=EXCLUDED.entities_people,
        entities_places=EXCLUDED.entities_places, entities_orgs=EXCLUDED.entities_orgs,
        main_topics=EXCLUDED.main_topics, quotes=EXCLUDED.quotes,
        keywords=EXCLUDED.keywords, editorial_type=EXCLUDED.editorial_type,
        key_points=EXCLUDED.key_points, generated_at=NOW()
    `, [
      post.id,
      a.summary || '',
      JSON.stringify(a.entities_people  ?? []),
      JSON.stringify(a.entities_places  ?? []),
      JSON.stringify(a.entities_orgs    ?? []),
      JSON.stringify(a.main_topics      ?? []),
      JSON.stringify(a.quotes           ?? []),
      JSON.stringify(a.keywords         ?? []),
      editorialType,
      JSON.stringify(a.key_points       ?? []),
    ]);
    console.log(`[Transcript] Auto-analysis done for ${post.id} (${editorialType})`);
  } catch (e) {
    console.warn(`[Transcript] Auto-analysis failed ${post.id}: ${e.message}`);
  }
}

async function processTranscriptResult(post, result) {
  const wordCount    = result.text.trim().split(/\s+/).filter(Boolean).length;
  const qualityScore = calculateQualityScore(result.text, result.source);

  await query(`
    INSERT INTO video_transcripts
      (post_id, transcript_text, transcript_language, transcript_source,
       transcript_length, word_count, quality_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (post_id) DO UPDATE SET
      transcript_text=$2, transcript_language=$3, transcript_source=$4,
      transcript_length=$5, word_count=$6, quality_score=$7, fetched_at=NOW()
  `, [post.id, result.text, result.language, result.source, result.text.length, wordCount, qualityScore]);

  await query(`
    UPDATE social_posts SET transcript_available=true, transcript_fetched_at=NOW() WHERE id=$1
  `, [post.id]);

  // Sprint 8.4: auto-analysis disabled — editor triggers via /social/posts/:id/analyze
}

// ── Sprint 8.0: Transcript fetching ──────────────────────────────────────────

const TRANSCRIPT_BATCH = 8; // max videos checked per 30-min cycle (newest first)

async function fetchPendingTranscripts() {
  // Only YouTube videos and shorts (community posts are text-only)
  const { rows: pending } = await query(`
    SELECT sp.id, sp.url, sp.title, ss.content_type
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube'
      AND ss.content_type IN ('videos', 'shorts')
      AND sp.url IS NOT NULL
      AND sp.transcript_fetched_at IS NULL
    ORDER BY sp.captured_at DESC
    LIMIT $1
  `, [TRANSCRIPT_BATCH]);

  if (!pending.length) return;

  console.log(`[SocialMonitor] Transcript check: ${pending.length} videos pending`);
  let found = 0;

  for (const post of pending) {
    const result = await fetchYouTubeTranscript(post.url);

    if (result === null) continue; // transient — retry next cycle

    if (result.available) {
      await processTranscriptResult(post, result);
      found++;
    } else {
      await query(`
        UPDATE social_posts SET transcript_available=false, transcript_fetched_at=NOW() WHERE id=$1
      `, [post.id]);
    }
  }

  console.log(`[SocialMonitor] Transcripts: found=${found}/${pending.length}`);
}

// ── Sprint 8.3: Historical backfill ──────────────────────────────────────────

const BACKFILL_PER_CYCLE  = 12; // max historical videos per cycle — conservative to avoid YT rate limits
const BACKFILL_CONCURRENT = 2;  // parallel requests per batch

async function backfillTranscripts() {
  const { rows: pending } = await query(`
    SELECT sp.id, sp.url, sp.title, ss.content_type
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube'
      AND ss.content_type IN ('videos', 'shorts')
      AND sp.url IS NOT NULL
      AND sp.transcript_fetched_at IS NULL
    ORDER BY sp.captured_at ASC
    LIMIT $1
  `, [BACKFILL_PER_CYCLE]);

  if (!pending.length) return;

  console.log(`[Backfill] ${pending.length} historical transcripts to process`);
  let processed = 0;

  for (let i = 0; i < pending.length; i += BACKFILL_CONCURRENT) {
    const batch = pending.slice(i, i + BACKFILL_CONCURRENT);

    await Promise.all(batch.map(async (post) => {
      try {
        const result = await fetchYouTubeTranscript(post.url);
        if (result === null) return; // transient — will retry next cycle
        if (result.available) {
          await processTranscriptResult(post, result);
          processed++;
        } else {
          await query(`
            UPDATE social_posts SET transcript_available=false, transcript_fetched_at=NOW() WHERE id=$1
          `, [post.id]);
        }
      } catch (e) {
        console.warn(`[Backfill] error ${post.id}: ${e.message}`);
      }
    }));

    if (i + BACKFILL_CONCURRENT < pending.length) {
      await new Promise(r => setTimeout(r, 4000)); // 4s between batches — avoid YT rate limits
    }
  }

  // Persist progress
  const { rows: [rem] } = await query(`
    SELECT COUNT(*)::int AS remaining
    FROM social_posts sp
    JOIN social_sources ss ON ss.id = sp.source_id
    WHERE sp.platform = 'youtube' AND ss.content_type IN ('videos','shorts')
      AND sp.transcript_fetched_at IS NULL
  `).catch(() => ({ rows: [{ remaining: -1 }] }));

  await query(`
    INSERT INTO settings (key, value) VALUES ('transcript_backfill_state', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [JSON.stringify({
    last_run:             new Date().toISOString(),
    processed_this_cycle: processed,
    remaining:            rem.remaining,
  })]).catch(() => {});

  console.log(`[Backfill] Done: processed=${processed} remaining=${rem.remaining}`);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runSocialMonitor() {
  const cycleStart = Date.now();
  console.log('[SocialMonitor] ─── Cycle start ───────────────────────────────');

  await ensureSchema();

  const runId = await startRun('social_monitor');

  const { rows: sources } = await query(`
    SELECT * FROM social_sources
    WHERE enabled = true
    ORDER BY last_checked ASC NULLS FIRST
  `);

  if (!sources.length) {
    console.log('[SocialMonitor] No active sources. Exiting cycle.');
    await finishRun(runId, { status: 'success' });
    return;
  }

  console.log(`[SocialMonitor] ${sources.length} active sources to process`);

  let totalSaved = 0;
  const allNewPostIds = [];

  for (const source of sources) {
    const startedAt = new Date();
    let postsFound = 0;
    let postsSaved = 0;
    let errorMessage = null;
    let success = false;

    const fetcher = getFetcher(source);
    if (!fetcher) {
      console.log(`[SocialMonitor] Skip ${source.platform}/${source.name} — no fetcher yet`);
      continue;
    }

    try {
      const posts = await fetcher.fetchLatest();
      postsFound = posts.length;

      for (const p of posts) {
        if (!p.external_id || !p.title?.trim()) continue;
        try {
          const res = await query(`
            INSERT INTO social_posts
              (source_id, platform, external_id, url, published_at,
               title, content, thumbnail_url,
               views, likes, comments, shares, engagement_score, keywords)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (platform, external_id) DO UPDATE SET
              views            = GREATEST(social_posts.views, EXCLUDED.views),
              likes            = GREATEST(social_posts.likes, EXCLUDED.likes),
              engagement_score = EXCLUDED.engagement_score,
              title            = EXCLUDED.title,
              thumbnail_url    = CASE WHEN EXCLUDED.thumbnail_url <> '' THEN EXCLUDED.thumbnail_url ELSE social_posts.thumbnail_url END
            RETURNING id, (xmax = 0) AS is_new
          `, [
            source.id, p.platform, p.external_id, p.url || '',
            p.published_at || new Date().toISOString(),
            p.title.slice(0, 500), p.content || '', p.thumbnail_url || '',
            p.views || 0, p.likes || 0, p.comments || 0, p.shares || 0,
            p.engagement_score || 0, JSON.stringify(p.keywords || [])
          ]);

          if (res.rowCount > 0 && res.rows[0].is_new) {
            postsSaved++;
            allNewPostIds.push(res.rows[0].id);
          }
        } catch (e) {
          console.warn(`[SocialMonitor] upsert error ${p.external_id}: ${e.message}`);
        }
      }

      await query(`
        UPDATE social_sources
        SET last_checked = now(),
            post_count   = (SELECT COUNT(*) FROM social_posts WHERE source_id = $1)
        WHERE id = $1
      `, [source.id]);

      success = true;
      totalSaved += postsSaved;
      console.log(`[SocialMonitor] ${source.name} [${source.content_type}]: found=${postsFound} new=${postsSaved}`);

    } catch (e) {
      errorMessage = e.message.slice(0, 500);
      console.error(`[SocialMonitor] ERROR ${source.name}: ${e.message}`);
    }

    await query(`
      INSERT INTO social_fetch_logs
        (source_id, platform, started_at, finished_at, success, posts_found, posts_saved, error_message)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [source.id, source.platform, startedAt, new Date(), success, postsFound, postsSaved, errorMessage])
      .catch(e => console.warn(`[SocialMonitor] fetch log write failed: ${e.message}`));
  }

  // Clustering, metrics, staleness
  if (allNewPostIds.length > 0) {
    console.log(`[SocialMonitor] Clustering ${allNewPostIds.length} new posts...`);
    const { created, joined, clusterIds } = await clusterNewPosts(allNewPostIds);
    console.log(`[SocialMonitor] Clusters: created=${created} joined=${joined}`);
    if (clusterIds.length > 0) await recalcClusterMetrics(clusterIds);
  }

  await markStaleClusters();
  await recalcGapScores();
  // Sprint 8.4: transcripts now ON DEMAND only — editor triggers via UI
  // await fetchPendingTranscripts();
  // await backfillTranscripts();

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`[SocialMonitor] ─── Done in ${elapsed}s — new_posts=${totalSaved} sources_processed=${sources.length} ───`);
  await finishRun(runId, {
    status: 'success',
    sources_processed: sources.length,
    items_found: allNewPostIds.length,
    items_saved: totalSaved,
  });
}
