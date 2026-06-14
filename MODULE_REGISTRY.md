# MODULE_REGISTRY.md — INSPYRA NEWS AUTONOMOUS EDITORIAL PLATFORM

One-line description of every non-trivial module. Use this to find where a feature lives before grepping.

---

## Backend — `src/`

### Entry
| File | Role |
|---|---|
| `src/server.js` | HTTP server bootstrap, listens on `PORT` |
| `src/app.js` | Express app factory; mounts all routes |
| `src/worker.js` | Background job runner (separate process) |

### Routes — `src/routes/`
| File | Mount | Notes |
|---|---|---|
| `articles.js` | `/articles` | CRUD for published articles |
| `auth.js` | `/auth` | JWT login/register |
| `ai.js` | `/ai` | Direct AI prompts (wraps AiService) |
| `editorial-studio.js` | `/editorial-studio` | AI-assisted article generation |
| `editorial_workflow.js` | `/editorial-workflow` | Dossier C1→C2→C3 pipeline |
| `research.js` | `/research` | Research pipeline + entity extraction |
| `knowledge.js` | `/knowledge` | Knowledge base CRUD |
| `monitor.js` | `/monitor` | RSS monitor stats, sources, articles, trending |
| `trends.js` | `/trends` | Trend cluster API (Sprint 5.3) |
| `social.js` | `/social` | Social Intelligence API + Diagnostic (Fase 4) |
| `topics.js` | `/topics` | Editorial topics |
| `analytics.js` | `/analytics` | v1 analytics |
| `analytics_v2.js` | `/analytics/v2` | Pixel-based campaign analytics |
| `ads.js` | `/ads` | Legacy ads |
| `ads_v2.js` | `/ads` | Current — intelligent ad serving from pixel profiles |
| `pixel.js` | `/pixel` | Tracking pixel endpoint |

### Services — `src/services/`
| File | Exports | Notes |
|---|---|---|
| `AiService.js` | `class AiService` | Single entry point for all Claude calls. Methods: `generateResearchBrief`, `extractEntities`, `generateTrendSummary`, `generateDossier`, and others |
| `ArticleFetcher.js` | `fetchArticleContent`, `getCacheStats` | Fetches + extracts full article HTML; 72h cache in `article_content_cache` |

### Jobs — `src/jobs/`
| File | Entry | Notes |
|---|---|---|
| `newsMonitor.js` | `runNewsMonitor()` | Main RSS polling job. Runs every N seconds. Pipelines: processSource → matchResearchEntities + discoverMonitorEntities → refreshTrendingTopics → upsertTrendCluster → summarizePendingClusters |

### Connectors — `src/connectors/`
| File | Exports | Notes |
|---|---|---|
| `index.js` | `investigate(title, connectors, opts)` | Orchestrates research connectors |
| `rss.js` | RSS connector | Scores relevance; uses `tracked_sources` from DB |

### Middleware — `src/middleware/`
| File | Exports |
|---|---|
| `auth.js` | `requireAuth` (named export — NOT default) |
| `roles.js` | `requireRole(role)` |
| `error.js` | `errorHandler`, `notFound` |

### Database
| File | Exports |
|---|---|
| `src/routes/db.js` | `{ query, pool }` — **always import from here**, never create a new pool |

---

## Frontend — `cms/src/`

### Core
| File | Role |
|---|---|
| `api.js` | All API calls. Exports: `apiJson`, `apiUpload`, `uploadFile`, trend helpers (`getTrends`, `getTrend`, `getTrendArticles`, `followTrend`, `createDossierFromTrend`) |
| `App.jsx` | Router root with `RequireAuth` wrapper |

### Pages — `cms/src/pages/`
| File | Route | Notes |
|---|---|---|
| `MediaMonitor.jsx` | `/monitor` | RSS feed, trending clusters, opportunities, sources |
| `TrendDetail.jsx` | `/trends/:id` | Cluster detail — headline, summary, angles, article timeline |
| `ResearchCenter.jsx` | `/research` | Research pipeline UI |
| `KnowledgeBase.jsx` | `/knowledge` | Entity browser |
| `EntityDetail.jsx` | `/knowledge/entities/:id` | Entity profile |
| `EditorialStudio.jsx` | `/editorial-studio` | AI article generation |
| `Dossiers.jsx` | `/dossiers` | Dossier list |
| `DossierDetail.jsx` | `/dossiers/:id` | Dossier C1→C3 workflow |
| `Topics.jsx` | `/topics` | Story topics |
| `TopicDetail.jsx` | `/topics/:id` | Topic detail |

### Editor — `cms/src/editor/`
Custom TipTap extensions: rich text, code blocks, image upload.

### Layout — `cms/src/layout/`
`AdminLayout.jsx` — sidebar + header shell wrapping all authenticated pages.

---

## Frontend — `web/src/`

Public-facing site. Same `src/api.js` + `src/App.jsx` + `src/pages/` pattern as CMS.

---

## Scripts — `scripts/`

DB migration scripts. Run with `node scripts/<name>.js` from repo root (requires `.env`).
