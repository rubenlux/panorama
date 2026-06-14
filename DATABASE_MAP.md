# DATABASE_MAP.md — INSPYRA NEWS AUTONOMOUS EDITORIAL PLATFORM

Schema reference. PostgreSQL 15, host port 5435, DB `newsdb`.

---

## Core publishing

| Table | PK | Purpose |
|---|---|---|
| `articles` | UUID | Published articles (title, slug, body HTML, status, author_id) |
| `categories` | UUID | Article categories |
| `users` | UUID | Platform users (reporters, editors, admins) |
| `comments` | UUID | Reader comments on articles |
| `media` | UUID | Uploaded images/files |
| `reels` | UUID | Short-form video content |

---

## Research & Knowledge Base

| Table | PK | Purpose |
|---|---|---|
| `research_topics` | UUID | Research sessions (title, status, created_by) |
| `research_sources` | UUID | Scraped articles per topic (url, title, content, word_count, content_fetched, relevance_score) |
| `research_briefs` | UUID | Claude-generated briefs per topic (executive_summary, key_facts JSONB, timeline JSONB) |
| `knowledge_entities` | UUID | Named entities extracted from research (name, entity_type, entity_origin, mention_count) |
| `entity_mentions` | UUID | Links entity ↔ research_topic (confidence) |
| `knowledge_events` | UUID | Time-stamped events linked to entities |
| `article_content_cache` | UUID | 72h HTML fetch cache (url UNIQUE, content, word_count) |

### `knowledge_entities.entity_origin` values
- `RESEARCH` — extracted by Claude from research briefs. Drive the knowledge base, never trending.
- `MONITOR` — discovered by NER from RSS titles. Drive trending and clusters.
- `SOCIAL` — reserved for future social connectors.
- `MANUAL` — created by editors manually.

### Unique constraint on `knowledge_entities`
`(lower(name), entity_type, entity_origin)` — same name can exist as RESEARCH and MONITOR independently.

---

## News Monitor

| Table | PK | Purpose |
|---|---|---|
| `tracked_sources` | UUID | RSS feeds to poll (name, rss_url, check_interval, last_checked, enabled) |
| `monitored_articles` | UUID | Articles ingested from RSS (title, url, hash UNIQUE, source_id, detected_at) |
| `article_entity_matches` | — | M:M link between monitored_articles and knowledge_entities |
| `trending_topics` | UUID | Rolling 30-min trending signal per MONITOR entity (mention_count, source_count, auto_researched) |

---

## Trend Intelligence (Sprint 5.3)

| Table | PK | Purpose |
|---|---|---|
| `trend_clusters` | UUID | One cluster per entity per 6h news cycle (headline, summary, editorial_angles JSONB, article_count, source_count, status) |
| `trend_cluster_articles` | (trend_id, article_id) | Articles belonging to a cluster |

### `trend_clusters.status` lifecycle
```
active → summarizing → ready → followed
             ↓ (error)
           active (retry)
  active/ready → stale  (6h TTL with no new articles)
```
Summarization triggers when `article_count >= 3 OR source_count >= 2`.

---

## Social Intelligence (Fase 4)

| Table | PK | Purpose |
|---|---|---|
| `social_sources` | UUID | Curated accounts to monitor (platform, profile_url, enabled, etc.) |
| `social_posts` | UUID | Individual posts captured from those accounts |
| `social_clusters` | UUID | Topic groups formed by Jaccard keyword clustering on social posts. **Fields:** viral_score, engagement_score, growth_rate, sources_count |
| `social_cluster_posts` | `cluster_id`, `post_id` | Junction table |
| `social_fetch_logs` | UUID | Observability: Logs each fetch attempt per source (success, posts_found, errors) - Sprint 7.1 |

---

## Editorial Workflow

| Table | PK | Purpose |
|---|---|---|
| `editorial_dossiers` | UUID | Full editorial dossiers (created from research or trends) |
| `editorial_topics` | UUID | Topic seeds for dossiers |
| `topics` | UUID | Internal story topics |
| `tracked_sources` | (shared) | Also used by research connector |

---

## Ads & Analytics

| Table | PK | Purpose |
|---|---|---|
| `ad_campaigns` | UUID | Ad campaigns |
| `ad_placements` | UUID | Placement definitions |
| `pixel_events` | UUID | User behaviour events (user_interest_profile built from these) |
| `analytics_events` | UUID | Article view analytics |
| `subscribers` | UUID | Newsletter subscribers |

---

## Migrations (run order)

Scripts in `scripts/` as numbered files. Run manually via `node scripts/<file>` or `npm run db:init`.

| Script | What it does |
|---|---|
| `migrate_entity_origin.js` | Adds `entity_origin` col + new 3-col unique index to `knowledge_entities` |
| `migrate_full_article_research.js` | Creates `article_content_cache`, adds `content_fetched` to `research_sources` |
| `migrate_trend_clusters.js` | Creates `trend_clusters` + `trend_cluster_articles` |
