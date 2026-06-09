import express from "express";
import { AiService } from "../services/AiService.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const aiService = new AiService();

router.post("/analyze", requireAuth, async (req, res) => {
    try {
        const { article, primary_keyword } = req.body;

        if (!article) {
            return res.status(400).json({ error: "Missing article data" });
        }

        // Prepare data for service
        // Article object should have: title, volanta, slug, categorySlugs, author, body, image_url, epigraph
        // We map it loosely to the prompt needs

        const analysisData = {
            title: article.title,
            subtitle: article.volanta,
            slug: article.slug,
            category: Array.isArray(article.categorySlugs) ? article.categorySlugs.join(", ") : article.categorySlugs,
            author: article.author?.name || "Unknown", // Assuming populated or just ID
            date: article.published_at,
            body: article.body,
            primary_keyword: primary_keyword,
            images: article.image_url ? [{ url: article.image_url, caption: article.epigraph, is_main: true }] : []
        };

        const result = await aiService.analyzeArticle(analysisData);
        res.json(result);

    } catch (error) {
        console.error("AI Route Error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.post("/rewrite", requireAuth, async (req, res) => {
    try {
        const { article } = req.body;
        if (!article) return res.status(400).json({ error: "Missing article data" });

        const rewriteData = {
            title: article.title,
            subtitle: article.volanta,
            excerpt: article.excerpt,
            body: article.body
        };

        const result = await aiService.rewriteArticle(rewriteData);
        res.json(result);

    } catch (error) {
        console.error("AI Rewrite Route Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
