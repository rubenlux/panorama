# MODULE_REGISTRY.md

> Inventario completo de módulos. Actualizar cuando se agregue, elimine o cambie un módulo.
> Última actualización: 2026-06-09 (Sprint 5)

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

## MÓDULO 19 — Editorial Workflow Engine (Sprint 4)

**Estado:** Activo | **Ubicación:** `src/routes/editorial_workflow.js`, `cms/src/pages/Dossiers.jsx`, `cms/src/pages/DossierDetail.jsx`

**Propósito:** Capa editorial entre el Research Center y la publicación. Transforma un brief de investigación en guías editoriales accionables (dossiers), permite generar múltiples enfoques periodísticos (Story Builder) y genera automáticamente artículos completos desde un enfoque seleccionado (Article Generator). Integra con PostEditor pre-llenando todos los campos.

**Pipeline:**
```
Research Topic (completed) → Dossier Editorial → Story Builder → Article Draft → PostEditor → Publicado
```

**Dossier Generation (async):**
1. `POST /editorial-workflow/dossiers` crea fila con `status='generating'`, retorna inmediatamente
2. Background: carga brief + entidades desde DB, llama `AiService.generateDossier()`
3. Actualiza dossier con `status='ready'` y todos los campos generados

**Article Draft Generation (sync):**
1. `POST /editorial-workflow/dossiers/:id/draft` con `{angle_index: N}`
2. Carga dossier + brief del topic, selecciona angle[N] de `suggested_angles`
3. Llama `AiService.generateArticleDraft(topicTitle, dossier, angle, briefText)`
4. Retorna el draft (NO crea el artículo en DB — lo crea PostEditor al guardar)
5. CMS navega a `/posts/new` con `location.state.prefilled = {volanta, title, excerpt, body, seo, origin:'dossier', dossier_id}`

**Endpoints (`/editorial-workflow/*`, todos con `requireAuth`):**
- `POST /dossiers` — crea dossier desde `topic_id` (debe estar completed con brief)
- `GET /dossiers` — lista con topic_title, status, drafts_count
- `GET /dossiers/:id` — detalle con dossier + list de articles generados
- `POST /dossiers/:id/draft` — genera artículo desde ángulo seleccionado
- `GET /metrics` — métricas de conversión por origen

**Origen del artículo (campo `articles.origin`):**
- `manual` — creado manualmente en PostEditor
- `research` — prefill básico desde Research Center
- `dossier` — generado por Article Generator desde un dossier

**AiService métodos nuevos:**
- `generateDossier(topicTitle, brief, entities)` — temp 0.3, max 3000 tokens
- `generateArticleDraft(topicTitle, dossier, angle, briefText)` — temp 0.4, max 4500 tokens

**Tablas:** `editorial_dossiers`, `articles` (columnas: origin, dossier_id)

**UI CMS:**
- `Dossiers.jsx` — lista con métricas (total, ready, arts. generados), modal de creación con selector de investigaciones completadas, auto-polling mientras genera
- `DossierDetail.jsx` — detalle completo: resumen, hechos, timeline, guía SEO, Story Builder (tarjetas por ángulo con botón "Generar artículo"), prompt de imagen hero

---

## MÓDULO 17 — News Intelligence Engine (Sprint 3 → 6.3)

**Estado:** Activo | **Ubicación:** `src/jobs/newsMonitor.js`, `src/routes/monitor.js`, `cms/src/pages/MediaMonitor.jsx`

**Propósito:** Monitoreo proactivo de medios. Detecta artículos vía RSS/Sitemap/Atom, extrae texto completo, matchea entidades, calcula tendencias, agrupa en historias y eventos, genera resúmenes y oportunidades con Claude, y registra la trazabilidad completa del contexto enviado a IA.

**Pipeline completo (cada 60s, `runNewsMonitor()`):**
1. `processSource(source)` — Fetch RSS/Atom/Sitemap, INSERT deduplicado por SHA-256
2. `fetchPendingArticleContent()` — Extrae texto completo (fetch→Playwright→rss_only), 20/ciclo con cola de prioridad
3. `matchResearchEntities()` — Match contra `knowledge_entities` origen RESEARCH
4. `discoverMonitorEntities()` — NER en títulos → upsert entidades MONITOR → trend clusters
5. `refreshTrendingTopics()` — Conteo menciones ventana 30min
6. `checkAutoResearchTriggers()` — ≥5 menciones de ≥3 fuentes → crea research_topic
7. `markStaleClusters()` / `summarizePendingClusters()` — Resúmenes de trend clusters
8. `detectStories(newIds)` — Jaccard sobre keywords de títulos (threshold 0.20), guarda trazabilidad completa
9. `markStaleStories()` — Stale tras 24h + stale huérfanas (article_count=0)
10. `summarizePendingStories()` — Claude solo si enrichment ≥70% y relevance ≥0.30
11. `generateOpportunitiesForStories()` — Claude genera oportunidades editoriales
12. `detectEvents(storyIds)` — Jaccard sobre entidades compartidas (threshold 0.35)
13. `markStaleEvents()` / `summarizePendingEvents()` — Resúmenes de eventos

**Constantes clave:**
- `STORY_MATCH_THRESHOLD=0.20` — Jaccard mínimo para asignar artículo a historia
- `ENRICHMENT_GATE_COVERAGE=0.70` — 70% de artículos con texto completo antes de IA
- `RELEVANCE_FILTER_THRESHOLD=0.30` — artículos bajo este score excluidos del contexto Claude
- `EVENT_ENTITY_THRESHOLD=0.35` — Jaccard de entidades para agrupar en evento

**Formatos de feed soportados:** RSS, Atom, Google News Sitemap (`<urlset xmlns:news>`), Sitemap Index (fetcha los 3 últimos child sitemaps, hasta 60 items), XML urlset genérico

**Trazabilidad (Sprint 6.3):** cada INSERT en `story_cluster_articles` guarda `matching_reason`, `shared_keywords`, `keyword_similarity` y `title_similarity`.

**Logging IA (Sprint 6.2):** antes de cada llamada Claude se inserta en `ai_generation_logs` el tipo, artículos enviados y palabras totales.

**Endpoints API (`/monitor/*`, todos con `requireAuth`):**
- `GET /monitor/stats` — contadores globales
- `GET /monitor/content-stats` — cobertura de extracción por fuente (`?days=7`)
- `GET /monitor/sources` — listado con `seconds_since_check`
- `POST /monitor/sources` — agregar fuente
- `PUT /monitor/sources/:id` — actualización parcial
- `DELETE /monitor/sources/:id` — eliminar
- `POST /monitor/sources/:id/verify` — verifica feed, detecta formato, actualiza trust_score
- `POST /monitor/sources/:id/approve` — aprobación editorial
- `GET /monitor/sources/:id/verifications` — historial de verificaciones
- `GET /monitor/articles` — feed con `?hours=&source_id=&entity_id=&limit=`
- `GET /monitor/trending` — tendencias con `?min_mentions=&min_sources=`
- `GET /monitor/clustering-audit` — stats globales + per-story + simulación thresholds 0.20–0.40 (`?hours=`)
- `GET /monitor/story/:id/explain` — trazabilidad completa de una historia *(Sprint 6.3)*
- `GET /monitor/clustering-outliers` — huérfanas, contaminadas, weak-link alto, score=0 *(Sprint 6.3)*
- `POST /monitor/research` — crea research_topic desde trending

**Tablas principales:** `tracked_sources`, `source_verifications`, `monitored_articles`, `article_entity_matches`, `trending_topics`, `trend_clusters`, `trend_cluster_articles`, `story_clusters`, `story_cluster_articles`, `story_entities`, `story_opportunities`, `event_clusters`, `event_cluster_stories`, `editorial_opportunities`, `ai_generation_logs`

**UI CMS (`MediaMonitor.jsx` — 5 tabs):**
- **Feed** — artículos recientes con entity badges, auto-refresh 30s
- **Historias** — story cards con badges enrichment, quality (🔴🟡🟢), context_score, panel diagnóstico para clusters contaminados
- **Eventos** — event cards con editorial_score y stories agrupadas
- **Oportunidades** — story_opportunities por composite_score
- **Tendencias** — trending entities con botón "Investigar"
- **Fuentes** — gestión tracked_sources con verify/approve, historial de verificaciones

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

## MÓDULO 19 — Editorial Workflow Engine *(Sprint 4)*

**Estado:** Activo | **Ubicación:** `src/routes/editorial_workflow.js`

**Propósito:** Pipeline Research → Dossier → Article. Transforma briefs de investigación en artículos listos para publicar con SEO prefillado.

**Endpoints:**
- `POST /editorial-workflow/dossiers` — crear dossier desde research topic (genera en background con Claude)
- `GET /editorial-workflow/dossiers` — listar con topic_title, status, drafts_count
- `GET /editorial-workflow/dossiers/:id` — detalle con story builder (suggested_angles)
- `POST /editorial-workflow/dossiers/:id/draft` — generar borrador de artículo para un ángulo (sync, retorna contenido sin crear en DB)
- `GET /editorial-workflow/metrics` — métricas de conversión por origin

**Tablas:** `editorial_dossiers`, `articles` (origin, dossier_id)
**IA:** `AiService.generateDossier()` (background) + `AiService.generateArticleDraft()` (sync)

---

## MÓDULO 20 — Topic Intelligence Engine *(Sprint 5)*

**Estado:** Activo | **Ubicación:** `src/routes/topics.js`

**Propósito:** Agrupa artículos, investigaciones, entidades y eventos bajo temas periodísticos. Soporta cobertura geográfica (nacional/regional/local) y hubs por región NEA.

**Endpoints:**
- `GET /topics` — listar con conteos, filtros por region/category/coverage_scope/search
- `GET /topics/trending` — ranking por volumen de artículos + velocidad de crecimiento (48h)
- `GET /topics/regions` — lista de hubs regionales con conteos
- `GET /topics/regions/:slug` — hub regional: topics + artículos recientes + entidades más mencionadas
- `GET /topics/:id` — detalle con artículos, investigaciones, entidades, timeline de eventos
- `POST /topics` — crear tema (auth)
- `PATCH /topics/:id` — editar tema (auth)
- `DELETE /topics/:id` — eliminar tema (auth)
- `POST /topics/:id/articles` — vincular artículo (auth)
- `DELETE /topics/:id/articles/:article_id` — desvincular (auth)
- `POST /topics/:id/research` — vincular investigación (auth)
- `POST /topics/:id/entities` — vincular entidad (auth)
- `POST /topics/:id/events` — vincular evento (auth)

**Tablas:** `topics`, `topic_articles`, `topic_research`, `topic_entities`, `topic_events`
**Columnas nuevas en `articles`:** `coverage_scope`, `region`

**UI CMS:**
- `cms/src/pages/Topics.jsx` — lista con métricas, filtros, tabs Todos/Trending, modal de creación
- `cms/src/pages/TopicDetail.jsx` — tabs Artículos/Investigaciones/Entidades/Timeline; vincular contenido desde el detalle
- `cms/src/pages/Regions.jsx` — grid de hubs regionales

**UI Web:**
- `web/src/pages/Topic.jsx` — página pública `/topic/:slug`
- `web/src/pages/Region.jsx` — hub regional `/region/:slug`

**Regiones soportadas:** argentina | nea | formosa | chaco | corrientes | misiones

**Preparado para (NO implementado):** pgvector embeddings, búsqueda semántica, knowledge graph

---

## MÓDULO 18 — Worker de Background

**Estado:** Activo | **Ubicación:** `src/worker.js`, `src/jobs/calculateAdRevenue.js`, `src/jobs/newsMonitor.js`

**Propósito:** Proceso separado con cron jobs. Orquesta tareas de background sin bloquear el servidor HTTP.

**Jobs activos:**
- `runNewsMonitor()` — ejecuta inmediatamente al iniciar y luego cada `* * * * *` (60s)
- `calculateAdRevenue()` — schedule `5 0 * * *` (00:05 AM todos los días)

**Lógica de revenue:** Agrega eventos del día anterior → calcula revenue por modelo CPM/CPC/FIXED → upsert en `ad_revenue`

**Comando:** `npm run worker` (proceso independiente, no parte del API server)
