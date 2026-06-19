import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

// Symbols to fetch from Yahoo Finance
const SYMBOLS = [
    { id: 'USDARS=X', label: 'USD/ARS' },
    { id: 'EURUSD=X', label: 'EUR/USD' },
    { id: 'BTC-USD', label: 'BTC' },
    { id: 'ETH-USD', label: 'ETH' },
    { id: 'SOL-USD', label: 'SOL' }
];

let cache = { data: null, lastUpdate: 0 };
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

router.get("/", async (req, res) => {
    if (cache.data && (Date.now() - cache.lastUpdate < CACHE_TTL)) {
        return res.json(cache.data);
    }

    try {
        const results = await Promise.all(SYMBOLS.map(async (s) => {
            try {
                // Yahoo Finance chart API (public)
                const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s.id}?interval=1m&range=1d`, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const json = await response.json();
                const meta = json.chart?.result?.[0]?.meta;
                
                if (!meta) throw new Error("Invalid response format");

                const price = meta.regularMarketPrice;
                const prevClose = meta.previousClose;
                const change = price - prevClose;
                const changePct = (change / prevClose) * 100;

                return {
                    symbol: s.id,
                    label: s.label,
                    price: price,
                    change: change.toFixed(2),
                    changePct: changePct.toFixed(2),
                    up: change >= 0
                };
            } catch (err) {
                console.error(`Error fetching ${s.id}:`, err.message);
                return null;
            }
        }));

        const filtered = results.filter(r => r !== null);
        
        // If we have some data, cache it. If total fail, don't update cache.
        if (filtered.length > 0) {
            cache = { data: filtered, lastUpdate: Date.now() };
        } else if (cache.data) {
            // Fallback to expired cache if fetch fails
            return res.json(cache.data);
        }
        
        res.json(filtered);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
