-- Observability Layer (P0 Instrumentation) — FINAL VERSION
-- Run: psql $DATABASE_URL -f scripts/migrate_observability_layer.sql
-- Enables data-driven decisions AND foundational state machine for P1 crawler
-- IMPORTANT: This script runs ONCE manually. Never call from worker code.

-- ============================================================================
-- TABLE 1: crawl_session — Groups all attempts for one article
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_session (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id            UUID NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
  domain                TEXT NOT NULL,
  strategy              VARCHAR(50) NOT NULL,               -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT
    CHECK (strategy IN ('HTTP_ONLY', 'PLAYWRIGHT_FIRST', 'HTTP_THEN_PLAYWRIGHT')),
  final_status          VARCHAR(20),                        -- SUCCESS | FAILED | PAYWALL
    CHECK (final_status IS NULL OR final_status IN ('SUCCESS', 'FAILED', 'PAYWALL')),
  final_method          VARCHAR(20),                        -- fetch | playwright | paywall | rss_only
    CHECK (final_method IS NULL OR final_method IN ('fetch', 'playwright', 'paywall', 'rss_only')),
  total_duration_ms     INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_session_article ON crawl_session(article_id);
CREATE INDEX IF NOT EXISTS idx_crawl_session_lookup ON crawl_session(domain, created_at DESC);

-- ============================================================================
-- TABLE 2: crawl_attempts — Individual attempts within a session
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_attempts (
  id                    BIGSERIAL PRIMARY KEY,
  session_id            UUID NOT NULL REFERENCES crawl_session(id) ON DELETE CASCADE,
  article_id            UUID NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
  domain                TEXT NOT NULL,
  attempt_number        INTEGER NOT NULL DEFAULT 1,         -- 1, 2, 3...
  stage                 VARCHAR(50) NOT NULL,               -- HTTP | PLAYWRIGHT | RETRY | HTML_PARSE | ARTICLE_SELECTOR | BOILERPLATE | CONTENT_VALIDATION
    CHECK (stage IN ('HTTP', 'PLAYWRIGHT', 'RETRY', 'HTML_PARSE', 'ARTICLE_SELECTOR', 'BOILERPLATE', 'CONTENT_VALIDATION')),
  status                VARCHAR(20) NOT NULL,               -- SUCCESS | FAILED
    CHECK (status IN ('SUCCESS', 'FAILED')),
  reason                VARCHAR(100),                       -- timeout | 403 | cloudflare | empty_html | ssl | redirect_loop | 404 | 429 | selector_missing | connection_timeout | dns_fail | paywall_detected | not_html
    CHECK (reason IS NULL OR reason IN ('timeout', '403', 'cloudflare', 'empty_html', 'ssl', 'redirect_loop', '404', '429', 'selector_missing', 'connection_timeout', 'dns_fail', 'paywall_detected', 'not_html')),
  http_status           INTEGER,                            -- 200 | 403 | 404 | 429 | 500 | null
  duration_ms           INTEGER,                            -- wall-clock time for this stage
  bytes_downloaded      INTEGER,                            -- raw HTML size (0 if failed)
  content_length        INTEGER,                            -- extracted text length (null if failed)
  content_hash          VARCHAR(64),                        -- SHA256 of content (for dedup detection)
  retryable             BOOLEAN,                            -- can this be retried? (false for 404, paywall; true for timeout, 403, dns)
  details               JSONB DEFAULT '{}',                 -- {error_class, error_context, ...} for exceptions
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_attempts_session ON crawl_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_crawl_attempts_article ON crawl_attempts(article_id);
CREATE INDEX IF NOT EXISTS idx_crawl_attempts_domain ON crawl_attempts(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_attempts_lookup ON crawl_attempts(domain, status, created_at DESC);

-- ============================================================================
-- TABLE 3: domain_profiles — Learned crawler strategy (auto-adapts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS domain_profiles (
  domain                TEXT PRIMARY KEY,
  total_attempts        INTEGER DEFAULT 0,
  success_http          INTEGER DEFAULT 0,
  success_playwright    INTEGER DEFAULT 0,
  success_retry         INTEGER DEFAULT 0,
  failed_http           INTEGER DEFAULT 0,
  failed_playwright     INTEGER DEFAULT 0,
  failed_retry          INTEGER DEFAULT 0,
  avg_time_http_ms      FLOAT,
  avg_time_playwright_ms FLOAT,
  avg_time_retry_ms     FLOAT,
  strategy              VARCHAR(50) DEFAULT 'HTTP_ONLY',    -- HTTP_ONLY | PLAYWRIGHT_FIRST | HTTP_THEN_PLAYWRIGHT | AUTO
    CHECK (strategy IN ('HTTP_ONLY', 'PLAYWRIGHT_FIRST', 'HTTP_THEN_PLAYWRIGHT', 'AUTO')),
  manual_override       BOOLEAN DEFAULT FALSE,              -- true = admin forced strategy, don't auto-learn
  preferred_selector    VARCHAR(100),                       -- article | main | .content | .story (learned from successful extractions)
  supports_http         BOOLEAN DEFAULT TRUE,               -- if false, skip HTTP entirely
  last_attempt_at       TIMESTAMPTZ,
  last_failure_reason   VARCHAR(100),
  last_failure_at       TIMESTAMPTZ,
  consecutive_failures  INTEGER DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE 4: page_metadata — Structured article metadata (SEO foundation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS page_metadata (
  article_id            UUID PRIMARY KEY REFERENCES monitored_articles(id) ON DELETE CASCADE,
  canonical             TEXT,
  h1                    TEXT,
  title                 TEXT,
  description           TEXT,
  og_title              TEXT,
  og_description        TEXT,
  og_image              TEXT,
  meta_keywords         TEXT,                              -- meta name="keywords" content
  twitter_card          TEXT,                              -- summary | summary_large_image | ...
  favicon               TEXT,                              -- favicon URL
  rss_url               TEXT,                              -- RSS feed URL if available
  sitemap_url           TEXT,                              -- sitemap.xml URL
  amp_url               TEXT,                              -- AMP version URL
  author                TEXT,
  published_at          TIMESTAMPTZ,
  modified_at           TIMESTAMPTZ,
  language              VARCHAR(5),                         -- en | es | pt | fr
  robots                VARCHAR(100),                       -- index, follow | noindex, nofollow
  schema_type           VARCHAR(50),                        -- NewsArticle | Article | BlogPosting
  schema_json           JSONB,                              -- full schema.org JSON-LD
  word_count            INTEGER,
  reading_time_minutes  INTEGER,
  images_count          INTEGER,
  videos_count          INTEGER,
  links_internal_count  INTEGER,
  links_external_count  INTEGER,
  has_byline            BOOLEAN,
  has_image             BOOLEAN,
  has_video             BOOLEAN,
  extraction_method     VARCHAR(50),                        -- http | playwright | rss | cache | manual
    CHECK (extraction_method IS NULL OR extraction_method IN ('http', 'playwright', 'rss', 'cache', 'manual')),
  last_crawled_at       TIMESTAMPTZ,                        -- for cache validation
  etag                  VARCHAR(256),                       -- HTTP ETag header (for If-None-Match)
  last_modified_header  TIMESTAMPTZ,                        -- Last-Modified header (for If-Modified-Since)
  content_quality       INTEGER,                            -- 0-100: objective quality score
    CHECK (content_quality IS NULL OR (content_quality BETWEEN 0 AND 100))
  -- Quality checks (merged from quality_checks table)
  has_title             BOOLEAN,
  has_h1                BOOLEAN,
  has_schema            BOOLEAN,
  has_canonical         BOOLEAN,
  language_detected     BOOLEAN,
  content_length        BOOLEAN,                           -- min 100 chars?
  article_element_found BOOLEAN,                           -- <article> or main found?
  no_boilerplate        BOOLEAN,
  -- Metadata
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_metadata_language ON page_metadata(language);
CREATE INDEX IF NOT EXISTS idx_page_metadata_schema ON page_metadata(schema_type);

-- ============================================================================
-- TABLE 5: pipeline_decisions — Generic decision log (coverage, social, SEO)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pipeline_decisions (
  id                    BIGSERIAL PRIMARY KEY,
  module                VARCHAR(50) NOT NULL,               -- crawler | coverage | social | seo | editorial
    CHECK (module IN ('crawler', 'coverage', 'social', 'seo', 'editorial')),
  pipeline              VARCHAR(20) NOT NULL DEFAULT 'v1',  -- v1 | v2 | v3 | ... (for algorithm versioning)
  entity_id             UUID,                               -- article_id | cluster_id | post_id
  entity_type           VARCHAR(50),                        -- article | story_cluster | social_cluster
  decision              VARCHAR(100) NOT NULL,              -- clustering_rejected | entity_matched | ...
  accepted              BOOLEAN,                            -- true = YES, false = REJECTED
  reason                VARCHAR(100),                       -- similarity_low | category_mismatch | ...
  score                 FLOAT,                              -- decision confidence (0-1) or threshold value
  threshold             FLOAT,                              -- gate threshold (e.g., Jaccard 0.20)
  metadata              JSONB DEFAULT '{}',                 -- {similarity: 0.13, keywords_shared: 2}
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_decisions_module ON pipeline_decisions(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_decisions_entity ON pipeline_decisions(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_decisions_pipeline ON pipeline_decisions(module, pipeline, created_at DESC);

-- ============================================================================
-- TABLE 6: crawl_content_versions — Track content updates over time
-- ============================================================================
-- Enables: detecting updates, breaking news, content changes, auto-refresh Coverage/Social
CREATE TABLE IF NOT EXISTS crawl_content_versions (
  id                    BIGSERIAL PRIMARY KEY,
  article_id            UUID NOT NULL REFERENCES monitored_articles(id) ON DELETE CASCADE,
  content_hash          VARCHAR(64) NOT NULL,               -- SHA256 of content
  word_count            INTEGER,
  version_number        INTEGER NOT NULL DEFAULT 1,         -- increments on each change
  change_reason         VARCHAR(50),                        -- CONTENT_UPDATED | TITLE_CHANGED | CANONICAL_CHANGED | AUTHOR_CHANGED | SCHEMA_CHANGED | CONTENT_REMOVED
    CHECK (change_reason IN ('CONTENT_UPDATED', 'TITLE_CHANGED', 'CANONICAL_CHANGED', 'AUTHOR_CHANGED', 'SCHEMA_CHANGED', 'CONTENT_REMOVED')),
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_content_versions_article ON crawl_content_versions(article_id, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_content_versions_hash ON crawl_content_versions(article_id, content_hash);

-- NOTE: crawl_queue will be created in P1 (Crawler rewrite)
-- Not created in P0 to avoid mixing concerns

-- ============================================================================
-- VIEWS (Derived tables, not persistent)
-- ============================================================================

-- Daily crawler performance by domain
CREATE OR REPLACE VIEW v_crawler_daily_metrics AS
SELECT
  domain,
  DATE(created_at) AS day,
  COUNT(*) AS total_attempts,
  COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'SUCCESS') / NULLIF(COUNT(*), 0), 2) AS success_rate_pct,
  COUNT(*) FILTER (WHERE stage = 'HTTP') AS http_attempts,
  COUNT(*) FILTER (WHERE stage = 'PLAYWRIGHT') AS playwright_attempts,
  COUNT(*) FILTER (WHERE stage = 'RETRY') AS retry_attempts,
  ROUND(AVG(CASE WHEN status = 'SUCCESS' THEN duration_ms END)) AS avg_success_time_ms,
  MAX(duration_ms) AS max_duration_ms,
  ARRAY_AGG(DISTINCT reason) FILTER (WHERE status = 'FAILED') AS failure_reasons
FROM crawl_attempts
GROUP BY domain, DATE(created_at)
ORDER BY day DESC, domain;

-- Domain failure summary (aggregated from crawl_attempts, not a table)
CREATE OR REPLACE VIEW v_domain_failures AS
SELECT
  domain,
  reason,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY domain), 1) AS percentage
FROM crawl_attempts
WHERE status = 'FAILED'
GROUP BY domain, reason
ORDER BY domain, percentage DESC;

-- Pipeline decision summary (rejection rates by module/reason)
CREATE OR REPLACE VIEW v_pipeline_rejection_summary AS
SELECT
  module,
  pipeline,
  reason,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE accepted = FALSE) / NULLIF(COUNT(*), 0), 2) AS rejection_rate_pct,
  ROUND(AVG(score), 3) AS avg_score
FROM pipeline_decisions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY module, pipeline, reason
ORDER BY module, pipeline, rejection_rate_pct DESC;

-- Domain performance: success rates and strategy recommendation
CREATE OR REPLACE VIEW v_domain_performance AS
SELECT
  domain,
  total_attempts,
  ROUND(100.0 * success_http / NULLIF(success_http + failed_http, 0), 1) AS http_success_pct,
  ROUND(100.0 * success_playwright / NULLIF(success_playwright + failed_playwright, 0), 1) AS pw_success_pct,
  ROUND(avg_time_http_ms) AS http_avg_ms,
  ROUND(avg_time_playwright_ms) AS pw_avg_ms,
  strategy,
  manual_override,
  CASE
    WHEN manual_override THEN 'ADMIN OVERRIDE'
    WHEN success_playwright IS NOT NULL AND success_playwright > (success_http * 2) THEN 'SWITCH TO PLAYWRIGHT'
    WHEN success_http > 80 THEN 'KEEP HTTP'
    ELSE 'MONITOR'
  END AS recommendation
FROM domain_profiles
WHERE total_attempts > 0
ORDER BY total_attempts DESC;
