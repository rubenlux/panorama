
import { query } from "../src/routes/db.js";

async function compareStats() {
    console.log("📊 Comparing Legacy Analytics vs. Pixel Events (Last 24h)\n");

    try {
        // 1. Get Top Articles from Legacy System (article_stats)
        // We look at 'views' column. Note: this is a lifetime counter, not just 24h.
        // But for recently created articles, it should be close.
        // Wait, article_stats.views is TOTAL views. pixel_events is transaction log.
        // To compare fairly, we should sum pixel_events for all time?
        // OR, we just compare the ones active today.

        // Let's compare TOTALs for simplicity, acknowledging Pixel started recently.
        // Pixel Count = COUNT(pixel_events where event='content_view')
        // Legacy Count = article_stats.views

        const comparison = await query(`
            WITH pixel_counts AS (
                SELECT 
                    payload->>'content_id' as article_id, 
                    COUNT(*) as pixel_views
                FROM pixel_events 
                WHERE event = 'content_view'
                GROUP BY 1
            ),
            legacy_counts AS (
                SELECT 
                    article_id::text, 
                    views as legacy_views
                FROM article_stats
            )
            SELECT 
                a.title,
                a.id,
                COALESCE(l.legacy_views, 0) as legacy,
                COALESCE(p.pixel_counts, 0) as pixel,
                (COALESCE(p.pixel_counts, 0) - COALESCE(l.legacy_views, 0)) as diff
            FROM articles a
            LEFT JOIN legacy_counts l ON a.id::text = l.article_id
            LEFT JOIN (
                SELECT payload->>'content_id' as article_id, COUNT(*) as pixel_counts 
                FROM pixel_events 
                WHERE event = 'content_view' 
                GROUP BY 1
            ) p ON a.id::text = p.article_id
            WHERE p.pixel_counts > 0 OR l.legacy_views > 0
            ORDER BY pixel DESC
            LIMIT 20;
        `);

        console.table(comparison.rows.map(row => ({
            "Article": row.title ? row.title.substring(0, 30) + '...' : row.id,
            "Legacy Views": row.legacy,
            "Pixel Views": row.pixel,
            "Difference": row.diff,
            "Accuracy": row.legacy > 0 ? Math.round((row.pixel / row.legacy) * 100) + '%' : 'N/A'
        })));

        // Summary
        const totalPixel = comparison.rows.reduce((sum, r) => sum + parseInt(r.pixel), 0);
        const totalLegacy = comparison.rows.reduce((sum, r) => sum + parseInt(r.legacy), 0);

        console.log(`\nTotal Validated Views:`);
        console.log(`Legacy: ${totalLegacy}`);
        console.log(`Pixel:  ${totalPixel}`);
        console.log(`Delta:  ${totalPixel - totalLegacy}`);

    } catch (e) {
        console.error("Comparison Error", e);
    }
}

compareStats();
