# ROADMAP.md

> Estado del producto y próximos pasos.
> Última actualización: 2026-06-09 (Sprint 2 completado)

---

## En Progreso

### Branch: `001-agente-cm-platform`
- [x] Diseño Panorama implementado en Home (web frontend)
- [x] PKS (Project Knowledge System) creado en `/docs`
- [x] **Sprint 1 — Centro de Investigación AI** (tablas + backend + conectores RSS + UI CMS)
- [x] **Sprint 2 — Knowledge Base** (`knowledge_entities`, `entity_mentions`, `knowledge_events` + extracción automática con Claude + UI CMS)
- [ ] Sprint 3 — Generación de artículos desde brief (PostEditor prefill desde ResearchCenter)
- [ ] Sprint 4 — Distribución (`article_distributions` — generación para redes sociales)
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
