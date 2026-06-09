import { apiJson, API_BASE } from "../api";

/**
 * Internal Pixel Service
 * Single Source of Truth for Client Events.
 * 
 * Features:
 * - Managed Identity (Visitor ID, Session ID)
 * - Fire-and-forget transport
 * - Session Management (30m reset)
 * - Automatic Metadata (URL, Device, etc.)
 */
class PixelService {
    constructor() {
        this.visitorId = null;
        this.sessionId = null;
        this.initialized = false;
        this.debug = import.meta.env.DEV;
        this.context = {}; // Global metadata (author, category, etc.)
        this.heartbeatInterval = null;
        this.sentScrollDepths = new Set();
        this.SESSION_TIMEOUT = 30 * 60 * 1000;
        this.startTime = Date.now();

        // Auto-init visibility listener
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.stopHeartbeat();
                else if (this.activeArticleId) this.startHeartbeat(this.activeArticleId);
            });
        }
    }

    init() {
        if (this.initialized) return;
        try {
            this._loadIdentity();
            this.initialized = true;
            this.captureNavLinks(); // Monitor internal navigation
            if (this.debug) console.log(`[Pixel] Init: v=${this.visitorId} s=${this.sessionId}`);
        } catch (e) {
            console.error("[Pixel] Init failed", e);
        }
    }

    setContext(ctx = {}) {
        this.context = { ...this.context, ...ctx };
    }

    track(eventName, payload = {}) {
        if (!this.initialized) this.init();

        try {
            this._checkSession();
            const urlParams = new URLSearchParams(window.location.search);

            const eventData = {
                visitor_id: this.visitorId,
                session_id: this.sessionId,
                event: eventName,
                url: window.location.href,
                payload: {
                    ...this.context, // Inject editorial metadata (Author/Category)
                    ...payload,
                    timestamp: new Date().toISOString(),
                    path: window.location.pathname,
                    title: document.title,
                    referrer: document.referrer || 'direct',
                    utm_source: urlParams.get('utm_source'),
                    utm_medium: urlParams.get('utm_medium'),
                    utm_campaign: urlParams.get('utm_campaign')
                }
            };

            if (this.debug) console.log(`[Pixel] Track: ${eventName}`, eventData);

            const endpoint = `${API_BASE}/pixel/events`;
            const blob = new Blob([JSON.stringify({ events: [eventData] })], { type: 'application/json' });

            if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, blob)) {
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ events: [eventData] }),
                    keepalive: true
                }).catch(() => { });
            }
        } catch (e) {
            console.error("[Pixel] Track Error", e);
        }
    }

    // --- SEO GOLD FEATURES ---

    /**
     * Heartbeat (Time on Content)
     */
    startHeartbeat(articleId) {
        this.stopHeartbeat();
        this.activeArticleId = articleId;
        this.heartbeatInterval = setInterval(() => {
            if (document.hidden) return;
            this.track('time_on_content', { article_id: articleId, seconds: 20 });
        }, 20000); // Every 20s
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
    }

    /**
     * Scroll Depth Tracking
     */
    /**
     * Scroll Depth Tracking
     */
    initScrollTracking(articleId) {
        this.stopScrollTracking(); // Cleanup first
        this.sentScrollDepths.clear();
        const thresholds = [25, 50, 75, 100];

        this.scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const depth = entry.target.dataset.depth;
                    if (!this.sentScrollDepths.has(depth)) {
                        this.track('scroll_depth', { article_id: articleId, percent: parseInt(depth) });
                        this.sentScrollDepths.add(depth);
                    }
                }
            });
        }, { threshold: 0.1 });

        // Add markers to the page
        thresholds.forEach(t => {
            const marker = document.createElement('div');
            marker.id = `scroll-marker-${t}`;
            marker.dataset.depth = t;
            marker.style.position = 'absolute';
            marker.style.top = `${t}%`;
            marker.style.height = '1px';
            marker.style.width = '1px';
            marker.style.visibility = 'hidden';
            marker.style.zIndex = '-1';
            document.body.appendChild(marker);
            this.scrollObserver.observe(marker);
        });
    }

    stopScrollTracking() {
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }
        // Remove markers
        [25, 50, 75, 100].forEach(t => {
            const marker = document.getElementById(`scroll-marker-${t}`);
            if (marker) marker.remove();
        });
    }

    /**
     * Exit Intent Detection
     */
    initExitIntent() {
        const handler = (e) => {
            if (e.clientY < 0) {
                this.track('exit_intent', { type: 'mouse_leave_top' });
                document.removeEventListener('mouseleave', handler);
            }
        };
        document.addEventListener('mouseleave', handler);
    }

    /**
     * Internal Link Navigation Tracking
     */
    captureNavLinks() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                const isInternal = link.href.includes(window.location.hostname);
                if (isInternal) {
                    this.track('internal_link_click', {
                        target_url: link.href,
                        text: link.innerText.substring(0, 50)
                    });
                }
            }
        });
    }

    /**
     * Performance: Content Visibility Timing
     */
    trackContentLoaded(articleId, startTime = null) {
        if (typeof window === 'undefined') return;

        const baseTime = startTime || this.startTime;
        const send = () => {
            const loadTimeMs = Date.now() - baseTime;
            this.track('content_loaded', {
                article_id: articleId,
                load_time_ms: loadTimeMs,
                perf: window.performance ? window.performance.now() : 0
            });
        };

        if (document.readyState === 'complete') send();
        else window.addEventListener('load', send, { once: true });
    }

    // --- Identity Methods ---
    _loadIdentity() {
        let vid = localStorage.getItem("pixel_vid");
        if (!vid) {
            vid = this._generateUUID();
            localStorage.setItem("pixel_vid", vid);
        }
        this.visitorId = vid;
        this._checkSession(true);
    }

    _checkSession(force = false) {
        const now = Date.now();
        const lastActive = parseInt(localStorage.getItem("pixel_last_active") || "0", 10);
        let sid = sessionStorage.getItem("pixel_sid");

        if (force || !sid || (now - lastActive > this.SESSION_TIMEOUT)) {
            sid = this._generateUUID();
            sessionStorage.setItem("pixel_sid", sid);
        }
        this.sessionId = sid;
        localStorage.setItem("pixel_last_active", now.toString());
    }

    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

export const Pixel = new PixelService();
