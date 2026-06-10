# SYSTEM_STATUS.md

> Estado actual del sistema Panorama. Permite entender la plataforma completa en menos de 5 minutos.
> Última actualización: 2026-06-10 (Sprint 6.4.1)

---

## Stack

| Capa | Tecnología | Puerto |
|---|---|---|
| API | Express 5 + Node.js | 5000 |
| CMS | React 19 + Vite | 5173 |
| Web público | React 19 + Vite | 5174 |
| Base de datos | PostgreSQL 15 (Docker) | 5435 |
| Worker | Node.js proceso separado (cron 60s) | — |
| IA | Claude (Anthropic SDK) + OpenAI | — |

---

## Fuentes de Noticias

| Formato | Estado |
|---|---|
| RSS 2.0 | ✓ Activo |
| Atom | ✓ Activo |
| Google News Sitemap (`<urlset xmlns:news>`) | ✓ Activo — Sprint 6.0 |
| Sitemap Index | ✓ Activo — fetcha últimos 3 child sitemaps |
| XML urlset genérico | ✓ Activo (fallback) |

Detección automática de formato en `detectFeedFormat()`. Verificación manual via `POST /monitor/sources/:id/verify`.

---

## Extracción de Contenido

| Método | Descripción | Estado |
|---|---|---|
| `fetch` | HTTP directo — artículos abiertos | ✓ Activo |
| `playwright` | Headless browser — JavaScript pesado | ✓ Activo |
| `paywall` | Artículo bloqueado — no se extrae | ✓ Detectado |
| `rss_only` | Sin extracción adicional — solo RSS snippet | ✓ Fallback |
| `NULL` | Pendiente de extracción | — |

Cola de prioridad: artículos en historias activas → últimas 24h → últimas 72h → históricos. Límite: 20 artículos/ciclo.

**Enrichment Gate:** una historia no genera resumen IA hasta que ≥70% de sus artículos tengan `fetch` o `playwright`.

---

## Pipeline de Inteligencia (cada 60s)

```
1. Fetch RSS/Sitemap de todas las fuentes habilitadas
2. Extracción texto completo (20 artículos/ciclo, cola de prioridad)
3. Match entidades RESEARCH + MONITOR
4. Trend clusters (NER en títulos, ventana 30min)
5. Auto-research triggers (≥5 menciones, ≥3 fuentes)
6. Story clustering (Jaccard keywords, threshold 0.20)
7. Event clustering (Jaccard entidades, threshold 0.35)
8. AI: resúmenes de stories (gate: enrichment ≥70%, relevance ≥0.30)
9. AI: oportunidades editoriales por historia
10. AI: resúmenes de eventos
```

---

## Sistema de Calidad de Historias (Sprint 6.2–6.3)

| Campo | Descripción |
|---|---|
| `story_quality` | poor / fair / good / excellent ← `story_context_score` con caps duros *(Sprint 6.4)* |
| `story_confidence` | low / medium / high ← `source_count` (1=low, 2-3=medium, 4+=high) *(Sprint 6.4)* |
| `story_context_score` | 0-100 = suma de 4 componentes |
| `context_relevance_score` | 0-35: avg_relevance × 35 |
| `context_depth_score` | 0-25: total_words/5000 × 25 |
| `context_diversity_score` | 0-15: sources/5 × 15 |
| `context_coverage_score` | 0-25: enriched_fraction × 25 |
| `avg_relevance` | Promedio de Jaccard scores — para auditoría, ya no define quality |
| `RELEVANCE_FILTER_THRESHOLD` | 0.30 — artículos bajo este score excluidos del contexto Claude |

**Clasificación story_quality (Sprint 6.4.1):**
- `poor` → score < 20 🔴
- `fair` → score 20-44 🟡
- `good` → score 45-69 🟢 · también si score ≥ 70 pero source_count = 1
- `excellent` → score ≥ 70 ⭐ · requiere source_count ≥ 2

Cap único: `source_count = 1 AND score ≥ 70 → good` (no excellent). No hay cap por article_count — el score ya refleja la falta de profundidad.

**Clasificación story_confidence:**
- `low` → 1 fuente (sin corroborar)
- `medium` → 2-3 fuentes (corroborada)
- `high` → 4+ fuentes (confirmada)

---

## Trazabilidad de IA (Sprint 6.2–6.3)

Cada llamada a Claude registra en `ai_generation_logs`:
- Tipo de generación: `story_summary` | `opportunities` | `event_summary` | `story_dossier` | `event_dossier` | `opportunity_dossier`
- Artículos enviados (cantidad + títulos)
- Total de palabras en el contexto

Cada asociación artículo↔historia registra en `story_cluster_articles`:
- `matching_reason`: `story_seed` | `keyword_jaccard` | `legacy`
- `shared_keywords`: keywords que causaron el match
- `keyword_similarity` / `title_similarity`: score Jaccard

---

## Pipeline Editorial (Sprint 4–5.7)

```
Research Topic → Research Brief → Entity Mentions → Research Sources
→ Editorial Dossier → Story Builder (ángulos) → Article Generator → PostEditor
```

- `POST /research-topics` → crea investigación
- `POST /dossiers/:id/generate` → Claude genera brief + ángulos
- `POST /dossiers/:id/draft?angle=N` → Claude genera borrador de artículo
- `DossierService.runDossierGeneration()` — pipeline completo en background

---

## Módulos Activos

| # | Módulo | Ruta | Estado |
|---|---|---|---|
| 01 | Artículos | `src/routes/articles.js` | ✓ |
| 02 | Auth | `src/routes/auth.js` | ✓ |
| 03 | Categorías | `src/routes/categories.js` | ✓ |
| 04 | Usuarios | `src/routes/users.js` | ✓ |
| 05 | Comentarios | `src/routes/comments.js` | ✓ |
| 06 | Media | `src/routes/media.js` | ✓ |
| 07 | Publicidad v2 | `src/routes/ads_v2.js` | ✓ |
| 08 | Publicidad legacy | `src/routes/ads.js` | Legacy |
| 09 | Pixel tracking | `src/routes/pixel.js` | ✓ |
| 16 | Knowledge Base | `src/routes/knowledge.js` | ✓ |
| 17 | News Intelligence | `src/routes/monitor.js` + worker | ✓ |
| 18 | Worker background | `src/worker.js` | ✓ |
| 19 | Editorial Workflow | `src/routes/editorial_workflow.js` | ✓ |
| 20 | Topic Intelligence | `src/routes/topics.js` | ✓ |
| — | Stories | `src/routes/stories.js` | ✓ Sprint 5.5 |
| — | Events | `src/routes/events.js` | ✓ Sprint 5.6 |
| — | Opportunities | `src/routes/opportunities.js` | ✓ Sprint 5.6.1 |

---

## Último Sprint: 6.4.1 — Scoring Integrity Fix

**Completado:** 2026-06-10

**Objetivo:** Corregir doble-penalización y 73 huérfanas con score inconsistente introducidos en Sprint 6.4.

**Implementado:**
- Eliminado el cap `article_count=1 → max fair` — el score ya refleja la falta de profundidad
- Cap único simplificado: `source_count=1 AND score≥70 → good` (no excellent)
- `scripts/fix_story_scoring_integrity.js`: sync + recálculo + reporte de integridad (73 huérfanas corregidas)
- `GET /monitor/scoring-integrity`: detecta `score_with_no_articles`, `score_with_no_sources`, `quality_mismatch`
- Distribución post-fix: excellent:4 / good:1214 / fair:113 / poor:0 — 0 inconsistencias

**Sprint anterior (6.4):** `story_quality` ← `story_context_score`; `story_confidence` ← source_count; 4 componentes auditables; CTE recalculation; scoring-audit endpoint; badges CMS.

---

## Problemas Conocidos

| Problema | Severidad | Estado |
|---|---|---|
| JWT en localStorage (no httpOnly) | Alta | Pendiente |
| CORS `origin: true` — acepta cualquier origen | Media | Pendiente |
| Pexels API key hardcodeada | Baja | Pendiente |
| DashboardEditorial.jsx no registrado en rutas | Baja | Pendiente |
| Sin suite de tests | Media | Pendiente |
| `rebuild_story_clusters.js` pendiente de ejecutar | Media | Ejecutar cuando se confirme auditoría |

---

## Comandos de referencia rápida

```bash
# Iniciar sistema completo
npm run dev:all      # API + CMS
npm run worker       # Worker de background (proceso separado)

# Base de datos
npm run db:up        # Iniciar PostgreSQL (Docker)
psql postgres://postgres:postgres@127.0.0.1:5435/newsdb  # Conectar

# Migraciones (ejecutar manualmente)
node scripts/migrate_clustering_quality.js     # Sprint 6.2 (si no corrió)
node scripts/migrate_story_traceability.js     # Sprint 6.3
node scripts/migrate_editorial_scoring.js      # Sprint 6.4 (añade 5 columnas)
node scripts/fix_story_scoring_integrity.js    # Sprint 6.4.1 (corrige quality + huérfanas)

# Auditoría
node scripts/rebuild_story_clusters.js --dry-run  # Ver estado sin modificar
```
