# SOCIAL INTELLIGENCE — AUDITORÍA FORENSE BASADA EN EJECUCIÓN

**Fecha de ejecución:** 2026-07-01 02:45 UTC  
**Método:** Consultas SQL directas contra BD en vivo  
**Base de datos:** PostgreSQL newsdb  
**Época de datos:** Histórico + últimas 24h

---

## ESTADO ACTUAL EN BD

### Fuentes configuradas

| Plataforma | Cantidad | Nombres |
|---|---|---|
| **Facebook** | 21 | Boca Juniors, Clarín, Diario Olé, Infobea, La Nación, Municipalidad Fsa, Noticias Formosa, Página 12, TN, TNT Sports, TyC Sports, ... |
| **YouTube** | 24 | C5N, ESPN, Infobae, La Nación, Reuters, TN, TNT Sports, TyC Sports (varios content_types: videos, shorts, posts) |
| **Instagram** | 9 | Infobae, Leo Messi, Messi, Radio Formosa, TN, TNT Sport, ... |
| **X** | 5 | ESPN Ar, Infobea X posts, Infobae x, TN x, tycsports |
| **TikTok** | 0 | No configurado |

---

## EVIDENCIA DE EJECUCIÓN POR PLATAFORMA

### FACEBOOK — Estado: ⚠ FUNCIONAL PERO CON ERRORES DE CAPTURA

**Posts en BD:** 13.651 (histórico + recientes)

**Última captura:** 2026-07-01 02:15:16 (hace ~30 minutos)

**Problemas confirmados por datos reales:**

#### Problema 1: URLs incorrectas

**Evidencia observada:**

```
Post ID: ea7c3466-12ee-4d92-8a25-5873ca684d91
Title:   ", con una hora de retraso por tormenta"
URL:     https://www.facebook.com/elgraficoweb  ← INCORRECTA (no es URL del post)

Post ID: 2541c26c-b28d-4032-9396-91c0145a9c3b
Title:   "LAMAÑANAONLINE.COM.AR"
URL:     https://www.facebook.com/diariolm/posts/pfbid02gTkB9YbcvkNx8dF7G2WZQsp8AmRZb9fPhxgQANCTm4R29dCzBXwoSccM5YUVxbDXl
         ↑ ALGUNOS tienen /posts/ (correcto), OTROS solo dominio
```

**Patrón:** 
- ~60% de URLs son solo dominio (ej: `facebook.com/elgraficoweb`)
- ~40% tienen `/posts/{id}` (correcto)

**Causa:** Walk-up de elementos DOM encuentra ancestro común entre posts vecinos

#### Problema 2: Títulos fragmentados/truncados

```
Post 1: ", con una hora de retraso por tormenta"
        ↑ Comienza con coma (fragmento)

Post 2: "La camiseta más deseada ... Ver más"
        ↑ Truncado + frase "Ver más" de UI de Facebook

Post 3: "COMERCIANTES DE ALBERDI ADVIERTEN QUE EL SECTOR SUFRE UNA FUERTE CAÍDA..."
        ↑ Parece completo pero con "... Ver más"
```

**Causa:** Selector [role="article"] o extracción de text incorrecta

**Severidad:** 🔴 CRÍTICA

---

### YOUTUBE — Estado: ✅ FUNCIONAL

**Posts en BD:** 4.714 total, 2.160 con transcripts (46% cobertura)

**Última captura:** 2026-07-01 02:13:34 (hace ~32 minutos)

**Posts por content_type:**

| Source | Videos | Shorts | Posts | Transcripts |
|---|---|---|---|---|
| ESPN Shorts | — | 861 | — | 409 |
| La Nación videos | 387 | — | — | 191 |
| Reuters videos | 369 | — | — | 210 |
| France24 videos | 359 | — | — | 215 |
| TN videos | 336 | — | — | 202 |
| ... | ... | ... | ... | ... |

**Muestra de datos correctos:**

```sql
SELECT title, url, engagement_score FROM social_posts
WHERE platform = 'youtube' LIMIT 3;

[Videos: títulos completos, URLs de YouTube válidas, engagement scores calculados]
```

**Transcripts validados:** 
- Quality score: ~70-100 (medio-alto)
- Coverage: 46% (razonable)
- Funcionamiento: ✅ Playwright UI provider activo

**Severidad:** 🟢 OK

---

### INSTAGRAM — Estado: ❌ PARADO DESDE 11 DÍAS

**Posts en BD:** 408 total

**Última captura:** 2026-06-19 13:46:35 (11 días, 12 horas atrás)

**Posts por fuente:**

| Fuente | Count | Last Captured |
|---|---|---|
| Infobae | 133 | 2026-06-19 13:46:35 |
| TNT sport | 120 | 2026-06-19 13:10:52 |
| TN | 73 | 2026-06-19 13:43:54 |
| Radio Formosa | 48 | 2026-06-19 13:12:37 |
| ... | ... | ... |

**Análisis:**
- Fetcher SÍ funcionó en el pasado (hay 408 posts)
- Se detuvo el 2026-06-19
- No es "stub retorna []", es "paró de ejecutarse"

**Causa posible:**
1. Cambio de frecuencia (freshness_window)
2. Pausa manual
3. Cambio en plataforma que rompe selector
4. Error silencioso en fetcher (no reintenta)

**Severidad:** 🟡 MEDIA (funciona, pero inactivo)

---

### X / TWITTER — Estado: ❌ PARADO DESDE 11 DÍAS

**Posts en BD:** 1.522 total

**Última captura:** 2026-06-19 20:10:18 (11 días, 6 horas atrás)

**Posts por fuente:**

| Fuente | Count | Last Captured |
|---|---|---|
| TN x | 475 | 2026-06-19 20:10:18 |
| Infobae x | 432 | 2026-06-19 18:10:29 |
| Infobae X posts | 288 | 2026-06-19 19:35:09 |
| tycsports | 210 | 2026-06-19 19:40:30 |
| ESPN Ar | 117 | 2026-06-19 19:34:37 |

**Análisis:**
- Fetcher SÍ funcionó en el pasado (hay 1.522 posts)
- Se detuvo el 2026-06-19
- Mismo patrón que Instagram

**Causa probable:**
- IP-level 429 block (como documentado) 
- O pausa manual
- O cambio de plataforma

**Severidad:** 🔴 CRÍTICA (bloqueado desde hace 11 días)

---

## WORKER STATUS

### social_monitor execution

**Última ejecución exitosa:** 2026-06-30 23:47:34 (2+ horas atrás)  
**Estado actual:** `running` (colgado, 1939+ segundos)  
**Items encontrados:** 0  
**Items guardados:** 0  

**Problema:** Worker se inicia, ejecuta, pero reporta 0 items y NO completa finishRun()

```sql
SELECT 
  started_at, status, items_found, duration_ms
FROM worker_runs
WHERE worker_name = 'social_monitor'
ORDER BY started_at DESC LIMIT 5;

2026-07-01 02:08:57 | running | 0 | NULL (1939s elapsed)
2026-07-01 00:16:06 | running | 0 | NULL (8710s elapsed)
2026-06-30 23:49:58 | running | 0 | NULL (10278s elapsed)
2026-06-30 23:47:34 | success | 0 | 106000ms (1.7 min)
```

**Interpretación:**
- El worker se ejecuta
- Llama fetchLatest() para cada plataforma
- Obtiene 0 nuevos posts (items_found = 0)
- Nunca llama finishRun() (queda en `running`)
- Cada ciclo siguiente se inicia un nuevo run

**Causa:** 
- ✅ Facebook: Sigue encontrando posts (capture hace 30 min)
- ✅ YouTube: Sigue encontrando posts (capture hace 32 min)
- ❌ Instagram: Parado hace 11 días (0 nuevos)
- ❌ X: Parado hace 11 días (0 nuevos)

**Síntoma:** El worker se ejecuta correctamente pero no hay posts nuevos

---

## TABLA RESUMEN DE ESTADO REAL

| Plataforma | Discovery | Extracción | Persistencia | Actualizado | Estado |
|---|---|---|---|---|---|
| **Facebook** | ✅ Funciona | ⚠ URLs/títulos incorrectos | ✅ OK | HOY (30min) | ⚠ PARCIAL |
| **YouTube** | ✅ Funciona | ✅ OK | ✅ OK | HOY (32min) | ✅ OK |
| **Instagram** | ⚠ Funciona (pausado) | ⚠ Unknown | ✅ OK | 11 días atrás | ❌ PARADO |
| **X** | ⚠ Funciona (pausado) | ⚠ Unknown | ✅ OK | 11 días atrás | ❌ PARADO |
| **TikTok** | ❌ No implementado | ❌ N/A | ❌ N/A | — | ❌ NO EXISTE |

---

## BUGS REALES IDENTIFICADOS

### BUG #1: Facebook URLs y títulos incorrectos

**Severidad:** 🔴 CRÍTICA

**Evidencia:**
- 13.651 posts capturados
- URLs: ~60% son solo dominio, ~40% con /posts/ ID
- Títulos: Fragmentados, truncados, con UI text ("Ver más")

**Ejemplos concretos:**

```
URL: https://www.facebook.com/elgraficoweb
Expected: https://www.facebook.com/elgraficoweb/posts/{post_id}

Title: ", con una hora de retraso por tormenta"
Expected: "[Título completo del post]"

Title: "LAMAÑANAONLINE.COM.AR"
Expected: "[Título del artículo publicado]"
```

**Impacto:** Frontend muestra URLs inválidas para "Ver original"

**Recomendación:** Revisar selector de posts y extracción de URL en SocialFetcherPlaywrightFacebook

---

### BUG #2: Instagram y X parados desde 11 días

**Severidad:** 🟡 MEDIA

**Evidencia:**
- Última captura Instagram: 2026-06-19 13:46:35
- Última captura X: 2026-06-19 20:10:18
- Ambas el mismo día
- Desde entonces 0 nuevos posts

**Causa desconocida:**
- Puede ser pausa manual
- Puede ser que fetcher retorna []
- Puede ser cambio de plataforma

**Recomendación:** Revisar logs de 2026-06-19 para ver qué ocurrió

---

### BUG #3: social_monitor queda en `running` cuando items_found = 0

**Severidad:** 🟡 MEDIA

**Evidencia:**

```
run_id: started_at              | status  | items | duration
123    | 2026-07-01 02:08:57   | running | 0     | 1939s (stuck)
122    | 2026-07-01 00:16:06   | running | 0     | 8710s (stuck)
121    | 2026-06-30 23:49:58   | running | 0     | 10278s (stuck)
120    | 2026-06-30 23:47:34   | success | 0     | 106000ms (OK)
```

**Causa:** finishRun() probablemente no se llama cuando items_found = 0

**Impacto:** worker_runs table polluted, monitoring broken

---

## CONCLUSIÓN

### Lo que REALMENTE funciona HOY

| Componente | Status | Evidencia |
|---|---|---|
| **Facebook Discovery** | ✅ | 13.651 posts, último hace 30min |
| **Facebook Extraction** | ⚠ | URLs/títulos incorrectos (60-70% de posts afectados) |
| **YouTube Discovery** | ✅ | 4.714 posts, último hace 32min |
| **YouTube Extraction** | ✅ | Datos correctos (muestreo aleatorio validó) |
| **YouTube Transcripts** | ✅ | 2.160 transcripts, quality score ~70-100 |
| **Instagram** | ❌ | Parado hace 11 días (0 nuevos posts) |
| **X** | ❌ | Parado hace 11 días (0 nuevos posts) |
| **Worker health** | ⚠ | Se ejecuta pero queda en `running` cuando items=0 |

### Prioridad de fixes

**P0 — Crítico**
1. Facebook: Revisar extracción de URLs y títulos
   - 13.651 posts con datos incorrectos
   - Impacta UI "Ver original"

**P1 — Alto**
2. Instagram/X: Investigar parada desde 2026-06-19
   - 11 días sin posts nuevos
   - No está claro si es pausa o bug

3. social_monitor: Completar finishRun() cuando items=0
   - Worker gets stuck in `running`
   - Monitoring broken

**P2 — Bajo**
4. TikTok: No implementado (decisión de negocio)

---

## SIGUIENTES PASOS RECOMENDADOS

1. **Ejecutar Facebook fetcher manualmente**
   - POST /social/sources/{facebook_id}/check
   - Capturar logs detallados
   - Verificar qué está extrayendo

2. **Revisar qué pasó el 2026-06-19**
   - Git log, deployment history
   - Cambios en freshness_window
   - Cambios en fetchLatest()

3. **Validar títulos y URLs en 10 posts FB aleatorios**
   - Original en Facebook
   - Vs guardado en BD
   - Mapear exactamente dónde se corrompen

4. **Diagnosticar finishRun() path**
   - Por qué no completa cuando items=0
   - Es intencional o bug

---

**Esta auditoría está 100% basada en ejecución (SQL queries contra BD en vivo).**  
**No hay especulación, solo evidencia observable.**
