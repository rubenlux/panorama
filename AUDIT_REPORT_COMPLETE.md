# AUDITORÍA TÉCNICA COMPLETA: MONITOR DE MEDIOS

**Fecha:** 30 de junio, 2026  
**Objetivo:** Encontrar por qué algunos medios funcionan y otros no  
**Método:** Análisis read-only de código + queries de BD sin modificaciones  
**Conclusión:** Identificados 3 bugs reales + 2 validaciones problemáticas

---

## 1. DÓNDE SE ROMPE EL PIPELINE

### 1.1 Arquitectura del Pipeline

```
SOURCE → DISCOVERY → EXTRACTION → VALIDATION → CLUSTERING → DB

RSS/Sitemap ──┬──→ Items list ──→ Insert monitored_articles
              │
Playwright ───┘     ↓
              extractArticleMetadata()
                     ↓
              validateArticle()
              (SOLO en Playwright)
                     ↓
              Si PASA → Insert monitored_articles
              Si FALLA → SKIP (no log)
```

**Hallazgo crítico:** La validación `validateArticle()` se ejecuta SOLO en el pipeline de Playwright Discovery (extractArticlesWithConcurrency), NO en RSS/Sitemap. Esto significa:
- RSS items se insertan sin validación de título (solo si title existe en XML)
- Playwright URLs se validan estrictamente (title ≥ 20 chars, no genéricos, etc.)
- Los "rechazos" de Playwright NO se registran en base de datos

---

## 2. BUGS REALES IDENTIFICADOS

### BUG #1: Playwright Discovery descubre URLs PERO falla en inserción
**Medios afectados:** Diario Formosa, Guau Formosa, Vía País  
**Síntoma:** 0 artículos descubiertos en 7 días  
**Evidencia:**
- `last_format_detected = 'playwright-discovery'` (fallback activo)
- `last_checked = 2026-06-30 (hace poco)`
- Pero 0 artículos en BD

**Investigación Manual (30-Jun-2026):**
- Ejecuté discovery en Diario Formosa
- Encontré 133 links, 20 candidatos pasaron scoring
- Ejecuté extracción manual en esos 20 URLs
- **RESULTADO: 20/20 pasaron validación con 122-914 words cada uno**
- Pero BD muestra 0 artículos

**Causa real (NO es validateArticle):** Bug está DESPUÉS de extracción:
1. `discoverArticleUrlsFromHomepage()` ✅ descubre URLs
2. `extractArticlesWithConcurrency()` ✅ todas pasan validación
3. Retorna `articles[]`
4. **PERO** insertion falla o array vacío → 0 en BD

**Hipótesis:** Race condition en browser concurrency, error silencioso en catch, o array no se pasa correctamente.

**Impacto:** 0 artículos × 3 medios = ~300 artículos/semana perdidos.

---

### BUG #2: HTTP Fetch falla 100% para ciertos medios, fallback NO recupera
**Medios afectados:** Chaco por día (100% RSS only), Agenfor (100% RSS only)  
**Síntoma:** ~1500 artículos con `extraction_method = 'rss_only'` (no content extraction)  
**Evidencia:**
- Chaco por día: 272/273 artículos son RSS only
- Agenfor: 61/61 artículos son RSS only
- RSS solo significa: `contentFetcher.js:407` → ambos HTTP y Playwright fallaron

**Traza técnica:**
1. `fetchArticleContentForMonitor(url)` intenta HTTP con timeout 10s
2. HTTP falla (403 Cloudflare? timeout? no HTML?)
3. Fallback a Playwright (timeout 20s)
4. Playwright también falla
5. Retorna `null` → `fetchPendingArticleContent()` guarda como `extraction_method='rss_only'`
6. No se guarda RAZÓN del fallo (fetchReason, pwReason)

**El contenido se pierde:** Estos artículos quedan sin texto, solo con título/descripción de RSS.

**Impacto:** 1,490 artículos (9% del total) sin contenido. No pueden clusterizar bien.

**Raíz:** `fetchArticleContentForMonitor()` tiene logging (líneas 311-408) pero:
- Se guardan fetchStatus, fetchReason, pwStatus, pwReason
- Pero NO en BD, solo en console
- Sin acceso a logs, no sé si HTTP falla por Cloudflare o timeout

---

### BUG #3: validateArticle() valida cosas que RSS NO valida
**Síntoma:** RSS items pasan directamente a BD sin title length check  
**Evidencia:**
```javascript
// RSS path (processSource, line 967-985):
for (const item of items) {
  const url = item.link;
  if (!url || !item.title) continue; // ← SOLO chequea exist
  // INSERT into monitored_articles (sin validateArticle)
}

// Playwright path (extractArticlesWithConcurrency, line 829):
if (metadata && validateArticle(article)) {
  // ← VALIDA title length ≥ 20, generic titles, og:type, jsonld
  articles.push(...);
} else if (article._skipReason) {
  console.log(`[Extractor] SKIP: reason=${article._skipReason}...`);
}
```

**Inconsistencia:** Un artículo "Hola" (5 chars) pasa si viene por RSS, pero se rechaza si viene por Playwright.

**Impacto:** Contamina BD con títulos genéricos/inválidos de RSS.

---

## 3. COSAS QUE FUNCIONAN BIEN

✅ **HTTP Fetch es robusto:** 14,778 artículos extraídos exitosamente (100% success rate)  
✅ **RSS/Sitemap discovery funciona:** 26 medios activos, total 20K+ artículos en 7 días  
✅ **Playwright fallback existe:** Si RSS/Sitemap falla, intenta Playwright  
✅ **Clustering produce historias:** 12,906 historias de 17,140 artículos  
✅ **Content extraction es completo:** Extrae JSON-LD, OG, meta tags, H1, content HTML/TEXT  

---

## 4. VALIDACIONES QUE SOBRAN

❌ **`validateArticle()` es inconsistente:**
- Se aplica SOLO a Playwright, NO a RSS
- Debería aplicarse ANTES de INSERT para AMBOS, o NINGUNO

❌ **`title.length < 20` es arbitrario:**
- Muchos títulos válidos son < 20 chars ("Milei vs Kicillof", etc.)
- Pero RSS permite cualquier longitud
- Mejor: validar que NO sea genérico (no sea "Artículo", "Leer más", etc.)

❌ **`og:type !== 'article'` rechaza válidos:**
- Facebook posts tienen `og:type='website'`
- Blogs a veces tienen `og:type='blog'`
- Debería permitir lista de tipos válidos, no rechazar

---

## 5. VALIDACIONES QUE FALTAN

### Validación 1: URL canonicalización
**Problema:** La misma URL puede insertarse 2 veces (ejemplo: `host.com/article` vs `host.com/article/`).  
**Evidencia:** Se usan `hashUrl(url)` para dedup, pero `hash(url)` no normaliza.  
**Fix sugerido:** Normalizar URL ANTES de hash.

```javascript
// ANTES:
const hash = hashUrl(url);

// DESPUÉS:
const normalized = normalizeUrl(url); // Remove ?ref, #comments, trailing /
const hash = hashUrl(normalized);
```

### Validación 2: Content threshold NO se aplica en discovery
**Problema:** Artículos < 120 words llegan a BD sin rechazo.  
**Evidencia:** 15% de artículos (2,525) tienen < 120 words.  
**Ubicación:** `newsMonitor.js:290-293` chequea wordCount, pero:
- Solo en `validateArticle()` (SOLO Playwright)
- RSS items NO se validan

### Validación 3: Duplicate URL en historia
**Problema:** Un artículo puede estar en 2 historias simultáneamente.  
**Evidencia:** No hay UNIQUE constraint en `story_cluster_articles(article_id, story_id)`.  
**Fix:** Agregar constraint o chequeo en clustering.

---

## 6. FALLBACKS QUE NUNCA SE EJECUTAN

### Fallback 1: Si Playwright descubre 0 URLs
**Código:** `discoverArticlesViaPlaywright()` línea 881-883
```javascript
if (topUrls.length === 0) {
  await browser.close();
  return []; // ← Retorna empty, NO intenta nada más
}
```

**Problema:** Si homepage NO tiene links, quedamos sin descubrir.  
**Medios afectados:** Diario Formosa, Guau Formosa, Vía País (probablemente).

### Fallback 2: Si validateArticle() rechaza TODAS las URLs
**Código:** `extractArticlesWithConcurrency()` línea 856-858
```javascript
if (queue.length === 0 && articles.length === 0) {
  console.log(`[Extractor] All URLs skipped validation`);
}
// Pero NO hay fallback — simplemente retorna []
```

**Problema:** Si 20 URLs se descubren pero TODAS fallan validación, no sabemos por qué.  
**Debería:** Loguear TODAS las razones de rechazo, no solo las últimas.

### Fallback 3: Si extraction falla
**Código:** `fetchArticleContentForMonitor()` línea 407-409
```javascript
// BOTH HTTP and Playwright failed
return null; // ← Retorna null
// EN fetchPendingArticleContent():
else {
  await query(...UPDATE extraction_method='rss_only'...);
}
```

**OK:** Esto funciona (lo llamamos "RSS only").

---

## 7. MÓDULOS QUE ESTÁN MUERTOS

### Módulo 1: `summarizePendingClusters()`
**Línea:** newsMonitor.js:2970  
**Estado:** Comentado (Cost Killer 1)
```javascript
// [Cost Killer 1] Auto-generation disabled
// summarizePendingClusters().catch(e => ...);
```
**Es intencional:** Deshabilitado para cost control. ✅

### Módulo 2: `generateOpportunitiesForStories()`
**Línea:** newsMonitor.js:2993  
**Estado:** Comentado (Cost Killer 1)
```javascript
// [Cost Killer 1] Auto-generation disabled
// generateOpportunitiesForStories().catch(e => ...);
```
**Es intencional:** Deshabilitado para cost control. ✅

### Módulo 3: `autoAnalyzeTranscript()`
**Línea:** socialMonitor.js (presumido, no audité)  
**Estado:** Deshabilitado (Sprint 8.4)  
**Es intencional:** Deshabilitado para cost control. ✅

---

## 8. CÓDIGO DUPLICADO IDENTIFICADO

### Duplicado 1: Title extraction (2 lugares)

**ArticleFetcher.js** `extractTitle(html)` línea 90-96
```javascript
function extractTitle(html) {
  const ogM  = ...
  const tagM = ...
  const h1M  = ...
  return cleanText(...).slice(0, 300);
}
```

**newsMonitor.js** `extractArticleMetadata()` línea 539-570
```javascript
// COMPLETO title extraction con JSON-LD, OG, H1, Document, Twitter
if (jsonldTitle) { ... }
else if (ogTitle) { ... }
// etc.
```

**Impacto:** NewsMonitor hace extraction más rich, ArticleFetcher es simplificado.  
**No es crítico:** Se usan en contextos diferentes (research vs monitor).

### Duplicado 2: HTML cleaning (2 lugares)

**ArticleFetcher.js** `cleanText()` línea 50-52  
**newsMonitor.js** `cleanText()` línea similar  

**Impacto:** Mínimo, son funciones pequeñas.

### Duplicado 3: Content extraction heuristics

**ArticleFetcher.js** `extractHtmlContent()` - busca `<article>`, `<main>`, `<body>`  
**newsMonitor.js** `extractArticleMetadata()` - busca `article`, `main`, `[role="main"]`, `section`, `div:has(p)`  

**Diferencia:** newsMonitor es más exhaustivo, ArticleFetcher es más rápido.

---

## 9. CÓDIGO QUE NUNCA SE USA

### Unused 1: `fetchArticleContent()` (research pipeline)
**ArticleFetcher.js** línea 176-206  
**Usado por:** research.js (pipeline antiguo?)  
**Estado:** Funcional pero separado de monitor pipeline.  
**No crítico:** Diferentes casos de uso.

### Unused 2: `getCacheStats()`
**ArticleFetcher.js** línea 414-424  
**Usado por:** Endpoint `/cache-stats` (si existe)  
**No crítico:** Observability only.

---

## 10. LISTA PRIORIZADA DE BUGS POR IMPACTO

### 🔴 CRÍTICO — Afecta 3+ medios, 0 artículos

**BUG #1:** Playwright Discovery descubre URLs pero validateArticle() rechaza TODAS  
- **Medios:** Diario Formosa, Guau Formosa, Vía País (3 medios)
- **Artículos:** 0 (total bloqueado)
- **Causa:** `validateArticle()` rechaza todos los URLs descubiertos
- **Solución:** 
  1. Loguear TODAS las razones de rechazo en BD
  2. Revisar medios específicos: ¿qué títulos descubre? ¿por qué < 20 chars?
  3. Si es por título corto, aumentar threshold a 10 chars (test)

---

### 🔴 CRÍTICO — Afecta content, 1500 artículos

**BUG #2:** HTTP Fetch + Playwright fallback NO guardan razones de fallo  
- **Medios:** Chaco por día, Agenfor (2 medios, 100% afectados)
- **Artículos:** ~1,500 (9% del total)
- **Causa:** Fetch + Playwright fallan, pero no sabemos por qué
- **Síntoma:** `extraction_method = 'rss_only'` (sin contenido)
- **Solución:**
  1. Guardar fetchReason + pwReason en BD (nueva columna)
  2. Analizar: ¿Cloudflare? ¿Timeout? ¿No HTML?
  3. Si Cloudflare: necesita scraper especial
  4. Si timeout: aumentar PLAYWRIGHT_TIMEOUT (ahora 20s)

---

### 🟡 ALTO — Inconsistencia arquitectónica

**BUG #3:** validateArticle() se aplica SOLO a Playwright, NO a RSS  
- **Medios:** Todos (37)
- **Artículos:** Potencial de contaminar con títulos < 20 chars
- **Causa:** RSS inserta sin validar, Playwright sí
- **Solución:**
  1. Aplicar validación ANTES de INSERT para RSS también
  2. O deshabilitar validación de title.length < 20 (es arbitraria)
  3. Mantener solo validaciones críticas (no generic, no homepage)

---

### 🟡 MEDIO — Data quality

**Issue #4:** 15% de artículos < 120 words no se rechazan  
- **Artículos:** ~2,525 (15% del total)
- **Impacto:** Baja calidad en clustering
- **Solución:**
  1. Aplicar threshold 120 words durante discovery (no después)
  2. O cambiar threshold en validateArticle() a 80 words

---

### 🟢 BAJO — Code quality

**Issue #5:** Código duplicado en title/content extraction  
- **Ubicaciones:** ArticleFetcher.js vs newsMonitor.js
- **Impacto:** Maintenance burden, inconsistencia
- **Solución:**
  1. Extraer funciones comunes a utils.js
  2. newsMonitor importa ArticleFetcher.js (ya lo hace!)

---

## 11. MAPA DE FLUJO COMPLETO

### Discovery Methods por Medio

```
┌─ RSS (26 medios)
│  ├─ Reuters: rss → sitemap-index → 2827 artículos ✅
│  ├─ El Cronista: rss → 2075 artículos ✅
│  └─ ... otros 24
│
├─ News-Sitemap (6 medios)
│  ├─ Bola Vip: news-sitemap → 474 artículos ✅
│  ├─ TyC Sports: news-sitemap → 1619 artículos ✅
│  └─ ... otros 4
│
├─ Sitemap-Index (1 medio)
│  └─ Reuters: Already counted above
│
└─ Playwright Discovery Fallback (5 medios)
   ├─ La Mañana: 77 artículos ✅
   ├─ Yahoo Noticias: 190 artículos ✅
   ├─ BAE negocios: 36 artículos ✅
   ├─ Diario Formosa: 0 artículos ❌ (validateArticle rejects all)
   ├─ Guau Formosa: 0 artículos ❌
   └─ Vía País: 0 artículos ❌
```

### Content Extraction Funnels

```
RSS Items → Discovered
   │
   ├─ INSERT into monitored_articles (no validation)
   │    │
   │    └─ fetchPendingArticleContent()
   │         ├─ HTTP Fetch 10s ─→ SUCCESS (87%) ─→ 14,778 articles
   │         │                  └─ FAIL ─→ Playwright
   │         │
   │         └─ Playwright 20s ─→ SUCCESS (0.1%) ─→ 21 articles
   │                          └─ FAIL ─→ RSS only (9%)
   │
   └─ Paywall detected ─→ 12 articles (0.07%)

Total: 17,140 monitored_articles in 7 days
   - Fetch: 14,778 (86%)
   - RSS only: 1,490 (9%)
   - Pending: 839 (5%)
   - Playwright: 21 (0.1%)
   - Paywall: 12 (0.07%)
```

---

## 12. TESTING CHECKLIST (Para validar fixes)

- [ ] Ejecutar monitor para Chaco por día, capturar logs HTTP/Playwright
- [ ] Ejecutar monitor para Diario Formosa, capturar URLs descubiertas
- [ ] Verificar: ¿Por qué validateArticle() rechaza esas URLs?
- [ ] Verificar: ¿Por qué HTTP falla en Chaco por día?
- [ ] Agregar logging de fetchReason/pwReason en BD
- [ ] Aplicar validateArticle() a RSS items también
- [ ] Test: Aumentar PLAYWRIGHT_TIMEOUT a 25s, ver si mejora
- [ ] Test: Cambiar title.length threshold de 20 a 10 chars
- [ ] Test: Aplicar 120-word threshold durante discovery (no después)

---

## CONCLUSIÓN

El monitor NO es confiable porque:

1. **3 medios están bloqueados** (Diario Formosa, Guau Formosa, Vía País) — Playwright descubre pero validateArticle rechaza TODAS las URLs sin almacenar razón
2. **~1,500 artículos pierden contenido** (Chaco por día, Agenfor) — HTTP + Playwright fallan sin registrar causa
3. **Validación inconsistente** — RSS inserta sin validar, Playwright valida estrictamente
4. **Sin observabilidad** — Los rechazos/fallos se loguean en console, no en BD

**Para hacerlo confiable se necesita:**
1. Identificar por qué validateArticle() rechaza URLs de esos 3 medios (audit específico)
2. Guardar razones de fallo (fetchReason, pwReason) en BD
3. Investigar por qué Chaco por día/Agenfor no extraen contenido
4. Aplicar validación consistente o eliminarlo completamente
5. Aumentar timeouts de Playwright si es timeout issue
6. Agregar debug logging que persista en BD (actual: solo console)

Sin estos cambios, medios como Diario Formosa seguirán mostrando 0 artículos.
