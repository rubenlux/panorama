import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mediaRouter from "./routes/media.js";
import aiRoutes from "./routes/ai.js";
import editorialStudioRoutes from "./routes/editorial-studio.js";
import morgan from "morgan";
import commentsRoutes from "./routes/comments.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import articlesRoutes from "./routes/articles.js";
import categoriesRoutes from "./routes/categories.js";
import usersRoutes from "./routes/users.js";
import statsRoutes from "./routes/stats.js";
import analyticsRoutes from "./routes/analytics.js";
import subscribersRoutes from "./routes/subscribers.js";
import adsRoutes from "./routes/ads.js";
import pixelRoutes from "./routes/pixel.js";
import marketingRouter from "./routes/marketing.js";
import analyticsV2Routes from "./routes/analytics_v2.js";
import settingsRouter from "./routes/settings.js";
import adsV2Routes from "./routes/ads_v2.js";
import reelsRoutes from "./routes/reels.js";
import productRoutes from "./routes/products.js";
import researchRoutes from "./routes/research.js";
import knowledgeRoutes from "./routes/knowledge.js";
import monitorRoutes   from "./routes/monitor.js";
import editorialWorkflowRoutes from "./routes/editorial_workflow.js";
import topicsRoutes from "./routes/topics.js";
import trendsRoutes from "./routes/trends.js";
import storiesRoutes from "./routes/stories.js";
import eventsRoutes from "./routes/events.js";
import opportunitiesRoutes from "./routes/opportunities.js";
import socialRoutes from "./routes/social.js";
import marketsRoutes from "./routes/markets.js";
import editorialDossiersRoutes from "./routes/editorial-dossiers.js";
import coverageRoutes from "./routes/coverage.js";
import editorialGraphRoutes    from "./routes/editorial-graph.js";
import contactRoutes from "./routes/contact.js";
import { errorHandler, notFound } from "./middleware/error.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Safe absolute path to uploads (one level up from src)
  const uploadsPath = path.join(__dirname, "../uploads");
  console.log(">> SERVER STATIC UPLOADS PATH:", uploadsPath);

  app.use(helmet({
    crossOriginResourcePolicy: false, // Disable default restrictive policy
  }));
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json({ limit: "50mb" }));
  app.use(morgan("dev"));

  app.use("/health", healthRoutes);
  app.use("/media", mediaRouter);
  app.use("/auth", authRoutes);
  app.use("/articles", articlesRoutes);
  app.use("/categories", categoriesRoutes);
  app.use("/users", usersRoutes);
  app.use("/stats", statsRoutes);
  app.use("/analytics", analyticsRoutes);
  app.use("/subscribers", subscribersRoutes);
  app.use("/ads", adsRoutes);
  app.use("/pixel", pixelRoutes);
  app.use("/analytics/v2", analyticsV2Routes);
  app.use("/marketing", marketingRouter);
  app.use("/settings", settingsRouter);
  app.use("/ads", adsV2Routes);
  app.use("/reels", reelsRoutes);
  app.use("/products", productRoutes);
  app.use("/ai", aiRoutes);
  app.use("/editorial-studio", editorialStudioRoutes);
  app.use("/research", researchRoutes);
  app.use("/knowledge", knowledgeRoutes);
  app.use("/monitor",   monitorRoutes);
  app.use("/editorial-workflow", editorialWorkflowRoutes);
  app.use("/topics", topicsRoutes);
  app.use("/trends", trendsRoutes);
  app.use("/stories", storiesRoutes);
  app.use("/events", eventsRoutes);
  app.use("/opportunities", opportunitiesRoutes);
  app.use("/social", socialRoutes);
  app.use("/markets", marketsRoutes);
  app.use("/editorial-dossiers", editorialDossiersRoutes);
  app.use("/coverage",           coverageRoutes);
  app.use("/editorial",         editorialGraphRoutes);
  app.use("/contact",           contactRoutes);

  app.use(commentsRoutes);

  // Debug middleware & CORS for uploads
  app.use("/uploads", (req, res, next) => {
    // Force cross-origin policy for images
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    res.header("Access-Control-Allow-Origin", "*"); // Extra safety for static

    // Debug 404s
    const requestFile = req.path.substring(1); // "foo.jpg"
    const diskPath = path.join(uploadsPath, requestFile);

    if (!fs.existsSync(diskPath) && req.path !== "/") {
      console.warn(`>> 404 WARNING: Request for ${req.path} but file not found at ${diskPath}`);
    }
    next();
  });

  app.use("/uploads", express.static(uploadsPath));
  // app.use("/media", mediaRouter); // Moved up
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
