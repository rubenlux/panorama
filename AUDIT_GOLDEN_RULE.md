# LA REGLA DE ORO — Auditoría Sin Hipótesis

**Principio**: No arreglamos lo que "creemos" que está roto. Seguimos un caso real hasta encontrar exactamente dónde rompe.

---

## El Ciclo (Repetido para cada bug)

### 1️⃣ Elegir un Caso Real Representativo

NO: "10 artículos al azar"

SÍ: 8 casos cuidadosamente seleccionados

```
Caso A: Artículo perfecto (baseline)
        → Origen: Reuters
        → Método: HTTP
        → Esperado: Contenido completo → Coverage OK → UI OK

Caso B: Artículo RSS_ONLY
        → Origen: Facebook
        → Método: HTTP + Playwright (ambos fallaron)
        → Pregunta: ¿Por qué Playwright no lo rescató?

Caso C: Artículo vacío (content_text IS NULL)
        → Origen: Formosa
        → Método: Cloudflare
        → Pregunta: ¿Se intentó Playwright? ¿Por qué falló?

Caso D: URL rota
        → Origen: TN (404)
        → Método: HTTP devolvió 404
        → Pregunta: ¿Se registró? ¿Coverage lo vio?

Caso E: Contenido parcial
        → Origen: Reuters
        → Método: HTTP
        → Pregunta: ¿Faltó scroll? ¿Selector incorrecto?

Caso F: Contenido duplicado
        → Origen: Múltiples feeds
        → Método: HTTP
        → Pregunta: ¿Coverage lo detectó? ¿Lo fusionó correctamente?

Caso G: Facebook payload
        → Origen: Facebook
        → Método: ¿Qué intentó?
        → Pregunta: ¿El transcript se descargó? ¿El análisis se hizo?

Caso H: Transcripción YouTube
        → Origen: YouTube
        → Método: Playwright
        → Pregunta: ¿La transcripción se extrajo? ¿El análisis pasó?
```

### 2️⃣ Seguirlo EXTREMO A EXTREMO

**No**: Leer código de ArticleFetcher.js en abstracto

**Sí**: Tracer este ID específico por todo el sistema

```
Artículo: xxxx-xxxx-xxxx (URL: https://tn.com.ar/...)

├─ RSS Feed
│  ├─ ¿Entró a monitored_articles?
│  └─ SELECT * FROM monitored_articles WHERE id = 'xxxx'
│     → title, url, created_at, content_text, extraction_method
│
├─ newsMonitor.js :: processSource()
│  ├─ ¿Se creó con content_text=NULL?
│  └─ Log: "Article created, id=xxxx, extraction_method=NULL"
│
├─ ArticleFetcher.js :: fetchArticleContentForMonitor()
│  ├─ ¿Se llamó? (Check crawl_session table)
│  ├─ SELECT * FROM crawl_session WHERE article_id = 'xxxx'
│  │  → strategy, final_status, final_method, total_duration_ms
│  │
│  ├─ HTTP Attempt?
│  │  ├─ SELECT * FROM crawl_attempts WHERE article_id = 'xxxx' AND stage = 'HTTP'
│  │  ├─ http_status, duration_ms, reason, content_length
│  │  └─ ¿Devolvió 2xx? ¿Tuvo contenido?
│  │
│  └─ Playwright Attempt?
│     ├─ SELECT * FROM crawl_attempts WHERE article_id = 'xxxx' AND stage = 'PLAYWRIGHT'
│     ├─ status, duration_ms, reason, content_length
│     └─ ¿Se intentó? ¿Por qué falló?
│
├─ UPDATE monitored_articles
│  ├─ SELECT * FROM monitored_articles WHERE id = 'xxxx'
│  └─ content_text, extraction_method
│     → ¿Quedó NULL? ¿extraction_method='rss_only'?
│
├─ Coverage.js
│  ├─ ¿Vio el artículo?
│  ├─ SELECT * FROM story_clusters WHERE article_id = 'xxxx'
│  └─ ¿Se agrupó? ¿Con qué otros?
│
└─ Frontend (CMS)
   ├─ MediaMonitor.jsx
   ├─ ¿Aparece?
   ├─ ¿Con qué resumen?
   └─ ¿Qué botones muestra?
```

### 3️⃣ Encontrar EXACTAMENTE Dónde Rompe

**No aceptamos**:
- "Creo que HTTP es lento"
- "Probablemente timeout"
- "Tal vez Cloudflare"

**Aceptamos**:
- "Artículo xxxx, HTTP devolvió 403 (línea 127 de ArticleFetcher.js), nunca entró a Playwright (línea 226)"
- "Artículo xxxx, Playwright timeout after 20s (línea 156), no hay retry (confirmado: no hay try-catch con reintento)"
- "Artículo xxxx, HTML tiene 45 bytes (contenido vacío), checkea `html.length < 100` (línea 130), pasa a rss_only"

**Evidencia requerida**:
```
Artículo: xxxx-xxxx
Bug: HTTP devolvió 403, Playwright nunca fue llamado

Prueba:
1. SELECT * FROM crawl_attempts WHERE article_id = 'xxxx-xxxx'
   → stage='HTTP', status='FAILED', reason='403', http_status=403
   → (no existe stage='PLAYWRIGHT')

2. ArticleFetcher.js línea 127:
   if (!resp.ok) return null;  ← si 403, retorna null sin try Playwright

3. ArticleFetcher.js línea 226:
   if (result) ... else { extraction_method='rss_only' }  ← no hay Playwright

BUG CONFIRMADO: 403 debería triggerar Playwright automáticamente
```

### 4️⃣ Corregir SOLO Ese Punto

**Máximo 30-50 líneas de cambio.**

**No**:
- Refactor completo de ArticleFetcher.js
- Cambio de arquitectura
- Nueva máquina de estado

**Sí**:
```javascript
// ArticleFetcher.js línea 127
if (!resp.ok) {
  // NEW: 403/429 → try Playwright, don't give up
  if ([403, 429].includes(resp.status)) {
    console.log(`HTTP ${resp.status} on ${url}, trying Playwright...`);
    return await fetchWithPlaywright(url, articleId); // try fallback
  }
  return null;
}
```

### 5️⃣ Validar

**Antes de fix:**
```sql
SELECT extraction_method, COUNT(*) 
FROM monitored_articles 
WHERE created_at > now() - interval '1 day' 
GROUP BY extraction_method;
```

Result:
```
extraction_method | count
------------------+-------
NULL              | 15
rss_only          | 42
http              | 80
playwright        | 3
```

**Después del fix:**
```
extraction_method | count
------------------+-------
NULL              | 5    ← down from 15
rss_only          | 30   ← down from 42 (Playwright rescued 12)
http              | 85   ← up from 80
playwright        | 20   ← up from 3 (rescued from 403s)
```

✅ **Fix validado** → siguiente bug

### 6️⃣ Siguiente Bug

Repeat ciclo.

---

## Lo Que NO Hacemos

❌ Especular sobre código  
❌ Leer funciones en abstracto  
❌ Cambios "por si acaso"  
❌ Refactors profilácticos  
❌ "Optimizaciones" sin evidencia  
❌ Corregir 5 cosas a la vez  

---

## Lo Que SÍ Hacemos

✅ Elegir casos reales  
✅ Seguirlos extremo a extremo  
✅ Encontrar evidencia de dónde rompe  
✅ Fix mínimo  
✅ Validar con datos  
✅ Siguiente  

---

## Máxima

**"Si no puedo nombrar el artículo ID y el número de línea donde rompe, no es un bug confirmado."**
