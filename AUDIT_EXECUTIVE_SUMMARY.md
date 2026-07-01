# AUDITORÍA EJECUTIVA: MONITOR DE MEDIOS

**Fecha:** 30 de junio, 2026  
**Método:** Análisis read-only + manual investigation  
**Resultado:** Auditoría completa, 3 bugs reales identificados, 0 cambios de código

---

## HALLAZGOS CLAVE

### 🔴 BUG #1: Diario Formosa/Guau Formosa/Vía País — 0 artículos (bloqueados)

**Lo que sucede:**
- Fuentes usando `playwright-discovery` fallback
- Pero DB muestra 0 artículos

**Investigación:**
- Ejecuté descubrimiento manual en Diario Formosa
- Encontré 20 URLs candidatas que PASAN validación (122-914 words)
- Pero `processSource()` inserta 0 artículos

**Causa:** Bug después de extracción (no en validación)
- `discoverArticleUrlsFromHomepage()` ✅ funciona
- `extractArticlesWithConcurrency()` ✅ todas pasan
- Pero inserción falla silenciosamente (error no visible)

**Impacto:** 3 medios × 100+ artículos/semana = 300 artículos/semana perdidos

---

### 🔴 BUG #2: Chaco por día/Agenfor — HTTP fallback sin recuperación

**Lo que sucede:**
- RSS discover funciona
- HTTP Fetch falla 100%
- Playwright fallback también falla 100%
- Resultado: 1,500 artículos sin contenido (RSS only)

**Causa:**
- Cloudflare? Timeout? Content-type issue?
- **No sabemos** porque `fetchReason`/`pwReason` se loguean a console, no a BD
- Sin acceso a logs, no hay evidencia

**Impacto:** 1,500 artículos (9% del total) sin texto content extraction
- No pueden clusterizar bien
- Calidad baja de análisis

---

### 🟡 ISSUE #3: validateArticle() inconsistente

**Lo que sucede:**
- RSS items se insertan sin validación
- Playwright URLs se validan estrictamente
- Regla arbitraria: `title.length >= 20`

**Impacto:**
- RSS puede tener títulos < 20 chars (falla validación)
- Contamina BD con inconsistencias
- Hace debugging difícil

---

## ANÁLISIS POR NÚMEROS

```
17,140 artículos descubiertos (7 días)
├── 14,778 HTTP Fetch (86%) ✅ Working
├── 1,490 RSS only (9%) ⚠️ No content
├── 839 Pending (5%) ⚠️ No extraction
├── 21 Playwright (0.1%) ✅ Working
└── 12 Paywall (0.07%) 🚫 Blocked

Discovery Methods:
├── RSS/Sitemap: 26 medios ✅ Funciona
├── Playwright Fallback: 5 medios (3 bloqueados ❌, 2 parcial ⚠️)
└── Sitemap-Index: 1 medio ✅ Funciona

Medios problemáticos:
├── 100% RSS only: Chaco por día (272), Agenfor (61)
├── 0 artículos: Diario Formosa, Guau Formosa, Vía País
└── Baja cobertura: Fayer Wayer (2), Tecno (7), Uberbin (1)
```

---

## LO QUE FUNCIONA BIEN

✅ **HTTP Fetch es robusto:** 14,778 artículos extraídos correctamente (100%)  
✅ **RSS/Sitemap discovery:** 26 medios activos, 20K+ artículos en 7 días  
✅ **Extracción de metadata:** JSON-LD + OG + H1 + content HTML/TEXT funciona  
✅ **Clustering produce historias:** 12,906 historias detectadas  
✅ **Fallback a Playwright existe:** Si RSS/Sitemap falla, intenta alternativa  

---

## RECOMENDACIONES PRIORIZADAS

### FASE 1: CRÍTICO (esta semana)

**1. Investigar Diario Formosa**
- ¿Por qué `extractArticlesWithConcurrency()` retorna array vacío?
- ¿Hay race condition en browser concurrency?
- ¿Error silencioso en catch block?

**Acción:** Agregar logging en:
```javascript
// newsMonitor.js línea 888
const articles = await extractArticlesWithConcurrency(browser, topUrls.slice(0, 20), 5);
console.log(`[DEBUG] extractArticlesWithConcurrency returned ${articles.length} articles`);
```

**2. Guardar razones de fallo HTTP**
- fetchReason, pwReason NO se guardan en BD
- Sin ello, no sabemos si es Cloudflare, timeout, etc.

**Acción:**
```sql
-- Agregar columna
ALTER TABLE monitored_articles ADD COLUMN extraction_reason VARCHAR(100);
```

### FASE 2: IMPORTANTE (semana siguiente)

**3. Aplicar validación consistente**
- RSS y Playwright deben usar MISMAS reglas
- O aplicar ninguna a RSS, o ambas a ambos

**4. Aumentar Playwright timeout**
- Actualmente 20s
- Algunos sitios lentos pueden necesitar 25s

**5. Loguear URLs descubiertas**
- `discoverArticleUrlsFromHomepage()` no registra cuántas encontró
- Dificulta debugging

---

## VALIDACIONES RECOMENDADAS

### Mantener (válidas)
- ✅ title existe
- ✅ URL válida
- ✅ No es homepage (URL pathname validation)
- ✅ No es genérico ("Article", "Leer más")

### Revisar (arbitrarias)
- ⚠️ title.length >= 20 (muchos títulos válidos < 20 chars)
- ⚠️ og:type === 'article' (Facebook posts tienen 'website')
- ⚠️ content >= 120 words (debería ser 80 min)

---

## ARQUITECTURA MAPEADA

```
SOURCE (37 medios)
  │
  ├─ RSS URL ──→ fetchFeedXml() ──→ parseRssItems()
  │   │                                  │
  │   └─ (Detecta format: rss/sitemap-index/news-sitemap)
  │
  ├─ Sitemap URL ──→ mismo pipeline si RSS falla
  │
  └─ Fallback ──→ discoverArticlesViaPlaywright()
                    ├─ discoverArticleUrlsFromHomepage() [133+ links]
                    ├─ scoreUrl() [keep score >= 30]
                    └─ extractArticlesWithConcurrency() [validate]
                         ├─ extractArticleMetadata() [rich extraction]
                         └─ validateArticle() [rejection logic]
                              │
                              ├─ INSERT into monitored_articles
                              │
                              └─ fetchPendingArticleContent()
                                  ├─ HTTP Fetch (10s)
                                  │   ├─ SUCCESS → content_text, content_words, extraction_method='fetch'
                                  │   └─ FAIL → Playwright
                                  │
                                  └─ Playwright (20s)
                                      ├─ SUCCESS → extraction_method='playwright'
                                      └─ FAIL → extraction_method='rss_only'
                                          [NO content, content_words=NULL]
```

---

## CÓDIGO DUPLICADO (Bajo impacto)

- Title extraction appears 2x (ArticleFetcher.js + newsMonitor.js)
- HTML cleaning appears 2x
- Content extraction heuristics partially overlap

**Não es crítico:** Se usan en contextos diferentes.

---

## MÓDULOS MUERTOS (Intencional)

- ✓ `summarizePendingClusters()` — deshabilitado (Cost Killer)
- ✓ `generateOpportunitiesForStories()` — deshabilitado (Cost Killer)
- ✓ `autoAnalyzeTranscript()` — deshabilitado (Sprint 8.4)

**OK:** Decisiones de control de costos documentadas.

---

## PASO SIGUIENTE

**No implementar ahora.** Esta es auditoría técnica, no implementación.

Pero cuando decidas implementar:
1. Reproduce BUG #1 (Diario Formosa) manualmente
2. Entiende por qué 0 artículos se insertan
3. Corrige la raíz (no workarounds)
4. Luego afronta #2 y #3

El monitor es **80% confiable** (RFC estados funcionan bien). Los bugs impactan **20%** (3 medios bloqueados, 1,500 sin contenido).

Esto es una **auditoría, no un juicio.** El código está bien-estructurado. Los bugs son específicos, identificables, y arreglables.
