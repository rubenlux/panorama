# BUG TRACKER — Panorama Foundation

| ID | Bug | Severidad | Estado | Evidencia | Fix | Validado |
|---|---|---|---|---|---|---|
| **BUG-001** | Monitor: Contenido incompleto (HTTP 403 → no intenta Playwright) | 🔴 CRÍTICA | 🔴 OPEN | TBD | TBD | TBD |
| **BUG-002** | Facebook: URLs incorrectas (post no abre en URL registrada) | 🔴 CRÍTICA | 🔴 OPEN | TBD | TBD | TBD |
| **BUG-003** | Coverage: No maneja artículos vacíos (rompe con NULL content) | 🟠 ALTA | 🔴 OPEN | TBD | TBD | TBD |
| **BUG-004** | Social: URLs, transcripciones, asociación post↔cluster | 🟠 ALTA | 🔴 OPEN | TBD | TBD | TBD |

---

## BUG-001 — Monitor: Contenido Incompleto

**Descripción**

Monitor intenta HTTP → Playwright en secuencia (línea 332+), pero:
- Si HTTP falla (403, 429, timeout), Playwright se intenta PERO
- Si Playwright también falla, artículo queda como `extraction_method='rss_only'` SIN RAZÓN DOCUMENTADA
- No se registra por qué Playwright falló (timeout, browser error, etc.)

**Síntoma observado**

Artículos con `content_text=NULL` y `extraction_method='rss_only'`. 

Sin logar CÓMO fallaron.

**Dónde rompe**

- Archivo: `src/services/ArticleFetcher.js`
- Línea 309-330: Intenta extraer de HTTP si exitoso
- Línea 332-374: Intenta Playwright si HTTP insuficiente
- Línea 340: `pwResult = await fetchWithPlaywright(url);`
- Línea 345-347: Si falla, `pwReason = 'timeout' o 'playwright_error'`
- Línea 391: `return null;` ← Caller convierte a `extraction_method='rss_only'`

**Problema**

No hay distinción entre:
- "HTTP falló → Playwright falló (intentó ambos)"  
- "HTTP insuficiente → Playwright falló"  
- "Ambos fallaron por timeout"  
- "Ambos fallaron por access denied"

Todo termina como `rss_only` sin detalles.

**Responsable**

`fetchArticleContentForMonitor()` línea 213-391

**Validación requerida**

P0 Observability debe estar DEPLOYED para capturar razones en `crawl_attempts`.

Sin P0, no podemos saber por qué Playwright falló en cada caso.

**Fix propuesto**

Cambiar línea 391 de:
```javascript
return null;  // rss_only — caller handles this
```

A:
```javascript
// Si ambos fallaron, retorna con razón explícita
if (articleId) {
  await recordCrawlAttempt({
    sessionId,
    articleId,
    domain,
    attemptNumber: 3,  // third attempt: decision
    stage: 'DECISION',
    status: 'FAILED',
    reason: pwReason || 'both_methods_exhausted',
    durationMs: Date.now() - startTime,
  }).catch(() => {});
}
return null;  // rss_only — but now we know why
```

O mejor: retornar estructura que documentar qué intentó:
```javascript
return {
  content: null,
  word_count: 0,
  method: 'rss_only',
  reason: pwReason,  // NUEVO: comunica por qué falló Playwright
  attempts: 2  // NUEVO: intento HTTP + Playwright
};
```

**Estado**

- [ ] P0 Observability deployed (prerequisite)
- [ ] Query `crawl_attempts` para confirmar pattern
- [ ] Causa encontrada
- [ ] Fix aplicado
- [ ] Validado
- [ ] Cerrado

---

## BUG-002 — Facebook: URLs Incorrectas

**Descripción**

Posts de Facebook se registran con URL que no coincide con la publicación real.

Cuando abres la URL guardada, no ves el post.

**Cómo reproducir**

1. Captura post de Facebook
2. Guarda URL registrada
3. Abre en navegador
4. **Esperado**: Ve el post
5. **Actual**: Post no aparece o aparece otro

**Dónde rompe**

- Probablemente: `src/connectors/social/fetchers.js`
- Facebook scraper genera `external_id` incorrectamente

**Validación requerida**

```
20 posts de Facebook
Abrir cada URL registrada
Comparar con post en FB

20/20 URLs correctas
```

**Fix propuesto**

Reconstruir `external_id` o usar Graph API en fallback.

**Estado**

- [ ] Reproducido
- [ ] Causa encontrada
- [ ] Fix aplicado
- [ ] Validado
- [ ] Cerrado

---

## BUG-003 — Coverage: Manejo de Artículos Vacíos

**Descripción**

Coverage recibe artículos con `content_text=NULL`.

Falla clustering, crea historias incompletas, o descarta silenciosamente.

**Cómo reproducir**

1. Artículo con extraction_method='rss_only' (contenido vacío)
2. Coverage intenta agrupar
3. **Esperado**: Marca como incompleto, reintenta después
4. **Actual**: Rompe o crea historia basura

**Dónde rompe**

- Archivo: `src/jobs/newsMonitor.js`
- Función: `detectStories()` o `createClusters()`
- Probablemente no valida que content_text IS NOT NULL

**Validación requerida**

```
100 artículos con content_text=NULL
Coverage los procesa
✓ No rompe
✓ Se marcan como incompletos
✓ Se reintentan después
```

**Estado**

- [ ] Reproducido
- [ ] Causa encontrada
- [ ] Fix aplicado
- [ ] Validado
- [ ] Cerrado

---

## BUG-004 — Social: URLs, Transcripciones, Clustering

**Descripción**

Social Intelligence tiene inconsistencias en:
1. URLs de posts (no coinciden con reales)
2. Transcripciones (timeout, IP-blocked, quality baja)
3. Asociación post↔cluster (posts en clusters incorrectos)

**Cómo reproducir**

1. Video YouTube
2. ¿Se extrae transcript? (50% falla)
3. ¿URL del post es correcta? (inconsistente)
4. ¿Post aparece en cluster correcto? (fragmentación)

**Validación requerida**

```
YouTube:
50 videos → 47+ con transcript OK

Facebook:
20 posts → 20/20 URLs correctas

Clustering:
100 posts → 99+ agrupados correctamente
```

**Estado**

- [ ] Reproducido
- [ ] Causa encontrada
- [ ] Fix aplicado
- [ ] Validado
- [ ] Cerrado

---

## Patrón de Trabajo

Cada bug sigue este ciclo:

```
1. REPRODUCIR
   └─ SQL query o manual test para confirmar el bug

2. UBICAR LÍNEA
   └─ Exactamente qué código causa el problema

3. FIX MÍNIMO
   └─ Máximo 30-50 líneas, no refactor

4. VALIDAR
   └─ Datos reales (Reuters, TN, Facebook, etc.)

5. COMMIT
   └─ fix(monitor): descripción + validación

6. SIGUIENTE BUG
   └─ No empezar otro hasta cerrar éste
```

---

## Commits Esperados

```
fix(monitor):
HTTP 403 now triggers Playwright fallback automatically.

Validated:
Reuters    ✓ 15/15
TN         ✓ 18/18
Facebook   ✓ 32/32
Infobea    ✓ 10/10
Agenfor    ✓ 10/10

Total: 90/90 articles with complete content.
```

```
fix(facebook):
Correct canonical URL extraction for posts.

Validated:
20/20 posts open correctly in browser.
```

```
fix(coverage):
Handle NULL content gracefully.

Validated:
100 empty articles processed.
0 failures.
Marked for retry: 100/100.
```

---

**Próximo paso**: Reproducir BUG-001 con datos reales.
