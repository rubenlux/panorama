import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import { query } from '../routes/db.js';
import { SocialFetcherPlaywrightYouTube, SocialFetcherPlaywrightFacebook, SocialFetcherGraphApiFacebook, SocialFetcherPlaywrightInstagram, SocialFetcherX, incrementalStats } from '../connectors/social/fetchers.js';
import { browserAudit } from '../services/browserLifecycleLogger.js';
import { fetchYouTubeTranscriptViaPlaywright, calculateQualityScore, detectEditorialType } from '../connectors/social/transcripts.js';
import { perfTracker } from '../services/PerformanceTracker.js';
import { startRun, finishRun } from './workerUtils.js';

const limit = pLimit(parseInt(process.env.SOCIAL_MAX_CONCURRENCY) || 3);
let isSocialRunning = false;
let socialSkippedCycles = 0;

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

  // Social Clustering 2.0 — category-gated clustering
  await query(`ALTER TABLE social_clusters ADD COLUMN IF NOT EXISTS detected_category VARCHAR(30) DEFAULT 'general'`).catch(() => {});

  // Expand content_type constraint to include 'tweets' (X platform)
  await query(`ALTER TABLE social_sources DROP CONSTRAINT IF EXISTS social_sources_content_type_check`).catch(() => {});
  await query(`ALTER TABLE social_sources ADD CONSTRAINT social_sources_content_type_check CHECK (content_type IN ('videos', 'shorts', 'posts', 'tweets'))`).catch(() => {});

  // Sprint Performance 10.0 — incremental fetching
  await query(`ALTER TABLE social_sources ADD COLUMN IF NOT EXISTS last_external_id VARCHAR(500)`).catch(() => {});
  await query(`ALTER TABLE social_sources ADD COLUMN IF NOT EXISTS freshness_window_seconds INTEGER DEFAULT 900`).catch(() => {});
  await query(`ALTER TABLE social_sources ADD COLUMN IF NOT EXISTS graph_api_supported BOOLEAN`).catch(() => {});
}

function getFetcher(source) {
  if (source.platform === 'youtube')   return new SocialFetcherPlaywrightYouTube(source);
  if (source.platform === 'facebook')  return new SocialFetcherGraphApiFacebook(source);
  if (source.platform === 'instagram') return new SocialFetcherPlaywrightInstagram(source);
  if (source.platform === 'x')         return new SocialFetcherX(source);
  return null;
}

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','en','por','que','de','del','al','se','lo','con',
  'es','son','fue','han','este','esta','para','pero','no','si','mas','muy','ya',
  'cuando','como','sobre','esto','eso','ante','bajo','tras','entre','sin','contra',
  // 4-letter common words that become visible with the new length threshold
  'bien','solo','debe','hace','sido','cada','otro','otra','todo','toda','algo',
  'poco','nada','aqui','alla','caso','vida','dias','anos','hora','hizo','tuvo',
  'sera','dice','dijo','dado','otro','cabe','unas','unos','cual','cuya',
]);

// ── Social Clustering 2.0 ─────────────────────────────────────────────────────
// Three-gate algorithm: Category → Specific-keyword → Jaccard threshold.
//
// Gate 1 (hard): post category must match cluster category. Sports posts never
//   join an international cluster just because both mention "Estados Unidos".
// Gate 2 (hard): at least 1 non-generic keyword must be shared. Words like
//   "argentina", "mundial", "estados", "unidos" are so frequent they cannot
//   be the sole reason for a match.
// Gate 3 (threshold): Jaccard ≥ 0.15 on specific (non-generic) keywords.
//
// Best-match wins (not first-match).

// Words too common across ALL topics to anchor a cluster on their own.
// These are not stopwords (they still exist in the keyword list) but
// they cannot satisfy Gate 2 alone.
const SOCIAL_GENERIC_TERMS = new Set([
  // Demonyms / country components — appear in every political AND sports story
  'argentina', 'estados', 'unidos', 'buenos', 'aires',
  // "mundial" (World Cup) appears in sports, economy ("crisis mundial"), society
  'mundial', 'mundo',
  // Generic geographic / institutional
  'pais', 'ciudad', 'nacion', 'publica',
  // Title filler adjectives
  'nuevo', 'nueva',
]);

const SOCIAL_CATEGORY_PATTERNS = {
  sports: [
    /\bgol\b/, /\bpartido\b/, /\bliga\b/, /\bcopa\b/, /\bequipo\b/,
    /\bseleccion\b/, /\bfutbol\b/, /\brugby\b/, /\btenis\b/,
    /\bbasket\b/, /\bdeport/, /\bcancha\b/, /\btorneo\b/,
    /\bcampeon\b/, /\bfixture\b/, /\bclasico\b/, /\bsuperliga\b/,
    /\bpremier\b/, /\bchampions\b/, /\briver\b/, /\bboca\b/,
    /\bfichaje\b/, /\brefuerzo\b/, /\btransferencia\b/, /\bjugador\b/,
    /\bentrenador\b/, /\bdirector.*tecnico\b/, /\bpase\b/,
    /\bformacion\b/, /\bconvocado\b/, /\barbitro\b/, /\boffsid/,
  ],
  international: [
    /\birak\b/, /\bisrael\b/, /\bgaza\b/, /\bucrania\b/,
    /\biran\b/, /\beeuu\b/, /\bestados.*unidos\b/,
    /\brusia\b/, /\bchina\b/, /\beuropa\b/,
    /\botan\b/, /\bonu\b/, /\bguerra\b/, /\bbomba\b/,
    /\bmisil\b/, /\bdiplom/, /\bcancilleria\b/, /\bembajad/,
    /\bnuclear\b/, /\bconflicto.*internaci/, /\bsancion\b/,
    /\bgeopolit/, /\bbloqueo\b/, /\bgolpe.*estado/,
  ],
  politics: [
    /\bmilei\b/, /\bkirchn/, /\bmacri\b/, /\bmassa\b/,
    /\bcongreso\b/, /\bsenado\b/, /\bdiputado\b/, /\bministro\b/,
    /\bdecreto\b/, /\bveto\b/, /\beleccion\b/, /\bvotacion\b/,
    /\boficialismo\b/, /\boposicion\b/, /\bcoalicion\b/,
    /\bcasarosada\b/, /\bpresidenta\b/, /\bgobernador\b/,
    /\bintendente\b/, /\blegislatura\b/, /\bpartido.*politico/,
  ],
  economy: [
    /\bdolar\b/, /\binflacion\b/, /\breservas\b/, /\bfmi\b/,
    /\bdeuda\b/, /\bbolsa\b/, /\beconomia\b/, /\brecesion\b/,
    /\bimpuesto\b/, /\barancel\b/, /\bpresupuesto\b/,
    /\bbanco.*central\b/, /\bpbi\b/, /\bpib\b/, /\bfinancier/,
    /\bcriptomoneda\b/, /\bbitcoin\b/, /\bmercado.*financ/,
    /\bdevalua/, /\bcepo\b/, /\bsubsidio\b/,
  ],
  security: [
    /\bcrimen\b/, /\bhomicidio\b/, /\basesinato\b/, /\brobo\b/, /\basalto\b/,
    /\btiroteo\b/, /\bbalacera\b/, /\bsecuestro\b/,
    /\bincendio\b/, /\bexplosion\b/, /\bmuertos\b/, /\bvictima/,
    /\bdetenido\b/, /\boperativo\b/, /\bpolicial\b/,
    /\bnarcotrafic/, /\baccidente.*vial\b/, /\bsiniestro\b/,
    /\bherido\b/, /\bfalleci/, /\batropell/,
  ],
  entertainment: [
    /\bactor\b/, /\bactriz\b/, /\bcantante\b/, /\bmusica\b/, /\bshow\b/,
    /\bconcierto\b/, /\bfestival\b/, /\bpelicula\b/, /\bserie\b/, /\bnetflix\b/,
    /\btelevision\b/, /\bcelebrid/, /\bfamoso\b/, /\bescandalo\b/,
    /\bespectaculo\b/, /\bcine\b/, /\bteatro\b/, /\bstreaming\b/,
    /\bchisme\b/, /\binfluencer\b/, /\btiktok\b/, /\binstagram\b/,
  ],
  society: [
    /\beducacion\b/, /\bsalud\b/, /\bderechos\b/, /\bprotesta\b/, /\bhuelga\b/,
    /\bvivienda\b/, /\bpobreza\b/, /\bdiscriminacion\b/, /\bfeminismo\b/,
    /\bclima\b/, /\becologia\b/, /\bmedioambiente\b/, /\breligion\b/,
    /\bciencia\b/, /\btecnologia\b/, /\binnovacion\b/, /\bcomunidad\b/,
  ],
};

// Precedence resolves ties; security & international trump everything
const SOCIAL_CATEGORY_PRECEDENCE = [
  'security', 'international', 'politics', 'economy',
  'sports', 'entertainment', 'society',
];

function detectSocialCategory(title) {
  // Normalize: lowercase + strip accents (same as extractWords)
  const t = (title || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const scores = {};
  for (const [cat, patterns] of Object.entries(SOCIAL_CATEGORY_PATTERNS)) {
    scores[cat] = patterns.filter(p => p.test(t)).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'general';
  return SOCIAL_CATEGORY_PRECEDENCE.find(cat => scores[cat] === maxScore) || 'general';
}

function extractWords(title) {
  if (!title) return [];
  return [...new Set(
    title.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents so "iran" = "irán"
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w =>
        w.length > 3 &&          // capture 4-char words: iran, otan, copa, boca, gaza
        !/^\d+$/.test(w) &&      // exclude pure numbers (2026, 2024 …)
        !STOP_WORDS.has(w)
      )
  )];
}

// ── Title sanitization ────────────────────────────────────────────────────────

function cleanSocialTitle(raw) {
  if (!raw) return null;
  // Tomar la primera línea no vacía como candidato
  const firstLine = raw.split('\n').map(l => l.trim()).find(l => l.length >= 15);
  if (!firstLine) return null;
  // Rechazar tokens tracking (alfanumérico sin espacios, >25 chars)
  if (/^[A-Za-z0-9]{25,}/.test(firstLine)) return null;
  // Rechazar repetición de "Facebook"
  if (/(Facebook){3,}/i.test(firstLine)) return null;
  // Rechazar "Compartido con:"
  if (/^Compartido con:/i.test(firstLine)) return null;
  // Rechazar "verificada" solo o con nombre corto
  if (/^[\w\s]{1,50}\s+verificad[ao]$/i.test(firstLine)) return null;
  // Rechazar URLs crudas
  if (/^https?:\/\//.test(firstLine)) return null;
  return firstLine.slice(0, 300);
}

// ── Clustering 2.0 ───────────────────────────────────────────────────────────

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
    SELECT id, title, COALESCE(detected_category, 'general') AS detected_category
    FROM social_clusters WHERE status = 'active'
  `);

  let created = 0, joined = 0;
  const affectedClusterIds = new Set();

  for (const post of posts) {
    const words = extractWords(post.title);
    if (words.length < 2) continue;

    const postCategory = detectSocialCategory(post.title);
    // Specific words = words that are not ultra-generic; these must anchor any match
    const specificWords = words.filter(w => !SOCIAL_GENERIC_TERMS.has(w));

    let bestClusterId = null;
    let bestScore     = 0;

    for (const cluster of activeClusters) {
      // ── Gate 1: category must match (either side 'general' = pass-through) ──
      const clusterCat = cluster.detected_category;
      if (postCategory !== 'general' && clusterCat !== 'general' && postCategory !== clusterCat) {
        continue;
      }

      const cWords    = extractWords(cluster.title);
      const cSpecific = cWords.filter(w => !SOCIAL_GENERIC_TERMS.has(w));

      let jaccard;

      if (specificWords.length > 0 && cSpecific.length > 0) {
        // ── Gate 2: at least 1 specific word must be shared ───────────────────
        const specificIntersection = specificWords.filter(w => cSpecific.includes(w));
        if (specificIntersection.length === 0) continue;

        // ── Gate 3: Jaccard on specific words ≥ 0.15 ─────────────────────────
        const specificUnion = new Set([...specificWords, ...cSpecific]).size;
        jaccard = specificIntersection.length / specificUnion;
        if (jaccard < 0.15) continue;
      } else {
        // Both sides lack specific words — fall back to all-word Jaccard ≥ 0.20
        const allIntersection = words.filter(w => cWords.includes(w));
        if (allIntersection.length < 2) continue;
        const allUnion = new Set([...words, ...cWords]).size;
        jaccard = allIntersection.length / allUnion;
        if (jaccard < 0.20) continue;
      }

      if (jaccard > bestScore) {
        bestScore     = jaccard;
        bestClusterId = cluster.id;
      }
    }

    if (bestClusterId) {
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [bestClusterId, post.id]);
      affectedClusterIds.add(bestClusterId);
      joined++;
    } else {
      const topWords = words.slice(0, 8);
      const views = post.views || 0;
      const { rows: [nc] } = await query(`
        INSERT INTO social_clusters
          (title, keywords, detected_category, post_count, source_count, sources_count,
           total_views, total_likes, total_engagement,
           engagement_score, viral_score, status, first_seen, last_seen)
        VALUES ($1, $2, $3, 1, 1, 1, $4::bigint, 0, $4::bigint, $4::float,
                LEAST(GREATEST(($4::float / 500)::int, 5), 30),
                'active', now(), now())
        RETURNING id
      `, [post.title.slice(0, 200), JSON.stringify(topWords), postCategory, views]);
      await query(`
        INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [nc.id, post.id]);
      activeClusters.push({ id: nc.id, title: post.title, detected_category: postCategory });
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
      title            = CASE
        WHEN sc.title ILIKE '%facebookfacebook%'
          OR sc.title ~ '^[A-Za-z0-9]{25,}'
          OR sc.title ILIKE 'compartido con:%'
        THEN COALESCE((
          SELECT sp.title FROM social_cluster_posts scp2
          JOIN social_posts sp ON sp.id = scp2.post_id
          WHERE scp2.cluster_id = sc.id
            AND sp.title IS NOT NULL
            AND LENGTH(sp.title) >= 15
          ORDER BY
            CASE
              WHEN sp.title NOT ILIKE '%facebookfacebook%'
                AND sp.title NOT ILIKE 'compartido con:%'
                AND sp.title NOT ILIKE '%cuenta verificada%'
                AND sp.title NOT ILIKE '%cuenta verificado%'
                AND sp.title !~ '^[A-Za-z0-9]{25,}'
                THEN 0
              WHEN sp.title NOT ILIKE '%facebookfacebook%'
                AND LENGTH(sp.title) < 200
                THEN 1
              WHEN sp.title NOT ILIKE '%facebookfacebook%'
                THEN 2
              ELSE 3
            END ASC,
            sp.likes DESC,
            LENGTH(sp.title) ASC
          LIMIT 1
        ), sc.title)
        ELSE sc.title
      END,
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
    const result = await fetchYouTubeTranscriptViaPlaywright(post.url);

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
        const result = await fetchYouTubeTranscriptViaPlaywright(post.url);
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

// ── Sprint Performance 10.0 — Freshness window ───────────────────────────────

function getFreshnessWindow(source) {
  if (source.freshness_window_seconds) return source.freshness_window_seconds;
  if (source.platform === 'youtube' && source.content_type === 'shorts') return 1800;
  return 900;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runSocialMonitor() {
  if (isSocialRunning) {
    socialSkippedCycles++;
    console.log('[SocialMonitor] A cycle is already in progress. Skipping this run.');
    return;
  }

  isSocialRunning = true;
  const cycleStart = Date.now();
  perfTracker.resetSocial();
  let sourcesProcessed = 0;
  let sourcesSkipped = 0;
  incrementalStats.reset();
  browserAudit.resetPeaks();

  console.log('\n=== Perf Profile: Social Monitor Cycle Start ===');
  console.time('Social Intelligence');

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
    isSocialRunning = false;
    return;
  }

  console.log(`[SocialMonitor] ${sources.length} active sources to process (Concurrency: ${process.env.SOCIAL_MAX_CONCURRENCY || 3})`);

  let totalSaved = 0;
  const allNewPostIds = [];

  // Parallel execution with p-limit
  await Promise.all(sources.map(source => limit(async () => {
    const startedAt = new Date();
    const platformStart = Date.now();
    let postsFound = 0;
    let postsSaved = 0;
    let errorMessage = null;
    let success = false;

    if (source.platform === 'x' && process.env.ENABLE_X_MONITOR === 'false') {
      console.log(`[SocialMonitor] Skip X/Twitter — disabled by ENABLE_X_MONITOR=false`);
      return;
    }

    // Freshness check — skip source if recently scraped
    const freshnessWindow = getFreshnessWindow(source);
    if (source.last_checked) {
      const ageMs = Date.now() - new Date(source.last_checked).getTime();
      if (ageMs < freshnessWindow * 1000) {
        const minsAgo = Math.floor(ageMs / 60000);
        console.log(`[SocialMonitor] Skip ${source.platform}/${source.name} (checked ${minsAgo} min ago)`);
        sourcesSkipped++;
        return;
      }
    }

    const fetcher = getFetcher(source);
    if (!fetcher) {
      console.log(`[SocialMonitor] Skip ${source.platform}/${source.name} — no fetcher yet`);
      return;
    }

    // Facebook — load known IDs for smart stop
    if (source.platform === 'facebook') {
      const { rows: knownRows } = await query(
        `SELECT external_id FROM social_posts WHERE source_id = $1 ORDER BY captured_at DESC LIMIT 100`,
        [source.id]
      ).catch(() => ({ rows: [] }));
      source._knownIds = new Set(knownRows.map(r => r.external_id));
    }

    try {
      const posts = await fetcher.fetchLatest();
      postsFound = posts.length;

      for (const p of posts) {
        const cleanedTitle = cleanSocialTitle(p.title);
        if (!p.external_id || !cleanedTitle) continue;
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
            cleanedTitle.slice(0, 500), p.content || '', p.thumbnail_url || '',
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

      // YouTube — persist newest external_id for smart stop on next cycle
      if (source.platform === 'youtube' && posts.length > 0) {
        await query(
          `UPDATE social_sources SET last_external_id = $1 WHERE id = $2`,
          [posts[0].external_id, source.id]
        ).catch(() => {});
      }

      success = true;
      sourcesProcessed++;
      totalSaved += postsSaved;
      
      const duration = Date.now() - platformStart;
      // Map platform/type to performance tracker key
      let perfKey = source.platform;
      if (source.platform === 'youtube') {
        if (source.content_type === 'posts') perfKey = 'youtube_posts';
        else if (source.content_type === 'videos') perfKey = 'youtube_videos';
        else if (source.content_type === 'shorts') perfKey = 'youtube_shorts';
      }
      perfTracker.trackSocialPlatform(perfKey, duration, postsFound, postsSaved);
      
      console.log(`[SocialMonitor] ${source.name} [${source.content_type}]: found=${postsFound} new=${postsSaved} (${duration}ms)`);

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
  })));

  // Clustering, metrics, staleness
  if (allNewPostIds.length > 0) {
    console.log(`[SocialMonitor] Clustering ${allNewPostIds.length} new posts...`);
    const { created, joined, clusterIds } = await clusterNewPosts(allNewPostIds);
    console.log(`[SocialMonitor] Clusters: created=${created} joined=${joined}`);
    if (clusterIds.length > 0) await recalcClusterMetrics(clusterIds);
  }

  await markStaleClusters();
  await recalcGapScores();
  await fetchPendingTranscripts();
  console.timeEnd('Social Intelligence');

  const totalTime = Date.now() - cycleStart;

  // Final Report
  console.log('\n=== Social Performance Report ===');
  console.log(`Facebook:       ${perfTracker.social.platforms.facebook.duration} ms`);
  console.log(`Instagram:      ${perfTracker.social.platforms.instagram.duration} ms`);
  console.log(`YouTube Posts:  ${perfTracker.social.platforms.youtube_posts.duration} ms`);
  console.log(`YouTube Videos: ${perfTracker.social.platforms.youtube_videos.duration} ms`);
  console.log(`YouTube Shorts: ${perfTracker.social.platforms.youtube_shorts.duration} ms`);
  console.log(`X:              ${perfTracker.social.platforms.x.duration} ms`);
  console.log('---------------------------');
  console.log(`Pages Opened:       ${perfTracker.social.pagesOpened}`);
  console.log(`Chromium Instances: ${perfTracker.social.browsersLaunched}`);
  console.log(`Total Social Time:  ${totalTime} ms`);
  console.log(`Ciclos omitidos por lock:   ${socialSkippedCycles}`);
  console.log('=================================\n');

  console.log('=== Social Optimization Report ===');
  console.log(`Sources Processed:        ${sourcesProcessed}`);
  console.log(`Sources Skipped:          ${sourcesSkipped}`);
  console.log(`Facebook Smart Stops:     ${incrementalStats.facebookSmartStops}`);
  console.log(`YouTube Smart Stops:      ${incrementalStats.youtubeSmartStops}`);
  console.log(`Est. Chromium Saved:      ${sourcesSkipped}`);
  console.log('==================================\n');

  browserAudit.report('SocialMonitor');

  await finishRun(runId, {
    status: 'success',
    sources_processed: sources.length,
    items_found: allNewPostIds.length,
    items_saved: totalSaved,
  });

  isSocialRunning = false;
}
