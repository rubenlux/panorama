# ROADMAP.md

> Estado del producto y próximos pasos.
> Última actualización: 2026-06-10 (Sprint 7.0 completado)

---

## En Progreso

### Branch: `001-agente-cm-platform` → subido a `main` en [github.com/rubenlux/panorama](https://github.com/rubenlux/panorama)

- [x] Diseño Panorama implementado en Home (web frontend)
- [x] PKS (Project Knowledge System) creado en `/docs`
- [x] **Sprint 1 — Centro de Investigación AI** (tablas + backend + conectores RSS + UI CMS)
- [x] **Sprint 2 — Knowledge Base** (`knowledge_entities`, `entity_mentions`, `knowledge_events` + extracción automática con Claude + UI CMS)
- [x] **Sprint 3 — News Intelligence Engine** (monitor RSS proactivo: `tracked_sources`, `monitored_articles`, `article_entity_matches`, `trending_topics` + worker 60s + panel `MediaMonitor.jsx`)
- [x] **Sprint 4 — Editorial Workflow Engine** (`editorial_dossiers` + Story Builder + Article Generator + PostEditor prefill con SEO completo + métricas por origen)
- [x] **Sprint 5 — Topic Intelligence Engine** (`topics` + 4 relation tables + hubs regionales NEA + `/topic/:slug` + `/region/:slug` en web público + coverage_scope/region en articles)
- [x] **Sprint 5.3 — Trend Clusters** (`trend_clusters`, `trend_cluster_articles`, `summarizePendingClusters()`)
- [x] **Sprint 5.5 — Story Intelligence Engine** (`story_clusters`, `story_cluster_articles`, `story_entities`, Jaccard keyword matching, `detectStories()`, `summarizePendingStories()`)
- [x] **Sprint 5.6 — Event Intelligence Engine** (`event_clusters`, `event_cluster_stories`, `detectEvents()`, `summarizePendingEvents()`)
- [x] **Sprint 5.6.1 — Editorial Opportunity Engine** (`story_opportunities`, `generateOpportunitiesForStories()`, rutas `/opportunities`)
- [x] **Sprint 5.7 — Dossier desde Monitor** (`POST /:id/create-dossier` en stories/events/opportunities → pipeline completo)
- [x] **Sprint 5.8 — Full Article Acquisition** (`content_text`, `content_words`, `extraction_method` en `monitored_articles`, `ArticleFetcher.js`, `fetchPendingArticleContent()`)
- [x] **Sprint 5.x — Source Verification** (`verification_status`, `trust_score` en `tracked_sources`, `source_verifications`, endpoints verify/approve)
- [x] **Sprint 6.0 — News Sitemap + Enrichment Gate** (parsers Google News Sitemap, `ENRICHMENT_GATE_COVERAGE=0.70`, gate en worker y rutas)
- [x] **Sprint 6.1 — Bug fixes** (duplicate events, editorial_score=0, EventCard coverageOk scope, display limits 150)
- [x] **Sprint 6.2 — Story Clustering Quality Engine** (`story_quality`, `avg_relevance`, `story_context_score` en `story_clusters`, `ai_generation_logs`, `RELEVANCE_FILTER_THRESHOLD=0.30`, `GET /monitor/clustering-audit`, badges CMS)
- [x] **Sprint 6.3 — Story Quality Forensics** (trazabilidad en `story_cluster_articles`, fix `story_context_score`, huérfanas → stale, `GET /monitor/story/:id/explain`, `GET /monitor/clustering-outliers`, docs actualizados)
- [x] **Sprint 6.4 — Editorial Scoring Audit** (`story_quality` ← `story_context_score` con caps duros; `story_confidence` ← corroboración por fuentes; 4 componentes auditables; `GET /monitor/scoring-audit`; badges Quality+Confidence en CMS)
- [x] **Sprint 6.4.1 — Scoring Integrity Fix** (elimina cap redundante article_count=1; nuevo cap único source_count=1→max good; 73 huérfanas con score>0 corregidas; `GET /monitor/scoring-integrity`; `scripts/fix_story_scoring_integrity.js`)
- [x] **Sprint 7.0 — Social Intelligence Platform** (4 tablas nuevas; `SocialFetcher.js` con YouTube activo + stubs para IG/FB/X/TK; `socialMonitor.js`; rutas `/social`; CMS: menu actualizado, `SocialSources.jsx`, `SocialIntelligence.jsx` con tabs Virales/Top Medios/Brechas/Regiones; Knowledge Base y Topic Intelligence retirados del menú)
- [x] Branding: título "PANORAMA" + favicon P/punto rojo en DB y `web/index.html`
- [x] Repositorio GitHub conectado (`panorama.git`) + `.gitignore` raíz
- [x] Docker-compose: `restart: unless-stopped` (fix CPU spike VmmemWSL)
- [ ] Sprint 6 — Distribución (`article_distributions` — generación para redes sociales)
- [ ] Sprint 5.5 — Auto-clustering: asignación automática de artículos a topics al publicar (matching por categoría/tags/entidades sin IA adicional)
- [ ] Diseño Panorama en página de Artículo (`Article.jsx`)
- [ ] Diseño Panorama en página de Categoría (`Category.jsx`)

---

## Pendiente

### Alta prioridad

- [ ] **Article.jsx → diseño Panorama** — La página de artículo usa estilos propios. Pendiente aplicar tokens de `panorama.css`. El archivo de diseño "Panorama - Article.html" está disponible.
- [ ] **Category.jsx → diseño Panorama** — Actualmente carga `Home.jsx` como fallback. Debería tener su propia vista de sección.
- [ ] **Funcionalidad de búsqueda** — El SearchOverlay en el frontend existe pero no conecta a ningún endpoint de búsqueda. `GET /articles?search=X` ya existe en la API.
- [ ] **Migrar JWT a httpOnly cookies** — Deuda de seguridad crítica. Ver `TECH_DEBT.md`.

### Media prioridad

- [ ] **Rate limiting en API** — Ningún endpoint tiene rate limiting. `express-rate-limit` es la solución estándar.
- [ ] **Paginación en Home** — La portada carga solo 20 artículos fijos. Implementar scroll infinito o paginación.
- [ ] **DashboardEditorial.jsx** — Existe el archivo pero no está registrado en las rutas del CMS. Integrarlo o eliminarlo.
- [ ] **Página de Settings en CMS** — Permite configurar `site_title`, `site_favicon`, etc. que el web frontend ya consume. Verificar que esté completa.
- [ ] **Índices de base de datos** — Auditar y documentar índices existentes. Agregar índices en `pixel_events(visitor_id)`, `pixel_events(created_at)`, `articles(status, published_at)`.

### Baja prioridad

- [ ] **Productos (e-commerce)** — El módulo existe pero no hay UI en el web frontend para mostrarlo.
- [ ] **Reels en web frontend** — El módulo de Reels existe en la API y CMS, pero no hay componente en el web público.
- [ ] **Eliminar `admin/` directory** — Artefacto legacy. No agregar código ahí, evaluar si se puede borrar.
- [ ] **Pexels API key hardcodeada** — Ver `TECH_DEBT.md`.
- [ ] **Suite de tests** — No existe ningún test. Agregar al menos tests de smoke para rutas críticas.
- [ ] **CORS cerrado** — `origin: true` en CORS acepta cualquier origen. Restringir a dominios del CMS y Web en producción.

---

## Finalizado

- [x] Sistema de publicidad v2 con perfilado de audiencia (`ads_v2.js`)
- [x] Analytics editorial avanzado (`analytics_v2.js`)
- [x] AI Core con Claude + Whisper (`AiService.js`, `editorial-studio.js`)
- [x] Pixel de tracking first-party (`pixel.js`, `web/src/utils/pixel.js`)
- [x] Editor TipTap con extensiones custom (imágenes, video, iframe, HTML raw)
- [x] Sistema de comentarios con moderación
- [x] Módulo de Reels
- [x] Worker de cálculo de revenue (CPM/CPC/FIXED)
- [x] Biblioteca de media con carpetas + integración Pexels
- [x] Settings key-value con aplicación dinámica (favicon, título)
- [x] Diseño Panorama en Home (portada del web frontend)
- [x] Navbar con categorías dinámicas de base de datos
- [x] Ticker de últimas noticias animado
- [x] SearchOverlay con UI completa
- [x] Branding Panorama — título y favicon (P + punto rojo) en `web/public/favicon.svg` + DB settings
- [x] Repositorio GitHub — `https://github.com/rubenlux/panorama` (branch `main`, 200 archivos)
- [x] Docker fix — `restart: unless-stopped` en `docker-compose.yml`
- [x] News Intelligence Engine — monitoreo proactivo RSS, trending por entidad, auto-research triggers, panel CMS completo (4 tabs)
- [x] Editorial Workflow Engine — pipeline Research → Dossier → Story Builder → Article Generator → PostEditor (origin tracking, SEO prefill completo)
- [x] Topic Intelligence Engine — temas periodísticos con relaciones a artículos/investigaciones/entidades/eventos, hubs regionales NEA, páginas públicas /topic/:slug y /region/:slug
