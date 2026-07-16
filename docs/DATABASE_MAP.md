# Panorama Informativo — Reconstructed Database Map

*Generated automatically from database metadata queries on 15/7/2026.*

## Summary Statistics

- **Total Tables:** 72
- **Total Views:** 3
- **Total Indexes:** 221
- **Active Extensions:** plpgsql 1.0, pgcrypto 1.3

## Tables

### `ad_events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`ad_id`** | `uuid` | YES | — |
| **`type`** | `text` | NO | — |
| **`ip`** | `text` | YES | — |
| **`user_agent`** | `text` | YES | — |
| **`article_id`** | `uuid` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `now()` |

**Indexes:**

- `ad_events_pkey`: `CREATE UNIQUE INDEX ad_events_pkey ON public.ad_events USING btree (id)`
- `idx_ad_events_ad_id`: `CREATE INDEX idx_ad_events_ad_id ON public.ad_events USING btree (ad_id)`
- `idx_ad_events_type`: `CREATE INDEX idx_ad_events_type ON public.ad_events USING btree (type)`

----

### `ad_revenue`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`ad_id`** | `uuid` | NO | — |
| **`impressions`** | `integer` | NO | `0` |
| **`clicks`** | `integer` | NO | `0` |
| **`revenue`** | `numeric` | NO | `0` |
| **`period_start`** | `date` | NO | — |
| **`period_end`** | `date` | NO | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `ad_revenue_ad_id_period_start_period_end_key`: `CREATE UNIQUE INDEX ad_revenue_ad_id_period_start_period_end_key ON public.ad_revenue USING btree (ad_id, period_start, period_end)`
- `ad_revenue_pkey`: `CREATE UNIQUE INDEX ad_revenue_pkey ON public.ad_revenue USING btree (id)`

----

### `ad_slots`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `text` | NO | — |
| **`position`** | `text` | NO | — |
| **`device`** | `text` | YES | `'all'::text` |
| **`width`** | `integer` | YES | — |
| **`height`** | `integer` | YES | — |
| **`active`** | `boolean` | YES | `true` |
| **`created_at`** | `timestamp without time zone` | YES | `now()` |

**Indexes:**

- `ad_slots_pkey`: `CREATE UNIQUE INDEX ad_slots_pkey ON public.ad_slots USING btree (id)`

----

### `ads`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`sponsor_name`** | `character varying` | NO | — |
| **`type`** | `character varying` | YES | `'banner'::character varying` |
| **`position`** | `character varying` | YES | — |
| **`image_url`** | `text` | NO | — |
| **`link_url`** | `text` | YES | — |
| **`impressions`** | `integer` | YES | `0` |
| **`clicks`** | `integer` | YES | `0` |
| **`active`** | `boolean` | YES | `true` |
| **`start_date`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`end_date`** | `timestamp without time zone` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`campaign_id`** | `uuid` | YES | — |
| **`ad_slot_id`** | `uuid` | YES | — |
| **`alt_text`** | `text` | YES | — |
| **`starts_at`** | `timestamp without time zone` | YES | — |
| **`ends_at`** | `timestamp without time zone` | YES | — |

**Indexes:**

- `ads_pkey`: `CREATE UNIQUE INDEX ads_pkey ON public.ads USING btree (id)`

----

### `advertisers`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `text` | NO | — |
| **`email`** | `text` | YES | — |
| **`contact_name`** | `text` | YES | — |
| **`active`** | `boolean` | YES | `true` |
| **`created_at`** | `timestamp without time zone` | YES | `now()` |

**Indexes:**

- `advertisers_pkey`: `CREATE UNIQUE INDEX advertisers_pkey ON public.advertisers USING btree (id)`

----

### `ai_generation_logs`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`story_id`** | `uuid` | YES | — |
| **`event_id`** | `uuid` | YES | — |
| **`generation_type`** | `character varying` | NO | — |
| **`article_count`** | `integer` | NO | `0` |
| **`article_titles`** | `jsonb` | NO | `'[]'::jsonb` |
| **`total_words_sent`** | `integer` | NO | `0` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `ai_gen_logs_created_idx`: `CREATE INDEX ai_gen_logs_created_idx ON public.ai_generation_logs USING btree (created_at DESC)`
- `ai_gen_logs_event_idx`: `CREATE INDEX ai_gen_logs_event_idx ON public.ai_generation_logs USING btree (event_id)`
- `ai_gen_logs_story_idx`: `CREATE INDEX ai_gen_logs_story_idx ON public.ai_generation_logs USING btree (story_id)`
- `ai_generation_logs_pkey`: `CREATE UNIQUE INDEX ai_generation_logs_pkey ON public.ai_generation_logs USING btree (id)`

----

### `article_categories`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`article_id`** | `uuid` | NO | — |
| **`category_id`** | `uuid` | NO | — |

**Indexes:**

- `article_categories_pkey`: `CREATE UNIQUE INDEX article_categories_pkey ON public.article_categories USING btree (article_id, category_id)`

----

### `article_content_cache`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('article_content_cache_id_seq'::regclass)` |
| **`url`** | `text` | NO | — |
| **`title`** | `text` | YES | — |
| **`content`** | `text` | NO | — |
| **`word_count`** | `integer` | NO | `0` |
| **`fetched_at`** | `timestamp with time zone` | NO | `now()` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `article_content_cache_pkey`: `CREATE UNIQUE INDEX article_content_cache_pkey ON public.article_content_cache USING btree (id)`
- `article_content_cache_url_key`: `CREATE UNIQUE INDEX article_content_cache_url_key ON public.article_content_cache USING btree (url)`
- `idx_acc_fetched`: `CREATE INDEX idx_acc_fetched ON public.article_content_cache USING btree (fetched_at DESC)`
- `idx_acc_url`: `CREATE INDEX idx_acc_url ON public.article_content_cache USING btree (url)`

----

### `article_entity_matches`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`article_id`** | `uuid` | NO | — |
| **`entity_id`** | `uuid` | NO | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `article_entity_matches_pkey`: `CREATE UNIQUE INDEX article_entity_matches_pkey ON public.article_entity_matches USING btree (id)`
- `idx_aem_by_article`: `CREATE INDEX idx_aem_by_article ON public.article_entity_matches USING btree (article_id)`
- `idx_aem_by_entity`: `CREATE INDEX idx_aem_by_entity ON public.article_entity_matches USING btree (entity_id)`
- `idx_aem_unique`: `CREATE UNIQUE INDEX idx_aem_unique ON public.article_entity_matches USING btree (article_id, entity_id)`

----

### `article_seo`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`article_id`** | `uuid` | NO | — |
| **`meta_title`** | `character varying` | YES | — |
| **`meta_description`** | `text` | YES | — |
| **`canonical_url`** | `text` | YES | — |
| **`og_title`** | `character varying` | YES | — |
| **`og_description`** | `text` | YES | — |
| **`og_image`** | `text` | YES | — |
| **`schema_json`** | `text` | YES | — |
| **`keywords`** | `text` | YES | — |

**Indexes:**

- `article_seo_pkey`: `CREATE UNIQUE INDEX article_seo_pkey ON public.article_seo USING btree (article_id)`

----

### `article_stats`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`article_id`** | `uuid` | NO | — |
| **`views`** | `integer` | YES | `0` |
| **`unique_views`** | `integer` | YES | `0` |
| **`likes`** | `integer` | YES | `0` |
| **`shares`** | `integer` | YES | `0` |
| **`comments_count`** | `integer` | YES | `0` |
| **`avg_read_time`** | `integer` | YES | `0` |
| **`last_viewed_at`** | `timestamp without time zone` | YES | — |
| **`total_read_time_seconds`** | `bigint` | YES | `0` |
| **`bounce_rate`** | `real` | YES | `0` |

**Indexes:**

- `article_stats_pkey`: `CREATE UNIQUE INDEX article_stats_pkey ON public.article_stats USING btree (article_id)`

----

### `articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`author_id`** | `uuid` | YES | — |
| **`title`** | `character varying` | NO | — |
| **`slug`** | `character varying` | NO | — |
| **`excerpt`** | `text` | YES | — |
| **`body`** | `text` | YES | — |
| **`status`** | `character varying` | YES | `'draft'::character varying` |
| **`published_at`** | `timestamp without time zone` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`volanta`** | `character varying` | YES | — |
| **`image_url`** | `text` | YES | — |
| **`epigraph`** | `text` | YES | — |
| **`origin`** | `character varying` | YES | `'manual'::character varying` |
| **`dossier_id`** | `uuid` | YES | — |
| **`created_by`** | `uuid` | YES | — |
| **`created_via`** | `character varying` | YES | `'cms_ui'::character varying` |
| **`workflow`** | `character varying` | YES | `'manual'::character varying` |
| **`scheduled_at`** | `timestamp with time zone` | YES | — |
| **`image`** | `text` | YES | — |
| **`updated_at`** | `timestamp with time zone` | NO | `now()` |
| **`coverage_scope`** | `character varying` | YES | `'national'::character varying` |
| **`region`** | `character varying` | YES | — |
| **`word_count`** | `integer` | YES | `0` |

**Indexes:**

- `articles_pkey`: `CREATE UNIQUE INDEX articles_pkey ON public.articles USING btree (id)`
- `articles_slug_key`: `CREATE UNIQUE INDEX articles_slug_key ON public.articles USING btree (slug)`
- `idx_articles_coverage`: `CREATE INDEX idx_articles_coverage ON public.articles USING btree (coverage_scope)`
- `idx_articles_created_by`: `CREATE INDEX idx_articles_created_by ON public.articles USING btree (created_by)`
- `idx_articles_created_via`: `CREATE INDEX idx_articles_created_via ON public.articles USING btree (created_via)`
- `idx_articles_dossier`: `CREATE INDEX idx_articles_dossier ON public.articles USING btree (dossier_id)`
- `idx_articles_origin`: `CREATE INDEX idx_articles_origin ON public.articles USING btree (origin)`
- `idx_articles_region`: `CREATE INDEX idx_articles_region ON public.articles USING btree (region)`
- `idx_articles_workflow`: `CREATE INDEX idx_articles_workflow ON public.articles USING btree (workflow)`

----

### `campaigns`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`advertiser_id`** | `uuid` | YES | — |
| **`name`** | `text` | NO | — |
| **`start_date`** | `timestamp without time zone` | YES | — |
| **`end_date`** | `timestamp without time zone` | YES | — |
| **`budget`** | `numeric` | YES | `0` |
| **`status`** | `text` | YES | `'draft'::text` |
| **`created_at`** | `timestamp without time zone` | YES | `now()` |
| **`pricing_model`** | `character varying` | YES | `'CPM'::character varying` |
| **`price`** | `numeric` | YES | `0.00` |
| **`currency`** | `character varying` | YES | `'USD'::character varying` |
| **`tags`** | `ARRAY` | YES | `'{}'::text[]` |

**Indexes:**

- `campaigns_pkey`: `CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id)`
- `idx_campaigns_tags`: `CREATE INDEX idx_campaigns_tags ON public.campaigns USING gin (tags)`

----

### `categories`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`slug`** | `character varying` | NO | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `categories_pkey`: `CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id)`
- `categories_slug_key`: `CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug)`

----

### `comments`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`article_id`** | `uuid` | YES | — |
| **`parent_id`** | `uuid` | YES | — |
| **`user_id`** | `uuid` | YES | — |
| **`author_name`** | `character varying` | YES | — |
| **`author_email`** | `character varying` | YES | — |
| **`body`** | `text` | YES | — |
| **`status`** | `character varying` | YES | `'pending'::character varying` |
| **`ip_hash`** | `character varying` | YES | — |
| **`user_agent`** | `text` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `comments_pkey`: `CREATE UNIQUE INDEX comments_pkey ON public.comments USING btree (id)`

----

### `contact_messages`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`email`** | `character varying` | NO | — |
| **`subject`** | `character varying` | NO | — |
| **`message`** | `text` | NO | — |
| **`status`** | `character varying` | YES | `'new'::character varying` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `contact_messages_pkey`: `CREATE UNIQUE INDEX contact_messages_pkey ON public.contact_messages USING btree (id)`
- `idx_contact_messages_email`: `CREATE INDEX idx_contact_messages_email ON public.contact_messages USING btree (email)`
- `idx_contact_messages_status_created`: `CREATE INDEX idx_contact_messages_status_created ON public.contact_messages USING btree (status, created_at DESC)`

----

### `coverage_changes`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`tracked_source_id`** | `uuid` | NO | — |
| **`tracked_article_id`** | `uuid` | YES | — |
| **`change_type`** | `character varying` | NO | — |
| **`old_value`** | `text` | YES | — |
| **`new_value`** | `text` | YES | — |
| **`detected_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `coverage_changes_pkey`: `CREATE UNIQUE INDEX coverage_changes_pkey ON public.coverage_changes USING btree (id)`
- `idx_coverage_changes_global`: `CREATE INDEX idx_coverage_changes_global ON public.coverage_changes USING btree (detected_at DESC)`
- `idx_coverage_changes_source`: `CREATE INDEX idx_coverage_changes_source ON public.coverage_changes USING btree (tracked_source_id, detected_at DESC)`
- `idx_coverage_changes_type`: `CREATE INDEX idx_coverage_changes_type ON public.coverage_changes USING btree (change_type, detected_at DESC)`

----

### `crawl_attempts`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `bigint` | NO | `nextval('crawl_attempts_id_seq'::regclass)` |
| **`session_id`** | `uuid` | NO | — |
| **`article_id`** | `uuid` | NO | — |
| **`domain`** | `text` | NO | — |
| **`attempt_number`** | `integer` | NO | `1` |
| **`stage`** | `character varying` | NO | — |
| **`status`** | `character varying` | NO | — |
| **`reason`** | `character varying` | YES | — |
| **`http_status`** | `integer` | YES | — |
| **`duration_ms`** | `integer` | YES | — |
| **`bytes_downloaded`** | `integer` | YES | — |
| **`content_length`** | `integer` | YES | — |
| **`content_hash`** | `character varying` | YES | — |
| **`retryable`** | `boolean` | YES | — |
| **`details`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `crawl_attempts_pkey`: `CREATE UNIQUE INDEX crawl_attempts_pkey ON public.crawl_attempts USING btree (id)`
- `idx_crawl_attempts_article`: `CREATE INDEX idx_crawl_attempts_article ON public.crawl_attempts USING btree (article_id)`
- `idx_crawl_attempts_domain`: `CREATE INDEX idx_crawl_attempts_domain ON public.crawl_attempts USING btree (domain, created_at DESC)`
- `idx_crawl_attempts_lookup`: `CREATE INDEX idx_crawl_attempts_lookup ON public.crawl_attempts USING btree (domain, status, created_at DESC)`
- `idx_crawl_attempts_session`: `CREATE INDEX idx_crawl_attempts_session ON public.crawl_attempts USING btree (session_id)`

----

### `crawl_content_versions`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `bigint` | NO | `nextval('crawl_content_versions_id_seq'::regclass)` |
| **`article_id`** | `uuid` | NO | — |
| **`content_hash`** | `character varying` | NO | — |
| **`word_count`** | `integer` | YES | — |
| **`version_number`** | `integer` | NO | `1` |
| **`change_reason`** | `character varying` | YES | — |
| **`detected_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `crawl_content_versions_pkey`: `CREATE UNIQUE INDEX crawl_content_versions_pkey ON public.crawl_content_versions USING btree (id)`
- `idx_crawl_content_versions_article`: `CREATE INDEX idx_crawl_content_versions_article ON public.crawl_content_versions USING btree (article_id, detected_at DESC)`
- `idx_crawl_content_versions_hash`: `CREATE UNIQUE INDEX idx_crawl_content_versions_hash ON public.crawl_content_versions USING btree (article_id, content_hash)`

----

### `crawl_session`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`article_id`** | `uuid` | NO | — |
| **`domain`** | `text` | NO | — |
| **`strategy`** | `character varying` | NO | — |
| **`final_status`** | `character varying` | YES | — |
| **`final_method`** | `character varying` | YES | — |
| **`total_duration_ms`** | `integer` | YES | — |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `crawl_session_pkey`: `CREATE UNIQUE INDEX crawl_session_pkey ON public.crawl_session USING btree (id)`
- `idx_crawl_session_article`: `CREATE INDEX idx_crawl_session_article ON public.crawl_session USING btree (article_id)`
- `idx_crawl_session_lookup`: `CREATE INDEX idx_crawl_session_lookup ON public.crawl_session USING btree (domain, created_at DESC)`

----

### `domain_profiles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`domain`** | `text` | NO | — |
| **`total_attempts`** | `integer` | YES | `0` |
| **`success_http`** | `integer` | YES | `0` |
| **`success_playwright`** | `integer` | YES | `0` |
| **`success_retry`** | `integer` | YES | `0` |
| **`failed_http`** | `integer` | YES | `0` |
| **`failed_playwright`** | `integer` | YES | `0` |
| **`failed_retry`** | `integer` | YES | `0` |
| **`avg_time_http_ms`** | `double precision` | YES | — |
| **`avg_time_playwright_ms`** | `double precision` | YES | — |
| **`avg_time_retry_ms`** | `double precision` | YES | — |
| **`strategy`** | `character varying` | YES | `'HTTP_ONLY'::character varying` |
| **`manual_override`** | `boolean` | YES | `false` |
| **`preferred_selector`** | `character varying` | YES | — |
| **`supports_http`** | `boolean` | YES | `true` |
| **`last_attempt_at`** | `timestamp with time zone` | YES | — |
| **`last_failure_reason`** | `character varying` | YES | — |
| **`last_failure_at`** | `timestamp with time zone` | YES | — |
| **`consecutive_failures`** | `integer` | YES | `0` |
| **`updated_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `domain_profiles_pkey`: `CREATE UNIQUE INDEX domain_profiles_pkey ON public.domain_profiles USING btree (domain)`

----

### `editorial_angles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`dossier_id`** | `uuid` | NO | — |
| **`title`** | `character varying` | NO | — |
| **`angle_type`** | `character varying` | NO | — |
| **`summary`** | `text` | YES | — |
| **`target_audience`** | `text` | YES | — |
| **`seo_keywords`** | `jsonb` | YES | `'[]'::jsonb` |
| **`position`** | `integer` | YES | `0` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `editorial_angles_pkey`: `CREATE UNIQUE INDEX editorial_angles_pkey ON public.editorial_angles USING btree (id)`
- `idx_editorial_angles_dossier`: `CREATE INDEX idx_editorial_angles_dossier ON public.editorial_angles USING btree (dossier_id, "position")`

----

### `editorial_dossiers`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`topic_id`** | `uuid` | YES | — |
| **`status`** | `character varying` | NO | `'generating'::character varying` |
| **`executive_summary`** | `text` | YES | — |
| **`verified_facts`** | `jsonb` | YES | `'[]'::jsonb` |
| **`timeline`** | `jsonb` | YES | `'[]'::jsonb` |
| **`entities`** | `jsonb` | YES | `'[]'::jsonb` |
| **`seo_keywords`** | `ARRAY` | YES | — |
| **`suggested_categories`** | `ARRAY` | YES | — |
| **`suggested_tags`** | `ARRAY` | YES | — |
| **`suggested_headlines`** | `ARRAY` | YES | — |
| **`suggested_angles`** | `jsonb` | YES | `'[]'::jsonb` |
| **`hero_image_prompt`** | `text` | YES | — |
| **`created_by`** | `uuid` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `editorial_dossiers_pkey`: `CREATE UNIQUE INDEX editorial_dossiers_pkey ON public.editorial_dossiers USING btree (id)`
- `idx_dossiers_created`: `CREATE INDEX idx_dossiers_created ON public.editorial_dossiers USING btree (created_at DESC)`
- `idx_dossiers_status`: `CREATE INDEX idx_dossiers_status ON public.editorial_dossiers USING btree (status)`
- `idx_dossiers_topic`: `CREATE INDEX idx_dossiers_topic ON public.editorial_dossiers USING btree (topic_id)`

----

### `editorial_opportunities`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`event_id`** | `uuid` | YES | — |
| **`type`** | `text` | NO | — |
| **`title`** | `text` | NO | — |
| **`reason`** | `text` | YES | — |
| **`seo_value`** | `integer` | YES | — |
| **`traffic_potential`** | `text` | YES | — |
| **`difficulty`** | `text` | YES | — |
| **`status`** | `text` | YES | `'pending'::text` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `editorial_opportunities_pkey`: `CREATE UNIQUE INDEX editorial_opportunities_pkey ON public.editorial_opportunities USING btree (id)`
- `idx_eo_event`: `CREATE INDEX idx_eo_event ON public.editorial_opportunities USING btree (event_id)`
- `idx_eo_status`: `CREATE INDEX idx_eo_status ON public.editorial_opportunities USING btree (status)`

----

### `entity_mentions`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`entity_id`** | `uuid` | NO | — |
| **`topic_id`** | `uuid` | NO | — |
| **`source_id`** | `uuid` | YES | — |
| **`confidence`** | `real` | YES | `1.0` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `entity_mentions_pkey`: `CREATE UNIQUE INDEX entity_mentions_pkey ON public.entity_mentions USING btree (id)`
- `idx_entity_mentions_entity`: `CREATE INDEX idx_entity_mentions_entity ON public.entity_mentions USING btree (entity_id)`
- `idx_entity_mentions_topic`: `CREATE INDEX idx_entity_mentions_topic ON public.entity_mentions USING btree (topic_id)`
- `idx_entity_mentions_unique`: `CREATE UNIQUE INDEX idx_entity_mentions_unique ON public.entity_mentions USING btree (entity_id, topic_id)`

----

### `entity_relationships`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`entity_a_id`** | `uuid` | NO | — |
| **`entity_b_id`** | `uuid` | NO | — |
| **`shared_articles`** | `integer` | NO | `0` |
| **`shared_events`** | `integer` | NO | `0` |
| **`strength_score`** | `double precision` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `entity_relationships_pkey`: `CREATE UNIQUE INDEX entity_relationships_pkey ON public.entity_relationships USING btree (id)`
- `idx_er_entity_a`: `CREATE INDEX idx_er_entity_a ON public.entity_relationships USING btree (entity_a_id)`
- `idx_er_entity_b`: `CREATE INDEX idx_er_entity_b ON public.entity_relationships USING btree (entity_b_id)`
- `idx_er_strength`: `CREATE INDEX idx_er_strength ON public.entity_relationships USING btree (strength_score DESC)`
- `uq_er_pair`: `CREATE UNIQUE INDEX uq_er_pair ON public.entity_relationships USING btree (entity_a_id, entity_b_id)`

----

### `event_cluster_stories`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`event_id`** | `uuid` | NO | — |
| **`story_id`** | `uuid` | NO | — |
| **`linked_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `event_cluster_stories_pkey`: `CREATE UNIQUE INDEX event_cluster_stories_pkey ON public.event_cluster_stories USING btree (event_id, story_id)`
- `idx_ecs_event`: `CREATE INDEX idx_ecs_event ON public.event_cluster_stories USING btree (event_id)`
- `idx_ecs_story`: `CREATE INDEX idx_ecs_story ON public.event_cluster_stories USING btree (story_id)`

----

### `event_clusters`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`headline`** | `text` | NO | — |
| **`summary`** | `text` | YES | — |
| **`event_type`** | `text` | YES | `'general'::text` |
| **`importance_score`** | `integer` | YES | `5` |
| **`editorial_score`** | `integer` | YES | `0` |
| **`coverage_status`** | `text` | YES | `'monitoring'::text` |
| **`status`** | `text` | YES | `'active'::text` |
| **`story_count`** | `integer` | YES | `0` |
| **`article_count`** | `integer` | YES | `0` |
| **`source_count`** | `integer` | YES | `0` |
| **`main_entities`** | `jsonb` | YES | `'[]'::jsonb` |
| **`timeline`** | `jsonb` | YES | `'[]'::jsonb` |
| **`first_detected_at`** | `timestamp with time zone` | YES | `now()` |
| **`last_updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`last_summarized_at`** | `timestamp without time zone` | YES | — |
| **`freshness_score`** | `double precision` | YES | `1.0` |

**Indexes:**

- `event_clusters_pkey`: `CREATE UNIQUE INDEX event_clusters_pkey ON public.event_clusters USING btree (id)`
- `idx_ec_coverage`: `CREATE INDEX idx_ec_coverage ON public.event_clusters USING btree (coverage_status)`
- `idx_ec_importance`: `CREATE INDEX idx_ec_importance ON public.event_clusters USING btree (importance_score DESC)`
- `idx_ec_last_updated`: `CREATE INDEX idx_ec_last_updated ON public.event_clusters USING btree (last_updated_at DESC)`
- `idx_ec_score`: `CREATE INDEX idx_ec_score ON public.event_clusters USING btree (editorial_score DESC)`
- `idx_ec_status`: `CREATE INDEX idx_ec_status ON public.event_clusters USING btree (status)`

----

### `events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`article_id`** | `uuid` | YES | — |
| **`type`** | `character varying` | NO | — |
| **`session_id`** | `character varying` | YES | — |
| **`metadata`** | `jsonb` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `events_pkey`: `CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)`
- `idx_events_article_id`: `CREATE INDEX idx_events_article_id ON public.events USING btree (article_id)`
- `idx_events_created_at`: `CREATE INDEX idx_events_created_at ON public.events USING btree (created_at)`
- `idx_events_type`: `CREATE INDEX idx_events_type ON public.events USING btree (type)`

----

### `knowledge_entities`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`entity_type`** | `character varying` | NO | — |
| **`description`** | `text` | YES | — |
| **`first_seen_at`** | `timestamp with time zone` | YES | `now()` |
| **`last_seen_at`** | `timestamp with time zone` | YES | `now()` |
| **`mention_count`** | `integer` | YES | `1` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`entity_origin`** | `character varying` | NO | `'RESEARCH'::character varying` |

**Indexes:**

- `idx_ke_name_type_origin`: `CREATE UNIQUE INDEX idx_ke_name_type_origin ON public.knowledge_entities USING btree (lower((name)::text), entity_type, entity_origin)`
- `idx_ke_origin`: `CREATE INDEX idx_ke_origin ON public.knowledge_entities USING btree (entity_origin)`
- `idx_knowledge_entities_mentions`: `CREATE INDEX idx_knowledge_entities_mentions ON public.knowledge_entities USING btree (mention_count DESC)`
- `idx_knowledge_entities_type`: `CREATE INDEX idx_knowledge_entities_type ON public.knowledge_entities USING btree (entity_type)`
- `knowledge_entities_pkey`: `CREATE UNIQUE INDEX knowledge_entities_pkey ON public.knowledge_entities USING btree (id)`

----

### `knowledge_events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`entity_id`** | `uuid` | NO | — |
| **`title`** | `character varying` | NO | — |
| **`summary`** | `text` | YES | — |
| **`event_date`** | `date` | YES | — |
| **`event_type`** | `character varying` | YES | `'news'::character varying` |
| **`source_topic_id`** | `uuid` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_knowledge_events_date`: `CREATE INDEX idx_knowledge_events_date ON public.knowledge_events USING btree (event_date DESC NULLS LAST)`
- `idx_knowledge_events_entity`: `CREATE INDEX idx_knowledge_events_entity ON public.knowledge_events USING btree (entity_id)`
- `idx_knowledge_events_type`: `CREATE INDEX idx_knowledge_events_type ON public.knowledge_events USING btree (event_type)`
- `knowledge_events_pkey`: `CREATE UNIQUE INDEX knowledge_events_pkey ON public.knowledge_events USING btree (id)`

----

### `media`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`url`** | `text` | NO | — |
| **`filename`** | `text` | NO | — |
| **`mime`** | `character varying` | YES | — |
| **`size_bytes`** | `bigint` | YES | — |
| **`created_by`** | `uuid` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `media_pkey`: `CREATE UNIQUE INDEX media_pkey ON public.media USING btree (id)`

----

### `monitored_articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`source_id`** | `uuid` | NO | — |
| **`external_id`** | `text` | YES | — |
| **`title`** | `text` | NO | — |
| **`url`** | `text` | NO | — |
| **`summary`** | `text` | YES | — |
| **`published_at`** | `timestamp with time zone` | YES | — |
| **`detected_at`** | `timestamp with time zone` | YES | `now()` |
| **`hash`** | `character varying` | NO | — |
| **`content_text`** | `text` | YES | — |
| **`content_words`** | `integer` | YES | `0` |
| **`extraction_method`** | `character varying` | YES | — |
| **`extracted_at`** | `timestamp with time zone` | YES | — |

**Indexes:**

- `idx_ma_extraction`: `CREATE INDEX idx_ma_extraction ON public.monitored_articles USING btree (extraction_method)`
- `idx_ma_unfetched`: `CREATE INDEX idx_ma_unfetched ON public.monitored_articles USING btree (detected_at DESC) WHERE (extraction_method IS NULL)`
- `idx_monitored_articles_detected`: `CREATE INDEX idx_monitored_articles_detected ON public.monitored_articles USING btree (detected_at DESC)`
- `idx_monitored_articles_hash`: `CREATE UNIQUE INDEX idx_monitored_articles_hash ON public.monitored_articles USING btree (hash)`
- `idx_monitored_articles_source`: `CREATE INDEX idx_monitored_articles_source ON public.monitored_articles USING btree (source_id)`
- `monitored_articles_pkey`: `CREATE UNIQUE INDEX monitored_articles_pkey ON public.monitored_articles USING btree (id)`

----

### `pipeline_decisions`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `bigint` | NO | `nextval('pipeline_decisions_id_seq'::regclass)` |
| **`module`** | `character varying` | NO | — |
| **`pipeline`** | `character varying` | NO | `'v1'::character varying` |
| **`entity_id`** | `uuid` | YES | — |
| **`entity_type`** | `character varying` | YES | — |
| **`decision`** | `character varying` | NO | — |
| **`accepted`** | `boolean` | YES | — |
| **`reason`** | `character varying` | YES | — |
| **`score`** | `double precision` | YES | — |
| **`threshold`** | `double precision` | YES | — |
| **`metadata`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `idx_pipeline_decisions_entity`: `CREATE INDEX idx_pipeline_decisions_entity ON public.pipeline_decisions USING btree (entity_id, entity_type)`
- `idx_pipeline_decisions_module`: `CREATE INDEX idx_pipeline_decisions_module ON public.pipeline_decisions USING btree (module, created_at DESC)`
- `idx_pipeline_decisions_pipeline`: `CREATE INDEX idx_pipeline_decisions_pipeline ON public.pipeline_decisions USING btree (module, pipeline, created_at DESC)`
- `pipeline_decisions_pkey`: `CREATE UNIQUE INDEX pipeline_decisions_pkey ON public.pipeline_decisions USING btree (id)`

----

### `pixel_events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`visitor_id`** | `text` | NO | — |
| **`session_id`** | `text` | NO | — |
| **`event`** | `text` | NO | — |
| **`url`** | `text` | YES | — |
| **`referrer`** | `text` | YES | — |
| **`user_agent`** | `text` | YES | — |
| **`ip_hash`** | `text` | YES | — |
| **`device_type`** | `character varying` | YES | — |
| **`payload`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` |
| **`geo_country`** | `character varying` | YES | — |
| **`geo_city`** | `character varying` | YES | — |
| **`utm_source`** | `character varying` | YES | — |
| **`utm_medium`** | `character varying` | YES | — |
| **`utm_campaign`** | `character varying` | YES | — |
| **`article_id`** | `uuid` | YES | — |

**Indexes:**

- `idx_pixel_events_article_time`: `CREATE INDEX idx_pixel_events_article_time ON public.pixel_events USING btree (((payload ->> 'content_id'::text)), created_at DESC) WHERE (event = 'content_view'::text)`
- `idx_pixel_events_created_at`: `CREATE INDEX idx_pixel_events_created_at ON public.pixel_events USING btree (created_at DESC)`
- `idx_pixel_events_event`: `CREATE INDEX idx_pixel_events_event ON public.pixel_events USING btree (event)`
- `idx_pixel_events_session`: `CREATE INDEX idx_pixel_events_session ON public.pixel_events USING btree (session_id)`
- `idx_pixel_events_visitor`: `CREATE INDEX idx_pixel_events_visitor ON public.pixel_events USING btree (visitor_id)`
- `pixel_events_pkey`: `CREATE UNIQUE INDEX pixel_events_pkey ON public.pixel_events USING btree (id)`

----

### `reel_settings`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('reel_settings_id_seq'::regclass)` |
| **`background_color`** | `character varying` | YES | `'#1e3a8a'::character varying` |
| **`updated_at`** | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `reel_settings_pkey`: `CREATE UNIQUE INDEX reel_settings_pkey ON public.reel_settings USING btree (id)`

----

### `reels`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('reels_id_seq'::regclass)` |
| **`title`** | `character varying` | NO | — |
| **`description`** | `text` | YES | — |
| **`url`** | `text` | NO | — |
| **`thumbnail`** | `text` | YES | — |
| **`platform`** | `character varying` | YES | `'instagram'::character varying` |
| **`status`** | `character varying` | YES | `'active'::character varying` |
| **`order_index`** | `integer` | YES | `0` |
| **`created_at`** | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` |
| **`updated_at`** | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `idx_reels_order`: `CREATE INDEX idx_reels_order ON public.reels USING btree (order_index)`
- `idx_reels_status`: `CREATE INDEX idx_reels_status ON public.reels USING btree (status)`
- `reels_pkey`: `CREATE UNIQUE INDEX reels_pkey ON public.reels USING btree (id)`

----

### `research_briefs`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`topic_id`** | `uuid` | NO | — |
| **`executive_summary`** | `text` | YES | — |
| **`key_facts`** | `jsonb` | YES | `'[]'::jsonb` |
| **`controversies`** | `jsonb` | YES | `'[]'::jsonb` |
| **`timeline`** | `jsonb` | YES | `'[]'::jsonb` |
| **`opportunities`** | `text` | YES | — |
| **`risks`** | `text` | YES | — |
| **`generated_at`** | `timestamp with time zone` | YES | `now()` |
| **`source_opportunities`** | `jsonb` | YES | `'[]'::jsonb` |
| **`source_attribution`** | `jsonb` | YES | `'{}'::jsonb` |
| **`model_used`** | `character varying` | YES | `'claude-sonnet-4-5-20250929'::character varying` |
| **`prompt_version`** | `integer` | YES | `1` |

**Indexes:**

- `idx_research_briefs_topic`: `CREATE INDEX idx_research_briefs_topic ON public.research_briefs USING btree (topic_id)`
- `research_briefs_pkey`: `CREATE UNIQUE INDEX research_briefs_pkey ON public.research_briefs USING btree (id)`

----

### `research_sources`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`topic_id`** | `uuid` | NO | — |
| **`url`** | `text` | YES | — |
| **`title`** | `text` | YES | — |
| **`source_name`** | `text` | YES | — |
| **`published_at`** | `timestamp with time zone` | YES | — |
| **`content`** | `text` | YES | — |
| **`relevance_score`** | `real` | YES | `0` |
| **`connector`** | `text` | YES | `'rss'::text` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`content_fetched`** | `boolean` | NO | `false` |
| **`language`** | `character varying` | YES | `'es'::character varying` |
| **`entities`** | `jsonb` | YES | `'[]'::jsonb` |
| **`word_count`** | `integer` | YES | — |

**Indexes:**

- `idx_research_sources_score`: `CREATE INDEX idx_research_sources_score ON public.research_sources USING btree (topic_id, relevance_score DESC)`
- `idx_research_sources_topic`: `CREATE INDEX idx_research_sources_topic ON public.research_sources USING btree (topic_id)`
- `research_sources_pkey`: `CREATE UNIQUE INDEX research_sources_pkey ON public.research_sources USING btree (id)`

----

### `research_topics`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`title`** | `text` | NO | — |
| **`status`** | `text` | NO | `'pending'::text` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`source_type`** | `character varying` | YES | `'manual'::character varying` |
| **`source_id`** | `uuid` | YES | — |
| **`source_title`** | `text` | YES | — |
| **`source_score`** | `integer` | YES | — |
| **`created_by`** | `uuid` | YES | — |
| **`category`** | `character varying` | YES | — |
| **`tags`** | `ARRAY` | YES | `'{}'::text[]` |

**Indexes:**

- `idx_research_topics_created`: `CREATE INDEX idx_research_topics_created ON public.research_topics USING btree (created_at DESC)`
- `idx_research_topics_status`: `CREATE INDEX idx_research_topics_status ON public.research_topics USING btree (status)`
- `idx_research_topics_title`: `CREATE INDEX idx_research_topics_title ON public.research_topics USING btree (lower(title))`
- `idx_research_topics_user`: `CREATE INDEX idx_research_topics_user ON public.research_topics USING btree (created_by)`
- `idx_rt_source_id`: `CREATE INDEX idx_rt_source_id ON public.research_topics USING btree (source_id)`
- `idx_rt_source_type`: `CREATE INDEX idx_rt_source_type ON public.research_topics USING btree (source_type)`
- `research_topics_pkey`: `CREATE UNIQUE INDEX research_topics_pkey ON public.research_topics USING btree (id)`

----

### `rss_sources`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`type`** | `character varying` | NO | `'news'::character varying` |
| **`rss_url`** | `text` | NO | — |
| **`homepage`** | `text` | YES | — |
| **`enabled`** | `boolean` | YES | `true` |
| **`check_interval`** | `integer` | YES | `60` |
| **`last_checked`** | `timestamp with time zone` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`verification_status`** | `character varying` | NO | `'pending'::character varying` |
| **`verified_at`** | `timestamp with time zone` | YES | — |
| **`verified_by`** | `integer` | YES | — |
| **`trust_score`** | `numeric` | YES | `5.0` |
| **`discovery_type`** | `character varying` | NO | `'RSS'::character varying` |
| **`last_discovery_status`** | `character varying` | YES | — |
| **`last_discovery_error`** | `text` | YES | — |
| **`last_discovery_duration_ms`** | `integer` | YES | — |
| **`last_articles_found`** | `integer` | YES | — |
| **`last_discovery_at`** | `timestamp without time zone` | YES | — |
| **`consecutive_discovery_failures`** | `integer` | YES | `0` |
| **`last_format_detected`** | `character varying` | YES | — |
| **`last_verification_notes`** | `text` | YES | — |

**Indexes:**

- `idx_rss_sources_discovery_status`: `CREATE INDEX idx_rss_sources_discovery_status ON public.rss_sources USING btree (last_discovery_status)`
- `idx_rss_sources_discovery_type`: `CREATE INDEX idx_rss_sources_discovery_type ON public.rss_sources USING btree (discovery_type)`
- `idx_rss_sources_enabled`: `CREATE INDEX idx_rss_sources_enabled ON public.rss_sources USING btree (enabled)`
- `idx_rss_sources_last_discovery_at`: `CREATE INDEX idx_rss_sources_last_discovery_at ON public.rss_sources USING btree (last_discovery_at DESC)`
- `tracked_sources_pkey`: `CREATE UNIQUE INDEX tracked_sources_pkey ON public.rss_sources USING btree (id)`

----

### `settings`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`key`** | `character varying` | NO | — |
| **`value`** | `text` | YES | — |
| **`type`** | `character varying` | YES | `'string'::character varying` |
| **`group_name`** | `character varying` | YES | `'general'::character varying` |
| **`updated_at`** | `timestamp without time zone` | YES | `now()` |

**Indexes:**

- `settings_pkey`: `CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree (key)`

----

### `social_cluster_posts`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`cluster_id`** | `uuid` | NO | — |
| **`post_id`** | `uuid` | NO | — |
| **`linked_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_scp_cluster`: `CREATE INDEX idx_scp_cluster ON public.social_cluster_posts USING btree (cluster_id)`
- `idx_scp_post`: `CREATE INDEX idx_scp_post ON public.social_cluster_posts USING btree (post_id)`
- `social_cluster_posts_pkey`: `CREATE UNIQUE INDEX social_cluster_posts_pkey ON public.social_cluster_posts USING btree (cluster_id, post_id)`

----

### `social_clusters`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`title`** | `text` | NO | — |
| **`keywords`** | `jsonb` | YES | `'[]'::jsonb` |
| **`post_count`** | `integer` | YES | `0` |
| **`source_count`** | `integer` | YES | `0` |
| **`total_views`** | `bigint` | YES | `0` |
| **`total_likes`** | `bigint` | YES | `0` |
| **`total_comments`** | `bigint` | YES | `0` |
| **`total_shares`** | `bigint` | YES | `0` |
| **`total_engagement`** | `bigint` | YES | `0` |
| **`engagement_score`** | `double precision` | YES | `0` |
| **`growth_rate`** | `double precision` | YES | `0` |
| **`status`** | `character varying` | YES | `'active'::character varying` |
| **`first_seen`** | `timestamp with time zone` | YES | `now()` |
| **`last_seen`** | `timestamp with time zone` | YES | `now()` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`viral_score`** | `integer` | YES | `0` |
| **`sources_count`** | `integer` | YES | `1` |
| **`gap_score`** | `double precision` | YES | `0` |
| **`opportunity_score`** | `double precision` | YES | `0` |
| **`detected_category`** | `character varying` | YES | `'general'::character varying` |

**Indexes:**

- `idx_social_clusters_engagement`: `CREATE INDEX idx_social_clusters_engagement ON public.social_clusters USING btree (total_engagement DESC)`
- `idx_social_clusters_status`: `CREATE INDEX idx_social_clusters_status ON public.social_clusters USING btree (status)`
- `social_clusters_pkey`: `CREATE UNIQUE INDEX social_clusters_pkey ON public.social_clusters USING btree (id)`

----

### `social_content_packages`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`dossier_id`** | `uuid` | NO | — |
| **`status`** | `character varying` | YES | `'draft'::character varying` |
| **`facebook_post`** | `text` | YES | — |
| **`instagram_feed`** | `text` | YES | — |
| **`instagram_story`** | `text` | YES | — |
| **`instagram_carousel`** | `jsonb` | YES | `'[]'::jsonb` |
| **`x_post`** | `text` | YES | — |
| **`linkedin_post`** | `text` | YES | — |
| **`newsletter_content`** | `text` | YES | — |
| **`push_notification`** | `text` | YES | — |
| **`recommendations`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`tiktok_script`** | `jsonb` | YES | `'{}'::jsonb` |
| **`instagram_reel`** | `jsonb` | YES | `'{}'::jsonb` |
| **`facebook_reel`** | `jsonb` | YES | `'{}'::jsonb` |
| **`youtube_short`** | `jsonb` | YES | `'{}'::jsonb` |

**Indexes:**

- `idx_social_content_dossier_id`: `CREATE UNIQUE INDEX idx_social_content_dossier_id ON public.social_content_packages USING btree (dossier_id)`
- `social_content_packages_pkey`: `CREATE UNIQUE INDEX social_content_packages_pkey ON public.social_content_packages USING btree (id)`

----

### `social_fetch_logs`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`source_id`** | `uuid` | NO | — |
| **`platform`** | `character varying` | NO | — |
| **`started_at`** | `timestamp with time zone` | YES | `now()` |
| **`finished_at`** | `timestamp with time zone` | YES | — |
| **`success`** | `boolean` | YES | `false` |
| **`posts_found`** | `integer` | YES | `0` |
| **`error_message`** | `text` | YES | — |
| **`auth_status`** | `character varying` | YES | `'unknown'::character varying` |
| **`rate_limited`** | `boolean` | YES | `false` |
| **`captcha_detected`** | `boolean` | YES | `false` |
| **`login_wall_detected`** | `boolean` | YES | `false` |
| **`posts_saved`** | `integer` | YES | `0` |

**Indexes:**

- `idx_social_logs_date`: `CREATE INDEX idx_social_logs_date ON public.social_fetch_logs USING btree (started_at DESC)`
- `idx_social_logs_source`: `CREATE INDEX idx_social_logs_source ON public.social_fetch_logs USING btree (source_id)`
- `social_fetch_logs_pkey`: `CREATE UNIQUE INDEX social_fetch_logs_pkey ON public.social_fetch_logs USING btree (id)`

----

### `social_posts`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`source_id`** | `uuid` | NO | — |
| **`platform`** | `character varying` | NO | — |
| **`external_id`** | `character varying` | NO | — |
| **`url`** | `text` | NO | — |
| **`published_at`** | `timestamp with time zone` | YES | — |
| **`title`** | `text` | YES | — |
| **`content`** | `text` | YES | — |
| **`thumbnail_url`** | `text` | YES | — |
| **`video_url`** | `text` | YES | — |
| **`views`** | `bigint` | YES | `0` |
| **`likes`** | `bigint` | YES | `0` |
| **`comments`** | `bigint` | YES | `0` |
| **`shares`** | `bigint` | YES | `0` |
| **`engagement_score`** | `double precision` | YES | `0` |
| **`keywords`** | `jsonb` | YES | `'[]'::jsonb` |
| **`captured_at`** | `timestamp with time zone` | YES | `now()` |
| **`enriched_at`** | `timestamp with time zone` | YES | — |
| **`transcript_available`** | `boolean` | YES | — |
| **`transcript_fetched_at`** | `timestamp without time zone` | YES | — |

**Indexes:**

- `idx_social_posts_published`: `CREATE INDEX idx_social_posts_published ON public.social_posts USING btree (published_at DESC)`
- `idx_social_posts_source`: `CREATE INDEX idx_social_posts_source ON public.social_posts USING btree (source_id)`
- `social_posts_pkey`: `CREATE UNIQUE INDEX social_posts_pkey ON public.social_posts USING btree (id)`
- `social_posts_platform_external_id_key`: `CREATE UNIQUE INDEX social_posts_platform_external_id_key ON public.social_posts USING btree (platform, external_id)`

----

### `social_sources`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`platform`** | `character varying` | NO | — |
| **`profile_url`** | `text` | NO | — |
| **`handle`** | `character varying` | YES | — |
| **`platform_id`** | `character varying` | YES | — |
| **`enabled`** | `boolean` | YES | `true` |
| **`priority`** | `integer` | YES | `5` |
| **`region`** | `character varying` | YES | `'nacional'::character varying` |
| **`category`** | `character varying` | YES | `'medio'::character varying` |
| **`last_checked`** | `timestamp with time zone` | YES | — |
| **`last_post_at`** | `timestamp with time zone` | YES | — |
| **`post_count`** | `integer` | YES | `0` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`content_type`** | `character varying` | YES | `'videos'::character varying` |
| **`last_external_id`** | `character varying` | YES | — |
| **`freshness_window_seconds`** | `integer` | YES | `900` |
| **`graph_api_supported`** | `boolean` | YES | — |

**Indexes:**

- `social_sources_pkey`: `CREATE UNIQUE INDEX social_sources_pkey ON public.social_sources USING btree (id)`
- `social_sources_platform_profile_url_key`: `CREATE UNIQUE INDEX social_sources_platform_profile_url_key ON public.social_sources USING btree (platform, profile_url)`

----

### `source_verifications`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('source_verifications_id_seq'::regclass)` |
| **`source_id`** | `uuid` | NO | — |
| **`status`** | `character varying` | NO | — |
| **`checked_by`** | `integer` | YES | — |
| **`notes`** | `text` | YES | — |
| **`http_status`** | `integer` | YES | — |
| **`response_ms`** | `integer` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_source_verifications_source`: `CREATE INDEX idx_source_verifications_source ON public.source_verifications USING btree (source_id, created_at DESC)`
- `source_verifications_pkey`: `CREATE UNIQUE INDEX source_verifications_pkey ON public.source_verifications USING btree (id)`

----

### `story_cluster_articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`story_id`** | `uuid` | NO | — |
| **`article_id`** | `uuid` | NO | — |
| **`relevance_score`** | `numeric` | NO | `1.0` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |
| **`category_match`** | `boolean` | YES | `true` |
| **`category_score`** | `double precision` | YES | `0` |
| **`entity_score`** | `double precision` | YES | `0` |
| **`keyword_score`** | `double precision` | YES | `0` |
| **`matching_reason`** | `text` | YES | — |
| **`shared_keywords`** | `jsonb` | YES | `'[]'::jsonb` |
| **`shared_entities`** | `jsonb` | YES | `'[]'::jsonb` |
| **`title_similarity`** | `numeric` | YES | — |
| **`keyword_similarity`** | `numeric` | YES | — |
| **`entity_similarity`** | `numeric` | YES | — |

**Indexes:**

- `idx_sca_article`: `CREATE INDEX idx_sca_article ON public.story_cluster_articles USING btree (article_id)`
- `idx_sca_story`: `CREATE INDEX idx_sca_story ON public.story_cluster_articles USING btree (story_id)`
- `story_cluster_articles_pkey`: `CREATE UNIQUE INDEX story_cluster_articles_pkey ON public.story_cluster_articles USING btree (story_id, article_id)`

----

### `story_clusters`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`title`** | `text` | YES | — |
| **`slug`** | `text` | YES | — |
| **`story_type`** | `character varying` | NO | `'news'::character varying` |
| **`summary`** | `text` | YES | — |
| **`editorial_opportunities`** | `jsonb` | NO | `'[]'::jsonb` |
| **`keywords`** | `jsonb` | NO | `'[]'::jsonb` |
| **`importance_score`** | `integer` | NO | `0` |
| **`coverage_status`** | `character varying` | NO | `'monitoring'::character varying` |
| **`status`** | `character varying` | NO | `'active'::character varying` |
| **`source_count`** | `integer` | NO | `0` |
| **`article_count`** | `integer` | NO | `0` |
| **`is_recurring`** | `boolean` | NO | `false` |
| **`first_seen`** | `timestamp with time zone` | NO | `now()` |
| **`last_seen`** | `timestamp with time zone` | NO | `now()` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |
| **`updated_at`** | `timestamp with time zone` | NO | `now()` |
| **`story_quality`** | `character varying` | YES | `'fair'::character varying` |
| **`avg_relevance`** | `double precision` | YES | — |
| **`story_context_score`** | `integer` | YES | `0` |
| **`algorithmic_summary`** | `text` | YES | — |
| **`freshness_score`** | `double precision` | YES | `1.0` |
| **`detected_category`** | `character varying` | YES | — |
| **`contamination_flag`** | `boolean` | YES | `false` |

**Indexes:**

- `idx_sc_coverage`: `CREATE INDEX idx_sc_coverage ON public.story_clusters USING btree (coverage_status)`
- `idx_sc_importance`: `CREATE INDEX idx_sc_importance ON public.story_clusters USING btree (importance_score DESC)`
- `idx_sc_last_seen`: `CREATE INDEX idx_sc_last_seen ON public.story_clusters USING btree (last_seen DESC)`
- `idx_sc_recurring`: `CREATE INDEX idx_sc_recurring ON public.story_clusters USING btree (is_recurring)`
- `idx_sc_status`: `CREATE INDEX idx_sc_status ON public.story_clusters USING btree (status)`
- `idx_sc_story_type`: `CREATE INDEX idx_sc_story_type ON public.story_clusters USING btree (story_type)`
- `story_clusters_pkey`: `CREATE UNIQUE INDEX story_clusters_pkey ON public.story_clusters USING btree (id)`
- `story_clusters_slug_key`: `CREATE UNIQUE INDEX story_clusters_slug_key ON public.story_clusters USING btree (slug)`

----

### `story_entities`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`story_id`** | `uuid` | NO | — |
| **`entity_id`** | `uuid` | NO | — |
| **`role`** | `character varying` | NO | `'participant'::character varying` |

**Indexes:**

- `idx_se_entity`: `CREATE INDEX idx_se_entity ON public.story_entities USING btree (entity_id)`
- `idx_se_story`: `CREATE INDEX idx_se_story ON public.story_entities USING btree (story_id)`
- `story_entities_pkey`: `CREATE UNIQUE INDEX story_entities_pkey ON public.story_entities USING btree (story_id, entity_id)`

----

### `story_opportunities`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`story_cluster_id`** | `uuid` | NO | — |
| **`title`** | `text` | NO | — |
| **`description`** | `text` | YES | — |
| **`opportunity_type`** | `character varying` | YES | `'NEWS'::character varying` |
| **`traffic_score`** | `integer` | YES | `50` |
| **`seo_score`** | `integer` | YES | `50` |
| **`urgency_score`** | `integer` | YES | `50` |
| **`editorial_score`** | `integer` | YES | `50` |
| **`composite_score`** | `numeric` | YES | `50.00` |
| **`status`** | `character varying` | YES | `'pending'::character varying` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`trigger`** | `character varying` | YES | `'ai'::character varying` |

**Indexes:**

- `idx_so_composite`: `CREATE INDEX idx_so_composite ON public.story_opportunities USING btree (composite_score DESC)`
- `idx_so_status`: `CREATE INDEX idx_so_status ON public.story_opportunities USING btree (status)`
- `idx_so_story`: `CREATE INDEX idx_so_story ON public.story_opportunities USING btree (story_cluster_id)`
- `idx_so_type`: `CREATE INDEX idx_so_type ON public.story_opportunities USING btree (opportunity_type)`
- `story_opportunities_pkey`: `CREATE UNIQUE INDEX story_opportunities_pkey ON public.story_opportunities USING btree (id)`

----

### `subscribers`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`email`** | `character varying` | NO | — |
| **`source`** | `character varying` | YES | — |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`status`** | `character varying` | YES | `'active'::character varying` |

**Indexes:**

- `idx_subscribers_email`: `CREATE INDEX idx_subscribers_email ON public.subscribers USING btree (email)`
- `subscribers_email_key`: `CREATE UNIQUE INDEX subscribers_email_key ON public.subscribers USING btree (email)`
- `subscribers_pkey`: `CREATE UNIQUE INDEX subscribers_pkey ON public.subscribers USING btree (id)`

----

### `system_events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('system_events_id_seq'::regclass)` |
| **`event_type`** | `text` | NO | — |
| **`actor`** | `text` | YES | `'system'::text` |
| **`metadata`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `idx_system_events_lookup`: `CREATE INDEX idx_system_events_lookup ON public.system_events USING btree (event_type, created_at DESC)`
- `system_events_pkey`: `CREATE UNIQUE INDEX system_events_pkey ON public.system_events USING btree (id)`

----

### `topic_articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`topic_id`** | `uuid` | NO | — |
| **`article_id`** | `uuid` | NO | — |
| **`relevance_score`** | `numeric` | YES | `1.0` |
| **`added_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_topic_articles_article`: `CREATE INDEX idx_topic_articles_article ON public.topic_articles USING btree (article_id)`
- `topic_articles_pkey`: `CREATE UNIQUE INDEX topic_articles_pkey ON public.topic_articles USING btree (topic_id, article_id)`

----

### `topic_entities`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`topic_id`** | `uuid` | NO | — |
| **`entity_id`** | `uuid` | NO | — |
| **`prominence_score`** | `numeric` | YES | `1.0` |
| **`added_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `topic_entities_pkey`: `CREATE UNIQUE INDEX topic_entities_pkey ON public.topic_entities USING btree (topic_id, entity_id)`

----

### `topic_events`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`topic_id`** | `uuid` | NO | — |
| **`event_id`** | `uuid` | NO | — |
| **`added_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `topic_events_pkey`: `CREATE UNIQUE INDEX topic_events_pkey ON public.topic_events USING btree (topic_id, event_id)`

----

### `topic_research`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`topic_id`** | `uuid` | NO | — |
| **`research_topic_id`** | `uuid` | NO | — |
| **`added_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `topic_research_pkey`: `CREATE UNIQUE INDEX topic_research_pkey ON public.topic_research USING btree (topic_id, research_topic_id)`

----

### `topics`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`slug`** | `character varying` | NO | — |
| **`name`** | `character varying` | NO | — |
| **`description`** | `text` | YES | — |
| **`category`** | `character varying` | YES | — |
| **`region`** | `character varying` | YES | — |
| **`coverage_scope`** | `character varying` | YES | `'national'::character varying` |
| **`importance_score`** | `numeric` | YES | `0` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_topics_category`: `CREATE INDEX idx_topics_category ON public.topics USING btree (category)`
- `idx_topics_importance`: `CREATE INDEX idx_topics_importance ON public.topics USING btree (importance_score DESC)`
- `idx_topics_region`: `CREATE INDEX idx_topics_region ON public.topics USING btree (region)`
- `topics_pkey`: `CREATE UNIQUE INDEX topics_pkey ON public.topics USING btree (id)`
- `topics_slug_key`: `CREATE UNIQUE INDEX topics_slug_key ON public.topics USING btree (slug)`

----

### `tracked_articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`tracked_source_id`** | `uuid` | NO | — |
| **`url`** | `text` | NO | — |
| **`title`** | `text` | YES | — |
| **`first_detected_at`** | `timestamp with time zone` | NO | `now()` |
| **`last_seen_at`** | `timestamp with time zone` | NO | `now()` |
| **`current_position`** | `integer` | YES | — |
| **`is_active`** | `boolean` | YES | `true` |
| **`content_text`** | `text` | YES | — |
| **`published_at`** | `timestamp with time zone` | YES | — |
| **`modified_at`** | `timestamp with time zone` | YES | — |

**Indexes:**

- `idx_tracked_articles_active`: `CREATE INDEX idx_tracked_articles_active ON public.tracked_articles USING btree (tracked_source_id) WHERE (is_active = true)`
- `idx_tracked_articles_source`: `CREATE INDEX idx_tracked_articles_source ON public.tracked_articles USING btree (tracked_source_id, first_detected_at DESC)`
- `tracked_articles_pkey`: `CREATE UNIQUE INDEX tracked_articles_pkey ON public.tracked_articles USING btree (id)`
- `tracked_articles_tracked_source_id_url_key`: `CREATE UNIQUE INDEX tracked_articles_tracked_source_id_url_key ON public.tracked_articles USING btree (tracked_source_id, url)`

----

### `tracked_source_snapshots`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`tracked_source_id`** | `uuid` | NO | — |
| **`content_hash`** | `character varying` | NO | — |
| **`links_detected`** | `jsonb` | YES | `'[]'::jsonb` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_tracked_source_snapshots_source`: `CREATE INDEX idx_tracked_source_snapshots_source ON public.tracked_source_snapshots USING btree (tracked_source_id)`
- `tracked_source_snapshots_pkey`: `CREATE UNIQUE INDEX tracked_source_snapshots_pkey ON public.tracked_source_snapshots USING btree (id)`

----

### `tracked_sources`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`name`** | `character varying` | NO | — |
| **`url`** | `text` | NO | — |
| **`type`** | `character varying` | NO | — |
| **`refresh_interval_seconds`** | `integer` | YES | `300` |
| **`active`** | `boolean` | YES | `true` |
| **`last_checked`** | `timestamp with time zone` | YES | — |
| **`last_hash`** | `character varying` | YES | — |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |
| **`last_verification_notes`** | `text` | YES | — |
| **`last_format_detected`** | `character varying` | YES | — |

**Indexes:**

- `idx_tracked_sources_active`: `CREATE INDEX idx_tracked_sources_active ON public.tracked_sources USING btree (active)`
- `tracked_sources_pkey1`: `CREATE UNIQUE INDEX tracked_sources_pkey1 ON public.tracked_sources USING btree (id)`

----

### `transcript_analysis`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`post_id`** | `uuid` | YES | — |
| **`summary`** | `text` | YES | — |
| **`entities_people`** | `jsonb` | YES | `'[]'::jsonb` |
| **`entities_places`** | `jsonb` | YES | `'[]'::jsonb` |
| **`entities_orgs`** | `jsonb` | YES | `'[]'::jsonb` |
| **`main_topics`** | `jsonb` | YES | `'[]'::jsonb` |
| **`quotes`** | `jsonb` | YES | `'[]'::jsonb` |
| **`keywords`** | `jsonb` | YES | `'[]'::jsonb` |
| **`generated_at`** | `timestamp without time zone` | YES | `now()` |
| **`editorial_type`** | `character varying` | YES | — |
| **`key_points`** | `jsonb` | YES | `'[]'::jsonb` |

**Indexes:**

- `transcript_analysis_pkey`: `CREATE UNIQUE INDEX transcript_analysis_pkey ON public.transcript_analysis USING btree (id)`
- `transcript_analysis_post_id_key`: `CREATE UNIQUE INDEX transcript_analysis_post_id_key ON public.transcript_analysis USING btree (post_id)`

----

### `trend_cluster_articles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`trend_id`** | `uuid` | NO | — |
| **`article_id`** | `uuid` | NO | — |
| **`added_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `idx_tca_article`: `CREATE INDEX idx_tca_article ON public.trend_cluster_articles USING btree (article_id)`
- `idx_tca_trend`: `CREATE INDEX idx_tca_trend ON public.trend_cluster_articles USING btree (trend_id)`
- `trend_cluster_articles_pkey`: `CREATE UNIQUE INDEX trend_cluster_articles_pkey ON public.trend_cluster_articles USING btree (trend_id, article_id)`

----

### `trend_clusters`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`entity_id`** | `uuid` | NO | — |
| **`headline`** | `text` | YES | — |
| **`summary`** | `text` | YES | — |
| **`editorial_angles`** | `jsonb` | YES | `'[]'::jsonb` |
| **`source_count`** | `integer` | NO | `0` |
| **`article_count`** | `integer` | NO | `0` |
| **`first_seen`** | `timestamp with time zone` | NO | `now()` |
| **`last_seen`** | `timestamp with time zone` | NO | `now()` |
| **`status`** | `character varying` | NO | `'active'::character varying` |
| **`created_at`** | `timestamp with time zone` | NO | `now()` |
| **`updated_at`** | `timestamp with time zone` | NO | `now()` |

**Indexes:**

- `idx_tc_counts`: `CREATE INDEX idx_tc_counts ON public.trend_clusters USING btree (article_count DESC, source_count DESC)`
- `idx_tc_entity`: `CREATE INDEX idx_tc_entity ON public.trend_clusters USING btree (entity_id)`
- `idx_tc_last_seen`: `CREATE INDEX idx_tc_last_seen ON public.trend_clusters USING btree (last_seen DESC)`
- `idx_tc_status`: `CREATE INDEX idx_tc_status ON public.trend_clusters USING btree (status)`
- `trend_clusters_pkey`: `CREATE UNIQUE INDEX trend_clusters_pkey ON public.trend_clusters USING btree (id)`

----

### `trending_topics`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`entity_id`** | `uuid` | NO | — |
| **`mention_count`** | `integer` | YES | `1` |
| **`source_count`** | `integer` | YES | `1` |
| **`window_minutes`** | `integer` | YES | `30` |
| **`last_seen_at`** | `timestamp with time zone` | YES | `now()` |
| **`auto_researched`** | `boolean` | YES | `false` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |
| **`updated_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_trending_entity`: `CREATE UNIQUE INDEX idx_trending_entity ON public.trending_topics USING btree (entity_id)`
- `idx_trending_last_seen`: `CREATE INDEX idx_trending_last_seen ON public.trending_topics USING btree (last_seen_at DESC)`
- `idx_trending_mentions`: `CREATE INDEX idx_trending_mentions ON public.trending_topics USING btree (mention_count DESC)`
- `trending_topics_pkey`: `CREATE UNIQUE INDEX trending_topics_pkey ON public.trending_topics USING btree (id)`

----

### `user_activity`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('user_activity_id_seq'::regclass)` |
| **`user_id`** | `uuid` | NO | — |
| **`event`** | `text` | NO | — |
| **`payload`** | `jsonb` | YES | `'{}'::jsonb` |
| **`created_at`** | `timestamp with time zone` | YES | `now()` |

**Indexes:**

- `idx_user_activity_created_at`: `CREATE INDEX idx_user_activity_created_at ON public.user_activity USING btree (created_at)`
- `idx_user_activity_event`: `CREATE INDEX idx_user_activity_event ON public.user_activity USING btree (event)`
- `idx_user_activity_user_id`: `CREATE INDEX idx_user_activity_user_id ON public.user_activity USING btree (user_id)`
- `user_activity_pkey`: `CREATE UNIQUE INDEX user_activity_pkey ON public.user_activity USING btree (id)`

----

### `users`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`email`** | `character varying` | NO | — |
| **`password_hash`** | `character varying` | NO | — |
| **`role`** | `character varying` | YES | `'editor'::character varying` |
| **`created_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`updated_at`** | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` |
| **`name`** | `character varying` | YES | — |
| **`bio`** | `text` | YES | — |
| **`avatar_url`** | `text` | YES | — |
| **`social_links`** | `jsonb` | YES | — |

**Indexes:**

- `users_email_key`: `CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)`
- `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`

----

### `video_transcripts`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `uuid` | NO | `gen_random_uuid()` |
| **`post_id`** | `uuid` | YES | — |
| **`transcript_text`** | `text` | YES | — |
| **`transcript_language`** | `character varying` | YES | — |
| **`transcript_source`** | `character varying` | YES | — |
| **`transcript_length`** | `integer` | YES | — |
| **`fetched_at`** | `timestamp without time zone` | YES | `now()` |
| **`word_count`** | `integer` | YES | — |
| **`quality_score`** | `integer` | YES | — |

**Indexes:**

- `video_transcripts_pkey`: `CREATE UNIQUE INDEX video_transcripts_pkey ON public.video_transcripts USING btree (id)`
- `video_transcripts_post_id_key`: `CREATE UNIQUE INDEX video_transcripts_post_id_key ON public.video_transcripts USING btree (post_id)`

----

### `visitor_profiles`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`visitor_id`** | `text` | NO | — |
| **`first_seen_at`** | `timestamp with time zone` | YES | — |
| **`last_seen_at`** | `timestamp with time zone` | YES | — |
| **`total_sessions`** | `integer` | YES | `0` |
| **`category_affinity`** | `jsonb` | YES | `'{}'::jsonb` |
| **`engagement_score`** | `double precision` | YES | `0.0` |
| **`updated_at`** | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` |

**Indexes:**

- `visitor_profiles_pkey`: `CREATE UNIQUE INDEX visitor_profiles_pkey ON public.visitor_profiles USING btree (visitor_id)`

----

### `worker_runs`

| Column | Type | Nullable? | Default |
|---|---|---|---|
| **`id`** | `integer` | NO | `nextval('worker_runs_id_seq'::regclass)` |
| **`worker_name`** | `text` | NO | — |
| **`started_at`** | `timestamp with time zone` | NO | `now()` |
| **`finished_at`** | `timestamp with time zone` | YES | — |
| **`duration_ms`** | `integer` | YES | — |
| **`status`** | `text` | NO | `'running'::text` |
| **`sources_processed`** | `integer` | YES | `0` |
| **`items_found`** | `integer` | YES | `0` |
| **`items_saved`** | `integer` | YES | `0` |
| **`errors_count`** | `integer` | YES | `0` |
| **`error_message`** | `text` | YES | — |

**Indexes:**

- `idx_worker_runs_lookup`: `CREATE INDEX idx_worker_runs_lookup ON public.worker_runs USING btree (worker_name, started_at DESC)`
- `worker_runs_pkey`: `CREATE UNIQUE INDEX worker_runs_pkey ON public.worker_runs USING btree (id)`

----

## Views

### `v_crawler_daily_metrics`

```sql
 SELECT crawl_attempts.domain,
    date(crawl_attempts.created_at) AS day,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE crawl_attempts.status::text = 'SUCCESS'::text) AS successes,
    round(100.0 * count(*) FILTER (WHERE crawl_attempts.status::text = 'SUCCESS'::text)::numeric / NULLIF(count(*), 0)::numeric, 2) AS success_rate_pct,
    count(*) FILTER (WHERE crawl_attempts.stage::text = 'HTTP'::text) AS http_attempts,
    count(*) FILTER (WHERE crawl_attempts.stage::text = 'PLAYWRIGHT'::text) AS playwright_attempts,
    count(*) FILTER (WHERE crawl_attempts.stage::text = 'RETRY'::text) AS retry_attempts,
    round(avg(
        CASE
            WHEN crawl_attempts.status::text = 'SUCCESS'::text THEN crawl_attempts.duration_ms
            ELSE NULL::integer
        END)) AS avg_success_time_ms,
    max(crawl_attempts.duration_ms) AS max_duration_ms,
    array_agg(DISTINCT crawl_attempts.reason) FILTER (WHERE crawl_attempts.status::text = 'FAILED'::text) AS failure_reasons
   FROM crawl_attempts
  GROUP BY crawl_attempts.domain, (date(crawl_attempts.created_at))
  ORDER BY (date(crawl_attempts.created_at)) DESC, crawl_attempts.domain;
```

----

### `v_domain_failures`

```sql
 SELECT crawl_attempts.domain,
    crawl_attempts.reason,
    count(*) AS count,
    round(100.0 * count(*)::numeric / sum(count(*)) OVER (PARTITION BY crawl_attempts.domain), 1) AS percentage
   FROM crawl_attempts
  WHERE crawl_attempts.status::text = 'FAILED'::text
  GROUP BY crawl_attempts.domain, crawl_attempts.reason
  ORDER BY crawl_attempts.domain, (round(100.0 * count(*)::numeric / sum(count(*)) OVER (PARTITION BY crawl_attempts.domain), 1)) DESC;
```

----

### `v_domain_performance`

```sql
 SELECT domain_profiles.domain,
    domain_profiles.total_attempts,
    round(100.0 * domain_profiles.success_http::numeric / NULLIF(domain_profiles.success_http + domain_profiles.failed_http, 0)::numeric, 1) AS http_success_pct,
    round(100.0 * domain_profiles.success_playwright::numeric / NULLIF(domain_profiles.success_playwright + domain_profiles.failed_playwright, 0)::numeric, 1) AS pw_success_pct,
    round(domain_profiles.avg_time_http_ms) AS http_avg_ms,
    round(domain_profiles.avg_time_playwright_ms) AS pw_avg_ms,
    domain_profiles.strategy,
    domain_profiles.manual_override,
        CASE
            WHEN domain_profiles.manual_override THEN 'ADMIN OVERRIDE'::text
            WHEN domain_profiles.success_playwright IS NOT NULL AND domain_profiles.success_playwright > (domain_profiles.success_http * 2) THEN 'SWITCH TO PLAYWRIGHT'::text
            WHEN domain_profiles.success_http > 80 THEN 'KEEP HTTP'::text
            ELSE 'MONITOR'::text
        END AS recommendation
   FROM domain_profiles
  WHERE domain_profiles.total_attempts > 0
  ORDER BY domain_profiles.total_attempts DESC;
```

----

