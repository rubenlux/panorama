# Auditoría del Pipeline Actual — newsMonitor + ArticleFetcher + Playwright

**Objetivo**: Identificar exactamente dónde se pierde contenido  
**Enfoque**: Rastrear el flujo completo de un artículo  
**Meta**: Encontrar 3-5 bugs verificables  

---

## Flujo Actual (Simplificado)

```
RSS Feed
  ↓
newsMonitor.js → processSource()
  ├─ Extrae URL + title de RSS
  ├─ CREATE monitored_articles (content_text = NULL, extraction_method = NULL)
  └─ Agrega ID a allNewIds[]
  ↓
fetchPendingArticleContent()
  ├─ SELECT * FROM monitored_articles WHERE content_text IS NULL
  ├─ Para cada artículo:
  │  ├─ fetchArticleContentForMonitor(url)
  │  │  ├─ HTTP fetch
  │  │  ├─ IF success AND word_count >= 80:
  │  │  │  └─ RETURN {content, word_count, method='fetch'}
  │  │  └─ ELSE:
  │  │     └─ fetchWithPlaywright()
  │  │        ├─ Launch browser
  │  │        ├─ Extract content
  │  │        └─ IF success: RETURN {content, method='playwright'}
  │  │        └─ ELSE: RETURN null
  │  │
  │  └─ IF result?.content:
  │     └─ UPDATE monitored_articles SET content_text, extraction_method
  │  └─ ELSE:
  │     └─ UPDATE monitored_articles SET extraction_method='rss_only'
  ↓
Coverage
  └─ Usa monitored_articles (content_text puede ser NULL)
```

---

## Puntos Críticos a Auditar

### 1. newsMonitor.js — Creación de artículos

**Archivo**: `src/jobs/newsMonitor.js`  
**Líneas**: ~254-262 (processSource)

**Preguntas**:
- ¿Crea articulo con `content_text=NULL`? ✓ Sí (confirmar)
- ¿Se ejecuta `fetchPendingArticleContent()` siempre después? ✓ (línea 2229)
- ¿Hay artículos que nunca entran a `fetchPendingArticleContent()`? ❓

**Bugs posibles**:
- ❓ `fetchPendingArticleContent()` no se ejecuta si hay excepción previa
- ❓ Artículos creados pero no procesados dentro de tiempo X
- ❓ Condición `WHERE content_text IS NULL` no captura todo

### 2. ArticleFetcher.js — Extracción HTTP

**Archivo**: `src/services/ArticleFetcher.js`  
**Función**: `fetchArticleContentForMonitor(url, articleId)`

**Preguntas**:
- ¿Qué sucede si `resp.ok = false` (HTTP 403, 404, etc.)? → Retorna `null` (línea 127)
- ¿Se intenta Playwright si HTTP falla? ✓ Sí (línea 226)
- ¿Hay timeout en HTTP? ✓ 10 segundos (línea 125)
- ¿Captura errores de red? ✓ Parcial (línea 204 catch)

**Bugs posibles**:
- ❓ Si HTTP es lento (8s) + Playwright intento (20s) = 28s total. ¿Se agota timeout?
- ❓ Condición `result.word_count >= MIN_WORDS_FETCH` (línea 220) es 80. ¿Muy alto?
- ❓ Si HTTP retorna 200 pero HTML vacío, se va a Playwright. ¿Lo detecta correctamente?

### 3. Playwright — Fallback

**Archivo**: `src/connectors/playwright.js`  
**Función**: `scrapeWithPlaywright(url, timeoutMs)`

**Preguntas**:
- ¿Lanza navegador? ✓ Sí (línea 23)
- ¿Timeout es 20s? ✓ Sí (por defecto)
- ¿Maneja errores? ✓ Parcial (línea 33)
- ¿Cierra navegador después? ✓ Sí (finally, línea 37)

**Bugs posibles**:
- ❓ `waitUntil: 'domcontentloaded'` puede no esperar todo el contenido
- ❓ Si página requiere scroll para cargar contenido, se pierde
- ❓ No hay retry en Playwright (si timeout en PW, game over)

### 4. NewsMonitor — Coverage

**Archivo**: `src/jobs/newsMonitor.js`  
**Líneas**: ~2095-2130

**Preguntas**:
- ¿Solo procesa PENDING artículos? ✓ Sí
- ¿Qué pasa si `fetchPendingArticleContent()` falla? → Articulo queda con `content_text=NULL`
- ¿Hay logs de qué artículos quedaron sin contenido? ❌ Probablemente no

---

## Problemas Identificados (Hipótesis)

### Problema 1: HTTP 403 (Cloudflare)
**Síntoma**: Articles con `extraction_method='rss_only'` (Cloudflare bloqueó)  
**Ubicación**: ArticleFetcher.js línea 127 (retorna null si no 2xx)  
**Solución**: Detectar 403 y pasar a Playwright inmediatamente

### Problema 2: Playwright timeout en dominios lentos
**Síntoma**: Articulo con `extraction_method=NULL` (probablemente timeout)  
**Ubicación**: ArticleFetcher.js línea 156  
**Solución**: Registrar timeout, agregar retry o fallback

### Problema 3: HTML vacío
**Síntoma**: `content_text=NULL` pero `extraction_method='rss_only'` (no debería ser)  
**Ubicación**: ArticleFetcher.js línea 130 (checkea `html.length < 100`)  
**Solución**: Mejor validación

### Problema 4: Minuto mínimo de palabras muy alto
**Síntoma**: Articulos cortos (100-200 palabras) quedan con `extraction_method='rss_only'`  
**Ubicación**: ArticleFetcher.js línea 29 (`MIN_WORDS_FETCH = 80`)  
**Solución**: Bajar a 50 o usar otra métrica

### Problema 5: Sin reintentos en Playwright
**Síntoma**: Si Playwright timeout, articulo se marca como fallido sin retry  
**Ubicación**: ArticleFetcher.js línea 226 (no hay retry)  
**Solución**: Agregar 1-2 reintentos automáticos

### Problema 6: Logs insuficientes
**Síntoma**: No sabemos qué artículos fallaron ni por qué  
**Ubicación**: newsMonitor.js línea 2124 (solo logs genéricos)  
**Solución**: Log cada artículo con su razón de fallo

---

## Plan de Auditoría Detallada

### Fase 1: Trace Manual (Hoy)

Tomar 10 artículos del último ciclo y rastrear:

```sql
-- 1. Artículos creados
SELECT id, title, url, extraction_method, content_text IS NOT NULL as has_content
FROM monitored_articles
WHERE created_at > now() - interval '1 hour'
LIMIT 10;

-- 2. Artículos que tienen extraction_method = NULL (nunca procesados)
SELECT id, title, extraction_method, content_text IS NOT NULL
FROM monitored_articles
WHERE extraction_method IS NULL AND created_at > now() - interval '1 hour';

-- 3. Artículos con extraction_method = 'rss_only' (HTTP/PW fallaron)
SELECT id, title, extraction_method, content_text, domain
FROM monitored_articles
WHERE extraction_method = 'rss_only' AND created_at > now() - interval '1 hour';

-- 4. Dominio de los 'rss_only' (¿patrón?)
SELECT 
  SUBSTRING(url FROM 'https?://([^/]+)') as domain,
  COUNT(*) as count_rss_only
FROM monitored_articles
WHERE extraction_method = 'rss_only' AND created_at > now() - interval '7 days'
GROUP BY domain
ORDER BY count DESC;
```

### Fase 2: Instrumento P0 (Mañana)

Con P0 observabilidad:

```sql
-- Todos los intentos fallidos
SELECT domain, reason, COUNT(*) 
FROM crawl_attempts
WHERE status = 'FAILED'
GROUP BY domain, reason
ORDER BY COUNT DESC;

-- Dominios donde Playwright es más efectivo que HTTP
SELECT domain,
  ROUND(100.0 * success_http / (success_http + failed_http), 1) as http_pct,
  ROUND(100.0 * success_playwright / (success_playwright + failed_playwright), 1) as pw_pct
FROM domain_profiles
WHERE total_attempts > 10;
```

### Fase 3: Cambios Mínimos (Basado en Hallazgos)

Una vez identificados bugs:

1. ✅ Si problema es timeout → Bajar PLAYWRIGHT_TIMEOUT o agregar retry
2. ✅ Si problema es 403 → Detectar y pasar a Playwright inmediatamente
3. ✅ Si problema es MIN_WORDS → Bajar threshold
4. ✅ Si problema es HTML vacío → Mejor validación
5. ✅ Si problema es logs → Agregar verbose logging

---

## Lo Que NO Haremos

❌ Crear nuevo scheduler  
❌ Separar en múltiples archivos  
❌ Cambiar arquitectura  
❌ Agregar estado PENDING/FETCHING  
❌ Cambiar cron jobs  

---

## Lo Que SÍ Haremos

✅ Leer código actual línea por línea  
✅ Identificar exactamente dónde falla  
✅ Agregar 30-50 líneas de fix (máximo)  
✅ Validar con 100 artículos  
✅ Medir: ¿Coverage funciona? ¿Social funciona? ¿Facebook funciona?

---

**Próximo paso: Fase 1 — Trace Manual**

Espera a que corra observabilidad P0 y ejecuta las queries arriba.