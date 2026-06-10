# DECISIONS_LOG.md

> Registro histórico de decisiones arquitectónicas y de producto.
> Orden: más reciente primero.

---

## 2026-06-10 — Sprint 7.0

**Decisión:** Retirar Knowledge Base y Topic Intelligence del menú principal. Crear Social Intelligence como módulo de monitoreo de cuentas seleccionadas.

**Problema:** KB y Topic Intelligence no generaban valor operativo diario para el equipo editorial. El flujo real es: news monitor → historias → dossier. KB era una capa intermedia sin uso activo. Topic Intelligence requería carga manual y no generaba insight accionable.

**Decisión sobre Social Intelligence:** El sistema NO monitorea redes sociales de forma abierta. El usuario decide qué cuentas seguir (`social_sources`), el sistema solo procesa esas cuentas. Es el mismo paradigma que `tracked_sources` en RSS Intelligence.

**Plataformas:** YouTube implementado completamente (YouTube Data API v3, 10k quota/día gratuita, ~12 units/canal/run). Instagram, Facebook, X, TikTok: stubs — infraestructura lista, se activan cuando se configuran las credenciales de cada plataforma.

**Quota YouTube:** Usar `playlistItems.list` (1 unit/call) + `videos.list` (~10 units/batch) en vez de `search.list` (100 units/call). Costo: ~12 units/canal. Con 10 canales y 48 runs/día: ~5,760 units/día — dentro del límite gratuito.

**Worker schedule:** Cada 30 minutos (vs 60s del news monitor). Las cuentas sociales se actualizan menos frecuentemente, y hay que respetar las cuotas de API.

**Content Gap Analysis:** Jaccard entre `social_clusters.keywords` y `story_clusters.keywords`, threshold 0.20. Categorías: gap (sin cobertura), partial (historia poor o 1 artículo), covered. Permite responder "qué publican los medios en redes que todavía no tenemos cubierto".

**KB y Topics:** Rutas mantenidas en App.jsx para backward compatibility. Datos intactos. Solo removidos del menú de navegación. Marcados como deprecated.

**Impacto:** 4 tablas nuevas, `SocialFetcher.js`, `socialMonitor.js`, `/social/*` routes, `SocialSources.jsx`, `SocialIntelligence.jsx`, `AdminLayout.jsx` (menú), `App.jsx`, `worker.js`, `app.js`.

---

## 2026-06-10 — Sprint 6.4.1

**Decisión:** Simplificar caps de story_quality — eliminar el cap de article_count=1.

**Problema:** Sprint 6.4 introdujo dos caps simultáneos (`article_count=1 → max fair` y `source_count<2 → max good`). Esto penalizaba dos veces la misma dimensión de corroboración, causando que una historia con score 71 y 1 fuente quedara clasificada como `fair` en lugar de `good`. La penalización por artículo único es innecesaria porque el propio score ya castiga la falta de profundidad (context_depth_score = 0 si hay poco texto).

**Decisión tomada:** Un solo cap: `source_count = 1 AND score ≥ 70 → good` (no excellent). Umbrales puros sin cap de artículos:
- score < 20   → poor
- score 20-44  → fair
- score 45-69  → good
- score ≥ 70   → excellent (cap: si source_count = 1 → good)

**Por qué este cap es suficiente:** Una historia excelente debe estar corroborada por al menos 2 fuentes. Pero una historia con 1 artículo y alto score simplemente tendrá context_depth bajo — el score se encarga de eso sin cap adicional.

**También corregido:** 73 historias huérfanas tenían `story_context_score > 0` con `article_count = 0` — inconsistencia matemática introducida por el backfill de Sprint 6.4. `fix_story_scoring_integrity.js` las resetea a score=0, quality=poor.

**Distribución post-fix:** excellent: 4 / good: 1214 / fair: 113 / poor: 0 (avg_score 62/100). 0 inconsistencias de integridad.

**Impacto:** `scripts/fix_story_scoring_integrity.js` (nuevo), `src/jobs/newsMonitor.js` (lógica quality simplificada), `src/routes/monitor.js` (+scoring-integrity endpoint).

---

## 2026-06-10 — Sprint 6.4

**Decisión:** story_quality ← story_context_score (reemplaza avg_relevance como fuente de verdad para calidad editorial).

**Problema raíz:** `avg_relevance = 1.0` para cualquier historia con un solo artículo (el seed article siempre tiene `relevance_score = 1.0`). Resultado: 85%+ de historias calificaban como `excellent` aunque tuvieran 1 artículo, 1 fuente y cero texto completo. El sistema respondía "¿los artículos se parecen entre sí?" pero no "¿la historia está sustentada?".

**Decisión tomada:** `story_quality` se basa en `story_context_score` (0-100) con dos caps duros:
- `article_count = 1` → máximo `fair` (sin importar el score)
- `source_count < 2` → máximo `good` (sin importar el score)
- Umbrales: >70 = excellent, >45 = good, >20 = fair, ≤20 = poor

**Separación Calidad / Confianza:** `story_confidence` es un campo nuevo basado exclusivamente en `source_count` (1=low, 2-3=medium, 4+=high). Responde "¿está corroborado?", no "¿es bueno?". Permite el caso: `quality=excellent, confidence=low` (1 artículo muy completo, 1 fuente).

**Desglose auditable:** `story_context_score` se divide en 4 componentes persistidos: `context_relevance_score` (35pts), `context_depth_score` (25pts), `context_diversity_score` (15pts), `context_coverage_score` (25pts). El editor puede ver `R:32/35 P:5/25 D:3/15 C:10/25` y entender inmediatamente por qué el score es bajo.

**Por qué no IA:** La confianza editorial no requiere semántica — basta con contar fuentes. Simple, transparente, auditable, sin latencia ni costo.

**Impacto:** `scripts/migrate_editorial_scoring.js`, `src/jobs/newsMonitor.js` (recálculo completo con CTE), `src/routes/stories.js`, `src/routes/monitor.js` (+scoring-audit), `cms/src/pages/MediaMonitor.jsx` (badges Quality+Confidence+desglose).

---

## 2026-06-10 — Sprints 5.3–6.3

**Decisión:** Story Context Score como métrica compuesta de calidad editorial.

**Problema:** `avg_relevance` solo mide la cohesión del clustering. No refleja si el cluster tiene suficiente contenido para generar un buen resumen. Se necesitaba una métrica que capturara múltiples dimensiones de calidad.

**Decisión tomada:** `story_context_score` = `avg_relevance×35 + content_depth×25 + source_diversity×15 + enrichment×25` (0-100). Pesos elegidos para priorizar relevancia (lo más importante para calidad editorial) sobre profundidad de contenido y diversidad de fuentes.

**Alternativas consideradas:** Solo `avg_relevance` (descartada: no captura profundidad), percentil de artículos enriquecidos (descartada: no diferencia entre cluster pequeño y grande).

---

**Decisión:** Filtro `RELEVANCE_FILTER_THRESHOLD = 0.30` — exclusión de contexto IA sin borrar de DB.

**Problema:** El threshold de matching Jaccard (0.20) permite artículos de baja relevancia en historias. Esos artículos contaminan los prompts enviados a Claude, degradando la calidad de resúmenes y oportunidades.

**Decisión tomada:** Artículos con `relevance_score < 0.30` se excluyen de toda query que construye contexto para Claude (worker + rutas dossier). Los links se preservan en DB para auditoría.

**Por qué 0.30 y no un threshold más alto:** 0.30 elimina los outliers claros (0.20–0.29) sin afectar la mayoría de links válidos (0.30+). Simulación de thresholds disponible en `GET /monitor/clustering-audit`.

---

**Decisión:** Trazabilidad en `story_cluster_articles` — guardar el "porqué" de cada asociación.

**Problema:** Con solo `relevance_score` no podemos auditar qué keywords/entidades causaron que un artículo entrara a una historia. Imposible validar manualmente si el matching fue correcto.

**Decisión tomada:** Al crear cada link se guardan `matching_reason`, `shared_keywords`, `keyword_similarity` y `title_similarity`. Links históricos marcados como `'legacy'`. Endpoint `GET /monitor/story/:id/explain` expone la información en forma legible.

---

**Decisión:** Enrichment Gate 70% antes de IA.

**Problema:** Claude generaba resúmenes solo con títulos y snippets RSS (200 chars), produciendo oportunidades genéricas sin valor editorial real.

**Decisión tomada:** `ENRICHMENT_GATE_COVERAGE = 0.70`. Una historia no avanza a summarization hasta que 70% de sus artículos tienen `extraction_method IN ('fetch','playwright')`. Las rutas dossier devuelven HTTP 422 si no se cumple el gate.

---

**Decisión:** Story Intelligence via Jaccard de keywords de título (Sprint 5.5).

**Problema:** RSS de múltiples fuentes publica el mismo evento bajo titulares distintos. Sin clustering, cada artículo sobre "Milei en el G7" era un ítem independiente sin contexto histórico.

**Decisión tomada:** Clustering automático por similitud Jaccard de keywords extraídas de títulos. Threshold 0.20 calibrado para capturar cobertura amplia; threshold 0.30 como filtro de calidad para IA. NLP sin modelos — lista de stopwords + mínimo 4 caracteres. Funciona en tiempo real en cada ciclo de 60s.

---

**Decisión:** Source Verification — trust_score y verificación editorial.

**Problema:** Cualquier URL RSS podía agregarse al monitor. Sin mecanismo de verificación, fuentes caídas o con HTML en lugar de XML degradaban el pipeline.

**Decisión tomada:** `POST /monitor/sources/:id/verify` detecta el formato del feed (RSS/Atom/Sitemap/etc.), asigna `trust_score` basado en latencia y HTTP status. `POST /monitor/sources/:id/approve` es una capa editorial adicional. `trust_score` persiste en DB para métricas de calidad de fuentes.

---

**Decisión:** Separación RESEARCH vs MONITOR entities.

**Problema:** Las entidades creadas manualmente en Knowledge Base (RESEARCH) tenían requisitos distintos a las descubiertas automáticamente por NER en titulares (MONITOR). Mezclarlas contaminaría el KB con ruido.

**Decisión tomada:** `knowledge_entities.entity_origin` distingue 'RESEARCH' (manual, curada) de 'MONITOR' (automática, efímera). El matcheo de artículos busca primero RESEARCH, luego MONITOR. Auto-research triggers solo se crean desde entidades MONITOR con suficiente masa.

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
