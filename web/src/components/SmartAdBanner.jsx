
import React, { useEffect, useState, useRef } from 'react';
import { apiJson, resolveUrl } from '../api';
import { Pixel } from '../utils/pixel';

// Positions: 'home_top', 'article_sidebar', 'article_bottom'
export default function SmartAdBanner({ position }) {
    const [ad, setAd] = useState(null);
    const [loading, setLoading] = useState(true);
    const hasImpression = useRef(false);
    const bannerRef = useRef(null);

    useEffect(() => {
        const fetchAd = async () => {
            // 1. Get Visitor ID for targeting - Sync with Pixel System
            let visitorId = localStorage.getItem('pixel_vid');

            // Fallback to old key if pixel_vid doesn't exist yet
            if (!visitorId) {
                visitorId = localStorage.getItem('news_visitor_id');
                if (visitorId) {
                    // Migrate to new key
                    localStorage.setItem('pixel_vid', visitorId);
                }
            }

            try {
                const res = await apiJson(`/ads/serve?position=${position}&visitor_id=${visitorId || 'anonymous'}`);
                if (res && res.ad) {
                    setAd(res.ad);
                    // Log debug info if matched by interest
                    if (res.debug_interests && res.debug_interests.length > 0) {
                        console.log(`🎯 Targeted Ad Served! Matched interests: ${res.debug_interests.join(', ')}`);
                    }
                }
            } catch (e) {
                console.error("Ad Load Error", e);
            } finally {
                setLoading(false);
            }
        };

        fetchAd();
    }, [position]);

    // 2. Impression Tracking (Intersection Observer)
    useEffect(() => {
        if (!ad || hasImpression.current || !bannerRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    console.log("👁️ Ad Impression Recorded:", ad.name);

                    // Track via Pixel
                    Pixel.track('ad_impression', {
                        campaign_id: ad.id,
                        position: position,
                        advertiser_name: ad.advertiser_name // Optional
                    });

                    hasImpression.current = true;
                    observer.disconnect();
                }
            });
        }, { threshold: 0.5 }); // 50% visible

        observer.observe(bannerRef.current);

        return () => observer.disconnect();
    }, [ad, position]);

    const handleClick = () => {
        // Track Click
        Pixel.track('ad_click', {
            campaign_id: ad.id,
            position: position,
            url: ad.target_url
        });

        // Open link
        window.open(ad.target_url, '_blank');
    };

    // Sin publicidad disponible: no renderiza nada (sin placeholder)
    if (loading) return null;


    // Sin publicidad disponible: no renderiza nada (sin placeholder)
    if (!ad) return null;


    return (
        <div className="smart-ad-container" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Publicidad</div>
            <div
                ref={bannerRef}
                onClick={handleClick}
                style={{ cursor: 'pointer', overflow: 'hidden', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'inline-block' }}
            >
                <img
                    src={resolveUrl(ad.banner_url)}
                    alt={ad.name}
                    style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                />
            </div>
        </div>
    );
}
