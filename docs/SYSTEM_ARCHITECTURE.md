# SYSTEM_ARCHITECTURE.md

> Arquitectura técnica detallada. Actualizar ante cambios de infraestructura o flujos.
> Última actualización: 2026-06-09

---

## Frontend — Web Pública (`web/`)

**Puerto:** 5174 | **Framework:** React 19 + Vite 7

### Estructura de rutas (React Router v7)
```
/                   → Home.jsx         (portada Panorama)
/article/:slug      → Article.jsx      (artículo individual)
/category/:slug     → Home.jsx         (portada filtrada por categoría)
*                   → 404 inline
```

### Componentes activos
```
web/src/
├── App.jsx               # Router root, SearchOverlay, Pixel.init()
├── panorama.css          # Design system tokens (colores, tipografía, layout)
├── components/
│   ├── Header.jsx/css    # Utility bar + masthead (logo Panorama)
│   ├── NavBar.jsx/css    # Nav sticky con categorías de DB (max 8)
│   ├── Ticker.jsx/css    # Banda de últimas noticias (scroll animado)
│   ├── Footer.jsx/css    # Footer 5 columnas
│   ├── AdSpot.jsx        # Contenedor de anuncios (llama SmartAdBanner)
│   ├── SmartAdBanner.jsx # Sirve anuncios desde /ads/serve
│   ├── CommentsSection   # Comentarios en artículos
│   ├── Newsletter.jsx    # Form de suscripción
│   └── LatestNewsWidget  # Widget de últimas noticias en sidebar
├── pages/
│   ├── Home.jsx/css      # Portada completa (diseño Panorama)
│   └── Article.jsx       # Página de artículo con sidebar de anuncios
├── context/
│   └── SettingsContext   # Carga settings del sitio (título, favicon)
├── hooks/
│   └── useArticleTracking.js  # Tracking de lectura (scroll, heartbeat)
└── utils/
    └── pixel.js          # PixelService singleton (tracking de audiencia)
```

### Flujo de datos Web
```
Usuario → NavBar (carga categorías) → Home (carga artículos) → Article
    └→ Pixel.track(page_view) en cada navegación
    └→ SmartAdBanner → GET /ads/serve?position=...&visitor_id=...
```

---

## Frontend — CMS Admin (`cms/`)

**Puerto:** 5173 | **Framework:** React 19 + Vite 7

### Rutas CMS
```
/login                          → Login.jsx
/dashboard                      → Dashboard.jsx (stats generales)
/dashboard/article/:id          → ArticleAnalytics.jsx
/posts                          → Posts.jsx (listado)
/posts/new                      → PostEditor.jsx (crear)
/posts/:slug                    → PostEditor.jsx (editar)
/posts/preview/:slug            → ArticlePreview.jsx
/media                          → Media.jsx (biblioteca de archivos)
/comments                       → Comments.jsx (moderación)
/categories                     → Categories.jsx
/reels                          → Reels.jsx
/editorial-studio               → EditorialStudio.jsx (IA asistida)
/ads                            → AdsDashboardV2.jsx (default)
/ads/campaign/:id               → AdCampaignDetail.jsx
/ads/legacy                     → AdsList.jsx
/ads/dashboard                  → AdsDashboard.jsx (v1 legacy)
/ads/campaigns/:id              → CampaignDetails.jsx
/subscribers                    → Subscribers.jsx
/users                          → Users.jsx
/users/:id                      → UserEditor.jsx
/users/:id/performance          → UserPerformance.jsx
/settings                       → Settings.jsx
```

### Editor enriquecido (`cms/src/editor/`)
TipTap con extensiones custom:
- `ImageExtension.js` / `ImageNode.jsx` — Upload y resize de imágenes
- `VideoExtension.js` / `VideoNode.jsx` — Embeds de video
- `IframeExtension.js` / `IframeNode.jsx` — Iframes embebidos
- `HtmlExtension.js` / `HtmlNode.jsx` — Bloques HTML raw
- `Toolbar.jsx` — Barra de herramientas completa

---

## Backend — API (`src/`)

**Puerto:** 5000 | **Framework:** Express 5

### Árbol de archivos clave
```
src/
├── server.js          # Entrypoint: crea app, abre puerto 5000
├── app.js             # Factory: registra todos los routers + middleware
├── worker.js          # Proceso separado: cron jobs
├── routes/
│   ├── db.js          # Pool pg compartido — siempre importar de aquí
│   ├── _util.js       # Helpers de rutas
│   ├── articles.js    # Artículos CRUD + búsqueda
│   ├── auth.js        # Login / Register
│   ├── categories.js  # Categorías CRUD
│   ├── users.js       # Usuarios + performance + heartbeat
│   ├── comments.js    # Comentarios + moderación
│   ├── media.js       # Upload + carpetas + Pexels
│   ├── analytics.js   # v1: track simple
│   ├── analytics_v2.js # v2: insights editoriales profundos
│   ├── ads.js         # Legacy: ads básicos + dashboard KPIs
│   ├── ads_v2.js      # Actual: smart serving + management
│   ├── pixel.js       # Tracking de visitantes (pixel.js + /events)
│   ├── settings.js    # Key-value settings del sitio
│   ├── stats.js       # Stats globales (admin)
│   ├── subscribers.js # Newsletter: suscribir + listar
│   ├── marketing.js   # Alternativa de suscripción
│   ├── reels.js       # Reels CRUD + settings
│   ├── products.js    # Productos (e-commerce ligero)
│   ├── ai.js          # Analyze + Rewrite (wraps AiService)
│   ├── editorial-studio.js # Create-draft, reformulate, structure, audio
│   └── health.js      # GET /health
├── middleware/
│   ├── auth.js        # requireAuth: valida JWT Bearer
│   ├── roles.js       # requireRole(...roles): verifica role en JWT
│   └── error.js       # notFound + errorHandler globales
├── services/
│   └── AiService.js   # Wrapper Anthropic + OpenAI
├── jobs/
│   └── calculateAdRevenue.js  # Calcula revenue CPM/CPC/FIXED por período
└── migration/
    ├── 001_init.js
    └── 002_add_user_profile.js
```

### Convenciones de rutas
- **Sin prefijo `/api`** — las rutas se montan directo: `/articles`, `/auth`, etc.
- **Uploads estáticos:** `GET /uploads/:filename` sirve archivos desde `./uploads/`
- **Duplicación ads:** `/ads` está montado dos veces — ads.js (legacy) y ads_v2.js (actual). `/ads/serve` y `/ads/manage/*` son de v2.

---

## Base de Datos

**PostgreSQL 15** via Docker. Pool compartido en `src/routes/db.js`.

### Diagrama de relaciones
```
users ──────────────────────────────────── articles
  │                                           │
  │                            article_categories ──── categories
  │                                           │
  │                                    article_seo
  │                                    article_stats
  │                                    comments
  │
user_activity                         events (analytics v1)
                                       pixel_events (analytics v2)
                                       visitor_profiles

advertisers ── campaigns ── ads ── ad_events
                                └─ ad_revenue
                                └─ ad_slots

settings (key-value)
subscribers
media (folders)
reels + reel_settings
products
```

---

## Flujos de Comunicación

### Flujo de publicación de artículo
```
CMS PostEditor → POST /articles (crear draft)
             → PUT /articles/:slug (editar)
             → PATCH /articles/:slug/status {published}
             → Web Home.jsx carga el artículo nuevo
```

### Flujo de serving de anuncios (Smart)
```
Web SmartAdBanner
  → GET /ads/serve?position=X&visitor_id=Y
  → ads_v2.js: query pixel_events de ese visitor
  → Extrae category_affinity de historial
  → Busca campaigns cuyas tags matcheen intereses
  → Si no match → campaña de mayor prioridad
  → Registra impresión en ad_events
  → Devuelve { banner_url, target_url, campaign_id }
```

### Flujo de tracking de audiencia
```
Web Article.jsx + useArticleTracking
  → Pixel.track('page_view')
  → Pixel.startHeartbeat(articleId)  → track 'time_on_content' cada 20s
  → Pixel.initScrollTracking()       → track 'scroll_depth' en 25/50/75/100%
  → Pixel.initExitIntent()           → track 'exit_intent'
  → POST /pixel/events
  → pixel.js guarda en pixel_events
  → visitor_profiles actualiza category_affinity
```

### Flujo de AI editorial
```
CMS EditorialStudio / PostEditor
  → POST /ai/analyze    → AiService.analyzeArticle()  → Claude claude-sonnet-4-5
  → POST /ai/rewrite    → AiService.rewriteArticle()  → Claude
  → POST /editorial-studio/create-draft   → Claude
  → POST /editorial-studio/reformulate    → Claude
  → POST /editorial-studio/transcribe     → OpenAI Whisper (multipart audio)
  → POST /editorial-studio/from-audio     → Whisper → Claude (draft desde audio)
```

---

## Infraestructura

### Docker
```yaml
# docker-compose.yml
postgres:15-alpine
  POSTGRES_DB: newsdb
  host_port: 5435 → container_port: 5432
  volume: postgres_data (persistente)
```

### Variables de entorno
```
PORT=5000
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/newsdb
JWT_SECRET=<64 chars>
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-svcacct-...
```

Frontends usan `VITE_API_BASE` en su propio `.env` (default `http://localhost:5000`).

### Static files
- `uploads/` sirve archivos subidos (imágenes, videos) via Express static
- CORS headers `Cross-Origin-Resource-Policy: cross-origin` en `/uploads`
