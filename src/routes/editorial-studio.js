import express from "express";
import { AiService } from "../services/AiService.js";
import { requireAuth } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.resolve("uploads/temp/");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const router = express.Router();
const aiService = new AiService();

// ============================================================
// CREAR BORRADOR DESDE TEMA
// ============================================================
router.post("/create-draft", requireAuth, async (req, res) => {
    try {
        const { topic, articleType, country, targetAudience, additionalContext } = req.body;

        if (!topic) {
            return res.status(400).json({ error: "Missing topic" });
        }

        const topicData = {
            topic,
            articleType: articleType || "breaking",
            country: country || "Argentina",
            targetAudience: targetAudience || "General",
            additionalContext: additionalContext || ""
        };

        const result = await aiService.createDraftFromTopic(topicData);
        res.json(result);

    } catch (error) {
        console.error("Create Draft Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// REFORMULAR ARTÍCULO EXISTENTE
// ============================================================
router.post("/reformulate", requireAuth, async (req, res) => {
    try {
        const { original, objective, instructions, newData } = req.body;

        if (!original || !original.title || !original.body) {
            return res.status(400).json({ error: "Missing original article data" });
        }

        if (!objective) {
            return res.status(400).json({ error: "Missing reformulation objective" });
        }

        const articleData = {
            original: {
                title: original.title,
                volanta: original.volanta || "",
                excerpt: original.excerpt || "",
                body: original.body
            },
            objective,
            instructions: instructions || "",
            newData: newData || ""
        };

        const result = await aiService.reformulateArticle(articleData);
        res.json(result);

    } catch (error) {
        console.error("Reformulate Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ESTRUCTURAR DATOS DESORDENADOS
// ============================================================
router.post("/structure-data", requireAuth, async (req, res) => {
    try {
        const { rawData, context } = req.body;

        if (!rawData) {
            return res.status(400).json({ error: "Missing raw data" });
        }

        const contextData = {
            category: context?.category || "General",
            expectedType: context?.expectedType || "breaking",
            country: context?.country || "Argentina"
        };

        const result = await aiService.structureChaoticData(rawData, contextData);
        res.json(result);

    } catch (error) {
        console.error("Structure Data Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// CREAR ARTÍCULO DESDE TRANSCRIPCIÓN DE AUDIO
// ============================================================
router.post("/from-audio", requireAuth, async (req, res) => {
    try {
        const { transcript, context } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: "Missing audio transcript" });
        }

        const contextData = {
            audioType: context?.audioType || "field-report",
            speakers: context?.speakers || [],
            category: context?.category || "General",
            location: context?.location || "",
            date: context?.date || new Date().toISOString().split('T')[0]
        };

        const result = await aiService.createArticleFromAudio(transcript, contextData);
        res.json(result);

    } catch (error) {
        console.error("Audio to Article Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// TRANSCRIBIR AUDIO (WHISPER)
// ============================================================
router.post("/transcribe", requireAuth, upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Missing audio file" });
        }

        const transcript = await aiService.transcribeAudio(req.file.path);

        // Delete temp file
        fs.unlinkSync(req.file.path);

        res.json({ transcript });

    } catch (error) {
        console.error("Transcription Error:", error);
        // Clean up even on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

export default router;
