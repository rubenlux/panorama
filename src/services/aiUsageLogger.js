/**
 * aiUsageLogger — centralised logging for all on-demand AI calls.
 * Writes to ai_usage_log table and returns the log row id.
 *
 * Pricing (USD per million tokens):
 *   claude-sonnet-4-6 : $3 input / $15 output
 *   claude-haiku-4-5  : $0.25 input / $1.25 output
 */
import { query } from '../routes/db.js';

const PRICING = {
  'claude-sonnet-4-6':        { input: 3,    output: 15    },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25  },
};

const TOKENS_PER_WORD = 1.3;

// Estimated output tokens by feature
const OUTPUT_TOKENS_EST = {
  story_summary:  350,
  event_summary:  500,
  opportunities:  450,
  trend_summary:  300,
};

export async function logAiCall({
  feature,
  trigger = 'auto',       // 'auto' | 'on_demand'
  triggeredBy = 'worker', // user_id string or 'worker'
  storyId  = null,
  eventId  = null,
  trendId  = null,
  model    = 'claude-sonnet-4-6',
  inputWords = 0,
  durationMs = null,
  cached   = false,
  success  = true,
  errorMessage = null,
}) {
  try {
    const inputTokens  = Math.round(inputWords * TOKENS_PER_WORD);
    const outputTokens = OUTPUT_TOKENS_EST[feature] ?? 300;
    const price        = PRICING[model] ?? PRICING['claude-sonnet-4-6'];
    const costUsd      = cached ? 0 :
      parseFloat(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(6));

    const { rows: [row] } = await query(`
      INSERT INTO ai_usage_log
        (feature, trigger, triggered_by, story_id, event_id, trend_id,
         model, input_words, input_tokens_est, output_tokens_est,
         cost_usd_est, cached, success, error_message, duration_ms)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id
    `, [
      feature, trigger, triggeredBy, storyId, eventId, trendId,
      model, inputWords, inputTokens, outputTokens,
      costUsd, cached, success, errorMessage, durationMs,
    ]);

    return row?.id ?? null;
  } catch (e) {
    console.error('[aiUsageLogger] Failed to log:', e.message);
    return null;
  }
}
