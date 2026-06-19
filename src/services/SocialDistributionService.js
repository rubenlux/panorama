import { query } from '../routes/db.js';
import { AiService } from './AiService.js';

const ai = new AiService();

export class SocialDistributionService {
    /**
     * Recomienda canales basados en el contenido (Algoritmo Editorial V2)
     */
    calculateRecommendations(dossier, entities, topicType) {
        // Scores base neutros
        const scores = {
            facebook: 60,
            instagram_feed: 50,
            instagram_story: 40,
            instagram_carousel: 30,
            x: 55,
            linkedin: 20,
            newsletter: 45,
            push: 20,
            tiktok: 30,
            instagram_reel: 30,
            facebook_reel: 30,
            youtube_short: 30
        };

        const type = (topicType || 'general').toLowerCase();
        const urgency = dossier.importance_score || 5;

        // 1. Lógica por Categoría / Tipo (FASE 1)
        if (type.includes('breaking') || type.includes('urgente') || urgency >= 8) {
            scores.push = 95;
            scores.x = 95;
            scores.facebook = 85;
            scores.newsletter = 70;
            scores.youtube_short = 60;
        }

        if (type.includes('economy') || type.includes('politics') || type.includes('business')) {
            scores.linkedin = 90;
            scores.newsletter = 90;
            scores.facebook = 80;
            scores.instagram_carousel = 75; // Explicadores económicos
            scores.x = 75;
        }

        if (type.includes('sports') || type.includes('entertainment') || type.includes('show')) {
            scores.instagram_reel = 95;
            scores.tiktok = 95;
            scores.facebook_reel = 90;
            scores.facebook = 85;
            scores.instagram_story = 90;
        }

        if (type.includes('police') || type.includes('crime') || type.includes('judicial')) {
            scores.facebook = 90;
            scores.push = 90;
            scores.x = 85;
            scores.youtube_short = 70;
        }

        // 2. Lógica por Entidades
        const hasPoliticians = entities.some(e => e.entity_type === 'person' && (e.role?.includes('politician') || e.name?.includes('Presidente') || e.name?.includes('Ministro')));
        if (hasPoliticians) {
            scores.linkedin += 15;
            scores.x += 10;
        }

        // 3. Lógica por Complejidad (Hechos)
        const factsCount = Array.isArray(dossier.verified_facts) ? dossier.verified_facts.length : 0;
        if (factsCount > 6) {
            scores.instagram_carousel += 25; // Mas slides para explicar hechos
            scores.newsletter += 20;
            scores.linkedin += 10;
        }

        // Normalizar y Categorizar (FASE 6)
        const normalized = {};
        Object.keys(scores).forEach(k => {
            normalized[k] = Math.min(100, Math.max(0, scores[k]));
        });

        const categories = {
            recommended: Object.keys(normalized).filter(k => normalized[k] > 80),
            optional: Object.keys(normalized).filter(k => normalized[k] <= 80 && normalized[k] >= 50),
            low: Object.keys(normalized).filter(k => normalized[k] < 50)
        };

        return { scores: normalized, categories };
    }

    async generateDistribution(dossierId) {
        // 1. Obtener dossier y datos relacionados
        const { rows: [dossier] } = await query(`
            SELECT ed.*, rt.title as topic_title, rt.id as topic_id
            FROM editorial_dossiers ed
            JOIN research_topics rt ON rt.id = ed.topic_id
            WHERE ed.id = $1
        `, [dossierId]);

        if (!dossier) throw new Error("Dossier not found");

        const { rows: entities } = await query(`
            SELECT ke.name, ke.entity_type
            FROM entity_mentions em 
            JOIN knowledge_entities ke ON ke.id = em.entity_id
            WHERE em.topic_id = $1
        `, [dossier.topic_id]);

        // 2. Generar contenido vía IA
        const socialContent = await ai.generateSocialDistribution(dossier, entities);

        // 3. Normalizar resultados (Capa de Normalización V2)
        const normalizedContent = {};
        for (const [key, raw] of Object.entries(socialContent)) {
            if (!raw) {
                normalizedContent[key] = null;
                continue;
            }

            // Simplificar objetos anidados para el renderizado plano
            if (typeof raw === 'object' && !Array.isArray(raw)) {
                // Prioridad de extracción de texto principal
                const mainText = raw.text || raw.body || raw.caption || raw.content || raw.script || raw.description || '';
                const extra = raw.hashtags || raw.tags || raw.cta || '';
                
                // Si es un canal de texto simple, lo convertimos a string para compatibilidad
                if (['facebook_post', 'instagram_feed', 'x_post', 'linkedin_post', 'newsletter_content', 'push_notification', 'instagram_story'].includes(key)) {
                    normalizedContent[key] = extra ? `${mainText}\n\n${extra}` : mainText;
                } else {
                    // Para video se queda como objeto pero aseguramos campos
                    normalizedContent[key] = raw;
                }
            } else {
                normalizedContent[key] = raw;
            }
        }

        // 3. Calcular recomendaciones (Algoritmo V2)
        const recommendations = this.calculateRecommendations(dossier, entities, dossier.event_type || dossier.category || 'general');

        // 4. Guardar en DB (Incluyendo nuevos campos V2)
        const { rows: [packageRecord] } = await query(`
            INSERT INTO social_content_packages (
                dossier_id, 
                facebook_post, 
                instagram_feed, 
                instagram_story, 
                instagram_carousel, 
                x_post, 
                linkedin_post, 
                newsletter_content, 
                push_notification,
                tiktok_script,
                instagram_reel,
                facebook_reel,
                youtube_short,
                recommendations,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'review')
            ON CONFLICT (dossier_id) DO UPDATE SET
                facebook_post = EXCLUDED.facebook_post,
                instagram_feed = EXCLUDED.instagram_feed,
                instagram_story = EXCLUDED.instagram_story,
                instagram_carousel = EXCLUDED.instagram_carousel,
                x_post = EXCLUDED.x_post,
                linkedin_post = EXCLUDED.linkedin_post,
                newsletter_content = EXCLUDED.newsletter_content,
                push_notification = EXCLUDED.push_notification,
                tiktok_script = EXCLUDED.tiktok_script,
                instagram_reel = EXCLUDED.instagram_reel,
                facebook_reel = EXCLUDED.facebook_reel,
                youtube_short = EXCLUDED.youtube_short,
                recommendations = EXCLUDED.recommendations,
                status = 'review',
                updated_at = NOW()
            RETURNING *
        `, [
            dossierId,
            normalizedContent.facebook_post,
            normalizedContent.instagram_feed,
            normalizedContent.instagram_story,
            JSON.stringify(normalizedContent.instagram_carousel),
            normalizedContent.x_post,
            normalizedContent.linkedin_post,
            normalizedContent.newsletter_content,
            normalizedContent.push_notification,
            JSON.stringify(normalizedContent.tiktok_script),
            JSON.stringify(normalizedContent.instagram_reel),
            JSON.stringify(normalizedContent.facebook_reel),
            JSON.stringify(normalizedContent.youtube_short),
            JSON.stringify(recommendations)
        ]);

        return packageRecord;
    }
}
