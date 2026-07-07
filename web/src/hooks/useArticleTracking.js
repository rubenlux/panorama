import { useEffect, useRef } from "react";
import { Pixel } from "../utils/pixel";

/**
 * Hook to track Article events: View, Behavioral Signals, Engagement
 * @param {object} article - The article object with all metadata
 * @param {boolean} isPreview - If true, do not track
 */
export function useArticleTracking(article, isPreview = false, slug = null) {
    const hasViewed = useRef(false);
    const navStartTime = useRef(Date.now());
    const lastSlug = useRef(null);

    // Capture navigation start when slug changes (even if article is still null)
    if (slug && slug !== lastSlug.current) {
        navStartTime.current = Date.now();
        lastSlug.current = slug;
        hasViewed.current = false; // Reset view flag for new article in SPA
    }

    useEffect(() => {
        if (!article || isPreview) return;

        const articleId = article.id;

        // 1. Initialize Context (Point 8: Context is ORO)
        Pixel.setContext({
            article_id: articleId,
            author_id: article.author_id,
            category: article.category_name,
            slug: article.slug
        });

        // 2. Track Initial View
        // page_view is NOT tracked here — App.jsx's location-effect already fires
        // it on every route change (including this one). Firing it again here
        // double-counted every article view (SPEC 014 finding). content_view is
        // the article-specific, already-deduped view signal.
        if (!hasViewed.current) {
            Pixel.track("content_view", {
                content_type: "article",
                content_id: articleId
            });
            hasViewed.current = true;
        }

        // 3. Behavioral Sensors (Points 1, 2, 3, 4, 5)
        Pixel.startHeartbeat(articleId);      // Point 1: Heartbeat
        Pixel.initScrollTracking(articleId);  // Point 2: Scroll
        Pixel.initExitIntent(articleId);      // Point 4: Exit Intent

        // Measure from Navigation Start to this render
        Pixel.trackContentLoaded(articleId, navStartTime.current);

        // Cleanup
        return () => {
            Pixel.stopHeartbeat();
            Pixel.stopScrollTracking();
            Pixel.stopExitIntent();
        };
    }, [article?.id, isPreview]);

    // Engagement Actions (Points 5, 6)
    const trackLike = async () => {
        if (!article || isPreview) return;
        Pixel.track("like_click");
    };

    const trackShare = async () => {
        if (!article || isPreview) return;
        Pixel.track("share_click");
    };

    return { trackLike, trackShare };
}
