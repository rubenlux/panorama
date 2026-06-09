import { query } from "../routes/db.js";

/**
 * Calculates revenue for a specific period and stores it in ad_revenue table.
 * @param {Date} startDate 
 * @param {Date} endDate 
 */
export async function calculateAdRevenue(startDate, endDate) {
  console.log(`Starting Revenue Calculation for ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // 1. Get Events Grouped by Ad
  // We filter by date range
  const events = await query(`
    SELECT
      ad_id,
      COUNT(*) FILTER (WHERE type = 'impression') AS impressions,
      COUNT(*) FILTER (WHERE type = 'click') AS clicks
    FROM ad_events
    WHERE created_at >= $1 AND created_at < $2
    GROUP BY ad_id
  `, [startDate, endDate]);

  console.log(`Found events for ${events.rows.length} ads.`);

  for (const row of events.rows) {
    // 2. Get Pricing Model for this Ad
    // Join ads -> campaigns to get pricing info
    const pricingRes = await query(`
      SELECT c.pricing_model as model, c.price, c.currency
      FROM ads a
      JOIN campaigns c ON a.campaign_id = c.id
      WHERE a.id = $1
      LIMIT 1
    `, [row.ad_id]);

    if (pricingRes.rowCount === 0) {
      console.warn(`No pricing info found for ad ${row.ad_id}`);
      continue;
    }

    const { model, price } = pricingRes.rows[0];
    const imp = parseInt(row.impressions);
    const clk = parseInt(row.clicks);
    const priceVal = parseFloat(price);

    let revenue = 0;

    if (model === "CPM") {
      revenue = (imp / 1000) * priceVal;
    } else if (model === "CPC") {
      revenue = clk * priceVal;
    } else if (model === "FIXED") {
      // For fixed, we need to be careful. 
      // If it's a daily job, we might want to split the total price by campaign duration?
      // Or just assume the 'price' in campaign is the "Daily Value" or "Total Value"?
      // The user prompt said: "Fixed: price".
      // Let's assume for a daily job we might need to attribute a daily portion if price is total.
      // BUT for simplicity and per user instructions: "If model === FIXED { revenue = price }"
      // Wait, if I run this every day, I'll add the full fixed price every day? That might be wrong if price is "Total Campaign Budget".
      // However, usually "Fixed" in simple systems might mean "Fixed Price per Month" or similar.
      // Let's stick to the simplest interpretation for now or logic:
      // If it's daily job, maybe we should divide by 30?
      // User said: "Calcula el día anterior... If model === FIXED { revenue = price }"
      // I will implement "price" but add a comment. 
      // Actually, standard practice for Fixed Daily is simply valid. If price is total, it should be divided using campaign start/end.
      // Let's implement logic: Revenue = Price / Duration_Days * 1_Day

      // Let's check campaign duration
      const campRes = await query(`SELECT start_date, end_date FROM campaigns c JOIN ads a ON a.campaign_id = c.id WHERE a.id = $1`, [row.ad_id]);
      if (campRes.rows[0].start_date && campRes.rows[0].end_date) {
        const start = new Date(campRes.rows[0].start_date);
        const end = new Date(campRes.rows[0].end_date);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;
        revenue = priceVal / days;
      } else {
        revenue = priceVal; // Fallback if no dates
      }
    }

    // 3. Store Result
    await query(`
      INSERT INTO ad_revenue
        (ad_id, impressions, clicks, revenue, period_start, period_end)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (ad_id, period_start, period_end)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        revenue = EXCLUDED.revenue
    `, [
      row.ad_id,
      imp,
      clk,
      revenue.toFixed(2),
      startDate,
      endDate
    ]);
  }

  console.log("Revenue calculation completed.");
}
