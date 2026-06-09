/**
 * universal-pixel.js
 * Standalone tracking script for advertisers.
 * 
 * Usage:
 * <script>
 *   (function(n,e,w,s,p,i,x){
 *     n[p]=n[p]||function(){(n[p].q=n[p].q||[]).push(arguments)};
 *     i=e.createElement(w);x=e.getElementsByTagName(w)[0];
 *     i.async=1;i.src=s;x.parentNode.insertBefore(i,x);
 *   })(window,document,'script','{{API_URL}}/pixel/pixel.js','NewsPixel');
 *   
 *   NewsPixel('init', { campaign_id: 'XYZ' });
 *   NewsPixel('event', 'page_view');
 * </script>
 */
(function () {
    const API_URL = '{{API_URL}}';
    const CONFIG = {
        SESSION_TIMEOUT: 30 * 60 * 1000 // 30 mins
    };

    const storage = {
        get: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
        set: (key, val) => { try { localStorage.setItem(key, val); } catch (e) { } }
    };

    const generateId = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const getVisitorId = () => {
        let id = storage.get('news_pixel_vid');
        if (!id) {
            id = generateId();
            storage.set('news_pixel_vid', id);
        }
        return id;
    };

    const getSessionId = () => {
        let sid = sessionStorage.getItem('news_pixel_sid');
        const lastActive = parseInt(storage.get('news_pixel_active') || "0");
        const now = Date.now();

        if (!sid || (now - lastActive > CONFIG.SESSION_TIMEOUT)) {
            sid = generateId();
            sessionStorage.setItem('news_pixel_sid', sid);
        }
        storage.set('news_pixel_active', now.toString());
        return sid;
    };

    let heartbeatInterval = null;
    let context = {};
    const sentScrollDepths = new Set();
    let currentId = null;

    const track = (eventName, payload = {}) => {
        const data = {
            visitor_id: getVisitorId(),
            session_id: getSessionId(),
            event: eventName,
            url: window.location.href,
            payload: {
                ...context,
                ...payload,
                ts: new Date().toISOString(),
                ref: document.referrer || 'direct',
                title: document.title
            }
        };

        const endpoint = `${API_URL}/pixel/events`;
        const blob = new Blob([JSON.stringify({ events: [data] })], { type: 'application/json' });

        if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, blob)) {
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: [data] }),
                keepalive: true
            }).catch(() => { });
        }
    };

    const startHeartbeat = (id) => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (!document.hidden) track('time_on_content', { content_id: id, seconds: 20 });
        }, 20000);
    };

    const initScrollDepth = (id) => {
        const thresholds = [25, 50, 75, 100];
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const depth = entry.target.dataset.depth;
                if (entry.isIntersecting && !sentScrollDepths.has(depth)) {
                    track('scroll_depth', { content_id: id, percent: parseInt(depth) });
                    sentScrollDepths.add(depth);
                }
            });
        }, { threshold: 0.1 });

        thresholds.forEach(t => {
            const marker = document.createElement('div');
            marker.dataset.depth = t;
            marker.style.cssText = `position:absolute;top:${t}%;left:0;height:1px;width:1px;visibility:hidden;pointer-events:none;`;
            document.body.appendChild(marker);
            observer.observe(marker);
        });
    };

    const initExitIntent = () => {
        const handler = (e) => {
            if (e.clientY < 0) {
                track('exit_intent', { type: 'mouse_leave_top' });
                document.removeEventListener('mouseleave', handler);
            }
        };
        document.addEventListener('mouseleave', handler);
    };

    // Global Interface
    const queue = window.NewsPixel ? window.NewsPixel.q || [] : [];

    window.NewsPixel = function () {
        const args = Array.prototype.slice.call(arguments);
        const cmd = args.shift();

        if (cmd === 'event') {
            track(args[0], args[1] || {});
        } else if (cmd === 'init') {
            const config = args[0] || {};
            context = { ...context, ...config };
            currentId = config.article_id || config.campaign_id;
            track('pixel_init', config);

            if (currentId) {
                startHeartbeat(currentId);
                initScrollDepth(currentId);
                initExitIntent();
                initPerformanceTracking(currentId);
            }
        }
    };

    // Auto-track internal links
    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.href && a.href.includes(window.location.hostname)) {
            track('internal_link_click', { target_url: a.href });
        }
    });

    const initPerformanceTracking = (id, startTime = null) => {
        const baseTime = startTime || Date.now();
        const send = () => {
            track('content_loaded', {
                content_id: id,
                load_time_ms: Date.now() - baseTime
            });
        };
        if (document.readyState === 'complete') send();
        else window.addEventListener('load', send, { once: true });
    };

    // Visibility listener
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        } else if (!document.hidden && currentId) {
            startHeartbeat(currentId);
        }
    });

    // Process queued events
    queue.forEach(args => window.NewsPixel.apply(null, args));
})();
