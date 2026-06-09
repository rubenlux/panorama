# MODULE_REGISTRY.md

> Inventario completo de módulos. Actualizar cuando se agregue, elimine o cambie un módulo.
> Última actualización: 2026-06-09 (Sprint 3)

---

## MÓDULO 01 — Artículos

**Estado:** Activo | **Ubicación:** `src/routes/articles.js`

**Propósito:** CRUD completo de artículos con estados, búsqueda full-text, y metadatos SEO.

**Endpoints:**
- `GET /articles` — Listar (con filtros: status, category, search, limit, offset)
- `GET /articles/stats` — Stats agregadas
- `GET /articles/:slug` — Obtener artículo por slug (incluye categorías, autor, SEO)
- `POST /articles` — Crear artículo (auth: admin/editor/author)
- `PUT /articles/:slug` — Editar artículo completo
- `PATCH /articles/:slug` — Actualizar campos parciales (ej: status)
- `DELETE /articles/:slug` — Eliminar (auth: admin)

**Tablas:** `articles`, `article_categories`, `article_seo`, `article_stats`

**Dependencias:** `db.js`, `auth.js`, `roles.js`

---

## MÓDULO 02 — Autenticación

**Estado:** Activo | **Ubicación:** `src/routes/auth.js`

**Propósito:** Login y registro de usuarios CMS. JWT sin refresh token.

**Endpoints:**
- `POST /auth/register` — Crear cuenta (¿abierto? revisar si tiene restricción de rol)
- `POST /auth/login` — Login → devuelve JWT con `{ sub, role, email }`

**Tablas:** `users`

**Dependencias:** `bcryptjs`, `jsonwebtoken`, `db.js`

**Nota:** JWT se almacena en `localStorage` del CMS (`cms_token`). Deuda de seguridad conocida.

---

## MÓDULO 03 — Categorías

**Estado:** Activo | **Ubicación:** `src/routes/categories.js`

**Propósito:** Taxonomía de secciones. Controla el menú de navegación del sitio público.

**Endpoints:**
- `GET /categories` — Listar todas (incluye `show_in_menu`, `color`, `is_tag`)
- `POST /categories` — Crear (auth: admin/editor)
- `PUT /categories/:id` — Editar
- `DELETE /categories/:id` — Eliminar

**Tablas:** `categories`, `article_categories`

**Dependencias:** `db.js`, `auth.js`, `roles.js`

---

## MÓDULO 04 — Usuarios

**Estado:** Activo | **Ubicación:** `src/routes/users.js`

**Propósito:** Gestión de usuarios CMS, perfiles de autores, tracking de actividad editorial.

**Endpoints:**
- `POST /users/activity/heartbeat` — Registra actividad en tiempo real
- `GET /users/performance/stats` — Métricas de rendimiento por usuario (auth: admin/editor)
- `GET /users/performance/export` — Export CSV de performance (auth: admin/editor)
- `GET /users` — Listar usuarios (auth: admin/editor)
- `POST /users` — Crear usuario (auth: admin)
- `GET /users/:id` — Obtener usuario
- `PATCH /users/:id` — Editar usuario
- `DELETE /users/:id` — Eliminar (auth: admin)

**Tablas:** `users`, `user_activity`

**Dependencias:** `db.js`, `auth.js`, `roles.js`, `bcryptjs`

---

## MÓDULO 05 — Comentarios

**Estado:** Activo | **Ubicación:** `src/routes/comments.js`

**Propósito:** Sistema de comentarios públicos con moderación editorial.

**Endpoints:**
- `GET /articles/:slug/comments` — Comentarios aprobados de un artículo
- `POST /articles/:slug/comments` — Publicar comentario (requiere nombre + email)
- `GET /comments` — Todos los comentarios (auth: admin/editor)
- `PATCH /comments/:id` — Moderar (status: pending/approved/rejected)
- `DELETE /comments/:id` — Eliminar

**Tablas:** `comments`

**Dependencias:** `db.js`, `auth.js`, `roles.js`

---

## MÓDULO 06 — Media

**Estado:** Activo | **Ubicación:** `src/routes/media.js`

**Propósito:** Biblioteca de archivos. Upload local + integración Pexels para imágenes stock.

**Endpoints:**
- `GET /media/folders` — Listar carpetas (auth)
- `POST /media/folders` — Crear carpeta (auth: admin/editor)
- `DELETE /media/folders/:id` — Eliminar carpeta
- `GET /media` — Listar archivos (auth: admin/editor)
- `POST /media` — Subir archivo (multipart, auth: admin/editor)
- `DELETE /media/:id` — Eliminar archivo
- `GET /media/pexels/search` — Buscar fotos en Pexels (auth)
- `POST /media/pexels/upload` — Importar foto de Pexels → local (auth: admin/editor)

**Tablas:** `media`, `folders`

**Dependencias:** `multer`, `db.js`, `auth.js`, `roles.js`, Pexels API key (hardcoded — deuda técnica)

**Archivos físicos:** `./uploads/` (servidos como static en `/uploads`)

---

## MÓDULO 07 — Publicidad v2 (Sistema Inteligente)

**Estado:** Activo (producción) | **Ubicación:** `src/routes/ads_v2.js`

**Propósito:** Serving inteligente de anuncios con perfilado de audiencia. Targeting por intereses del visitante.

**Endpoints:**
- `GET /ads/serve?position=X&visitor_id=Y` — Sirve el anuncio más relevante para ese visitante en esa posición
- `GET /ads/manage/advertisers` — CRUD anunciantes (auth: admin)
- `POST /ads/manage/advertisers`
- `GET /ads/manage/campaigns` — CRUD campañas
- `POST /ads/manage/campaigns`
- `PUT /ads/manage/campaigns/:id`
- `DELETE /ads/manage/campaigns/:id`

**Tablas:** `campaigns`, `advertisers`, `ad_events`, `visitor_profiles`, `pixel_events`

**Lógica de targeting:**
1. Lee historial `pixel_events` del `visitor_id`
2. Extrae categorías de interés (las más frecuentes)
3. Busca campañas activas cuyas `tags` intersecten con esos intereses
4. Fallback: campaña de mayor prioridad en esa posición
5. Registra impresión en `ad_events`

**Posiciones disponibles:** `home_top`, `article_sidebar`, `article_bottom`, `header_top`, `article_hero`, `article_top_banner`, `article_sidebar_top`, `article_sticky`, `article_sidebar_bottom_1`, `article_sidebar_bottom_2`, `home_sponsors`, `home_latest_sidebar`, `footer_top_horizontal`

---

## MÓDULO 08 — Publicidad Legacy (ads.js)

**Estado:** Legacy (mantener para KPIs/reportes) | **Ubicación:** `src/routes/ads.js`

**Propósito:** Sistema de anuncios básico anterior. Mantiene dashboard de KPIs y reportes.

**Endpoints clave:**
- `GET /ads/active` — Ads activos (público)
- `POST /ads/:id/impression` / `POST /ads/:id/click` — Tracking
- `GET /ads/admin/kpis` / `GET /ads/admin/chart` — KPIs dashboard (auth: admin)
- `GET /ads/admin/campaigns/:id/stats` — Stats de campaña
- `GET /ads/admin/campaigns/:id/export` — Export CSV

**Tablas:** `ads`, `ad_events`, `campaigns`, `advertisers`, `ad_slots`

---

## MÓDULO 09 — Pixel / Tracking de Audiencia

**Estado:** Activo | **Ubicación:** `src/routes/pixel.js`

**Propósito:** Sistema de tracking first-party. Recopila comportamiento de visitantes para analytics y targeting de ads.

**Endpoints:**
- `GET /pixel/pixel.js` — Sirve el script de tracking client-side
- `POST /pixel/events` — Recibe batch de eventos del browser

**Eventos capturados:** `page_view`, `time_on_content`, `scroll_depth`, `exit_intent`, `content_loaded`, `internal_link_click`

**Tablas:** `pixel_events`, `visitor_profiles`

**Frontend:** `web/src/utils/pixel.js` — `PixelService` singleton con gestión de identidad (visitor_id en localStorage, session_id en sessionStorage, TTL 30min)

---

## MÓDULO 10 — Analytics v2 (Editorial Intelligence)

**Estado:** Activo | **Ubicación:** `src/routes/analytics_v2.js`

**Propósito:** Insights editoriales avanzados para el dashboard del CMS.

**Endpoints (todos montados bajo `/analytics/v2`):**
- `GET /editorial/overview` — Métricas globales
- `GET /editorial/realtime` — Lectores activos en tiempo real
- `GET /editorial/insights/authors` — Rendimiento por autor
- `GET /editorial/insights/categories` — Rendimiento por categoría
- `GET /editorial/insights/traffic` — Fuentes de tráfico
- `GET /editorial/insights/history` — Histórico de pageviews
- `GET /editorial/insights/geo` — Distribución geográfica
- `GET /editorial/insights/journey` — Recorridos de usuario
- `GET /editorial/insights/flow` — Flujo de navegación
- `GET /editorial/insights/engagement` — Métricas de engagement
- `GET /editorial/article/:id` — Analytics de artículo individual
- `GET /editorial/ads/campaign/:id` — Analytics de campaña publicitaria

**Tablas:** `pixel_events`, `visitor_profiles`, `articles`, `users`, `campaigns`, `ad_events`

---

## MÓDULO 11 — AI Core

**Estado:** Activo | **Ubicación:** `src/services/AiService.js`, `src/routes/ai.js`, `src/routes/editorial-studio.js`

**Propósito:** Asistencia IA para redacción editorial. Único punto de entrada a modelos de IA.

**AiService métodos:**
- `analyzeArticle(article)` — Análisis completo (SEO, legibilidad, sugerencias) → Claude
- `rewriteArticle(article, instructions)` — Reescritura con instrucciones → Claude
- `createDraft(prompt)` — Genera borrador desde titular → Claude
- `reformulate(text, style)` — Reformula fragmento → Claude
- `structureData(text)` — Extrae datos estructurados → Claude
- `transcribeAudio(filePath)` — Transcripción → OpenAI Whisper
- `createDraftFromAudio(transcript)` — Borrador desde transcripción → Claude

**Modelo Claude:** `claude-sonnet-4-5-20250929`

**Endpoints:**
- `POST /ai/analyze` — Analiza artículo (auth)
- `POST /ai/rewrite` — Reescribe (auth)
- `POST /editorial-studio/create-draft` (auth)
- `POST /editorial-studio/reformulate` (auth)
- `POST /editorial-studio/structure-data` (auth)
- `POST /editorial-studio/from-audio` (auth)
- `POST /editorial-studio/transcribe` — multipart audio (auth)

---

## MÓDULO 12 — Reels

**Estado:** Activo | **Ubicación:** `src/routes/reels.js`

**Propósito:** Videos cortos estilo Stories/Reels. Plataformas: Instagram, YouTube, TikTok.

**Endpoints:**
- `GET /reels/settings` — Configuración visual (color de fondo)
- `PUT /reels/settings` — Actualizar config (auth: admin/editor)
- `GET /reels` — Listar reels activos (público)
- `GET /reels/admin/list` — Listado admin (auth: admin/editor)
- `POST /reels` — Crear reel (auth: admin/editor)
- `PUT /reels/:id` — Editar
- `DELETE /reels/:id` — Eliminar (auth: admin)

**Tablas:** `reels`, `reel_settings`

---

## MÓDULO 13 — Configuración del Sitio

**Estado:** Activo | **Ubicación:** `src/routes/settings.js`

**Propósito:** Key-value store para configuración global del sitio (título, favicon, etc.)

**Endpoints:**
- `GET /settings` — Obtener todos los settings (público)
- `POST /settings/batch` — Actualizar múltiples settings (auth: admin)

**Tablas:** `settings`

**Uso en frontend:** `web/src/context/SettingsContext.jsx` carga settings al iniciar y aplica favicon + título dinámicamente.

---

## MÓDULO 14 — Suscriptores / Newsletter

**Estado:** Activo | **Ubicación:** `src/routes/subscribers.js`, `src/routes/marketing.js`

**Propósito:** Captura de emails para newsletter.

**Endpoints:**
- `POST /subscribers` — Suscribirse (público)
- `GET /subscribers` — Listar (auth: admin)
- `POST /marketing/subscribe` — Alternativa de suscripción
- `GET /marketing/subscribers` — Listar (auth: admin/editor)

**Tablas:** `subscribers`

---

## MÓDULO 15 — Productos

**Estado:** Activo (uso limitado) | **Ubicación:** `src/routes/products.js`

**Propósito:** E-commerce ligero para promocionar productos en el sitio.

**Endpoints:**
- `GET /products` — Listar productos activos (público)
- `POST /products` — Crear (auth: admin)
- `DELETE /products/:id` — Eliminar (auth: admin)

**Tablas:** `products`

---

## MÓDULO 16 — Knowledge Base (Sprint 2)

**Estado:** Activo | **Ubicación:** `src/routes/knowledge.js`, `cms/src/pages/KnowledgeBase.jsx`, `cms/src/pages/EntityDetail.jsx`

**Propósito:** Base de conocimiento acumulativa. Entidades nombradas (personas, empresas, productos, organizaciones, lugares) extraídas automáticamente de cada investigación con Claude. Permite responder: "¿Qué investigaciones mencionaron a OpenAI?" o "¿Cuáles son los eventos más recientes de Milei?".

**Flujo de extracción:**
1. `_runPipeline()` en `research.js` llama a `AiService.extractEntities()` después de generar el brief
2. Las entidades se upsert en `knowledge_entities` (incrementa `mention_count` si ya existe)
3. Se registra una `entity_mention` para vincular entidad → investigación
4. Los eventos clave se guardan en `knowledge_events`

**Endpoints:**
- `GET /knowledge/entities` — Listar entidades (filtros: `?type=&search=&limit=&offset=`) (auth)
- `GET /knowledge/entities/:id` — Detalle de entidad con topics + events (auth)
- `GET /knowledge/stats` — Contadores globales para widget dashboard (auth)

**Tablas:** `knowledge_entities`, `entity_mentions`, `knowledge_events`

**Dependencias:** `AiService.extractEntities()`, `research_topics`, `research_sources`

**UI CMS:**
- `KnowledgeBase.jsx` — Grid de entidades filtrable por tipo con stats globales
- `EntityDetail.jsx` — Perfil de entidad con timeline de eventos e investigaciones vinculadas
- `ResearchCenter.jsx` — Sección "Entidades detectadas" con badges clickeables post-brief

---

## MÓDULO 17 — News Intelligence Engine (Sprint 3)

**Estado:** Activo | **Ubicación:** `src/jobs/newsMonitor.js`, `src/routes/monitor.js`, `cms/src/pages/MediaMonitor.jsx`

**Propósito:** Monitoreo proactivo de medios de comunicación. Detecta artículos nuevos vía RSS, los matchea contra entidades del Knowledge Base usando comparación string, calcula tendencias en ventana de 30 minutos y crea automáticamente `research_topics` cuando una entidad supera los umbrales de trending.

**Pipeline (cada 60s):**
1. `processSource(source)` — Fetch RSS, parse items, INSERT artículos nuevos deduplicados por hash SHA-256
2. `matchEntities(newIds)` — Carga `knowledge_entities` (más largas primero), busca en título de cada artículo nuevo
3. `refreshTrendingTopics()` — Cuenta menciones/fuentes en ventana 30min, upsert en `trending_topics`
4. `checkAutoResearchTriggers()` — Si entidad ≥5 menciones de ≥3 fuentes, crea `research_topic` como `pending`

**Constantes de umbral:**
- `TRENDING_WINDOW_MIN=30` — ventana sliding en minutos
- `AUTO_RESEARCH_MENTIONS=5` — menciones mínimas para auto-trigger
- `AUTO_RESEARCH_SOURCES=3` — fuentes distintas mínimas
- `AUTO_RESEARCH_COOLDOWN=120` — minutos de cooldown para evitar spam

**Endpoints API (`/monitor/*`, todos con `requireAuth`):**
- `GET /monitor/stats` — 5 contadores (sources_active, sources_total, articles_today, trending_now, opportunities)
- `GET /monitor/sources` — Listado con `seconds_since_check`
- `POST /monitor/sources` — Agregar fuente
- `PUT /monitor/sources/:id` — Actualización parcial con COALESCE
- `DELETE /monitor/sources/:id` — Eliminar fuente
- `GET /monitor/articles` — Feed con `?hours=&source_id=&entity_id=&limit=` + entities[] como json_agg
- `GET /monitor/trending` — Tendencias con `?min_mentions=&min_sources=`, ventana 6h
- `POST /monitor/research` — Crea research_topic desde una tendencia, marca como auto_researched

**Tablas:** `tracked_sources`, `monitored_articles`, `article_entity_matches`, `trending_topics`

**UI CMS (`MediaMonitor.jsx`):**
- Tab **Feed** — artículos recientes con entity badges, auto-refresh 30s
- Tab **Tendencias** — entidades trending con mention_count, botón "Investigar" → `POST /monitor/research`
- Tab **Oportunidades** — filtro: source_count ≥ 3 AND mention_count ≥ 5, resaltadas con borde rojo
- Tab **Fuentes** — gestión de tracked_sources: toggle enable/disable, add form, delete

**Notas importantes:**
- El matching es string-based (gratis, sin IA) — solo funciona si la entidad ya existe en `knowledge_entities`
- Las entidades se crean en la KB cuando se investiga un topic (pipeline de Sprint 2)
- El engine es proactivo pero NO publica artículos ni postea en redes automáticamente

---

## MÓDULO 18 — Worker de Background

**Estado:** Activo | **Ubicación:** `src/worker.js`, `src/jobs/calculateAdRevenue.js`, `src/jobs/newsMonitor.js`

**Propósito:** Proceso separado con cron jobs. Orquesta tareas de background sin bloquear el servidor HTTP.

**Jobs activos:**
- `runNewsMonitor()` — ejecuta inmediatamente al iniciar y luego cada `* * * * *` (60s)
- `calculateAdRevenue()` — schedule `5 0 * * *` (00:05 AM todos los días)

**Lógica de revenue:** Agrega eventos del día anterior → calcula revenue por modelo CPM/CPC/FIXED → upsert en `ad_revenue`

**Comando:** `npm run worker` (proceso independiente, no parte del API server)
