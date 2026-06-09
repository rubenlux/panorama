import { Router } from "express";
import { query } from "./db.js";

const router = Router();

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
        const result = await query(`
            SELECT 
                COALESCE(NULLIF(substring(payload->>'referrer' from '(?:.*://)?([^/]*)'), ''), 'Direct') as domain,
                CASE 
                    WHEN payload->>'referrer' ILIKE '%google%' THEN 'Search'
                    WHEN payload->>'referrer' ILIKE '%facebook%' OR payload->>'referrer' ILIKE '%t.co%' OR payload->>'referrer' ILIKE '%instagram%' THEN 'Social'
                    WHEN payload->>'referrer' IS NULL OR payload->>'referrer' = '' THEN 'Direct'
                    ELSE 'Referral'
                END as category,
                payload->>'utm_source' as utm_source,
                COUNT(*) as views
            FROM pixel_events 
            WHERE event = 'page_view' AND created_at > NOW() - INTERVAL '30 DAYS'
            GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10
        `);
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
        const result = await query(`
            SELECT 
                COALESCE(NULLIF(substring(payload->>'referrer' from '(?:.*://)?([^/]*)'), ''), 'Direct') as source,
                url as target, COUNT(*) as value
            FROM pixel_events 
            WHERE event = 'page_view' 
              AND created_at > NOW() - INTERVAL '30 DAYS'
              AND (payload->>'article_id' IS NOT NULL OR payload->>'content_id' IS NOT NULL)
            GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15
        `);

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
        const [scroll, exits, shares, comments] = await Promise.all([
            query(`
                SELECT payload->>'percent' as depth, COUNT(*) as count
                FROM pixel_events WHERE event = 'scroll_depth' AND created_at > NOW() - INTERVAL '24 HOURS'
                GROUP BY 1 ORDER BY 1::int ASC
            `),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'exit_intent' AND created_at > NOW() - INTERVAL '24 HOURS'`),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'share_click' AND created_at > NOW() - INTERVAL '24 HOURS'`),
            query(`SELECT COUNT(*) as count FROM pixel_events WHERE event = 'comment_submit' AND created_at > NOW() - INTERVAL '24 HOURS'`)
        ]);

        res.json({
            scroll_funnel: scroll.rows,
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
        const [article, views, scroll, engagement, timeData, exitIntent, continuity, performance] = await Promise.all([
            // 1. Article Metadata
            query(`SELECT id, title, slug, published_at, author_id FROM articles WHERE id = $1`, [id]),

            // 2. Views (Time Series)
            query(`
                SELECT date_trunc('hour', created_at) as time_bucket, COUNT(*) as views
                FROM pixel_events
                WHERE event = 'page_view' AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
                AND created_at > NOW() - INTERVAL '24 HOURS'
                GROUP BY 1 ORDER BY 1 ASC
            `, [id]),

            // 3. Scroll Depth Funnel
            query(`
                SELECT payload->>'percent' as depth, COUNT(*) as count
                FROM pixel_events
                WHERE event = 'scroll_depth' AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
                GROUP BY 1 ORDER BY 1::int ASC
            `, [id]),

            // 4. Engagement Breakdown
            query(`
                SELECT event as type, COUNT(*) as count
                FROM pixel_events
                WHERE event IN ('like_click', 'share_click', 'comment_submit', 'engagement') 
                AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
                GROUP BY 1
            `, [id]),

            // 5. Total Read Time (Heartbeat sum)
            query(`
                SELECT SUM((payload->>'seconds')::int) as total_seconds
                FROM pixel_events
                WHERE event = 'time_on_content' AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
            `, [id]),

            // 6. Exit Intent Count
            query(`
                SELECT COUNT(*) as count
                FROM pixel_events
                WHERE event = 'exit_intent' AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
            `, [id]),

            // 7. Internal Navigation (Continuity)
            query(`
                SELECT payload->>'target_url' as url, COUNT(*) as count
                FROM pixel_events
                WHERE event = 'internal_link_click' AND (payload->>'article_id' = $1 OR payload->>'content_id' = $1)
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

        res.json({
            meta: article.rows[0],
            views_series: views.rows,
            scroll_funnel: scroll.rows,
            engagement: engagement.rows,
            seo_gold: {
                reading_time_seconds: parseInt(timeData.rows[0]?.total_seconds || 0),
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
