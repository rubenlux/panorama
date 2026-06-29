# AUDIT 1 — MONITOR (Crawler: RSS → Contenido)

**Objetivo**: Rastrear 8 casos reales de extremo a extremo. Encontrar dónde exactamente rompe el crawler.

**NO**: Hipótesis. **SÍ**: Evidencia.

---

## Los 8 Casos

### Caso A: Reuters (Baseline — Debe Funcionar)
```
Origen:         Reuters RSS feed
URL:            https://www.reuters.com/article/XXX
Método:         HTTP
Esperado:       content_text completo, extraction_method='fetch'
Pregunta:       ¿Qué sucede en el caso perfecto?
```

**Trace**: 
```sql
SELECT id, title, url, extraction_method, content_text IS NOT NULL as has_content, word_count
FROM monitored_articles
WHERE url LIKE '%reuters%' AND created_at > now() - interval '7 days'
LIMIT 1;

SELECT * FROM crawl_session WHERE article_id = '[RESULT.id]';
SELECT * FROM crawl_attempts WHERE article_id = '[RESULT.id]';
```

---

### Caso B: Cloudflare HTTP Fallido + Playwright
```
Origen:         Sitio con Cloudflare
URL:            https://example.com/article (devuelve 403 sin Cloudflare bypass)
Método:         HTTP fallido → ¿Playwright rescata?
Esperado:       extraction_method='playwright'
Pregunta:       ¿Se intenta Playwright después de 403?
```

**Trace**:
```sql
-- Buscar artículos que terminaron con playwright
SELECT id, url, extraction_method, domain
FROM monitored_articles
WHERE extraction_method='playwright' AND created_at > now() - interval '7 days'
LIMIT 3;

-- Para cada uno:
SELECT * FROM crawl_session WHERE article_id = '[ID]';
SELECT * FROM crawl_attempts WHERE article_id = '[ID]' ORDER BY attempt_number;

-- Verificar: ¿HTTP fue 403?
SELECT * FROM crawl_attempts 
WHERE article_id = '[ID]' AND stage='HTTP' AND http_status=403;
```

---

### Caso C: Contenido Vacío (Boilerplate o Selector)
```
Origen:         Sitio con layout complejo
URL:            https://example.com/article
Método:         HTTP devolvió HTML, pero extraction falló
Esperado:       extraction_method='rss_only' (porque HTML se descargó pero no se parsed)
Pregunta:       ¿Dónde exactamente se pierde el contenido? ¿Selector? ¿Boilerplate?
```

**Trace**:
```sql
-- Artículos creados pero sin contenido
SELECT id, url, extraction_method, domain
FROM monitored_articles
WHERE content_text IS NULL AND extraction_method='rss_only' 
  AND created_at > now() - interval '7 days'
LIMIT 5;

-- Para cada uno:
SELECT * FROM crawl_session WHERE article_id = '[ID]';
SELECT * FROM crawl_attempts WHERE article_id = '[ID]';

-- Detalles del intento:
SELECT stage, status, reason, duration_ms, bytes_downloaded, content_length, details
FROM crawl_attempts
WHERE article_id = '[ID]' AND stage='HTTP';
```

---

### Caso D: URL Rota (404)
```
Origen:         RSS con URL desactualizada
URL:            https://example.com/article/old-slug (404)
Método:         HTTP
Esperado:       extraction_method=NULL, content_text=NULL, razón registrada
Pregunta:       ¿Se registra el 404? ¿Sigue intentando Playwright?
```

**Trace**:
```sql
-- Artículos con extraction_method NULL (nunca procesados o falló todo)
SELECT id, url, extraction_method, domain
FROM monitored_articles
WHERE extraction_method IS NULL AND created_at > now() - interval '1 day'
LIMIT 10;

-- Para cada uno:
SELECT * FROM crawl_session WHERE article_id = '[ID]';
SELECT * FROM crawl_attempts WHERE article_id = '[ID]';

-- ¿HTTP devolvió 404?
SELECT http_status, reason, stage, status
FROM crawl_attempts
WHERE article_id = '[ID]';
```

---

### Caso E: Contenido Parcial (Falta Scroll o Lazy Load)
```
Origen:         Sitio con contenido lazy-loaded
URL:            https://example.com/article
Método:         HTTP obtuvo HTML incompleto (falta contenido debajo de fold)
Esperado:       Problema: HTTP devuelve 50 palabras, Playwright devolvería 500
Pregunta:       ¿HTTP retorna contenido parcial? ¿Cómo lo detectamos?
```

**Trace**:
```sql
-- Comparar HTTP vs Playwright word count en mismo artículo
-- (Si hubo retry/fallback en el mismo articulo)

-- Articles with multiple attempts (HTTP + Playwright)
SELECT article_id, COUNT(*) as attempt_count
FROM crawl_attempts
WHERE created_at > now() - interval '7 days'
GROUP BY article_id
HAVING COUNT(*) > 1;

-- Para cada uno:
SELECT stage, status, content_length, word_count_extracted, duration_ms
FROM crawl_attempts
WHERE article_id = '[MULTI_ATTEMPT_ID]'
ORDER BY attempt_number;
```

---

### Caso F: Facebook Link (Especial: Paywall o Bot Detection)
```
Origen:         Facebook link
URL:            https://facebook.com/page/post/XXX (o respuesta de crawl de FB)
Método:         HTTP (devuelve login page), ¿Playwright con cookies?
Esperado:       ¿Puede Playwright acceder con cookies persistentes?
Pregunta:       ¿Funciona el fetch de Facebook? ¿Fallamos consistentemente?
```

**Trace**:
```sql
-- Artículos de Facebook
SELECT id, url, extraction_method, domain
FROM monitored_articles
WHERE url LIKE '%facebook%' AND created_at > now() - interval '7 days'
LIMIT 5;

-- Para cada uno:
SELECT * FROM crawl_session WHERE article_id = '[ID]';
SELECT * FROM crawl_attempts WHERE article_id = '[ID]';

-- Dominio: facebook.com, ¿qué estrategia tiene?
SELECT * FROM domain_profiles WHERE domain='facebook.com';
```

---

### Caso G: Transcripción YouTube (P0 Observability)
```
Origen:         YouTube video link
URL:            https://youtube.com/watch?v=XXX
Método:         Playwright (con Transcript extractor)
Esperado:       transcript_text completo
Pregunta:       ¿Funciona el scrape de transcripts? ¿Quality score qué rango tiene?
```

**Trace**:
```sql
-- Videos con transcript
SELECT id, url, extraction_method
FROM monitored_articles
WHERE url LIKE '%youtube%' AND extraction_method='playwright'
  AND created_at > now() - interval '7 days'
LIMIT 3;

-- Para cada uno:
SELECT * FROM page_metadata WHERE article_id = '[ID]';
SELECT * FROM crawl_attempts WHERE article_id = '[ID]';
```

---

### Caso H: Duplicado (Mismo Contenido, Múltiples Feeds)
```
Origen:         Reuters publica, luego TN republica
URL1:           https://reuters.com/article/...
URL2:           https://tn.com.ar/article/... (mismo contenido)
Método:         HTTP (ambos)
Esperado:       ¿Monitor detecta que son iguales? ¿Los agrupa?
Pregunta:       ¿Content hash funciona? ¿Coverage los deduplica?
```

**Trace**:
```sql
-- Buscar articles con content_hash duplicado
SELECT content_hash, COUNT(*) as count
FROM crawl_content_versions
WHERE content_hash IS NOT NULL
GROUP BY content_hash
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 5;

-- Ver qué artículos comparten hash:
SELECT article_id, content_hash
FROM crawl_content_versions
WHERE content_hash = '[DUPLICATED_HASH]';
```

---

## Cómo Ejecutar la Auditoría

### Paso 1: Elegir un Caso

```bash
# Ejecutar la trace SQL del Caso A (Reuters)
psql $DATABASE_URL -f audit_queries/case_a_reuters.sql

# Resultado: artículo específico con ID
# Ejemplo: id='f7a9c8e2-1234-5678-9abc-def0123456'
```

### Paso 2: Rastrear en Profundidad

```bash
# Para el ID del Paso 1, ejecutar todas las queries:

# 2a. ¿Qué pasó en el crawler?
SELECT * FROM crawl_session WHERE article_id = 'f7a9c8e2-1234-5678-9abc-def0123456';

# 2b. ¿Qué intentos?
SELECT * FROM crawl_attempts WHERE article_id = 'f7a9c8e2-1234-5678-9abc-def0123456' ORDER BY attempt_number;

# 2c. ¿Qué resultado final?
SELECT * FROM monitored_articles WHERE id = 'f7a9c8e2-1234-5678-9abc-def0123456';
```

### Paso 3: Documentar Hallazgo

```
CASO A: Reuters
Artículo ID: f7a9c8e2-1234-5678-9abc-def0123456
URL: https://reuters.com/article/...

Resultado: ✅ FUNCIONA
├─ crawl_session.strategy = 'HTTP_ONLY'
├─ crawl_attempts.stage = 'HTTP', status = 'SUCCESS', http_status = 200
├─ content_length = 4523, word_count = 678
├─ extraction_method = 'fetch'
└─ monitored_articles.content_text = [full content]

Conclusión: Baseline OK. Este artículo es un caso de éxito.
```

### Paso 4: Si Encuentra Bug

```
CASO B: Cloudflare
Artículo ID: a1b2c3d4-5678-9abc-def0-123456789abc
URL: https://example-cloudflare.com/article/...

Resultado: ❌ FALLO
├─ crawl_session.strategy = 'HTTP_ONLY'
├─ crawl_attempts.stage = 'HTTP', status = 'FAILED', http_status = 403, reason = '403'
├─ (no existe entry con stage = 'PLAYWRIGHT')
├─ extraction_method = 'rss_only'
└─ monitored_articles.content_text = NULL

BUG CONFIRMADO:
- HTTP devolvió 403
- Playwright nunca fue intentado
- Code location: ArticleFetcher.js línea 127
  if (!resp.ok) return null;  ← debería intentar Playwright

FIX PROPUESTO: Detectar 403 y pasar a Playwright.
```

---

## Archivos de Queries (Crear)

Crear archivo `audit_queries/` con queries listas:

```
audit_queries/
├─ case_a_reuters.sql
├─ case_b_cloudflare.sql
├─ case_c_empty_content.sql
├─ case_d_404.sql
├─ case_e_partial.sql
├─ case_f_facebook.sql
├─ case_g_youtube.sql
└─ case_h_duplicate.sql
```

Cada uno es un SELECT que encuentra UN artículo representativo de ese caso.

---

## Regla De Oro

**"Si no puedo nombrar el Artículo ID y el número de línea donde rompe, no es un bug."**

---

**Próximo paso**: Ejecutar las 8 queries, encontrar los 8 casos, documentar hallazgos con ID + línea.
