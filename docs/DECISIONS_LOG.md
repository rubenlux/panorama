# DECISIONS_LOG.md

> Registro histórico de decisiones arquitectónicas y de producto.
> Orden: más reciente primero.

---

## 2026-06-09

**Decisión:** Sprint 5 — Topic Intelligence Engine: temas periodísticos como capa de agregación.

**Motivo:** El sistema tenía artículos, investigaciones y entidades en silos separados. Un editor no podía ver "todo lo que sabemos sobre X tema" en un solo lugar. El objetivo es crear una capa de temas que agrupe todo el conocimiento del sistema y lo proyecte en páginas públicas regionales.

**Decisiones específicas:**

- **Topics como entidad manual, no auto-clustering** — Los temas se crean manualmente y el editor vincula artículos/investigaciones desde el CMS. No hay auto-asignación automática en este sprint para evitar clustering ruidoso. El auto-clustering queda como Sprint 5.5 con matching por categoría/tags.

- **Regiones NEA como primer ciudadano** — Las 6 regiones (argentina, nea, formosa, chaco, corrientes, misiones) están hardcodeadas en el backend. Esto permite hubs regionales funcionales desde el día uno sin configuración adicional. La lista puede expandirse sin cambiar el schema.

- **coverage_scope en articles** — Se agrega `coverage_scope` (international/national/regional/local) y `region` a `articles` para permitir filtrado geográfico sin depender de categorías. Preparación para el hub regional.

- **Trending sin IA** — El ranking de trending es puramente SQL: peso por artículos (×1), investigaciones (×2), artículos en últimas 48h (×3), importance_score. Sin llamadas a Claude. Suficiente para MVP.

- **Schema preparado para pgvector** — Las tablas tienen campos que en el futuro podrán recibir un campo `embedding vector(1536)` para búsqueda semántica. No se implementa ahora porque requiere extensión pgvector y pipeline de embeddings.

- **Páginas web públicas /topic/:slug y /region/:slug** — El web frontend expone los temas al lector. La página de región muestra artículos recientes, temas activos y entidades más mencionadas.

**Impacto:**
- Nuevos archivos: `scripts/migrate_topic_intelligence.js`, `src/routes/topics.js`, `cms/src/pages/Topics.jsx`, `cms/src/pages/TopicDetail.jsx`, `cms/src/pages/Regions.jsx`, `web/src/pages/Topic.jsx`, `web/src/pages/Region.jsx`
- Archivos modificados: `src/app.js`, `cms/src/App.jsx`, `cms/src/layout/AdminLayout.jsx`, `web/src/App.jsx`, `docs/*`
- NO implementado: auto-clustering, pgvector, embeddings, knowledge graph, búsqueda semántica

---

**Decisión:** Sprint 4 — Editorial Workflow Engine: pipeline de Research a Publicación.

**Motivo:** El sistema tenía investigación y conocimiento pero el proceso editorial era discontinuo — el redactor debía leer el brief manualmente y empezar un artículo desde cero. El objetivo es crear una capa editorial que automatice el paso de "tengo información" a "tengo un artículo casi listo para publicar".

**Decisiones específicas:**

- **Dossier como capa intermedia** — El brief de investigación (executive_summary, key_facts, controversias) no es directamente editorial. El dossier reformula esa información en términos periodísticos: hechos verificados, ángulos, titulares, keywords, prompt de imagen. Esta separación permite que la IA sea investigadora en un paso y editora en otro, sin mezclar roles.

- **Story Builder integrado en el dossier, no separado** — Los `suggested_angles` son parte del dossier generado. No hay un endpoint separado de "generar ángulos" porque ya se generan en el mismo paso. El Story Builder en la UI es solo una presentación de esos ángulos con un botón de acción.

- **Article Generator retorna contenido, no crea artículo en DB** — `POST /dossiers/:id/draft` retorna el contenido generado y el CMS navega a PostEditor con `location.state.prefilled`. La creación en DB ocurre solo cuando el editor guarda. Esto evita borradores huérfanos y mantiene el editor en control del cuándo se crea.

- **SEO prefill completo** — El Article Generator genera meta_title, meta_description, og_title, og_description además del contenido. PostEditor inicializa el estado SEO desde `prefilled.seo`, lo que significa que el editor llega al PostEditor con todo pre-llenado y solo necesita revisar.

- **origin tracking transparente** — Los campos `origin` y `dossier_id` se agregan a `articles` pero no se muestran como selector editable en el PostEditor (el editor no necesita elegirlo, se asigna automáticamente). Son campos de métricas y trazabilidad.

- **Temperatura 0.4 para Article Generator** — Mayor que los otros métodos (0.2-0.3) para permitir más variación en el estilo de escritura entre artículos del mismo tema.

**Impacto:**
- Nuevos archivos: `src/routes/editorial_workflow.js`, `scripts/migrate_editorial_workflow.js`, `cms/src/pages/Dossiers.jsx`, `cms/src/pages/DossierDetail.jsx`
- Archivos modificados: `src/services/AiService.js` (+2 métodos), `src/routes/articles.js` (+origin/dossier_id en schemas), `src/app.js`, `cms/src/pages/PostEditor.jsx` (origin/dossier_id tracking + SEO prefill), `cms/src/App.jsx`, `cms/src/layout/AdminLayout.jsx`, `docs/*`
- NO implementado: publicación automática, agentes múltiples, pgvector, redes sociales

---

**Decisión:** Sprint 3 — News Intelligence Engine: monitoreo proactivo de medios.

**Motivo:** El sistema era reactivo — alguien debía crear manualmente un topic de investigación. El objetivo del Sprint 3 es hacerlo proactivo: el sistema detecta oportunidades editoriales solo, sin intervención humana, monitoreando 8 fuentes RSS argentinas e internacionales cada 60 segundos.

**Decisiones específicas:**

- **Matching string-based en lugar de IA** — El motor matchea entidades contra títulos de artículos por comparación de strings (case-insensitive), sin llamar a Claude. Las entidades a matchear ya existen en `knowledge_entities` (creadas en Sprint 2 por investigaciones previas). Esto es O(n×m) pero n≤50 entidades en el MVP, suficiente y gratuito.

- **SHA-256 de URL como hash de deduplicación** — El mismo artículo puede aparecer en múltiples feeds (sindicación). `ON CONFLICT (hash) DO NOTHING RETURNING id` solo retorna IDs de filas efectivamente insertadas, evitando re-procesar el mismo artículo.

- **`trending_topics` con UNIQUE en `entity_id`** — Una sola fila por entidad que se actualiza en cada ciclo, en lugar de log histórico. El campo `auto_researched` se resetea automáticamente tras 2h de inactividad (cooldown), permitiendo re-trigger si la entidad vuelve a trender.

- **Umbrales conservadores** — Auto-research se dispara solo con ≥5 menciones de ≥3 fuentes distintas. Intencionalmente alto para evitar spam de topics de investigación.

- **Worker como proceso único** — El mismo `npm run worker` ahora corre el revenue job (00:05 AM) y el news monitor (cada 60s). No se creó un proceso separado para evitar complejidad operativa innecesaria en esta etapa.

**Impacto:**
- Nuevos archivos: `src/jobs/newsMonitor.js`, `src/routes/monitor.js`, `scripts/migrate_news_intelligence.js`, `cms/src/pages/MediaMonitor.jsx`
- Archivos modificados: `src/worker.js` (agrega monitor job), `src/app.js` (registra /monitor), `cms/src/App.jsx` (ruta /monitor), `cms/src/layout/AdminLayout.jsx` (nav item), `docs/*`
- NO implementado: generación de artículos automáticos, publicación automática, posting en redes sociales, TikTok

---

**Decisión:** Branding Panorama — título y favicon del sitio.

**Motivo:** El sitio mostraba "El Espectador" en la pestaña del browser y el favicon era el logo de Vite (artefacto del scaffolding inicial). Ambos necesitaban reflejar la identidad real del producto.

**Cambios:**
- `web/public/favicon.svg` creado: "P" blanca en fondo oscuro (`#0f172a`) con punto rojo (`#ef4444` — branding Panorama)
- `web/index.html` actualizado: `<title>Panorama</title>` + `href="/favicon.svg"` como fallback estático
- DB `settings`: `site_title` = `PANORAMA`, `site_favicon` = `/favicon.svg` — `SettingsContext.jsx` los aplica dinámicamente al cargar el frontend

**Regla:** El título y favicon canónicos viven en la DB (`settings` table). El `index.html` tiene los valores de fallback para cuando la API no responde.

---

**Decisión:** Repositorio GitHub conectado como `panorama` (público).

**Motivo:** El proyecto no tenía control de versiones independiente. El directorio `/news` vivía dentro de un git raíz en `C:/Users/ruben/` apuntando a otro proyecto (`MicroSaas-lolo`).

**Cambios:**
- Nuevo `.git` inicializado en `c:/Users/ruben/Documents/Mis-Proyectos/news/`
- Remote: `https://github.com/rubenlux/panorama.git` (branch `main`)
- `.gitignore` raíz creado: excluye `.env`, `node_modules/`, `uploads/`, `backups/`, `dist/`, scripts de debug
- Commit inicial: 200 archivos, 36157 líneas — Sprint 1 + Sprint 2 completos

---

**Decisión:** `docker-compose.yml` — cambiar `restart: always` por `restart: unless-stopped`.

**Motivo:** Con `restart: always`, el contenedor de postgres se reiniciaba automáticamente cada vez que se iniciaba Docker Desktop, generando un spike de CPU en VmmemWSL (77–80%) incluso cuando el desarrollo no estaba activo.

**Impacto:** Con `unless-stopped`, postgres sólo se reinicia si crashea, no al abrir Docker Desktop. Resolución del problema de CPU alto reportado.

---

## 2026-06-09

**Decisión:** Sprint 2 — Knowledge Base Foundation implementada como sistema de conocimiento acumulativo.

**Motivo:** Cada investigación generaba un brief desechable. El objetivo del Sprint 2 es transformar ese conocimiento en memoria persistente: entidades nombradas (personas, empresas, productos, lugares) que crecen en cada investigación nueva.

**Decisiones específicas:**
- Tabla `entity_mentions` en lugar de `knowledge_relationships` — enfoque más simple y directo para MVP: basta saber "esta entidad apareció en este topic"
- Extracción de entidades **post-brief**: `extractEntities()` se llama después de `generateResearchBrief()` y es **non-fatal** — si falla, el topic sigue marcado como `completed`
- Entidades incluidas en respuesta de `GET /research/topics/:id` — evita segunda llamada API desde ResearchCenter
- La UI de Knowledge Base muestra un grid de tarjetas filtrable por tipo (persona/empresa/producto/organización/lugar)
- Página de detalle (`EntityDetail.jsx`) muestra todas las investigaciones donde apareció + timeline de eventos

**Impacto:**
- Nuevos archivos: `src/routes/knowledge.js`, `scripts/migrate_knowledge_base.js`, `cms/src/pages/KnowledgeBase.jsx`, `cms/src/pages/EntityDetail.jsx`
- Archivos modificados: `src/services/AiService.js` (método `extractEntities`), `src/routes/research.js` (pipeline + `_extractAndSaveEntities`), `cms/src/App.jsx`, `cms/src/layout/AdminLayout.jsx`, `docs/*`
- NO implementado: pgvector, embeddings, knowledge graph complejo, BullMQ, redes sociales

---

**Decisión:** Arquitectura del Centro de Investigación AI con tablas normalizadas y conectores extensibles.

**Motivo:** Diseño acordado: `research_topics` + `research_sources` + `research_briefs` desde el primer día para no tener que rehacer el esquema en 6 meses cuando se quiera mostrar fuentes, historial, o cruzar con la Knowledge Base. Pipeline: RSS → Claude → Brief → Draft.

**Impacto:**
- Nuevos archivos: `src/routes/research.js`, `src/connectors/rss.js`, `src/connectors/index.js`, `cms/src/pages/ResearchCenter.jsx`
- Arquitectura de conectores extensible: agregar nuevas fuentes (NewsAPI, YouTube, Reddit) sin cambiar la ruta ni el schema
- La UI de ResearchCenter incluye polling para actualizaciones en tiempo real mientras Claude genera el brief
- El botón "Crear artículo" pasa el brief como contexto al PostEditor (sprint 3 completará este flujo)

---

**Decisión:** Implementar diseño Panorama en el frontend web público.

**Motivo:** Se contaba con un archivo de diseño HTML/CSS de alta fidelidad ("Panorama - Home.html") que define el sistema visual completo del portal de noticias.

**Impacto:**
- Reemplazo completo de componentes legacy del web frontend (12 componentes eliminados)
- Creación de `panorama.css` como sistema de design tokens
- Componentes nuevos: `Header`, `NavBar`, `Ticker`, `Footer`, `Home` (todos reescritos)
- El frontend `Article.jsx` todavía usa estilos propios — pendiente de actualizar al diseño Panorama

---

## 2026-06-09

**Decisión:** Crear Project Knowledge System (PKS) con 10 documentos en `/docs`.

**Motivo:** Evitar releer miles de líneas de código en cada sesión. La documentación viva actúa como fuente de verdad del estado del sistema.

**Impacto:** Cualquier cambio futuro debe actualizar los documentos relevantes del PKS antes y después de implementar.

---

## 2026-06-09

**Decisión:** Limitar categorías del navbar a las primeras 8 con `show_in_menu: true`.

**Motivo:** La base de datos tenía 18+ categorías en inglés del seed inicial, todas con `show_in_menu: true`, lo que saturaba el navbar del sitio.

**Impacto:** `NavBar.jsx` aplica `.slice(0, 8)` al resultado filtrado de la API.

---

## (Fecha desconocida — anterior a 2026-06)

**Decisión:** Sistema de publicidad v2 (`ads_v2.js`) reemplaza v1 como default del CMS.

**Motivo:** El sistema v2 usa perfilado de intereses basado en `pixel_events` para targeting inteligente. El v1 era targeting básico por posición sin personalización.

**Impacto:** La ruta `/ads` en el CMS ahora muestra `AdsDashboardV2`. El v1 queda accesible en `/ads/legacy` y `/ads/dashboard`. Ambos routers coexisten montados en el mismo prefijo `/ads`.

---

## (Fecha desconocida)

**Decisión:** `ads.js` y `ads_v2.js` comparten el prefijo `/ads` montados secuencialmente.

**Motivo:** Retrocompatibilidad. Las rutas v1 (`/ads/active`, `/ads/admin/*`) y v2 (`/ads/serve`, `/ads/manage/*`) no colisionan por naming diferente.

**Impacto:** Riesgo de colisión si se agregan rutas similares en ambos archivos. Documentar cada nueva ruta en ambos para evitar conflictos.

---

## (Fecha desconocida)

**Decisión:** AiService como única capa de acceso a modelos de IA.

**Motivo:** Centralizar configuración de SDKs, manejo de errores y modelo utilizado. Evitar importar `@anthropic-ai/sdk` u `openai` directamente en rutas.

**Impacto:** Todos los endpoints de IA (ai.js, editorial-studio.js) instancian `AiService`. El modelo por defecto es `claude-sonnet-4-5-20250929`.

---

## (Fecha desconocida)

**Decisión:** Rutas Express sin prefijo `/api`.

**Motivo:** Diseño original de la API — las rutas se montan directamente (`/articles`, `/auth`, etc.).

**Impacto:** Los clientes (web/cms) hacen fetch a `http://localhost:5000/articles`, no a `.../api/articles`. Esto debe respetarse en cualquier nuevo endpoint.

---

## (Fecha desconocida)

**Decisión:** JWT almacenado en `localStorage` en el CMS.

**Motivo:** Simplicidad de implementación inicial.

**Impacto:** Vulnerabilidad XSS conocida. Registrada como deuda técnica en `TECH_DEBT.md`. No se ha migrado a httpOnly cookies.

---

## (Fecha desconocida)

**Decisión:** Pool de base de datos compartido via `src/routes/db.js`.

**Motivo:** Un único pool por proceso previene connection leaks. Importar de `db.js` garantiza singleton.

**Impacto:** Nunca crear un `new Pool()` en ningún archivo de ruta. Siempre `import { pool, query } from './db.js'`.

---

## (Fecha desconocida)

**Decisión:** Worker como proceso separado para cron jobs.

**Motivo:** Aislar tareas pesadas (cálculo de revenue) del proceso principal de la API. El worker puede fallar sin afectar el servidor HTTP.

**Impacto:** `npm run worker` debe ejecutarse como proceso independiente en producción. Actualmente solo tiene un job: cálculo diario de revenue a las 00:05.
