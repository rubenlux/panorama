# FULL_ARTICLE_RESEARCH_AUDIT.md

Sprint 5.2 — Full Article Research Engine
Fecha: 2026-06-09

---

## 1. ESTADO ANTERIOR (Pre Sprint 5.2)

El pipeline de Research enviaba a Claude únicamente el extracto RSS de cada artículo.

| Métrica | Valor |
|---|---|
| Fuentes totales procesadas | 61 |
| Promedio de caracteres por fuente | **196 chars** |
| Promedio de palabras por fuente | **32 palabras** |
| Contenido máximo enviado | 380 chars |
| Límite aplicado en `generateResearchBrief` | `.slice(0, 300)` |

**Consecuencia:** Claude recibía el equivalente a 2-3 oraciones por artículo. Con 10 fuentes, el corpus total era de ~320 palabras — equivalente a un párrafo de nota de prensa. Los briefs generados eran inevitablemente superficiales y con alta tasa de advertencias ("información insuficiente").

---

## 2. NUEVA ARQUITECTURA (Post Sprint 5.2)

```
RSS Feed
  ↓
URL de artículo
  ↓
ArticleFetcher.js
  ├── Verificar article_content_cache (TTL 72h)
  ├── Fetch HTML con browser User-Agent
  ├── Extracción en orden de prioridad:
  │   1. JSON-LD articleBody (schema.org NewsArticle)
  │   2. <article> tag
  │   3. <main> tag
  │   4. <body> fallback
  ├── Detección de paywall (suscri/premium/sign in)
  └── Cap: 2000 palabras máximo
  ↓
research_sources.content (artículo completo)
research_sources.content_fetched = true
  ↓
generateResearchBrief() → Claude
  (hasta 1500 palabras por fuente full-text)
```

---

## 3. BENCHMARK — TASA DE ÉXITO POR FUENTE

Prueba realizada el 2026-06-09 con artículos reales del monitor.

| Fuente | RSS chars | Full words | Factor mejora | Resultado |
|---|---|---|---|---|
| BBC Mundo | 95 | 1424 | **~75x** | ✓ fresh |
| TechCrunch | 196 | 942 | **~24x** | ✓ cached |
| Perfil | 279 | 694 | **~12x** | ✓ fresh |
| TN | 133 | 662 | **~25x** | ✓ fresh |
| La Nación | 171 | 477 | **~14x** | ✓ fresh |
| Clarín | 117 | 285 | **~12x** | ✓ fresh |
| Agenfor | 357 | 0 | — | ✗ BLOQUEADA |

**Tasa de éxito: 86% (6/7 fuentes)**

Promedio antes: **196 chars** (~32 palabras)  
Promedio después (fuentes exitosas): **747 palabras**  
Mejora promedio: **~23x más contenido por fuente**

---

## 4. FUENTES QUE BLOQUEAN EXTRACCIÓN

| Fuente | Razón detectada | Fallback |
|---|---|---|
| Agenfor | Bloqueo de scraper / sin respuesta | RSS description |

Nota: Agenfor es una agencia de noticias local de Formosa con 357 chars de RSS — es la más "verbal" en RSS pero no permite extracción de contenido completo. El sistema cae automáticamente al RSS description.

---

## 5. FUENTES QUE FUNCIONAN CORRECTAMENTE

- **BBC Mundo** — Mejor resultado. Usa `<article>` tag + JSON-LD completo. 1424 palabras promedio.
- **TechCrunch** — Excelente. 942 palabras. JSON-LD bien formado.
- **Perfil** — Bueno. 694 palabras. HTML estándar.
- **TN** — Bueno. 662 palabras. Extracción vía `<article>`.
- **La Nación** — Correcto. 477 palabras.
- **Clarín** — Funciona. 285 palabras (posible truncación por paywalls parciales).

---

## 6. IMPACTO EN CALIDAD DE BRIEFS

### Antes
```
[1] TN — Anthropic lanzó una IA que era demasiado potente
Empresa de IA Anthropic lanzó esta semana una herramienta de inte...
```
→ Claude recibía ~200 chars. No podía citar datos específicos, fechas, 
  nombres de personas, cifras. Resultado: briefs vagos con advertencias.

### Después
```
[1] TN — Anthropic lanzó una IA que era demasiado potente (📄 artículo completo)
Anthropic abrió al público esta semana una versión de una herramienta de 
inteligencia artificial que la propia empresa consideró "demasiado potente" 
para hacerla pública. Se trata de Claude Fable 5... [662 palabras con fechas, 
nombres, cifras, contexto técnico, citas de ejecutivos]
```
→ Claude recibe el artículo completo. Puede citar hechos específicos, 
  contrastar fuentes, identificar contradicciones, construir timeline.

---

## 7. MÉTRICAS DE CACHE

| Métrica | Valor |
|---|---|
| Artículos en cache | 9 |
| Promedio de palabras en cache | 817 |
| TTL de cache | 72 horas |

La cache evita re-descargar el mismo artículo en investigaciones sucesivas. Un research de "Claude Fable 5" y luego un research de "Anthropic" reutilizan el mismo HTML descargado.

---

## 8. COMPATIBILIDAD Y FALLBACK

El sistema mantiene compatibilidad completa:

- Si ArticleFetcher falla → `content_fetched = false`, usa RSS description
- Si la URL retorna 403/404 → `content_fetched = false`
- Si detecta paywall → `content_fetched = false`
- Timeout (>10s) → `content_fetched = false`
- `generateResearchBrief` funciona con mezcla de full-text y RSS en el mismo corpus

No se modificaron:
- Research Center UI
- Knowledge Base
- Trending
- Dossiers
- Story Builder
- topic flow

---

## 9. ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---|---|
| `src/services/ArticleFetcher.js` | NUEVO — fetcher + extractor + cache |
| `src/routes/research.js` | `_enrichSources()` + nuevo INSERT con `content_fetched` |
| `src/services/AiService.js` | Eliminado `.slice(0, 300)`, prompt actualizado para full-text, `max_tokens` 2000→3000 |
| `scripts/migrate_full_article_research.js` | `article_content_cache` table + `research_sources.content_fetched` |

---

## 10. DEUDA TÉCNICA RESIDUAL

| # | Issue | Impacto |
|---|---|---|
| D1 | Clarín posiblemente trunca por paywall suave | Brief de Clarín con menos contexto |
| D2 | Agenfor bloqueada — cobertura local de Formosa depende solo de RSS | Investigaciones sobre Formosa siguen siendo débiles |
| D3 | Extracción puramente regex — no usa `@mozilla/readability` | Algunos layouts complejos extraen contenido de navigación |
| D4 | Sin rotación de User-Agent | A largo plazo podría generar bloqueos |
| D5 | `content_fetched = false` para fuentes fuera de TOP_N (>10) | 10+ fuentes siguen siendo RSS snippets |
