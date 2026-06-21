import { Router } from 'express';
import { query } from './db.js';
import { requireAuth } from '../middleware/auth.js';
import { investigate } from '../connectors/index.js';
import { AiService } from '../services/AiService.js';
import { fetchArticleContent } from '../services/ArticleFetcher.js';

const router = Router();
const ai = new AiService();

// Recover zombie topics on module load (Fix A)
// Any topic stuck in 'researching' at startup means the server crashed mid-pipeline.
async function recoverZombieTopics() {
  try {
    const { rowCount } = await query(
      `UPDATE research_topics
       SET status = 'failed', updated_at = now()
       WHERE status = 'researching'
         AND updated_at < now() - interval '10 minutes'`
    );
    if (rowCount > 0) console.log(`[Research] Recovered ${rowCount} zombie topic(s).`);
  } catch (e) {
    console.error('[Research] Zombie recovery failed:', e.message);
  }
}
recoverZombieTopics();

// GET /research/topics — list all topics (Fix C: subquery avoids brief-join multiply)
router.get('/topics', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT rt.*,
              (SELECT executive_summary FROM research_briefs WHERE topic_id = rt.id ORDER BY generated_at DESC LIMIT 1) AS executive_summary,
              (SELECT COUNT(*)::int     FROM research_sources WHERE topic_id = rt.id) AS sources_count
       FROM research_topics rt
       ORDER BY rt.created_at DESC
       LIMIT 50`
    );
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /research/topics/:id — get topic with sources and brief
router.get('/topics/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [topicRes, sourcesRes, briefRes, entitiesRes] = await Promise.all([
      query('SELECT * FROM research_topics WHERE id = $1', [id]),
      query('SELECT * FROM research_sources WHERE topic_id = $1 ORDER BY relevance_score DESC', [id]),
      query('SELECT * FROM research_briefs WHERE topic_id = $1 ORDER BY generated_at DESC LIMIT 1', [id]),
      query(
        `SELECT ke.id, ke.name, ke.entity_type, ke.description, ke.mention_count, em.confidence
         FROM entity_mentions em
         JOIN knowledge_entities ke ON ke.id = em.entity_id
         WHERE em.topic_id = $1
         ORDER BY ke.mention_count DESC`,
        [id]
      ),
    ]);

    if (!topicRes.rows[0]) return res.status(404).json({ error: 'Topic not found' });

    res.json({
      topic:    topicRes.rows[0],
      sources:  sourcesRes.rows,
      brief:    briefRes.rows[0] || null,
      entities: entitiesRes.rows,
    });
  } catch (e) { next(e); }
});

// POST /research/investigate — run research pipeline
router.post('/investigate', requireAuth, async (req, res, next) => {
  try {
    const { title, connectors = ['rss'] } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const userId = req.user?.sub || null;

    // 1. Create topic record (Fix D: store created_by)
    const topicRes = await query(
      `INSERT INTO research_topics (title, status, created_by) VALUES ($1, 'researching', $2) RETURNING *`,
      [title.trim(), userId]
    );
    const topic = topicRes.rows[0];

    // Respond immediately — UI polls for progress
    res.json({ topic, status: 'started' });

    // 2. Run pipeline in background
    setImmediate(() => _runPipeline(topic, title, connectors));

  } catch (e) { next(e); }
});

// POST /research/topics/:id/retry — re-run pipeline on failed/no_sources topics (Fix F)
router.post('/topics/:id/retry', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const topicRes = await query('SELECT * FROM research_topics WHERE id = $1', [id]);
    if (!topicRes.rows[0]) return res.status(404).json({ error: 'Not found' });

    const topic = topicRes.rows[0];
    if (topic.status === 'researching') {
      return res.status(409).json({ error: 'Already running' });
    }

    // Reset status and wipe previous sources/briefs
    await query(`DELETE FROM research_sources WHERE topic_id = $1`, [id]);
    await query(`DELETE FROM research_briefs  WHERE topic_id = $1`, [id]);
    await query(`UPDATE research_topics SET status = 'researching', updated_at = now() WHERE id = $1`, [id]);

    res.json({ topic: { ...topic, status: 'researching' }, status: 'started' });

    setImmediate(() => _runPipeline(topic, topic.title, ['rss']));
  } catch (e) { next(e); }
});

// Enrich top-N sources with full article content via ArticleFetcher.
// Falls back to RSS description if fetch fails (blocked, timeout, paywall).
const FULL_TEXT_TOP_N = 10;

async function _enrichSources(sources) {
  const enriched = [];
  let fetched = 0, fallback = 0, errors = 0;

  for (let i = 0; i < sources.length; i++) {
    const s = { ...sources[i], content_fetched: false };

    if (i < FULL_TEXT_TOP_N && s.url) {
      try {
        const result = await fetchArticleContent(s.url);
        if (result && result.word_count >= 50) {
          s.content         = result.content;
          s.word_count      = result.word_count;
          s.content_fetched = true;
          fetched++;
        } else {
          fallback++;
        }
      } catch {
        errors++;
      }
    } else {
      fallback++;
    }

    enriched.push(s);
  }

  console.log(`[Research] Content enrichment: ${fetched} full-text, ${fallback} RSS fallback, ${errors} errors`);
  return enriched;
}

async function _runPipeline(topic, title, connectors) {
  try {
    // Use tracked_sources from DB instead of hardcoded DEFAULT_FEEDS (Phase 2 fix — W1)
    const { rows: trackedFeeds } = await query(
      `SELECT name, rss_url AS url FROM rss_sources
       WHERE enabled = true AND rss_url IS NOT NULL
       ORDER BY trust_score DESC NULLS LAST`
    );
    const feedsToUse = trackedFeeds.length > 0 ? trackedFeeds : undefined;

    // Fetch sources from connectors
    const rawSources = await investigate(title, connectors, { feeds: feedsToUse });

    // Enrich with full article content (Sprint 5.2)
    const sources = await _enrichSources(rawSources);

    // Save sources
    if (sources.length > 0) {
      const capped = sources.slice(0, 20);
      const placeholders = capped
        .map((_, i) => `($1, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8}, $${i * 8 + 9})`)
        .join(', ');

      const params = [topic.id];
      capped.forEach(s => {
        const text      = s.content || '';
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        params.push(s.url, s.title, s.source_name, s.published_at, text, s.relevance_score, wordCount, s.content_fetched ?? false);
      });

      await query(
        `INSERT INTO research_sources
           (topic_id, url, title, source_name, published_at, content, relevance_score, word_count, content_fetched)
         VALUES ${placeholders}`,
        params
      );
    }

    // Generate brief with Claude
    let brief = null;
    if (sources.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const briefData = await Promise.race([
          ai.generateResearchBrief(title, sources),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Claude timeout after 90s')), 90_000)
          ),
        ]);

        const briefRes = await query(
          `INSERT INTO research_briefs
             (topic_id, executive_summary, key_facts, controversies, timeline, opportunities, risks, model_used)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            topic.id,
            briefData.executive_summary,
            JSON.stringify(briefData.key_facts || []),
            JSON.stringify(briefData.controversies || []),
            JSON.stringify(briefData.timeline || []),
            briefData.opportunities,
            briefData.risks,
            'claude-sonnet-4-6',
          ]
        );
        brief = briefRes.rows[0];
      } catch (aiErr) {
        console.error('[Research] Brief generation failed:', aiErr.message);
      }
    }

    // Extract and save entities if we have a brief (non-fatal)
    if (brief) {
      try {
        await _extractAndSaveEntities(topic.id, topic.title, brief);
      } catch (e) {
        console.error('[Research] Entity extraction failed (non-fatal):', e.message);
      }
    }

    // Update final status
    const finalStatus = brief ? 'completed' : (sources.length > 0 ? 'no_brief' : 'no_sources');
    await query(
      `UPDATE research_topics SET status = $1, updated_at = now() WHERE id = $2`,
      [finalStatus, topic.id]
    );

  } catch (err) {
    console.error('[Research] Pipeline error:', err);
    try {
      await query(
        `UPDATE research_topics SET status = 'failed', updated_at = now() WHERE id = $1`,
        [topic.id]
      );
    } catch (dbErr) {
      console.error('[Research] Could not update failed status:', dbErr.message);
    }
  }
}

async function _extractAndSaveEntities(topicId, topicTitle, brief) {
  const extracted = await ai.extractEntities(topicTitle, brief);
  const { entities = [], events = [] } = extracted;
  if (entities.length === 0) return;

  for (const entity of entities) {
    if (!entity.name || !entity.entity_type) continue;

    // Upsert entity: if same name+type exists, bump mention_count and last_seen_at
    const { rows } = await query(
      `INSERT INTO knowledge_entities (name, entity_type, entity_origin, description, first_seen_at, last_seen_at, mention_count)
       VALUES ($1, $2, 'RESEARCH', $3, now(), now(), 1)
       ON CONFLICT (lower(name), entity_type, entity_origin)
       DO UPDATE SET
         mention_count = knowledge_entities.mention_count + 1,
         last_seen_at  = now(),
         description   = COALESCE(NULLIF(EXCLUDED.description, ''), knowledge_entities.description),
         updated_at    = now()
       RETURNING id`,
      [entity.name.trim(), entity.entity_type, entity.description || null]
    );
    const entityId = rows[0].id;

    // Record this topic as a mention (ignore duplicate if topic was retried)
    await query(
      `INSERT INTO entity_mentions (entity_id, topic_id, confidence)
       VALUES ($1, $2, $3)
       ON CONFLICT (entity_id, topic_id) DO NOTHING`,
      [entityId, topicId, entity.confidence ?? 1.0]
    );
  }

  // Save events — link to their entity by name
  for (const ev of events) {
    if (!ev.entity_name || !ev.title) continue;
    const entityRes = await query(
      `SELECT id FROM knowledge_entities WHERE lower(name) = lower($1) LIMIT 1`,
      [ev.entity_name.trim()]
    );
    if (!entityRes.rows[0]) continue;

    await query(
      `INSERT INTO knowledge_events (entity_id, title, summary, event_date, event_type, source_topic_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entityRes.rows[0].id,
        ev.title.slice(0, 200),
        ev.summary || null,
        ev.event_date || null,
        ev.event_type || 'news',
        topicId,
      ]
    );
  }
}

// DELETE /research/topics/:id
router.delete('/topics/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM research_topics WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
