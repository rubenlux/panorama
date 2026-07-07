import { Router } from "express";
import { query } from "./db.js";

const router = Router();

// SPEC 014 — hostnames this site is served from, normalized (lowercase, no
// "www.", no port). Referrers matching one of these are internal navigation,
// never an external acquisition source — always includes localhost/127.0.0.1
// since local/dev testing traffic already lives in the same pixel_events
// table as real traffic. Configurable via PUBLIC_SITE_HOSTNAMES (comma-
// separated) for when the site has a real production domain.
const OWN_HOSTNAMES = (() => {
    const fromEnv = (process.env.PUBLIC_SITE_HOSTNAMES || "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
        .map((h) => h.replace(/^www\./, "").replace(/:\d+$/, ""));
    return Array.from(new Set(["localhost", "127.0.0.1", ...fromEnv]));
})();

/**
 * GET /analytics/v2/editorial/overview
 * Real-time KPIs for the Editorial Dashboard (Including SEO Gold)
 */
router.get("/editorial/overview", async (req, res) => {
    try {
        const [viewsToday, activeUsers, topArticles, avgTime, engagement, scroll] = await Promise.all([
            // Q1: Total Page Views (last 24h)
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '24 HOURS'`),

            // Q2: Real-time Active Users (last 5 mins)
            query(`SELECT COUNT(DISTINCT visitor_id) as count FROM pixel_events WHERE created_at > NOW() - INTERVAL '5 MINUTES'`),

            // Q3: Top 50 Articles (last 24h) - Increased LIMIT for frontend slider
            query(`
                SELECT 
                    a.id as article_id, a.title, a.slug,
                    COUNT(*) FILTER (WHERE p.event = 'page_view') as views,
                    COALESCE(SUM((p.payload->>'seconds')::int) FILTER (WHERE p.event = 'time_on_content'), 0) as total_seconds
                FROM pixel_events p
                JOIN articles a ON (p.payload->>'article_id' = a.id::text OR p.payload->>'content_id' = a.id::text)
                WHERE p.created_at > NOW() - INTERVAL '30 DAYS'
                GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 50
            `),

            // Q4: Average Time on Site (SEO Gold)
            query(`
                SELECT AVG(seconds_sum) as avg_seconds
                FROM (
                    SELECT session_id, SUM((payload->>'seconds')::int) as seconds_sum
                    FROM pixel_events
                    WHERE event = 'time_on_content' AND created_at > NOW() - INTERVAL '30 DAYS'
                    GROUP BY 1
                ) s
            `),

            // Q5: Global SEO Engagement Highlights (24h -> 30d)
            query(`
                SELECT 
                    COUNT(*) FILTER (WHERE event = 'share_click') as shares,
                    COUNT(*) FILTER (WHERE event = 'comment_submit') as comments
                FROM pixel_events
                WHERE created_at > NOW() - INTERVAL '30 DAYS'
            `),

            // Q6: Global Scroll Depth (24h -> 30d)
            query(`
                SELECT payload->>'percent' as depth, COUNT(*) as count
                FROM pixel_events WHERE event = 'scroll_depth' AND created_at > NOW() - INTERVAL '30 DAYS'
                GROUP BY 1 ORDER BY 1::int ASC
            `)
        ]);

        const engStats = engagement.rows[0];

        res.json({
            meta: { timestamp: new Date() },
            kpis: {
                views_24h: parseInt(viewsToday.rows[0].count),
                active_users_5m: parseInt(activeUsers.rows[0].count),
                avg_time_seconds: Math.round(avgTime.rows[0]?.avg_seconds || 0)
            },
            engagement: {
                kpis: {
                    total_shares: parseInt(engStats.shares || 0),
                    total_comments: parseInt(engStats.comments || 0)
                },
                scroll_funnel: scroll.rows
            },
            top_articles: topArticles.rows
        });
    } catch (e) {
        console.error("[Analytics V2 Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/realtime
 * Time-series data for sparklines/charts
 */
router.get("/editorial/realtime", async (req, res) => {
    try {
        const result = await query(`
            SELECT date_trunc('minute', created_at) as time_bucket, COUNT(*) as views
            FROM pixel_events WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '1 HOUR'
            GROUP BY 1 ORDER BY 1 ASC
        `);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics V2 Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/authors
 * Top Authors (Quality focused mapping)
 */
router.get("/editorial/insights/authors", async (req, res) => {
    try {
        const result = await query(`
            SELECT COALESCE(u.name, u.email) as author_name, COUNT(*) as views
            FROM pixel_events p
            JOIN articles a ON (p.payload->>'article_id' = a.id::text OR p.payload->>'content_id' = a.id::text)
            JOIN users u ON a.author_id = u.id
            WHERE p.event = 'page_view' AND p.created_at > NOW() - INTERVAL '30 DAYS'
            GROUP BY 1 ORDER BY 2 DESC LIMIT 10
        `);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics Authors Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/categories
 */
router.get("/editorial/insights/categories", async (req, res) => {
    try {
        const result = await query(`
            SELECT c.name as category_name, COUNT(*) as views
            FROM pixel_events p
            JOIN article_categories ac ON (p.payload->>'article_id' = ac.article_id::text OR p.payload->>'content_id' = ac.article_id::text)
            JOIN categories c ON ac.category_id = c.id
            WHERE p.event = 'page_view' AND p.created_at > NOW() - INTERVAL '30 DAYS'
            GROUP BY 1 ORDER BY 2 DESC LIMIT 10
        `);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics Categories Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/traffic
 * Traffic Sources (Referrers)
 * Correctly extracts domain or returns 'Direct'
 */
router.get("/editorial/insights/traffic", async (req, res) => {
    try {
        // SPEC 014 fix: referrers whose normalized hostname is our own (see
        // OWN_HOSTNAMES) are internal navigation, not an acquisition source —
        // previously localhost/the site's own domain showed up as "Referral".
        const result = await query(`
            WITH raw AS (
                SELECT
                    COALESCE(NULLIF(substring(payload->>'referrer' from '(?:.*://)?([^/]*)'), ''), '') as raw_domain,
                    payload->>'referrer' as referrer,
                    payload->>'utm_source' as utm_source
                FROM pixel_events
                WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '30 DAYS'
            ), classified AS (
                SELECT
                    regexp_replace(regexp_replace(lower(raw_domain), '^www\\.', ''), ':\\d+$', '') as normalized_domain,
                    raw_domain, referrer, utm_source
                FROM raw
            )
            SELECT
                CASE WHEN normalized_domain = ANY($1::text[]) OR raw_domain = '' THEN 'Direct' ELSE raw_domain END as domain,
                CASE
                    WHEN normalized_domain = ANY($1::text[]) THEN 'Direct'
                    WHEN referrer ILIKE '%google%' THEN 'Search'
                    WHEN referrer ILIKE '%facebook%' OR referrer ILIKE '%t.co%' OR referrer ILIKE '%instagram%' THEN 'Social'
                    WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                    ELSE 'Referral'
                END as category,
                utm_source,
                COUNT(*) as views
            FROM classified
            GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10
        `, [OWN_HOSTNAMES]);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics Traffic Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/history
 * Historical Page Views (Daily for 30 days)
 */
router.get("/editorial/insights/history", async (req, res) => {
    try {
        const result = await query(`
            SELECT date_trunc('day', created_at) as date, 
                   COUNT(*) as views,
                   COUNT(DISTINCT visitor_id) as visitors
            FROM pixel_events 
            WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '30 DAYS'
            GROUP BY 1 ORDER BY 1 ASC
        `);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics History Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/geo
 * Geographic Distribution
 * Uses the new geo_country column
 */
router.get("/editorial/insights/geo", async (req, res) => {
    try {
        const result = await query(`
            SELECT geo_country as country_code, COUNT(*) as views
            FROM pixel_events 
            WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '30 DAYS' 
            AND geo_country IS NOT NULL
            GROUP BY 1 ORDER BY 2 DESC LIMIT 20
        `);
        res.json({ data: result.rows });
    } catch (e) {
        console.error("[Analytics Geo Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/journey
 * Top Landing Pages (ARTICLES ONLY)
 */
router.get("/editorial/insights/journey", async (req, res) => {
    try {
        const landing = await query(`
            SELECT url as landing_page, COUNT(DISTINCT session_id) as sessions
            FROM (
                SELECT session_id, url, ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY created_at ASC) as rn
                FROM pixel_events 
                WHERE event = 'page_view' 
                  AND created_at > NOW() - INTERVAL '30 DAYS'
                  AND (payload->>'article_id' IS NOT NULL OR payload->>'content_id' IS NOT NULL)
            ) t WHERE rn = 1 GROUP BY 1 ORDER BY 2 DESC LIMIT 5
        `);
        res.json({ data: landing.rows });
    } catch (e) {
        console.error("[Analytics Journey Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/flow
 * Source -> Target Flow (ARTICLES ONLY)
 */
router.get("/editorial/insights/flow", async (req, res) => {
    try {
        // Same own-hostname exclusion as insights/traffic — an internal
        // navigation should never render as its own "source" node in the flow.
        const result = await query(`
            WITH raw AS (
                SELECT
                    COALESCE(NULLIF(substring(payload->>'referrer' from '(?:.*://)?([^/]*)'), ''), '') as raw_domain,
                    url
                FROM pixel_events
                WHERE event = 'page_view'
                  AND created_at > NOW() - INTERVAL '30 DAYS'
                  AND article_id IS NOT NULL
            )
            SELECT
                CASE
                    WHEN regexp_replace(regexp_replace(lower(raw_domain), '^www\\.', ''), ':\\d+$', '') = ANY($1::text[]) OR raw_domain = ''
                    THEN 'Direct'
                    ELSE raw_domain
                END as source,
                url as target, COUNT(*) as value
            FROM raw
            GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15
        `, [OWN_HOSTNAMES]);

        const nodes = [];
        const links = [];
        const nodeMap = new Map();

        result.rows.forEach(row => {
            let targetPath = row.target;
            try { if (targetPath.startsWith('http')) { const u = new URL(targetPath); targetPath = u.pathname === '/' ? 'Home' : u.pathname; } } catch (e) { }

            if (!nodeMap.has(row.source)) { nodeMap.set(row.source, nodes.length); nodes.push({ name: row.source }); }
            if (!nodeMap.has(targetPath)) { nodeMap.set(targetPath, nodes.length); nodes.push({ name: targetPath }); }

            links.push({ source: nodeMap.get(row.source), target: nodeMap.get(targetPath), value: parseInt(row.value) });
        });

        res.json({ data: { nodes, links } });
    } catch (e) {
        console.error("[Analytics Flow Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/insights/engagement
 * SEO Gold Retention (Scroll + Heartbeat + Exit)
 */
router.get("/editorial/insights/engagement", async (req, res) => {
    try {
        const [funnel, exits, shares, comments] = await Promise.all([
            // Site-wide Reading Funnel — same session-cohort + shared-window fix
            // as the per-article endpoint (see /editorial/article/:id). Previously
            // this was a raw per-threshold histogram with no cohort at all.
            query(`
                WITH eligible_sessions AS (
                    SELECT DISTINCT session_id
                    FROM pixel_events
                    WHERE event = 'content_view' AND created_at > NOW() - INTERVAL '24 HOURS'
                ),
                session_max_scroll AS (
                    SELECT session_id, MAX((payload->>'percent')::int) AS max_pct
                    FROM pixel_events
                    WHERE event = 'scroll_depth' AND created_at > NOW() - INTERVAL '24 HOURS'
                      AND session_id IN (SELECT session_id FROM eligible_sessions)
                    GROUP BY session_id
                )
                SELECT
                    COUNT(*) FILTER (WHERE max_pct >= 25)  AS d25,
                    COUNT(*) FILTER (WHERE max_pct >= 50)  AS d50,
                    COUNT(*) FILTER (WHERE max_pct >= 75)  AS d75,
                    COUNT(*) FILTER (WHERE max_pct >= 100) AS d100
                FROM session_max_scroll
            `),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'exit_intent' AND created_at > NOW() - INTERVAL '24 HOURS'`),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'share_click' AND created_at > NOW() - INTERVAL '24 HOURS'`),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'comment_submit' AND created_at > NOW() - INTERVAL '24 HOURS'`)
        ]);

        const f = funnel.rows[0] || { d25: 0, d50: 0, d75: 0, d100: 0 };
        const scrollFunnel = [
            { depth: '25', count: parseInt(f.d25 || 0) },
            { depth: '50', count: parseInt(f.d50 || 0) },
            { depth: '75', count: parseInt(f.d75 || 0) },
            { depth: '100', count: parseInt(f.d100 || 0) },
        ];

        res.json({
            scroll_funnel: scrollFunnel,
            kpis: {
                total_exits: parseInt(exits.rows[0].count),
                total_shares: parseInt(shares.rows[0].count),
                total_comments: parseInt(comments.rows[0].count)
            }
        });
    } catch (e) {
        console.error("[Analytics Engagement Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /analytics/v2/editorial/article/:id
 * The "Gold" Article Deep Dive
 */
router.get("/editorial/article/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [article, views, eligibleAndFunnel, engagement, timeData, exitIntent, continuity, performance] = await Promise.all([
            // 1. Article Metadata
            query(`SELECT id, title, slug, published_at, author_id FROM articles WHERE id = $1`, [id]),

            // 2. Views (Time Series) — hourly page_view chart, kept as-is for
            // the "Tráfico por Hora" line chart. NOT the funnel's denominator
            // (see eligibleAndFunnel below) — page_view is a site-wide route
            // signal, not an article-view cohort.
            query(`
                SELECT date_trunc('hour', created_at) as time_bucket, COUNT(*) as views
                FROM pixel_events
                WHERE event = 'page_view' AND article_id = $1::uuid
                AND created_at > NOW() - INTERVAL '24 HOURS'
                GROUP BY 1 ORDER BY 1 ASC
            `, [id]),

            // 3. Eligible views + Scroll Depth Funnel — SPEC 014 fix.
            // eligible_views = distinct sessions with a content_view (the real
            // article-view cohort), same 24h window as the funnel itself
            // (previously scroll_funnel had NO time filter while views_series
            // had 24h — that mismatch is exactly why the funnel could exceed
            // 100% or show negative drop-off). Each bucket counts sessions
            // whose MAX(percent) reached that threshold, not raw per-threshold
            // event counts — guarantees scroll_100<=scroll_75<=...<=eligible_views
            // by construction regardless of client firing order. Restricting
            // to session_ids already in eligible_sessions keeps the funnel from
            // ever exceeding its own denominator.
            query(`
                WITH eligible_sessions AS (
                    SELECT DISTINCT session_id
                    FROM pixel_events
                    WHERE event = 'content_view' AND article_id = $1::uuid
                      AND created_at > NOW() - INTERVAL '24 HOURS'
                ),
                session_max_scroll AS (
                    SELECT session_id, MAX((payload->>'percent')::int) AS max_pct
                    FROM pixel_events
                    WHERE event = 'scroll_depth' AND article_id = $1::uuid
                      AND created_at > NOW() - INTERVAL '24 HOURS'
                      AND session_id IN (SELECT session_id FROM eligible_sessions)
                    GROUP BY session_id
                )
                SELECT
                    (SELECT COUNT(*) FROM eligible_sessions) AS eligible_views,
                    COUNT(*) FILTER (WHERE max_pct >= 25)  AS d25,
                    COUNT(*) FILTER (WHERE max_pct >= 50)  AS d50,
                    COUNT(*) FILTER (WHERE max_pct >= 75)  AS d75,
                    COUNT(*) FILTER (WHERE max_pct >= 100) AS d100
                FROM session_max_scroll
            `, [id]),

            // 4. Engagement Breakdown
            query(`
                SELECT event as type, COUNT(*) as count
                FROM pixel_events
                WHERE event IN ('like_click', 'share_click', 'comment_submit', 'engagement') 
                AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
                GROUP BY 1
            `, [id]),

            // 5. Reading Time — SPEC 014: SUM per session first (heartbeat ticks
            // are per-session, not per-visitor — summing before aggregating
            // avoids a visitor with 2 tabs/sessions open double-counting), then
            // derive total/avg/median. Same 24h window as eligible_views/funnel
            // (previously this had no time filter at all).
            query(`
                WITH per_session AS (
                    SELECT session_id, SUM((payload->>'seconds')::int) AS session_seconds
                    FROM pixel_events
                    WHERE event = 'time_on_content' AND article_id = $1::uuid
                      AND created_at > NOW() - INTERVAL '24 HOURS'
                    GROUP BY session_id
                )
                SELECT
                    COALESCE(SUM(session_seconds), 0) AS total_engaged_time,
                    COALESCE(AVG(session_seconds), 0) AS avg_engaged_time,
                    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY session_seconds), 0) AS median_engaged_time
                FROM per_session
            `, [id]),

            // 6. Exit Intent — SPEC 014: distinct sessions, not raw events. A
            // session can fire exit_intent more than once was possible pre-Paso-2
            // (listener leak); even after that fix, counting sessions is the
            // semantically correct measure of "how many visits showed an exit
            // signal", not "how many times a mouse left the viewport".
            query(`
                SELECT COUNT(DISTINCT session_id) as count
                FROM pixel_events
                WHERE event = 'exit_intent' AND article_id = $1::uuid
                  AND created_at > NOW() - INTERVAL '24 HOURS'
            `, [id]),

            // 7. Internal Navigation (Continuity) — SPEC 014: exclude '#', empty,
            // and NULL destinations at the query layer. web/src/utils/pixel.js
            // no longer captures these (Paso 2), but the third-party embed
            // (src/templates/pixel-client.js, Track C) isn't touched by that
            // fix, so defense-in-depth here matters regardless of client hygiene.
            query(`
                SELECT payload->>'target_url' as url, COUNT(*) as count
                FROM pixel_events
                WHERE event = 'internal_link_click' AND article_id = $1::uuid
                  AND payload->>'target_url' IS NOT NULL
                  AND payload->>'target_url' NOT IN ('', '#')
                GROUP BY 1 ORDER BY 2 DESC LIMIT 3
            `, [id]),

            // 8. Performance (Avg Load Time)
            query(`
                SELECT AVG((payload->>'load_time_ms')::int) as avg_load
                FROM pixel_events
                WHERE event = 'content_loaded' 
                  AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
                  AND (payload->>'load_time_ms')::int > 0 
                  AND (payload->>'load_time_ms')::int < 60000
            `, [id])
        ]);

        if (article.rows.length === 0) return res.status(404).json({ error: "Article not found" });

        const funnelRow = eligibleAndFunnel.rows[0] || { eligible_views: 0, d25: 0, d50: 0, d75: 0, d100: 0 };
        const eligibleViews = parseInt(funnelRow.eligible_views || 0);
        const scrollFunnel = [
            { depth: '25', count: parseInt(funnelRow.d25 || 0) },
            { depth: '50', count: parseInt(funnelRow.d50 || 0) },
            { depth: '75', count: parseInt(funnelRow.d75 || 0) },
            { depth: '100', count: parseInt(funnelRow.d100 || 0) },
        ];

        res.json({
            meta: article.rows[0],
            views_series: views.rows,
            eligible_views: eligibleViews,
            scroll_funnel: scrollFunnel,
            engagement: engagement.rows,
            seo_gold: {
                // reading_time_seconds kept for backwards compatibility with any
                // other consumer; equals total_engaged_time.
                reading_time_seconds: Math.round(timeData.rows[0]?.total_engaged_time || 0),
                total_engaged_time: Math.round(timeData.rows[0]?.total_engaged_time || 0),
                avg_engaged_time: Math.round(timeData.rows[0]?.avg_engaged_time || 0),
                median_engaged_time: Math.round(timeData.rows[0]?.median_engaged_time || 0),
                exit_intent_count: parseInt(exitIntent.rows[0]?.count || 0),
                avg_load_time: Math.round(performance.rows[0]?.avg_load || 0),
                internal_links: continuity.rows
            }
        });

    } catch (e) {
        console.error("[Article Analytics Error]", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- ADS ANALYTICS ---

router.get("/ads/campaign/:id", async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Get Campaign Metadata
        const campaignRes = await query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
        if (campaignRes.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
        const campaign = campaignRes.rows[0];

        // 2. Aggregate Stats (Impressions, Clicks, Reach)
        // We look at ALL TIME or filter by date? Let's do ALL TIME for now or last 30 days.
        // Let's do Last 30 Days default for relevance.
        const statsRes = await query(`
            SELECT 
                COUNT(*) FILTER (WHERE event = 'ad_impression') as impressions,
                COUNT(*) FILTER (WHERE event = 'ad_click') as clicks,
                COUNT(DISTINCT visitor_id) as unique_reach
            FROM pixel_events 
            WHERE 
                (event = 'ad_impression' OR event = 'ad_click') 
                AND payload->>'campaign_id' = $1
        `, [id]);

        const stats = statsRes.rows[0];
        const impressions = parseInt(stats.impressions || 0);
        const clicks = parseInt(stats.clicks || 0);
        const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0;

        // 3. Time Series (Last 7 Days - Hourly)
        const timeseriesRes = await query(`
            SELECT 
                DATE_TRUNC('hour', created_at) as time,
                COUNT(*) FILTER (WHERE event = 'ad_impression') as impressions,
                COUNT(*) FILTER (WHERE event = 'ad_click') as clicks
            FROM pixel_events
            WHERE 
                (event = 'ad_impression' OR event = 'ad_click') 
                AND payload->>'campaign_id' = $1
                AND created_at > NOW() - INTERVAL '7 days'
            GROUP BY 1
            ORDER BY 1 ASC
        `, [id]);

        // 4. Interest / Context Breakdown (What categories did these users view?)
        // This is expensive: join ad events -> visitor -> content views -> category.
        // Simplified: Just return the raw stats for V1.

        res.json({
            campaign,
            kpi: {
                impressions,
                clicks,
                ctr: parseFloat(ctr),
                unique_reach: parseInt(stats.unique_reach || 0),
                cost_per_click: 0 // Placeholder
            },
            chart: timeseriesRes.rows.map(r => ({
                time: r.time,
                impressions: parseInt(r.impressions),
                clicks: parseInt(r.clicks)
            }))
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Analytics Error" });
    }
});

export default router;
