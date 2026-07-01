/**
 * Intelligence — Event Clustering & Detection
 * Events group related stories using entity-based matching (Jaccard similarity)
 * Complements story clustering: stories → events (higher-level aggregation)
 * Cost Killer 1: Algorithmic editorial scoring (no AI for simple events)
 */

import { query } from '../../../routes/db.js';
import { AiService } from '../../../services/AiService.js';
import { RELEVANCE_FILTER_THRESHOLD } from './stories.js';

const ai = new AiService();

// ── Event Clustering Constants ───────────────────────────────────────────────

export const EVENT_WINDOW_HOURS = 48;
export const EVENT_ENTITY_THRESHOLD = 0.35; // Jaccard on shared entities to group stories into one event
export const EVENT_SUMMARY_MIN_STORIES = 2;  // min story clusters before event gets AI summary
export const MIN_EVENT_MATCH_ENTITIES = 2;   // min story entities to qualify for event matching (mirrors creation guard)

export const EMPTY_EVENT_STATS = {
  storiesAnalyzed: 0,
  storiesMatched: 0,
  newEventsCreated: 0,
  singleEntityStoriesSkipped: 0
};

// ── Event Editorial Scoring (pure) ──────────────────────────────────────────

/**
 * calcEditorialScore — Calculate weighted editorial score for events
 * Components:
 *   - Importance score: 40% (scales 0-10 to 0-40)
 *   - Source count: 25% (capped at 5 sources)
 *   - Coverage status: 20% (breaking=20, growing=15, else=10)
 *   - Article count: 15% (capped at 20 articles)
 *
 * @param {number} importanceScore — 0-10
 * @param {number} sourceCount — Number of distinct sources
 * @param {number} articleCount — Total articles in event
 * @param {string} coverageStatus — 'breaking', 'growing', or other
 * @returns {number} — Editorial score 0-100
 */
export function calcEditorialScore(importanceScore, sourceCount, articleCount, coverageStatus) {
  const impPart    = (importanceScore / 10) * 40;
  const srcPart    = Math.min(sourceCount / 5, 1) * 25;
  const livePart   = coverageStatus === 'breaking' ? 20 : coverageStatus === 'growing' ? 15 : 10;
  const artPart    = Math.min(articleCount / 20, 1) * 15;
  return Math.round(impPart + srcPart + livePart + artPart);
}

// ── Event Detection (Story → Event matching) ────────────────────────────────

/**
 * detectEvents — Group related stories into events
 * Entity-based matching: stories with shared entities (Jaccard ≥ EVENT_ENTITY_THRESHOLD)
 * belong to the same event.
 *
 * Two-path flow:
 *   1. Match story to existing event (if enough shared entities)
 *   2. Create new event from story (if it has ≥2 entities)
 *
 * Design note: Event entities are NOT accumulated in-memory to prevent
 * cascade contamination (same bug fixed in Story Clustering 2.0). DB-loaded
 * entity sets are the only source of truth; next cycle re-evaluates with
 * the full merged set from the database.
 *
 * @param {string[]} affectedStoryIds — story_clusters UUIDs
 * @returns {{storiesAnalyzed, storiesMatched, newEventsCreated, singleEntityStoriesSkipped}}
 */
export async function detectEvents(affectedStoryIds) {
  if (affectedStoryIds.length === 0) return EMPTY_EVENT_STATS;

  // Load each affected story with its entity set
  const { rows: newStories } = await query(`
    SELECT
      sc.id,
      sc.title,
      sc.article_count,
      sc.source_count,
      sc.importance_score,
      sc.coverage_status,
      COALESCE(
        (SELECT array_agg(ke.name)
         FROM story_entities se
         JOIN knowledge_entities ke ON ke.id = se.entity_id
         WHERE se.story_id = sc.id),
        ARRAY[]::text[]
      ) AS entities
    FROM story_clusters sc
    WHERE sc.id = ANY($1::uuid[])
      AND sc.is_recurring = false
      AND sc.status IN ('active','summarizing','ready','followed')
  `, [affectedStoryIds]);

  if (newStories.length === 0) return EMPTY_EVENT_STATS;

  // Load active non-stale event clusters with their entity union and linked story ids
  const { rows: activeEvents } = await query(`
    SELECT
      ec.id,
      ec.headline,
      COALESCE(
        (SELECT array_agg(DISTINCT ke.name)
         FROM event_cluster_stories ecs
         JOIN story_entities se ON se.story_id = ecs.story_id
         JOIN knowledge_entities ke ON ke.id = se.entity_id
         WHERE ecs.event_id = ec.id),
        ARRAY[]::text[]
      ) AS entities,
      COALESCE(
        (SELECT array_agg(ecs.story_id)
         FROM event_cluster_stories ecs
         WHERE ecs.event_id = ec.id),
        ARRAY[]::uuid[]
      ) AS story_ids
    FROM event_clusters ec
    WHERE ec.status IN ('active','followed')
      AND ec.last_updated_at > now() - interval '${EVENT_WINDOW_HOURS} hours'
  `);

  const eventSigs = activeEvents.map(e => ({
    id:       e.id,
    entities: new Set((e.entities || []).map(n => n.toLowerCase())),
    storyIds: new Set((e.story_ids || []).map(String)),
  }));

  const affectedEventIds = new Set();
  const eventStats = {
    storiesAnalyzed:             0,
    storiesMatched:              0,
    newEventsCreated:            0,
    singleEntityStoriesSkipped:  0,
  };

  for (const story of newStories) {
    const storyEntities = new Set((story.entities || []).map(n => n.toLowerCase()));
    if (storyEntities.size === 0) continue;

    // Skip stories already linked to any active event — prevents creating duplicate events
    if (eventSigs.some(ev => ev.storyIds.has(String(story.id)))) continue;

    eventStats.storiesAnalyzed++;

    if (storyEntities.size < MIN_EVENT_MATCH_ENTITIES) {
      console.log(
        `[EventMatcher] Skip story ${story.id} "${(story.title || '').slice(0, 60)}": ` +
        `only ${storyEntities.size} entity (${[...storyEntities].join(', ')})`
      );
      eventStats.singleEntityStoriesSkipped++;
      continue;
    }

    let bestEventId = null;
    let bestScore   = 0;

    for (const ev of eventSigs) {
      if (ev.storyIds.has(String(story.id))) continue; // already linked
      const intersection = [...storyEntities].filter(e => ev.entities.has(e)).length;
      const union        = new Set([...storyEntities, ...ev.entities]).size;
      const score        = union === 0 ? 0 : intersection / union;
      if (score > bestScore) { bestScore = score; bestEventId = ev.id; }
    }

    if (bestScore >= EVENT_ENTITY_THRESHOLD && bestEventId) {
      await query(
        `INSERT INTO event_cluster_stories (event_id, story_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [bestEventId, story.id]
      );
      affectedEventIds.add(bestEventId);
      eventStats.storiesMatched++;
      // Track story membership only — do NOT accumulate entities into ev.entities.
      // Cascade entity accumulation caused the same contamination bug fixed in
      // Story Clustering 2.0. DB-loaded entity set is the only source of truth;
      // next cycle re-evaluates with the full merged entity set from the DB.
      const ev = eventSigs.find(e => e.id === bestEventId);
      if (ev) {
        ev.storyIds.add(String(story.id));
      }
    } else if (storyEntities.size >= 2) {
      // Create a new event candidate from this story
      const { rows } = await query(`
        INSERT INTO event_clusters (headline, event_type, importance_score, coverage_status)
        VALUES ($1, 'general', $2, $3)
        RETURNING id
      `, [story.title, story.importance_score || 5, story.coverage_status || 'monitoring']);
      const newEventId = rows[0].id;
      await query(
        `INSERT INTO event_cluster_stories (event_id, story_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [newEventId, story.id]
      );
      affectedEventIds.add(newEventId);
      eventStats.newEventsCreated++;
      eventSigs.push({
        id:       newEventId,
        entities: new Set(storyEntities),
        storyIds: new Set([String(story.id)]),
      });
    }
  }

  // Recalculate metrics for all affected events
  for (const eventId of affectedEventIds) {
    await query(`
      UPDATE event_clusters ec SET
        story_count   = (SELECT COUNT(*) FROM event_cluster_stories WHERE event_id = $1),
        article_count = (
          SELECT COALESCE(SUM(sc.article_count), 0)
          FROM event_cluster_stories ecs
          JOIN story_clusters sc ON sc.id = ecs.story_id
          WHERE ecs.event_id = $1
        ),
        source_count  = (
          SELECT COUNT(DISTINCT ma.source_id)
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          WHERE ecs.event_id = $1
        ),
        editorial_score = LEAST(100, GREATEST(0, ROUND((
          (ec.importance_score::float / 10 * 40)
          + LEAST((SELECT COUNT(DISTINCT ma2.source_id)::float / 5
                   FROM event_cluster_stories ecs2
                   JOIN story_cluster_articles sca2 ON sca2.story_id = ecs2.story_id
                   JOIN monitored_articles ma2 ON ma2.id = sca2.article_id
                   WHERE ecs2.event_id = $1), 1) * 25
          + CASE ec.coverage_status WHEN 'breaking' THEN 20 WHEN 'growing' THEN 15 ELSE 10 END
          + LEAST(COALESCE((SELECT SUM(sc2.article_count)::float / 20
                            FROM event_cluster_stories ecs3
                            JOIN story_clusters sc2 ON sc2.id = ecs3.story_id
                            WHERE ecs3.event_id = $1), 0), 1) * 15
        )::integer))),
        last_updated_at = now(),
        updated_at      = now()
      WHERE ec.id = $1
    `, [eventId]);
  }

  return eventStats;
}

/**
 * markStaleEvents — Mark inactive events as stale
 * Events older than EVENT_WINDOW_HOURS marked as stale
 */
export async function markStaleEvents() {
  await query(`
    UPDATE event_clusters SET status = 'stale', updated_at = now()
    WHERE status IN ('active','followed')
      AND last_updated_at < now() - interval '${EVENT_WINDOW_HOURS} hours'
  `);
}

/**
 * summarizePendingEvents — Generate AI summaries for new events (Cost Killer 1)
 * CURRENTLY COMMENTED OUT - Called only via explicit user action
 * Requires ≥EVENT_SUMMARY_MIN_STORIES stories to summarize
 * Filters articles by RELEVANCE_FILTER_THRESHOLD
 *
 * @deprecated Cost Killer 1: Disabled automatic summarization
 */
export async function summarizePendingEvents() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { rows: pending } = await query(`
    SELECT ec.id, ec.headline, ec.story_count, ec.article_count, ec.source_count, ec.coverage_status
    FROM event_clusters ec
    WHERE ec.status = 'active'
      AND ec.story_count >= $1
      AND ec.last_updated_at > now() - interval '${EVENT_WINDOW_HOURS} hours'
      AND (ec.last_summarized_at IS NULL OR ec.last_summarized_at < now() - interval '2 hours')
    ORDER BY ec.source_count DESC, ec.article_count DESC
    LIMIT 3
  `, [EVENT_SUMMARY_MIN_STORIES]);

  for (const event of pending) {
    try {
      const [storiesRes, articlesRes, entitiesRes] = await Promise.all([
        query(`
          SELECT sc.id, sc.title, sc.article_count, sc.source_count, sc.importance_score, sc.coverage_status
          FROM event_cluster_stories ecs
          JOIN story_clusters sc ON sc.id = ecs.story_id
          WHERE ecs.event_id = $1
        `, [event.id]),
        query(`
          SELECT DISTINCT ON (ma.id) ma.title, ma.url, ma.summary, ma.detected_at,
                 ma.content_text, ma.extraction_method, ma.content_words, ts.name AS source_name
          FROM event_cluster_stories ecs
          JOIN story_cluster_articles sca ON sca.story_id = ecs.story_id
          JOIN monitored_articles ma ON ma.id = sca.article_id
          JOIN rss_sources ts ON ts.id = ma.source_id
          WHERE ecs.event_id = $1
            AND sca.relevance_score >= ${RELEVANCE_FILTER_THRESHOLD}
          ORDER BY ma.id, ma.detected_at DESC
          LIMIT 25
        `, [event.id]),
        query(`
          SELECT DISTINCT ke.name, ke.entity_type
          FROM event_cluster_stories ecs
          JOIN story_entities se ON se.story_id = ecs.story_id
          JOIN knowledge_entities ke ON ke.id = se.entity_id
          WHERE ecs.event_id = $1
          LIMIT 15
        `, [event.id]),
      ]);

      // Log AI context for traceability
      query(`
        INSERT INTO ai_generation_logs (event_id, generation_type, article_count, article_titles, total_words_sent)
        VALUES ($1, 'event_summary', $2, $3, $4)
      `, [
        event.id,
        articlesRes.rows.length,
        JSON.stringify(articlesRes.rows.map(a => a.title)),
        articlesRes.rows.reduce((s, a) => s + (a.content_words || 0), 0),
      ]).catch(() => {});

      const result = await ai.generateEventSummary(
        storiesRes.rows, articlesRes.rows, entitiesRes.rows
      );

      const editScore = calcEditorialScore(
        result.importance_score ?? event.importance_score ?? 5,
        event.source_count,
        event.article_count,
        result.coverage_status || event.coverage_status
      );

      await query(`
        UPDATE event_clusters SET
          headline           = $1,
          summary            = $2,
          event_type         = $3,
          importance_score   = $4,
          editorial_score    = $5,
          coverage_status    = $6,
          main_entities      = $7,
          timeline           = $8,
          status             = 'active',
          last_summarized_at = now(),
          updated_at         = now()
        WHERE id = $9
      `, [
        result.headline      || result.event_name || event.headline,
        result.summary       || null,
        result.event_type    || 'general',
        result.importance_score ?? 5,
        editScore,
        result.coverage_status || 'monitoring',
        JSON.stringify(result.main_entities || []),
        JSON.stringify(result.timeline      || []),
        event.id,
      ]);

      // Persist structured editorial opportunities
      if (Array.isArray(result.editorial_opportunities) && result.editorial_opportunities.length > 0) {
        // Clear stale pending opportunities before inserting fresh ones
        await query(
          `DELETE FROM editorial_opportunities WHERE event_id = $1 AND status = 'pending'`,
          [event.id]
        );
        for (const opp of result.editorial_opportunities) {
          await query(`
            INSERT INTO editorial_opportunities
              (event_id, type, title, reason, seo_value, traffic_potential, difficulty)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            event.id,
            opp.type             || 'noticia',
            opp.title            || '',
            opp.reason           || null,
            opp.seo_value        || null,
            opp.traffic_potential || null,
            opp.difficulty       || null,
          ]);
        }
      }

      console.log(`[Monitor] Event ready: "${result.event_name || result.headline}" (score: ${editScore})`);
    } catch (e) {
      console.error(`[Monitor] Event summarization failed for "${event.headline}":`, e.message);
    }
  }
}
