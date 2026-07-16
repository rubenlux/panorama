--
-- PostgreSQL database dump
--

\restrict vqKLnrP0RllK1kYLXv6JcCD1Db0hNYlt4iTWeQEoGGRRnAsgCFQU6INV1oqGRra

-- Dumped from database version 15.18
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0; (commented out for PostgreSQL 15 compatibility)
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_id uuid,
    type text NOT NULL,
    ip text,
    user_agent text,
    article_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ad_revenue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_revenue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_id uuid NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    revenue numeric(10,2) DEFAULT 0 NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ad_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    "position" text NOT NULL,
    device text DEFAULT 'all'::text,
    width integer,
    height integer,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sponsor_name character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'banner'::character varying,
    "position" character varying(50),
    image_url text NOT NULL,
    link_url text,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    active boolean DEFAULT true,
    start_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    campaign_id uuid,
    ad_slot_id uuid,
    alt_text text,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone
);


--
-- Name: advertisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertisers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    contact_name text,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ai_generation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_generation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid,
    event_id uuid,
    generation_type character varying(50) NOT NULL,
    article_count integer DEFAULT 0 NOT NULL,
    article_titles jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_words_sent integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_categories (
    article_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: article_content_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_content_cache (
    id integer NOT NULL,
    url text NOT NULL,
    title text,
    content text NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_content_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.article_content_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: article_content_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.article_content_cache_id_seq OWNED BY public.article_content_cache.id;


--
-- Name: article_entity_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_entity_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: article_seo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_seo (
    article_id uuid NOT NULL,
    meta_title character varying(255),
    meta_description text,
    canonical_url text,
    og_title character varying(255),
    og_description text,
    og_image text,
    schema_json text,
    keywords text
);


--
-- Name: article_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_stats (
    article_id uuid NOT NULL,
    views integer DEFAULT 0,
    unique_views integer DEFAULT 0,
    likes integer DEFAULT 0,
    shares integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    avg_read_time integer DEFAULT 0,
    last_viewed_at timestamp without time zone,
    total_read_time_seconds bigint DEFAULT 0,
    bounce_rate real DEFAULT 0
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    title character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    excerpt text,
    body text,
    status character varying(50) DEFAULT 'draft'::character varying,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    volanta character varying(255),
    image_url text,
    epigraph text,
    origin character varying DEFAULT 'manual'::character varying,
    dossier_id uuid,
    created_by uuid,
    created_via character varying(50) DEFAULT 'cms_ui'::character varying,
    workflow character varying(50) DEFAULT 'manual'::character varying,
    scheduled_at timestamp with time zone,
    image text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    coverage_scope character varying(50) DEFAULT 'national'::character varying,
    region character varying(100),
    word_count integer DEFAULT 0
);


--
-- Name: COLUMN articles.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.created_by IS 'User ID who initiated the creation (real user, not service account)';


--
-- Name: COLUMN articles.created_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.created_via IS 'Channel: claude_desktop, cms_ui, cli, api';


--
-- Name: COLUMN articles.workflow; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.workflow IS 'Workflow type: editorial_ai, manual, optimized, translated, curated';


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id uuid,
    name text NOT NULL,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    budget numeric(10,2) DEFAULT 0,
    status text DEFAULT 'draft'::text,
    created_at timestamp without time zone DEFAULT now(),
    pricing_model character varying(10) DEFAULT 'CPM'::character varying,
    price numeric(10,2) DEFAULT 0.00,
    currency character varying(3) DEFAULT 'USD'::character varying,
    tags text[] DEFAULT '{}'::text[]
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid,
    parent_id uuid,
    user_id uuid,
    author_name character varying(100),
    author_email character varying(120),
    body text,
    status character varying(50) DEFAULT 'pending'::character varying,
    ip_hash character varying(64),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    message text NOT NULL,
    status character varying(50) DEFAULT 'new'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: coverage_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tracked_source_id uuid NOT NULL,
    tracked_article_id uuid,
    change_type character varying(30) NOT NULL,
    old_value text,
    new_value text,
    detected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crawl_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crawl_attempts (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    article_id uuid NOT NULL,
    domain text NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    stage character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    reason character varying(100),
    http_status integer,
    duration_ms integer,
    bytes_downloaded integer,
    content_length integer,
    content_hash character varying(64),
    retryable boolean,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crawl_attempts_reason_check CHECK (((reason IS NULL) OR ((reason)::text = ANY (ARRAY[('timeout'::character varying)::text, ('403'::character varying)::text, ('cloudflare'::character varying)::text, ('empty_html'::character varying)::text, ('ssl'::character varying)::text, ('redirect_loop'::character varying)::text, ('404'::character varying)::text, ('429'::character varying)::text, ('selector_missing'::character varying)::text, ('connection_timeout'::character varying)::text, ('dns_fail'::character varying)::text, ('paywall_detected'::character varying)::text, ('not_html'::character varying)::text])))),
    CONSTRAINT crawl_attempts_stage_check CHECK (((stage)::text = ANY (ARRAY[('HTTP'::character varying)::text, ('PLAYWRIGHT'::character varying)::text, ('RETRY'::character varying)::text, ('HTML_PARSE'::character varying)::text, ('ARTICLE_SELECTOR'::character varying)::text, ('BOILERPLATE'::character varying)::text, ('CONTENT_VALIDATION'::character varying)::text]))),
    CONSTRAINT crawl_attempts_status_check CHECK (((status)::text = ANY (ARRAY[('SUCCESS'::character varying)::text, ('FAILED'::character varying)::text])))
);


--
-- Name: crawl_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crawl_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crawl_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crawl_attempts_id_seq OWNED BY public.crawl_attempts.id;


--
-- Name: crawl_content_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crawl_content_versions (
    id bigint NOT NULL,
    article_id uuid NOT NULL,
    content_hash character varying(64) NOT NULL,
    word_count integer,
    version_number integer DEFAULT 1 NOT NULL,
    change_reason character varying(50),
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crawl_content_versions_change_reason_check CHECK (((change_reason)::text = ANY (ARRAY[('CONTENT_UPDATED'::character varying)::text, ('TITLE_CHANGED'::character varying)::text, ('CANONICAL_CHANGED'::character varying)::text, ('AUTHOR_CHANGED'::character varying)::text, ('SCHEMA_CHANGED'::character varying)::text, ('CONTENT_REMOVED'::character varying)::text])))
);


--
-- Name: crawl_content_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crawl_content_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crawl_content_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crawl_content_versions_id_seq OWNED BY public.crawl_content_versions.id;


--
-- Name: crawl_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crawl_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    domain text NOT NULL,
    strategy character varying(50) NOT NULL,
    final_status character varying(20),
    final_method character varying(20),
    total_duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crawl_session_final_method_check CHECK (((final_method IS NULL) OR ((final_method)::text = ANY (ARRAY[('fetch'::character varying)::text, ('playwright'::character varying)::text, ('paywall'::character varying)::text, ('rss_only'::character varying)::text])))),
    CONSTRAINT crawl_session_final_status_check CHECK (((final_status IS NULL) OR ((final_status)::text = ANY (ARRAY[('SUCCESS'::character varying)::text, ('FAILED'::character varying)::text, ('PAYWALL'::character varying)::text])))),
    CONSTRAINT crawl_session_strategy_check CHECK (((strategy)::text = ANY (ARRAY[('HTTP_ONLY'::character varying)::text, ('PLAYWRIGHT_FIRST'::character varying)::text, ('HTTP_THEN_PLAYWRIGHT'::character varying)::text])))
);


--
-- Name: domain_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_profiles (
    domain text NOT NULL,
    total_attempts integer DEFAULT 0,
    success_http integer DEFAULT 0,
    success_playwright integer DEFAULT 0,
    success_retry integer DEFAULT 0,
    failed_http integer DEFAULT 0,
    failed_playwright integer DEFAULT 0,
    failed_retry integer DEFAULT 0,
    avg_time_http_ms double precision,
    avg_time_playwright_ms double precision,
    avg_time_retry_ms double precision,
    strategy character varying(50) DEFAULT 'HTTP_ONLY'::character varying,
    manual_override boolean DEFAULT false,
    preferred_selector character varying(100),
    supports_http boolean DEFAULT true,
    last_attempt_at timestamp with time zone,
    last_failure_reason character varying(100),
    last_failure_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT domain_profiles_strategy_check CHECK (((strategy)::text = ANY (ARRAY[('HTTP_ONLY'::character varying)::text, ('PLAYWRIGHT_FIRST'::character varying)::text, ('HTTP_THEN_PLAYWRIGHT'::character varying)::text, ('AUTO'::character varying)::text])))
);


--
-- Name: editorial_angles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editorial_angles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    angle_type character varying(50) NOT NULL,
    summary text,
    target_audience text,
    seo_keywords jsonb DEFAULT '[]'::jsonb,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT editorial_angles_angle_type_check CHECK (((angle_type)::text = ANY (ARRAY[('noticia'::character varying)::text, ('ultima_hora'::character varying)::text, ('cronica'::character varying)::text, ('analisis'::character varying)::text, ('investigacion'::character varying)::text, ('fact_check'::character varying)::text, ('explicador'::character varying)::text])))
);


--
-- Name: editorial_dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editorial_dossiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid,
    status character varying DEFAULT 'generating'::character varying NOT NULL,
    executive_summary text,
    verified_facts jsonb DEFAULT '[]'::jsonb,
    timeline jsonb DEFAULT '[]'::jsonb,
    entities jsonb DEFAULT '[]'::jsonb,
    seo_keywords text[],
    suggested_categories text[],
    suggested_tags text[],
    suggested_headlines text[],
    suggested_angles jsonb DEFAULT '[]'::jsonb,
    hero_image_prompt text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: editorial_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editorial_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    reason text,
    seo_value integer,
    traffic_potential text,
    difficulty text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT editorial_opportunities_difficulty_check CHECK ((difficulty = ANY (ARRAY['facil'::text, 'medio'::text, 'dificil'::text]))),
    CONSTRAINT editorial_opportunities_seo_value_check CHECK (((seo_value >= 1) AND (seo_value <= 10))),
    CONSTRAINT editorial_opportunities_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'dismissed'::text]))),
    CONSTRAINT editorial_opportunities_traffic_potential_check CHECK ((traffic_potential = ANY (ARRAY['alto'::text, 'medio'::text, 'bajo'::text]))),
    CONSTRAINT editorial_opportunities_type_check CHECK ((type = ANY (ARRAY['noticia'::text, 'analisis'::text, 'seo'::text, 'redes'::text, 'explicador'::text, 'entrevista'::text, 'opinion'::text, 'multimedia'::text, 'cobertura_viva'::text])))
);


--
-- Name: entity_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    source_id uuid,
    confidence real DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: entity_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_a_id uuid NOT NULL,
    entity_b_id uuid NOT NULL,
    shared_articles integer DEFAULT 0 NOT NULL,
    shared_events integer DEFAULT 0 NOT NULL,
    strength_score double precision GENERATED ALWAYS AS ((((shared_articles)::double precision * (1.0)::double precision) + ((shared_events)::double precision * (5.0)::double precision))) STORED,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ck_er_order CHECK ((entity_a_id < entity_b_id))
);


--
-- Name: event_cluster_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_cluster_stories (
    event_id uuid NOT NULL,
    story_id uuid NOT NULL,
    linked_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    headline text NOT NULL,
    summary text,
    event_type text DEFAULT 'general'::text,
    importance_score integer DEFAULT 5,
    editorial_score integer DEFAULT 0,
    coverage_status text DEFAULT 'monitoring'::text,
    status text DEFAULT 'active'::text,
    story_count integer DEFAULT 0,
    article_count integer DEFAULT 0,
    source_count integer DEFAULT 0,
    main_entities jsonb DEFAULT '[]'::jsonb,
    timeline jsonb DEFAULT '[]'::jsonb,
    first_detected_at timestamp with time zone DEFAULT now(),
    last_updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_summarized_at timestamp without time zone,
    freshness_score double precision DEFAULT 1.0,
    CONSTRAINT event_clusters_coverage_status_check CHECK ((coverage_status = ANY (ARRAY['monitoring'::text, 'growing'::text, 'breaking'::text, 'cooling'::text, 'archived'::text]))),
    CONSTRAINT event_clusters_editorial_score_check CHECK (((editorial_score >= 0) AND (editorial_score <= 100))),
    CONSTRAINT event_clusters_event_type_check CHECK ((event_type = ANY (ARRAY['sports_live'::text, 'sports'::text, 'politics'::text, 'economy'::text, 'culture'::text, 'science'::text, 'international'::text, 'breaking'::text, 'investigation'::text, 'analysis'::text, 'entertainment'::text, 'health'::text, 'technology'::text, 'general'::text]))),
    CONSTRAINT event_clusters_importance_score_check CHECK (((importance_score >= 1) AND (importance_score <= 10))),
    CONSTRAINT event_clusters_status_check CHECK ((status = ANY (ARRAY['active'::text, 'followed'::text, 'stale'::text, 'archived'::text])))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid,
    type character varying(50) NOT NULL,
    session_id character varying(100),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: knowledge_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    entity_type character varying NOT NULL,
    description text,
    first_seen_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    mention_count integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    entity_origin character varying(20) DEFAULT 'RESEARCH'::character varying NOT NULL,
    CONSTRAINT chk_entity_origin CHECK (((entity_origin)::text = ANY (ARRAY[('RESEARCH'::character varying)::text, ('MONITOR'::character varying)::text, ('SOCIAL'::character varying)::text, ('MANUAL'::character varying)::text])))
);


--
-- Name: knowledge_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    title character varying NOT NULL,
    summary text,
    event_date date,
    event_type character varying DEFAULT 'news'::character varying,
    source_topic_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    filename text NOT NULL,
    mime character varying(100),
    size_bytes bigint,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: monitored_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monitored_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    external_id text,
    title text NOT NULL,
    url text NOT NULL,
    summary text,
    published_at timestamp with time zone,
    detected_at timestamp with time zone DEFAULT now(),
    hash character varying(64) NOT NULL,
    content_text text,
    content_words integer DEFAULT 0,
    extraction_method character varying(20),
    extracted_at timestamp with time zone
);


--
-- Name: pipeline_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_decisions (
    id bigint NOT NULL,
    module character varying(50) NOT NULL,
    pipeline character varying(20) DEFAULT 'v1'::character varying NOT NULL,
    entity_id uuid,
    entity_type character varying(50),
    decision character varying(100) NOT NULL,
    accepted boolean,
    reason character varying(100),
    score double precision,
    threshold double precision,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipeline_decisions_module_check CHECK (((module)::text = ANY (ARRAY[('crawler'::character varying)::text, ('coverage'::character varying)::text, ('social'::character varying)::text, ('seo'::character varying)::text, ('editorial'::character varying)::text])))
);


--
-- Name: pipeline_decisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pipeline_decisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pipeline_decisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pipeline_decisions_id_seq OWNED BY public.pipeline_decisions.id;


--
-- Name: pixel_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pixel_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id text NOT NULL,
    session_id text NOT NULL,
    event text NOT NULL,
    url text,
    referrer text,
    user_agent text,
    ip_hash text,
    device_type character varying(50),
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    geo_country character varying(2),
    geo_city character varying(100),
    utm_source character varying(100),
    utm_medium character varying(100),
    utm_campaign character varying(100),
    article_id uuid
);


--
-- Name: reel_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reel_settings (
    id integer NOT NULL,
    background_color character varying(20) DEFAULT '#1e3a8a'::character varying,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: reel_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reel_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reel_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reel_settings_id_seq OWNED BY public.reel_settings.id;


--
-- Name: reels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reels (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    url text NOT NULL,
    thumbnail text,
    platform character varying(50) DEFAULT 'instagram'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: reels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reels_id_seq OWNED BY public.reels.id;


--
-- Name: research_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    executive_summary text,
    key_facts jsonb DEFAULT '[]'::jsonb,
    controversies jsonb DEFAULT '[]'::jsonb,
    timeline jsonb DEFAULT '[]'::jsonb,
    opportunities text,
    risks text,
    generated_at timestamp with time zone DEFAULT now(),
    source_opportunities jsonb DEFAULT '[]'::jsonb,
    source_attribution jsonb DEFAULT '{}'::jsonb,
    model_used character varying DEFAULT 'claude-sonnet-4-5-20250929'::character varying,
    prompt_version integer DEFAULT 1
);


--
-- Name: research_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    url text,
    title text,
    source_name text,
    published_at timestamp with time zone,
    content text,
    relevance_score real DEFAULT 0,
    connector text DEFAULT 'rss'::text,
    created_at timestamp with time zone DEFAULT now(),
    content_fetched boolean DEFAULT false NOT NULL,
    language character varying DEFAULT 'es'::character varying,
    entities jsonb DEFAULT '[]'::jsonb,
    word_count integer
);


--
-- Name: research_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source_type character varying(20) DEFAULT 'manual'::character varying,
    source_id uuid,
    source_title text,
    source_score integer,
    created_by uuid,
    category character varying,
    tags text[] DEFAULT '{}'::text[]
);


--
-- Name: rss_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rss_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying DEFAULT 'news'::character varying NOT NULL,
    rss_url text NOT NULL,
    homepage text,
    enabled boolean DEFAULT true,
    check_interval integer DEFAULT 60,
    last_checked timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    verification_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    verified_at timestamp with time zone,
    verified_by integer,
    trust_score numeric(4,1) DEFAULT 5.0,
    discovery_type character varying(20) DEFAULT 'RSS'::character varying NOT NULL,
    last_discovery_status character varying(20),
    last_discovery_error text,
    last_discovery_duration_ms integer,
    last_articles_found integer,
    last_discovery_at timestamp without time zone,
    consecutive_discovery_failures integer DEFAULT 0,
    last_format_detected character varying(40),
    last_verification_notes text,
    CONSTRAINT check_discovery_type CHECK (((discovery_type)::text = ANY (ARRAY[('RSS'::character varying)::text, ('SITEMAP'::character varying)::text, ('PLAYWRIGHT'::character varying)::text])))
);


--
-- Name: schema_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_version (
    id integer NOT NULL,
    version character varying(50) NOT NULL,
    baseline_hash character varying(64) NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    git_commit character varying(40),
    generator_version character varying(50) DEFAULT 'bootstrap.js v1'::character varying,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_version_id_seq OWNED BY public.schema_version.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key character varying(100) NOT NULL,
    value text,
    type character varying(20) DEFAULT 'string'::character varying,
    group_name character varying(50) DEFAULT 'general'::character varying,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: social_cluster_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_cluster_posts (
    cluster_id uuid NOT NULL,
    post_id uuid NOT NULL,
    linked_at timestamp with time zone DEFAULT now()
);


--
-- Name: social_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    keywords jsonb DEFAULT '[]'::jsonb,
    post_count integer DEFAULT 0,
    source_count integer DEFAULT 0,
    total_views bigint DEFAULT 0,
    total_likes bigint DEFAULT 0,
    total_comments bigint DEFAULT 0,
    total_shares bigint DEFAULT 0,
    total_engagement bigint DEFAULT 0,
    engagement_score double precision DEFAULT 0,
    growth_rate double precision DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    first_seen timestamp with time zone DEFAULT now(),
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    viral_score integer DEFAULT 0,
    sources_count integer DEFAULT 1,
    gap_score double precision DEFAULT 0,
    opportunity_score double precision DEFAULT 0,
    detected_category character varying(30) DEFAULT 'general'::character varying,
    CONSTRAINT social_clusters_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('stale'::character varying)::text])))
);


--
-- Name: social_content_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_content_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    facebook_post text,
    instagram_feed text,
    instagram_story text,
    instagram_carousel jsonb DEFAULT '[]'::jsonb,
    x_post text,
    linkedin_post text,
    newsletter_content text,
    push_notification text,
    recommendations jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tiktok_script jsonb DEFAULT '{}'::jsonb,
    instagram_reel jsonb DEFAULT '{}'::jsonb,
    facebook_reel jsonb DEFAULT '{}'::jsonb,
    youtube_short jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT social_content_packages_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('review'::character varying)::text, ('approved'::character varying)::text, ('scheduled'::character varying)::text, ('published'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: social_fetch_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_fetch_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    success boolean DEFAULT false,
    posts_found integer DEFAULT 0,
    error_message text,
    auth_status character varying(50) DEFAULT 'unknown'::character varying,
    rate_limited boolean DEFAULT false,
    captcha_detected boolean DEFAULT false,
    login_wall_detected boolean DEFAULT false,
    posts_saved integer DEFAULT 0
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    external_id character varying(500) NOT NULL,
    url text NOT NULL,
    published_at timestamp with time zone,
    title text,
    content text,
    thumbnail_url text,
    video_url text,
    views bigint DEFAULT 0,
    likes bigint DEFAULT 0,
    comments bigint DEFAULT 0,
    shares bigint DEFAULT 0,
    engagement_score double precision DEFAULT 0,
    keywords jsonb DEFAULT '[]'::jsonb,
    captured_at timestamp with time zone DEFAULT now(),
    enriched_at timestamp with time zone,
    transcript_available boolean,
    transcript_fetched_at timestamp without time zone
);


--
-- Name: social_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    platform character varying(20) NOT NULL,
    profile_url text NOT NULL,
    handle character varying(100),
    platform_id character varying(200),
    enabled boolean DEFAULT true,
    priority integer DEFAULT 5,
    region character varying(50) DEFAULT 'nacional'::character varying,
    category character varying(50) DEFAULT 'medio'::character varying,
    last_checked timestamp with time zone,
    last_post_at timestamp with time zone,
    post_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    content_type character varying(20) DEFAULT 'videos'::character varying,
    last_external_id character varying(500),
    freshness_window_seconds integer DEFAULT 900,
    graph_api_supported boolean,
    CONSTRAINT social_sources_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['videos'::character varying, 'shorts'::character varying, 'posts'::character varying, 'tweets'::character varying])::text[]))),
    CONSTRAINT social_sources_platform_check CHECK (((platform)::text = ANY (ARRAY[('youtube'::character varying)::text, ('instagram'::character varying)::text, ('facebook'::character varying)::text, ('x'::character varying)::text, ('tiktok'::character varying)::text, ('whatsapp'::character varying)::text])))
);


--
-- Name: source_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_verifications (
    id integer NOT NULL,
    source_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    checked_by integer,
    notes text,
    http_status integer,
    response_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: source_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.source_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: source_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.source_verifications_id_seq OWNED BY public.source_verifications.id;


--
-- Name: story_cluster_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_cluster_articles (
    story_id uuid NOT NULL,
    article_id uuid NOT NULL,
    relevance_score numeric DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category_match boolean DEFAULT true,
    category_score double precision DEFAULT 0,
    entity_score double precision DEFAULT 0,
    keyword_score double precision DEFAULT 0,
    matching_reason text,
    shared_keywords jsonb DEFAULT '[]'::jsonb,
    shared_entities jsonb DEFAULT '[]'::jsonb,
    title_similarity numeric,
    keyword_similarity numeric,
    entity_similarity numeric
);


--
-- Name: story_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text,
    slug text,
    story_type character varying(50) DEFAULT 'news'::character varying NOT NULL,
    summary text,
    editorial_opportunities jsonb DEFAULT '[]'::jsonb NOT NULL,
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    importance_score integer DEFAULT 0 NOT NULL,
    coverage_status character varying(30) DEFAULT 'monitoring'::character varying NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    source_count integer DEFAULT 0 NOT NULL,
    article_count integer DEFAULT 0 NOT NULL,
    is_recurring boolean DEFAULT false NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    story_quality character varying(10) DEFAULT 'fair'::character varying,
    avg_relevance double precision,
    story_context_score integer DEFAULT 0,
    algorithmic_summary text,
    freshness_score double precision DEFAULT 1.0,
    detected_category character varying(20),
    contamination_flag boolean DEFAULT false,
    context_relevance_score integer DEFAULT 0,
    context_depth_score integer DEFAULT 0,
    context_diversity_score integer DEFAULT 0,
    context_coverage_score integer DEFAULT 0,
    story_confidence character varying(10) DEFAULT 'low'::character varying,
    CONSTRAINT story_clusters_coverage_status_check CHECK (((coverage_status)::text = ANY (ARRAY[('monitoring'::character varying)::text, ('growing'::character varying)::text, ('breaking'::character varying)::text, ('cooling'::character varying)::text, ('archived'::character varying)::text]))),
    CONSTRAINT story_clusters_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('summarizing'::character varying)::text, ('ready'::character varying)::text, ('stale'::character varying)::text, ('followed'::character varying)::text]))),
    CONSTRAINT story_clusters_story_type_check CHECK (((story_type)::text = ANY (ARRAY[('news'::character varying)::text, ('breaking_news'::character varying)::text, ('event'::character varying)::text, ('live_event'::character varying)::text, ('investigation'::character varying)::text, ('analysis'::character varying)::text, ('politics'::character varying)::text, ('sports'::character varying)::text, ('technology'::character varying)::text, ('entertainment'::character varying)::text, ('economy'::character varying)::text, ('health'::character varying)::text, ('science'::character varying)::text, ('international'::character varying)::text, ('culture'::character varying)::text])))
);


--
-- Name: story_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_entities (
    story_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    role character varying(50) DEFAULT 'participant'::character varying NOT NULL
);


--
-- Name: story_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_cluster_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    opportunity_type character varying(30) DEFAULT 'NEWS'::character varying,
    traffic_score integer DEFAULT 50,
    seo_score integer DEFAULT 50,
    urgency_score integer DEFAULT 50,
    editorial_score integer DEFAULT 50,
    composite_score numeric(5,2) DEFAULT 50.00,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    trigger character varying(20) DEFAULT 'ai'::character varying,
    CONSTRAINT story_opportunities_editorial_score_check CHECK (((editorial_score >= 0) AND (editorial_score <= 100))),
    CONSTRAINT story_opportunities_opportunity_type_check CHECK (((opportunity_type)::text = ANY (ARRAY[('NEWS'::character varying)::text, ('SEO'::character varying)::text, ('ANALYSIS'::character varying)::text, ('EXPLAINER'::character varying)::text, ('SOCIAL'::character varying)::text, ('FACT_CHECK'::character varying)::text, ('LIVE_COVERAGE'::character varying)::text, ('OPINION'::character varying)::text]))),
    CONSTRAINT story_opportunities_seo_score_check CHECK (((seo_score >= 0) AND (seo_score <= 100))),
    CONSTRAINT story_opportunities_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('in_progress'::character varying)::text, ('done'::character varying)::text, ('dismissed'::character varying)::text]))),
    CONSTRAINT story_opportunities_traffic_score_check CHECK (((traffic_score >= 0) AND (traffic_score <= 100))),
    CONSTRAINT story_opportunities_urgency_score_check CHECK (((urgency_score >= 0) AND (urgency_score <= 100)))
);


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    source character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'active'::character varying
);


--
-- Name: system_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_events (
    id integer NOT NULL,
    event_type text NOT NULL,
    actor text DEFAULT 'system'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_events_id_seq OWNED BY public.system_events.id;


--
-- Name: topic_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_articles (
    topic_id uuid NOT NULL,
    article_id uuid NOT NULL,
    relevance_score numeric(3,2) DEFAULT 1.0,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: topic_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_entities (
    topic_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    prominence_score numeric(3,2) DEFAULT 1.0,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: topic_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_events (
    topic_id uuid NOT NULL,
    event_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: topic_research; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_research (
    topic_id uuid NOT NULL,
    research_topic_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    region character varying(100),
    coverage_scope character varying(50) DEFAULT 'national'::character varying,
    importance_score numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT topics_coverage_scope_check CHECK (((coverage_scope)::text = ANY (ARRAY[('international'::character varying)::text, ('national'::character varying)::text, ('regional'::character varying)::text, ('local'::character varying)::text])))
);


--
-- Name: tracked_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracked_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tracked_source_id uuid NOT NULL,
    url text NOT NULL,
    title text,
    first_detected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    current_position integer,
    is_active boolean DEFAULT true,
    content_text text,
    published_at timestamp with time zone,
    modified_at timestamp with time zone
);


--
-- Name: tracked_source_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracked_source_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tracked_source_id uuid NOT NULL,
    content_hash character varying(64) NOT NULL,
    links_detected jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tracked_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracked_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    url text NOT NULL,
    type character varying(50) NOT NULL,
    refresh_interval_seconds integer DEFAULT 300,
    active boolean DEFAULT true,
    last_checked timestamp with time zone,
    last_hash character varying(64),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_verification_notes text,
    last_format_detected character varying(40)
);


--
-- Name: transcript_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcript_analysis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    summary text,
    entities_people jsonb DEFAULT '[]'::jsonb,
    entities_places jsonb DEFAULT '[]'::jsonb,
    entities_orgs jsonb DEFAULT '[]'::jsonb,
    main_topics jsonb DEFAULT '[]'::jsonb,
    quotes jsonb DEFAULT '[]'::jsonb,
    keywords jsonb DEFAULT '[]'::jsonb,
    generated_at timestamp without time zone DEFAULT now(),
    editorial_type character varying(20),
    key_points jsonb DEFAULT '[]'::jsonb
);


--
-- Name: trend_cluster_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trend_cluster_articles (
    trend_id uuid NOT NULL,
    article_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trend_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trend_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    headline text,
    summary text,
    editorial_angles jsonb DEFAULT '[]'::jsonb,
    source_count integer DEFAULT 0 NOT NULL,
    article_count integer DEFAULT 0 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trend_clusters_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('summarizing'::character varying)::text, ('ready'::character varying)::text, ('stale'::character varying)::text, ('followed'::character varying)::text])))
);


--
-- Name: trending_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trending_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    mention_count integer DEFAULT 1,
    source_count integer DEFAULT 1,
    window_minutes integer DEFAULT 30,
    last_seen_at timestamp with time zone DEFAULT now(),
    auto_researched boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_activity_id_seq OWNED BY public.user_activity.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'editor'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    name character varying(255),
    bio text,
    avatar_url text,
    social_links jsonb
);


--
-- Name: v_crawler_daily_metrics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_crawler_daily_metrics AS
 SELECT crawl_attempts.domain,
    date(crawl_attempts.created_at) AS day,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE ((crawl_attempts.status)::text = 'SUCCESS'::text)) AS successes,
    round(((100.0 * (count(*) FILTER (WHERE ((crawl_attempts.status)::text = 'SUCCESS'::text)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS success_rate_pct,
    count(*) FILTER (WHERE ((crawl_attempts.stage)::text = 'HTTP'::text)) AS http_attempts,
    count(*) FILTER (WHERE ((crawl_attempts.stage)::text = 'PLAYWRIGHT'::text)) AS playwright_attempts,
    count(*) FILTER (WHERE ((crawl_attempts.stage)::text = 'RETRY'::text)) AS retry_attempts,
    round(avg(
        CASE
            WHEN ((crawl_attempts.status)::text = 'SUCCESS'::text) THEN crawl_attempts.duration_ms
            ELSE NULL::integer
        END)) AS avg_success_time_ms,
    max(crawl_attempts.duration_ms) AS max_duration_ms,
    array_agg(DISTINCT crawl_attempts.reason) FILTER (WHERE ((crawl_attempts.status)::text = 'FAILED'::text)) AS failure_reasons
   FROM public.crawl_attempts
  GROUP BY crawl_attempts.domain, (date(crawl_attempts.created_at))
  ORDER BY (date(crawl_attempts.created_at)) DESC, crawl_attempts.domain;


--
-- Name: v_domain_failures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_domain_failures AS
 SELECT crawl_attempts.domain,
    crawl_attempts.reason,
    count(*) AS count,
    round(((100.0 * (count(*))::numeric) / sum(count(*)) OVER (PARTITION BY crawl_attempts.domain)), 1) AS percentage
   FROM public.crawl_attempts
  WHERE ((crawl_attempts.status)::text = 'FAILED'::text)
  GROUP BY crawl_attempts.domain, crawl_attempts.reason
  ORDER BY crawl_attempts.domain, (round(((100.0 * (count(*))::numeric) / sum(count(*)) OVER (PARTITION BY crawl_attempts.domain)), 1)) DESC;


--
-- Name: v_domain_performance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_domain_performance AS
 SELECT domain_profiles.domain,
    domain_profiles.total_attempts,
    round(((100.0 * (domain_profiles.success_http)::numeric) / (NULLIF((domain_profiles.success_http + domain_profiles.failed_http), 0))::numeric), 1) AS http_success_pct,
    round(((100.0 * (domain_profiles.success_playwright)::numeric) / (NULLIF((domain_profiles.success_playwright + domain_profiles.failed_playwright), 0))::numeric), 1) AS pw_success_pct,
    round(domain_profiles.avg_time_http_ms) AS http_avg_ms,
    round(domain_profiles.avg_time_playwright_ms) AS pw_avg_ms,
    domain_profiles.strategy,
    domain_profiles.manual_override,
        CASE
            WHEN domain_profiles.manual_override THEN 'ADMIN OVERRIDE'::text
            WHEN ((domain_profiles.success_playwright IS NOT NULL) AND (domain_profiles.success_playwright > (domain_profiles.success_http * 2))) THEN 'SWITCH TO PLAYWRIGHT'::text
            WHEN (domain_profiles.success_http > 80) THEN 'KEEP HTTP'::text
            ELSE 'MONITOR'::text
        END AS recommendation
   FROM public.domain_profiles
  WHERE (domain_profiles.total_attempts > 0)
  ORDER BY domain_profiles.total_attempts DESC;


--
-- Name: video_transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    transcript_text text,
    transcript_language character varying(20),
    transcript_source character varying(20),
    transcript_length integer,
    fetched_at timestamp without time zone DEFAULT now(),
    word_count integer,
    quality_score integer
);


--
-- Name: visitor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_profiles (
    visitor_id text NOT NULL,
    first_seen_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    total_sessions integer DEFAULT 0,
    category_affinity jsonb DEFAULT '{}'::jsonb,
    engagement_score double precision DEFAULT 0.0,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: worker_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_runs (
    id integer NOT NULL,
    worker_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    status text DEFAULT 'running'::text NOT NULL,
    sources_processed integer DEFAULT 0,
    items_found integer DEFAULT 0,
    items_saved integer DEFAULT 0,
    errors_count integer DEFAULT 0,
    error_message text
);


--
-- Name: worker_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.worker_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: worker_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.worker_runs_id_seq OWNED BY public.worker_runs.id;


--
-- Name: article_content_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_content_cache ALTER COLUMN id SET DEFAULT nextval('public.article_content_cache_id_seq'::regclass);


--
-- Name: crawl_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_attempts ALTER COLUMN id SET DEFAULT nextval('public.crawl_attempts_id_seq'::regclass);


--
-- Name: crawl_content_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_content_versions ALTER COLUMN id SET DEFAULT nextval('public.crawl_content_versions_id_seq'::regclass);


--
-- Name: pipeline_decisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_decisions ALTER COLUMN id SET DEFAULT nextval('public.pipeline_decisions_id_seq'::regclass);


--
-- Name: reel_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reel_settings ALTER COLUMN id SET DEFAULT nextval('public.reel_settings_id_seq'::regclass);


--
-- Name: reels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reels ALTER COLUMN id SET DEFAULT nextval('public.reels_id_seq'::regclass);


--
-- Name: schema_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version ALTER COLUMN id SET DEFAULT nextval('public.schema_version_id_seq'::regclass);


--
-- Name: source_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_verifications ALTER COLUMN id SET DEFAULT nextval('public.source_verifications_id_seq'::regclass);


--
-- Name: system_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events ALTER COLUMN id SET DEFAULT nextval('public.system_events_id_seq'::regclass);


--
-- Name: user_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity ALTER COLUMN id SET DEFAULT nextval('public.user_activity_id_seq'::regclass);


--
-- Name: worker_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_runs ALTER COLUMN id SET DEFAULT nextval('public.worker_runs_id_seq'::regclass);


--
-- Name: ad_events ad_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_events
    ADD CONSTRAINT ad_events_pkey PRIMARY KEY (id);


--
-- Name: ad_revenue ad_revenue_ad_id_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_revenue
    ADD CONSTRAINT ad_revenue_ad_id_period_start_period_end_key UNIQUE (ad_id, period_start, period_end);


--
-- Name: ad_revenue ad_revenue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_revenue
    ADD CONSTRAINT ad_revenue_pkey PRIMARY KEY (id);


--
-- Name: ad_slots ad_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_slots
    ADD CONSTRAINT ad_slots_pkey PRIMARY KEY (id);


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);


--
-- Name: advertisers advertisers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertisers
    ADD CONSTRAINT advertisers_pkey PRIMARY KEY (id);


--
-- Name: ai_generation_logs ai_generation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generation_logs
    ADD CONSTRAINT ai_generation_logs_pkey PRIMARY KEY (id);


--
-- Name: article_categories article_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_pkey PRIMARY KEY (article_id, category_id);


--
-- Name: article_content_cache article_content_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_content_cache
    ADD CONSTRAINT article_content_cache_pkey PRIMARY KEY (id);


--
-- Name: article_content_cache article_content_cache_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_content_cache
    ADD CONSTRAINT article_content_cache_url_key UNIQUE (url);


--
-- Name: article_entity_matches article_entity_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_entity_matches
    ADD CONSTRAINT article_entity_matches_pkey PRIMARY KEY (id);


--
-- Name: article_seo article_seo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_seo
    ADD CONSTRAINT article_seo_pkey PRIMARY KEY (article_id);


--
-- Name: article_stats article_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_stats
    ADD CONSTRAINT article_stats_pkey PRIMARY KEY (article_id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: articles articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_slug_key UNIQUE (slug);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: coverage_changes coverage_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_changes
    ADD CONSTRAINT coverage_changes_pkey PRIMARY KEY (id);


--
-- Name: crawl_attempts crawl_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_attempts
    ADD CONSTRAINT crawl_attempts_pkey PRIMARY KEY (id);


--
-- Name: crawl_content_versions crawl_content_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_content_versions
    ADD CONSTRAINT crawl_content_versions_pkey PRIMARY KEY (id);


--
-- Name: crawl_session crawl_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_session
    ADD CONSTRAINT crawl_session_pkey PRIMARY KEY (id);


--
-- Name: domain_profiles domain_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_profiles
    ADD CONSTRAINT domain_profiles_pkey PRIMARY KEY (domain);


--
-- Name: editorial_angles editorial_angles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_angles
    ADD CONSTRAINT editorial_angles_pkey PRIMARY KEY (id);


--
-- Name: editorial_dossiers editorial_dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_dossiers
    ADD CONSTRAINT editorial_dossiers_pkey PRIMARY KEY (id);


--
-- Name: editorial_opportunities editorial_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_opportunities
    ADD CONSTRAINT editorial_opportunities_pkey PRIMARY KEY (id);


--
-- Name: entity_mentions entity_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_pkey PRIMARY KEY (id);


--
-- Name: entity_relationships entity_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relationships
    ADD CONSTRAINT entity_relationships_pkey PRIMARY KEY (id);


--
-- Name: event_cluster_stories event_cluster_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cluster_stories
    ADD CONSTRAINT event_cluster_stories_pkey PRIMARY KEY (event_id, story_id);


--
-- Name: event_clusters event_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_clusters
    ADD CONSTRAINT event_clusters_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: knowledge_entities knowledge_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entities
    ADD CONSTRAINT knowledge_entities_pkey PRIMARY KEY (id);


--
-- Name: knowledge_events knowledge_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_events
    ADD CONSTRAINT knowledge_events_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: monitored_articles monitored_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitored_articles
    ADD CONSTRAINT monitored_articles_pkey PRIMARY KEY (id);


--
-- Name: pipeline_decisions pipeline_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_decisions
    ADD CONSTRAINT pipeline_decisions_pkey PRIMARY KEY (id);


--
-- Name: pixel_events pixel_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_events
    ADD CONSTRAINT pixel_events_pkey PRIMARY KEY (id);


--
-- Name: reel_settings reel_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reel_settings
    ADD CONSTRAINT reel_settings_pkey PRIMARY KEY (id);


--
-- Name: reels reels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reels
    ADD CONSTRAINT reels_pkey PRIMARY KEY (id);


--
-- Name: research_briefs research_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_briefs
    ADD CONSTRAINT research_briefs_pkey PRIMARY KEY (id);


--
-- Name: research_sources research_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_sources
    ADD CONSTRAINT research_sources_pkey PRIMARY KEY (id);


--
-- Name: research_topics research_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_topics
    ADD CONSTRAINT research_topics_pkey PRIMARY KEY (id);


--
-- Name: schema_version schema_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version
    ADD CONSTRAINT schema_version_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: social_cluster_posts social_cluster_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_cluster_posts
    ADD CONSTRAINT social_cluster_posts_pkey PRIMARY KEY (cluster_id, post_id);


--
-- Name: social_clusters social_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_clusters
    ADD CONSTRAINT social_clusters_pkey PRIMARY KEY (id);


--
-- Name: social_content_packages social_content_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_content_packages
    ADD CONSTRAINT social_content_packages_pkey PRIMARY KEY (id);


--
-- Name: social_fetch_logs social_fetch_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_fetch_logs
    ADD CONSTRAINT social_fetch_logs_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_platform_external_id_key UNIQUE (platform, external_id);


--
-- Name: social_sources social_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_sources
    ADD CONSTRAINT social_sources_pkey PRIMARY KEY (id);


--
-- Name: social_sources social_sources_platform_profile_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_sources
    ADD CONSTRAINT social_sources_platform_profile_url_key UNIQUE (platform, profile_url);


--
-- Name: source_verifications source_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_verifications
    ADD CONSTRAINT source_verifications_pkey PRIMARY KEY (id);


--
-- Name: story_cluster_articles story_cluster_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_cluster_articles
    ADD CONSTRAINT story_cluster_articles_pkey PRIMARY KEY (story_id, article_id);


--
-- Name: story_clusters story_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_clusters
    ADD CONSTRAINT story_clusters_pkey PRIMARY KEY (id);


--
-- Name: story_clusters story_clusters_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_clusters
    ADD CONSTRAINT story_clusters_slug_key UNIQUE (slug);


--
-- Name: story_entities story_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_entities
    ADD CONSTRAINT story_entities_pkey PRIMARY KEY (story_id, entity_id);


--
-- Name: story_opportunities story_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_opportunities
    ADD CONSTRAINT story_opportunities_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_email_key UNIQUE (email);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: system_events system_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_pkey PRIMARY KEY (id);


--
-- Name: topic_articles topic_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_articles
    ADD CONSTRAINT topic_articles_pkey PRIMARY KEY (topic_id, article_id);


--
-- Name: topic_entities topic_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_entities
    ADD CONSTRAINT topic_entities_pkey PRIMARY KEY (topic_id, entity_id);


--
-- Name: topic_events topic_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_events
    ADD CONSTRAINT topic_events_pkey PRIMARY KEY (topic_id, event_id);


--
-- Name: topic_research topic_research_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_research
    ADD CONSTRAINT topic_research_pkey PRIMARY KEY (topic_id, research_topic_id);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: topics topics_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_slug_key UNIQUE (slug);


--
-- Name: tracked_articles tracked_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_articles
    ADD CONSTRAINT tracked_articles_pkey PRIMARY KEY (id);


--
-- Name: tracked_articles tracked_articles_tracked_source_id_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_articles
    ADD CONSTRAINT tracked_articles_tracked_source_id_url_key UNIQUE (tracked_source_id, url);


--
-- Name: tracked_source_snapshots tracked_source_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_source_snapshots
    ADD CONSTRAINT tracked_source_snapshots_pkey PRIMARY KEY (id);


--
-- Name: rss_sources tracked_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rss_sources
    ADD CONSTRAINT tracked_sources_pkey PRIMARY KEY (id);


--
-- Name: tracked_sources tracked_sources_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_sources
    ADD CONSTRAINT tracked_sources_pkey1 PRIMARY KEY (id);


--
-- Name: transcript_analysis transcript_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_analysis
    ADD CONSTRAINT transcript_analysis_pkey PRIMARY KEY (id);


--
-- Name: transcript_analysis transcript_analysis_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_analysis
    ADD CONSTRAINT transcript_analysis_post_id_key UNIQUE (post_id);


--
-- Name: trend_cluster_articles trend_cluster_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_cluster_articles
    ADD CONSTRAINT trend_cluster_articles_pkey PRIMARY KEY (trend_id, article_id);


--
-- Name: trend_clusters trend_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_clusters
    ADD CONSTRAINT trend_clusters_pkey PRIMARY KEY (id);


--
-- Name: trending_topics trending_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trending_topics
    ADD CONSTRAINT trending_topics_pkey PRIMARY KEY (id);


--
-- Name: entity_relationships uq_er_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relationships
    ADD CONSTRAINT uq_er_pair UNIQUE (entity_a_id, entity_b_id);


--
-- Name: user_activity user_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_transcripts video_transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_transcripts
    ADD CONSTRAINT video_transcripts_pkey PRIMARY KEY (id);


--
-- Name: video_transcripts video_transcripts_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_transcripts
    ADD CONSTRAINT video_transcripts_post_id_key UNIQUE (post_id);


--
-- Name: visitor_profiles visitor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_profiles
    ADD CONSTRAINT visitor_profiles_pkey PRIMARY KEY (visitor_id);


--
-- Name: worker_runs worker_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_runs
    ADD CONSTRAINT worker_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_gen_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_gen_logs_created_idx ON public.ai_generation_logs USING btree (created_at DESC);


--
-- Name: ai_gen_logs_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_gen_logs_event_idx ON public.ai_generation_logs USING btree (event_id);


--
-- Name: ai_gen_logs_story_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_gen_logs_story_idx ON public.ai_generation_logs USING btree (story_id);


--
-- Name: idx_acc_fetched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_fetched ON public.article_content_cache USING btree (fetched_at DESC);


--
-- Name: idx_acc_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_url ON public.article_content_cache USING btree (url);


--
-- Name: idx_ad_events_ad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_events_ad_id ON public.ad_events USING btree (ad_id);


--
-- Name: idx_ad_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_events_type ON public.ad_events USING btree (type);


--
-- Name: idx_aem_by_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aem_by_article ON public.article_entity_matches USING btree (article_id);


--
-- Name: idx_aem_by_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aem_by_entity ON public.article_entity_matches USING btree (entity_id);


--
-- Name: idx_aem_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_aem_unique ON public.article_entity_matches USING btree (article_id, entity_id);


--
-- Name: idx_articles_coverage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_coverage ON public.articles USING btree (coverage_scope);


--
-- Name: idx_articles_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_created_by ON public.articles USING btree (created_by);


--
-- Name: idx_articles_created_via; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_created_via ON public.articles USING btree (created_via);


--
-- Name: idx_articles_dossier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_dossier ON public.articles USING btree (dossier_id);


--
-- Name: idx_articles_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_origin ON public.articles USING btree (origin);


--
-- Name: idx_articles_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_region ON public.articles USING btree (region);


--
-- Name: idx_articles_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_workflow ON public.articles USING btree (workflow);


--
-- Name: idx_campaigns_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_tags ON public.campaigns USING gin (tags);


--
-- Name: idx_contact_messages_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_email ON public.contact_messages USING btree (email);


--
-- Name: idx_contact_messages_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_status_created ON public.contact_messages USING btree (status, created_at DESC);


--
-- Name: idx_coverage_changes_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_changes_global ON public.coverage_changes USING btree (detected_at DESC);


--
-- Name: idx_coverage_changes_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_changes_source ON public.coverage_changes USING btree (tracked_source_id, detected_at DESC);


--
-- Name: idx_coverage_changes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_changes_type ON public.coverage_changes USING btree (change_type, detected_at DESC);


--
-- Name: idx_crawl_attempts_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_attempts_article ON public.crawl_attempts USING btree (article_id);


--
-- Name: idx_crawl_attempts_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_attempts_domain ON public.crawl_attempts USING btree (domain, created_at DESC);


--
-- Name: idx_crawl_attempts_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_attempts_lookup ON public.crawl_attempts USING btree (domain, status, created_at DESC);


--
-- Name: idx_crawl_attempts_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_attempts_session ON public.crawl_attempts USING btree (session_id);


--
-- Name: idx_crawl_content_versions_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_content_versions_article ON public.crawl_content_versions USING btree (article_id, detected_at DESC);


--
-- Name: idx_crawl_content_versions_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crawl_content_versions_hash ON public.crawl_content_versions USING btree (article_id, content_hash);


--
-- Name: idx_crawl_session_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_session_article ON public.crawl_session USING btree (article_id);


--
-- Name: idx_crawl_session_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_session_lookup ON public.crawl_session USING btree (domain, created_at DESC);


--
-- Name: idx_dossiers_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_created ON public.editorial_dossiers USING btree (created_at DESC);


--
-- Name: idx_dossiers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_status ON public.editorial_dossiers USING btree (status);


--
-- Name: idx_dossiers_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_topic ON public.editorial_dossiers USING btree (topic_id);


--
-- Name: idx_ec_coverage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ec_coverage ON public.event_clusters USING btree (coverage_status);


--
-- Name: idx_ec_importance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ec_importance ON public.event_clusters USING btree (importance_score DESC);


--
-- Name: idx_ec_last_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ec_last_updated ON public.event_clusters USING btree (last_updated_at DESC);


--
-- Name: idx_ec_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ec_score ON public.event_clusters USING btree (editorial_score DESC);


--
-- Name: idx_ec_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ec_status ON public.event_clusters USING btree (status);


--
-- Name: idx_ecs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecs_event ON public.event_cluster_stories USING btree (event_id);


--
-- Name: idx_ecs_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecs_story ON public.event_cluster_stories USING btree (story_id);


--
-- Name: idx_editorial_angles_dossier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_editorial_angles_dossier ON public.editorial_angles USING btree (dossier_id, "position");


--
-- Name: idx_entity_mentions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_mentions_entity ON public.entity_mentions USING btree (entity_id);


--
-- Name: idx_entity_mentions_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_mentions_topic ON public.entity_mentions USING btree (topic_id);


--
-- Name: idx_entity_mentions_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_entity_mentions_unique ON public.entity_mentions USING btree (entity_id, topic_id);


--
-- Name: idx_eo_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eo_event ON public.editorial_opportunities USING btree (event_id);


--
-- Name: idx_eo_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eo_status ON public.editorial_opportunities USING btree (status);


--
-- Name: idx_er_entity_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_er_entity_a ON public.entity_relationships USING btree (entity_a_id);


--
-- Name: idx_er_entity_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_er_entity_b ON public.entity_relationships USING btree (entity_b_id);


--
-- Name: idx_er_strength; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_er_strength ON public.entity_relationships USING btree (strength_score DESC);


--
-- Name: idx_events_article_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_article_id ON public.events USING btree (article_id);


--
-- Name: idx_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_created_at ON public.events USING btree (created_at);


--
-- Name: idx_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_type ON public.events USING btree (type);


--
-- Name: idx_ke_name_type_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ke_name_type_origin ON public.knowledge_entities USING btree (lower((name)::text), entity_type, entity_origin);


--
-- Name: idx_ke_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ke_origin ON public.knowledge_entities USING btree (entity_origin);


--
-- Name: idx_knowledge_entities_mentions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_entities_mentions ON public.knowledge_entities USING btree (mention_count DESC);


--
-- Name: idx_knowledge_entities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_entities_type ON public.knowledge_entities USING btree (entity_type);


--
-- Name: idx_knowledge_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_events_date ON public.knowledge_events USING btree (event_date DESC NULLS LAST);


--
-- Name: idx_knowledge_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_events_entity ON public.knowledge_events USING btree (entity_id);


--
-- Name: idx_knowledge_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_events_type ON public.knowledge_events USING btree (event_type);


--
-- Name: idx_ma_extraction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ma_extraction ON public.monitored_articles USING btree (extraction_method);


--
-- Name: idx_ma_unfetched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ma_unfetched ON public.monitored_articles USING btree (detected_at DESC) WHERE (extraction_method IS NULL);


--
-- Name: idx_monitored_articles_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitored_articles_detected ON public.monitored_articles USING btree (detected_at DESC);


--
-- Name: idx_monitored_articles_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_monitored_articles_hash ON public.monitored_articles USING btree (hash);


--
-- Name: idx_monitored_articles_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitored_articles_source ON public.monitored_articles USING btree (source_id);


--
-- Name: idx_pipeline_decisions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_decisions_entity ON public.pipeline_decisions USING btree (entity_id, entity_type);


--
-- Name: idx_pipeline_decisions_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_decisions_module ON public.pipeline_decisions USING btree (module, created_at DESC);


--
-- Name: idx_pipeline_decisions_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_decisions_pipeline ON public.pipeline_decisions USING btree (module, pipeline, created_at DESC);


--
-- Name: idx_pixel_events_article_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_events_article_time ON public.pixel_events USING btree (((payload ->> 'content_id'::text)), created_at DESC) WHERE (event = 'content_view'::text);


--
-- Name: idx_pixel_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_events_created_at ON public.pixel_events USING btree (created_at DESC);


--
-- Name: idx_pixel_events_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_events_event ON public.pixel_events USING btree (event);


--
-- Name: idx_pixel_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_events_session ON public.pixel_events USING btree (session_id);


--
-- Name: idx_pixel_events_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_events_visitor ON public.pixel_events USING btree (visitor_id);


--
-- Name: idx_reels_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reels_order ON public.reels USING btree (order_index);


--
-- Name: idx_reels_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reels_status ON public.reels USING btree (status);


--
-- Name: idx_research_briefs_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_briefs_topic ON public.research_briefs USING btree (topic_id);


--
-- Name: idx_research_sources_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_sources_score ON public.research_sources USING btree (topic_id, relevance_score DESC);


--
-- Name: idx_research_sources_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_sources_topic ON public.research_sources USING btree (topic_id);


--
-- Name: idx_research_topics_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_topics_created ON public.research_topics USING btree (created_at DESC);


--
-- Name: idx_research_topics_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_topics_status ON public.research_topics USING btree (status);


--
-- Name: idx_research_topics_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_topics_title ON public.research_topics USING btree (lower(title));


--
-- Name: idx_research_topics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_research_topics_user ON public.research_topics USING btree (created_by);


--
-- Name: idx_rss_sources_discovery_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rss_sources_discovery_status ON public.rss_sources USING btree (last_discovery_status);


--
-- Name: idx_rss_sources_discovery_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rss_sources_discovery_type ON public.rss_sources USING btree (discovery_type);


--
-- Name: idx_rss_sources_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rss_sources_enabled ON public.rss_sources USING btree (enabled);


--
-- Name: idx_rss_sources_last_discovery_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rss_sources_last_discovery_at ON public.rss_sources USING btree (last_discovery_at DESC);


--
-- Name: idx_rt_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_source_id ON public.research_topics USING btree (source_id);


--
-- Name: idx_rt_source_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_source_type ON public.research_topics USING btree (source_type);


--
-- Name: idx_sc_coverage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_coverage ON public.story_clusters USING btree (coverage_status);


--
-- Name: idx_sc_importance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_importance ON public.story_clusters USING btree (importance_score DESC);


--
-- Name: idx_sc_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_last_seen ON public.story_clusters USING btree (last_seen DESC);


--
-- Name: idx_sc_recurring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_recurring ON public.story_clusters USING btree (is_recurring);


--
-- Name: idx_sc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_status ON public.story_clusters USING btree (status);


--
-- Name: idx_sc_story_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sc_story_type ON public.story_clusters USING btree (story_type);


--
-- Name: idx_sca_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sca_article ON public.story_cluster_articles USING btree (article_id);


--
-- Name: idx_sca_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sca_story ON public.story_cluster_articles USING btree (story_id);


--
-- Name: idx_schema_version_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_schema_version_hash ON public.schema_version USING btree (baseline_hash);


--
-- Name: idx_scp_cluster; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scp_cluster ON public.social_cluster_posts USING btree (cluster_id);


--
-- Name: idx_scp_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scp_post ON public.social_cluster_posts USING btree (post_id);


--
-- Name: idx_se_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_se_entity ON public.story_entities USING btree (entity_id);


--
-- Name: idx_se_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_se_story ON public.story_entities USING btree (story_id);


--
-- Name: idx_so_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_composite ON public.story_opportunities USING btree (composite_score DESC);


--
-- Name: idx_so_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_status ON public.story_opportunities USING btree (status);


--
-- Name: idx_so_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_story ON public.story_opportunities USING btree (story_cluster_id);


--
-- Name: idx_so_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_type ON public.story_opportunities USING btree (opportunity_type);


--
-- Name: idx_social_clusters_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_clusters_engagement ON public.social_clusters USING btree (total_engagement DESC);


--
-- Name: idx_social_clusters_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_clusters_status ON public.social_clusters USING btree (status);


--
-- Name: idx_social_content_dossier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_social_content_dossier_id ON public.social_content_packages USING btree (dossier_id);


--
-- Name: idx_social_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_logs_date ON public.social_fetch_logs USING btree (started_at DESC);


--
-- Name: idx_social_logs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_logs_source ON public.social_fetch_logs USING btree (source_id);


--
-- Name: idx_social_posts_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_published ON public.social_posts USING btree (published_at DESC);


--
-- Name: idx_social_posts_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_source ON public.social_posts USING btree (source_id);


--
-- Name: idx_source_verifications_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_verifications_source ON public.source_verifications USING btree (source_id, created_at DESC);


--
-- Name: idx_subscribers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscribers_email ON public.subscribers USING btree (email);


--
-- Name: idx_system_events_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_events_lookup ON public.system_events USING btree (event_type, created_at DESC);


--
-- Name: idx_tc_counts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_counts ON public.trend_clusters USING btree (article_count DESC, source_count DESC);


--
-- Name: idx_tc_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_entity ON public.trend_clusters USING btree (entity_id);


--
-- Name: idx_tc_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_last_seen ON public.trend_clusters USING btree (last_seen DESC);


--
-- Name: idx_tc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_status ON public.trend_clusters USING btree (status);


--
-- Name: idx_tca_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tca_article ON public.trend_cluster_articles USING btree (article_id);


--
-- Name: idx_tca_trend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tca_trend ON public.trend_cluster_articles USING btree (trend_id);


--
-- Name: idx_topic_articles_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_articles_article ON public.topic_articles USING btree (article_id);


--
-- Name: idx_topics_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_category ON public.topics USING btree (category);


--
-- Name: idx_topics_importance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_importance ON public.topics USING btree (importance_score DESC);


--
-- Name: idx_topics_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_region ON public.topics USING btree (region);


--
-- Name: idx_tracked_articles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracked_articles_active ON public.tracked_articles USING btree (tracked_source_id) WHERE (is_active = true);


--
-- Name: idx_tracked_articles_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracked_articles_source ON public.tracked_articles USING btree (tracked_source_id, first_detected_at DESC);


--
-- Name: idx_tracked_source_snapshots_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracked_source_snapshots_source ON public.tracked_source_snapshots USING btree (tracked_source_id);


--
-- Name: idx_tracked_sources_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracked_sources_active ON public.tracked_sources USING btree (active);


--
-- Name: idx_trending_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_trending_entity ON public.trending_topics USING btree (entity_id);


--
-- Name: idx_trending_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trending_last_seen ON public.trending_topics USING btree (last_seen_at DESC);


--
-- Name: idx_trending_mentions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trending_mentions ON public.trending_topics USING btree (mention_count DESC);


--
-- Name: idx_user_activity_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_created_at ON public.user_activity USING btree (created_at);


--
-- Name: idx_user_activity_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_event ON public.user_activity USING btree (event);


--
-- Name: idx_user_activity_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_user_id ON public.user_activity USING btree (user_id);


--
-- Name: idx_worker_runs_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_runs_lookup ON public.worker_runs USING btree (worker_name, started_at DESC);


--
-- Name: ad_events ad_events_ad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_events
    ADD CONSTRAINT ad_events_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ads(id);


--
-- Name: ad_events ad_events_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_events
    ADD CONSTRAINT ad_events_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id);


--
-- Name: ad_revenue ad_revenue_ad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_revenue
    ADD CONSTRAINT ad_revenue_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ads(id);


--
-- Name: ads ads_ad_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_ad_slot_id_fkey FOREIGN KEY (ad_slot_id) REFERENCES public.ad_slots(id);


--
-- Name: ads ads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


--
-- Name: ai_generation_logs ai_generation_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generation_logs
    ADD CONSTRAINT ai_generation_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_clusters(id) ON DELETE SET NULL;


--
-- Name: ai_generation_logs ai_generation_logs_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generation_logs
    ADD CONSTRAINT ai_generation_logs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_clusters(id) ON DELETE SET NULL;


--
-- Name: article_categories article_categories_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: article_categories article_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: article_entity_matches article_entity_matches_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_entity_matches
    ADD CONSTRAINT article_entity_matches_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: article_entity_matches article_entity_matches_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_entity_matches
    ADD CONSTRAINT article_entity_matches_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: article_seo article_seo_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_seo
    ADD CONSTRAINT article_seo_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: article_stats article_stats_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_stats
    ADD CONSTRAINT article_stats_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles articles_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: articles articles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: articles articles_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.editorial_dossiers(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: comments comments_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: coverage_changes coverage_changes_tracked_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_changes
    ADD CONSTRAINT coverage_changes_tracked_article_id_fkey FOREIGN KEY (tracked_article_id) REFERENCES public.tracked_articles(id) ON DELETE SET NULL;


--
-- Name: coverage_changes coverage_changes_tracked_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_changes
    ADD CONSTRAINT coverage_changes_tracked_source_id_fkey FOREIGN KEY (tracked_source_id) REFERENCES public.tracked_sources(id) ON DELETE CASCADE;


--
-- Name: crawl_attempts crawl_attempts_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_attempts
    ADD CONSTRAINT crawl_attempts_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: crawl_attempts crawl_attempts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_attempts
    ADD CONSTRAINT crawl_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.crawl_session(id) ON DELETE CASCADE;


--
-- Name: crawl_content_versions crawl_content_versions_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_content_versions
    ADD CONSTRAINT crawl_content_versions_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: crawl_session crawl_session_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_session
    ADD CONSTRAINT crawl_session_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: editorial_angles editorial_angles_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_angles
    ADD CONSTRAINT editorial_angles_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.editorial_dossiers(id) ON DELETE CASCADE;


--
-- Name: editorial_dossiers editorial_dossiers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_dossiers
    ADD CONSTRAINT editorial_dossiers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: editorial_dossiers editorial_dossiers_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_dossiers
    ADD CONSTRAINT editorial_dossiers_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.research_topics(id) ON DELETE SET NULL;


--
-- Name: editorial_opportunities editorial_opportunities_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_opportunities
    ADD CONSTRAINT editorial_opportunities_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_clusters(id) ON DELETE CASCADE;


--
-- Name: entity_mentions entity_mentions_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: entity_mentions entity_mentions_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.research_sources(id) ON DELETE SET NULL;


--
-- Name: entity_mentions entity_mentions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.research_topics(id) ON DELETE CASCADE;


--
-- Name: event_cluster_stories event_cluster_stories_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cluster_stories
    ADD CONSTRAINT event_cluster_stories_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_clusters(id) ON DELETE CASCADE;


--
-- Name: event_cluster_stories event_cluster_stories_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cluster_stories
    ADD CONSTRAINT event_cluster_stories_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_clusters(id) ON DELETE CASCADE;


--
-- Name: events events_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE SET NULL;


--
-- Name: entity_relationships fk_er_entity_a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relationships
    ADD CONSTRAINT fk_er_entity_a FOREIGN KEY (entity_a_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: entity_relationships fk_er_entity_b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relationships
    ADD CONSTRAINT fk_er_entity_b FOREIGN KEY (entity_b_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: knowledge_events knowledge_events_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_events
    ADD CONSTRAINT knowledge_events_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: knowledge_events knowledge_events_source_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_events
    ADD CONSTRAINT knowledge_events_source_topic_id_fkey FOREIGN KEY (source_topic_id) REFERENCES public.research_topics(id) ON DELETE SET NULL;


--
-- Name: media media_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: monitored_articles monitored_articles_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitored_articles
    ADD CONSTRAINT monitored_articles_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.rss_sources(id) ON DELETE CASCADE;


--
-- Name: research_briefs research_briefs_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_briefs
    ADD CONSTRAINT research_briefs_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.research_topics(id) ON DELETE CASCADE;


--
-- Name: research_sources research_sources_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_sources
    ADD CONSTRAINT research_sources_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.research_topics(id) ON DELETE CASCADE;


--
-- Name: research_topics research_topics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_topics
    ADD CONSTRAINT research_topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: social_cluster_posts social_cluster_posts_cluster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_cluster_posts
    ADD CONSTRAINT social_cluster_posts_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES public.social_clusters(id) ON DELETE CASCADE;


--
-- Name: social_cluster_posts social_cluster_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_cluster_posts
    ADD CONSTRAINT social_cluster_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- Name: social_content_packages social_content_packages_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_content_packages
    ADD CONSTRAINT social_content_packages_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.editorial_dossiers(id) ON DELETE CASCADE;


--
-- Name: social_fetch_logs social_fetch_logs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_fetch_logs
    ADD CONSTRAINT social_fetch_logs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.social_sources(id) ON DELETE CASCADE;


--
-- Name: social_posts social_posts_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.social_sources(id) ON DELETE CASCADE;


--
-- Name: source_verifications source_verifications_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_verifications
    ADD CONSTRAINT source_verifications_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.rss_sources(id) ON DELETE CASCADE;


--
-- Name: story_cluster_articles story_cluster_articles_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_cluster_articles
    ADD CONSTRAINT story_cluster_articles_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: story_cluster_articles story_cluster_articles_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_cluster_articles
    ADD CONSTRAINT story_cluster_articles_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_clusters(id) ON DELETE CASCADE;


--
-- Name: story_entities story_entities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_entities
    ADD CONSTRAINT story_entities_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: story_entities story_entities_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_entities
    ADD CONSTRAINT story_entities_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_clusters(id) ON DELETE CASCADE;


--
-- Name: story_opportunities story_opportunities_story_cluster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_opportunities
    ADD CONSTRAINT story_opportunities_story_cluster_id_fkey FOREIGN KEY (story_cluster_id) REFERENCES public.story_clusters(id) ON DELETE CASCADE;


--
-- Name: topic_articles topic_articles_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_articles
    ADD CONSTRAINT topic_articles_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: topic_articles topic_articles_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_articles
    ADD CONSTRAINT topic_articles_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_entities topic_entities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_entities
    ADD CONSTRAINT topic_entities_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: topic_entities topic_entities_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_entities
    ADD CONSTRAINT topic_entities_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_events topic_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_events
    ADD CONSTRAINT topic_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.knowledge_events(id) ON DELETE CASCADE;


--
-- Name: topic_events topic_events_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_events
    ADD CONSTRAINT topic_events_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_research topic_research_research_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_research
    ADD CONSTRAINT topic_research_research_topic_id_fkey FOREIGN KEY (research_topic_id) REFERENCES public.research_topics(id) ON DELETE CASCADE;


--
-- Name: topic_research topic_research_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_research
    ADD CONSTRAINT topic_research_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: tracked_articles tracked_articles_tracked_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_articles
    ADD CONSTRAINT tracked_articles_tracked_source_id_fkey FOREIGN KEY (tracked_source_id) REFERENCES public.tracked_sources(id) ON DELETE CASCADE;


--
-- Name: tracked_source_snapshots tracked_source_snapshots_tracked_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_source_snapshots
    ADD CONSTRAINT tracked_source_snapshots_tracked_source_id_fkey FOREIGN KEY (tracked_source_id) REFERENCES public.tracked_sources(id) ON DELETE CASCADE;


--
-- Name: transcript_analysis transcript_analysis_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_analysis
    ADD CONSTRAINT transcript_analysis_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- Name: trend_cluster_articles trend_cluster_articles_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_cluster_articles
    ADD CONSTRAINT trend_cluster_articles_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.monitored_articles(id) ON DELETE CASCADE;


--
-- Name: trend_cluster_articles trend_cluster_articles_trend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_cluster_articles
    ADD CONSTRAINT trend_cluster_articles_trend_id_fkey FOREIGN KEY (trend_id) REFERENCES public.trend_clusters(id) ON DELETE CASCADE;


--
-- Name: trend_clusters trend_clusters_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_clusters
    ADD CONSTRAINT trend_clusters_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: trending_topics trending_topics_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trending_topics
    ADD CONSTRAINT trending_topics_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;


--
-- Name: user_activity user_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_transcripts video_transcripts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_transcripts
    ADD CONSTRAINT video_transcripts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict vqKLnrP0RllK1kYLXv6JcCD1Db0hNYlt4iTWeQEoGGRRnAsgCFQU6INV1oqGRra

