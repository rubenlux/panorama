/**
 * PanoramaBuilder
 * Construye el panorama global de Panorama para el día
 *
 * Genera un resumen ejecutivo con:
 * - Top 10 historias del día
 * - Números globales (artículos, eventos, oportunidades, etc)
 * - Métricas clave
 *
 * Este panorama es lo que el editor ve en 10 segundos.
 * Es el contexto que se le pasa a Claude/Sonnet para que haga razonamiento.
 */

import { query } from '../routes/db.js';

export class PanoramaBuilder {
  /**
   * Build complete daily panorama
   * Returns a structured view of everything happening today
   */
  async buildDailyPanorama() {
    try {
      const [
        topStories,
        activeEvents,
        topSocial,
        coverageStats,
        topOpportunities,
        globalStats
      ] = await Promise.all([
        this._getTopStories(),
        this._getActiveEvents(),
        this._getTopSocialClusters(),
        this._getCoverageStats(),
        this._getTopOpportunities(),
        this._getGlobalStats()
      ]);

      const panorama = {
        timestamp: new Date().toISOString(),
        global_stats: globalStats,
        top_stories: topStories,
        active_events: activeEvents,
        social_trends: topSocial,
        coverage_stats: coverageStats,
        opportunities: topOpportunities
      };

      return panorama;
    } catch (error) {
      console.warn('[PanoramaBuilder] Error building panorama:', error.message);
      return null;
    }
  }

  /**
   * Format panorama for human consumption (executive summary)
   */
  formatExecutiveSummary(panorama) {
    if (!panorama) return null;

    let summary = '📰 **PANORAMA DEL DÍA**\n\n';

    // Global numbers
    const stats = panorama.global_stats;
    summary += `**Números globales**\n`;
    summary += `✔ ${stats.new_articles || 0} artículos nuevos\n`;
    summary += `✔ ${stats.active_stories || 0} historias activas\n`;
    summary += `✔ ${stats.active_events || 0} eventos creciendo\n`;
    summary += `✔ ${stats.editorial_opportunities || 0} oportunidades editoriales\n`;
    summary += `✔ ${stats.social_posts || 0} publicaciones sociales\n`;
    summary += `✔ ${stats.coverage_changes || 0} cambios de coverage\n\n`;

    // Top stories with brief cards
    summary += `**Top 5 Historias**\n`;
    panorama.top_stories.slice(0, 5).forEach((s, i) => {
      summary += `\n${i + 1}. **${s.title}**\n`;
      summary += `   📰 ${s.article_count} artículos • 🔗 ${s.source_count} medios\n`;
      if (s.social_mentions) summary += `   📱 ${s.social_mentions} menciones en redes\n`;
      summary += `   ${s.coverage_status === 'breaking' ? '🔥 Breaking' : s.coverage_status === 'growing' ? '📈 Creciendo' : '➡️ Estable'}\n`;
    });

    summary += '\n\n▼ **Expandir para ver detalles de cada historia**\n';

    return summary;
  }

  /**
   * Format detailed view for a single story (when expanded)
   */
  formatStoryDetails(story) {
    let details = `**${story.title}**\n\n`;
    details += `📊 Datos\n`;
    details += `Artículos: ${story.article_count}\n`;
    details += `Medios: ${story.source_count}\n`;
    details += `Fuentes: ${(story.sources || []).join(', ') || 'N/A'}\n\n`;

    if (story.social_mentions) {
      details += `📱 Redes Sociales\n`;
      details += `Menciones: ${story.social_mentions}\n`;
      details += `Engagement: ${story.social_engagement || 'N/A'}\n\n`;
    }

    if (story.entities?.length) {
      details += `🔗 Entidades\n`;
      story.entities.slice(0, 5).forEach(e => {
        details += `• ${e}\n`;
      });
      details += '\n';
    }

    return details;
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE: Data fetching methods
  // ────────────────────────────────────────────────────────────

  async _getTopStories() {
    try {
      const { rows } = await query(`
        SELECT
          sc.id,
          sc.title,
          sc.article_count,
          sc.source_count,
          sc.importance_score,
          sc.coverage_status,
          (
            SELECT json_agg(DISTINCT ts.name ORDER BY ts.name)
            FROM story_cluster_articles sca
            JOIN monitored_articles ma ON ma.id = sca.article_id
            JOIN rss_sources ts ON ts.id = ma.source_id
            WHERE sca.story_id = sc.id
          ) AS sources,
          (
            SELECT COUNT(DISTINCT scp.post_id)
            FROM social_cluster_posts scp
            JOIN social_posts sp ON sp.id = scp.post_id
            WHERE sp.title ILIKE '%' || sc.title || '%'
          ) AS social_mentions,
          (
            SELECT SUM(sp.likes)
            FROM social_cluster_posts scp
            JOIN social_posts sp ON sp.id = scp.post_id
            WHERE sp.title ILIKE '%' || sc.title || '%'
          ) AS social_engagement,
          (
            SELECT json_agg(ke.name ORDER BY ke.name LIMIT 5)
            FROM story_entities se
            JOIN knowledge_entities ke ON ke.id = se.entity_id
            WHERE se.story_id = sc.id
          ) AS entities
        FROM story_clusters sc
        WHERE sc.status IN ('active', 'ready', 'followed')
          AND sc.is_recurring = false
          AND sc.last_seen > now() - interval '24 hours'
        ORDER BY sc.importance_score DESC
        LIMIT 10
      `);
      return rows;
    } catch (e) {
      console.warn('[PanoramaBuilder] _getTopStories error:', e.message);
      return [];
    }
  }

  async _getActiveEvents() {
    try {
      const { rows } = await query(`
        SELECT
          ec.id,
          ec.headline,
          ec.story_count,
          ec.article_count,
          ec.editorial_score,
          ec.coverage_status,
          ec.last_updated_at
        FROM event_clusters ec
        WHERE ec.status IN ('active', 'followed')
          AND ec.last_updated_at > now() - interval '24 hours'
        ORDER BY ec.editorial_score DESC
        LIMIT 5
      `);
      return rows;
    } catch (e) {
      console.warn('[PanoramaBuilder] _getActiveEvents error:', e.message);
      return [];
    }
  }

  async _getTopSocialClusters() {
    try {
      const { rows } = await query(`
        SELECT
          sc.id,
          sc.title,
          sc.post_count,
          sc.total_engagement,
          sc.viral_score,
          sc.gap_score,
          sc.opportunity_score,
          (
            SELECT json_agg(DISTINCT sp.platform ORDER BY sp.platform)
            FROM social_cluster_posts scp
            JOIN social_posts sp ON sp.id = scp.post_id
            WHERE scp.cluster_id = sc.id
          ) AS platforms
        FROM social_clusters sc
        WHERE sc.status = 'active'
          AND sc.last_seen > now() - interval '24 hours'
        ORDER BY sc.opportunity_score DESC
        LIMIT 5
      `);
      return rows;
    } catch (e) {
      console.warn('[PanoramaBuilder] _getTopSocialClusters error:', e.message);
      return [];
    }
  }

  async _getCoverageStats() {
    try {
      const { rows } = await query(`
        SELECT
          COUNT(DISTINCT source_name) AS sources_active,
          COUNT(*) AS total_changes,
          COUNT(*) FILTER (WHERE change_type = 'link_added') AS new_articles,
          COUNT(*) FILTER (WHERE change_type = 'link_updated') AS updated_articles
        FROM coverage_changes
        WHERE detected_at > now() - interval '24 hours'
      `);
      return rows[0] || {};
    } catch (e) {
      console.warn('[PanoramaBuilder] _getCoverageStats error:', e.message);
      return {};
    }
  }

  async _getTopOpportunities() {
    try {
      const { rows } = await query(`
        SELECT
          so.id,
          so.title,
          so.opportunity_type,
          so.composite_score,
          so.traffic_score,
          so.editorial_score,
          sc.title AS story_title
        FROM story_opportunities so
        JOIN story_clusters sc ON sc.id = so.story_cluster_id
        WHERE so.status NOT IN ('dismissed')
          AND so.last_seen > now() - interval '24 hours'
        ORDER BY so.composite_score DESC
        LIMIT 5
      `);
      return rows;
    } catch (e) {
      console.warn('[PanoramaBuilder] _getTopOpportunities error:', e.message);
      return [];
    }
  }

  async _getGlobalStats() {
    try {
      const { rows } = await query(`
        SELECT
          (SELECT COUNT(*) FROM monitored_articles WHERE detected_at > now() - interval '24 hours') AS new_articles,
          (SELECT COUNT(DISTINCT id) FROM story_clusters WHERE status IN ('active', 'ready', 'followed') AND last_seen > now() - interval '24 hours') AS active_stories,
          (SELECT COUNT(DISTINCT id) FROM event_clusters WHERE status IN ('active', 'followed') AND last_updated_at > now() - interval '24 hours') AS active_events,
          (SELECT COUNT(DISTINCT id) FROM story_opportunities WHERE status NOT IN ('dismissed') AND last_seen > now() - interval '24 hours') AS editorial_opportunities,
          (SELECT COUNT(DISTINCT id) FROM social_posts WHERE captured_at > now() - interval '24 hours') AS social_posts,
          (SELECT COUNT(DISTINCT id) FROM coverage_changes WHERE detected_at > now() - interval '24 hours') AS coverage_changes
      `);
      return rows[0] || {};
    } catch (e) {
      console.warn('[PanoramaBuilder] _getGlobalStats error:', e.message);
      return {};
    }
  }
}

export default new PanoramaBuilder();
