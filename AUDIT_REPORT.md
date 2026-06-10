# AUDIT REPORT — News Intelligence Engine
**Fecha de auditoría:** 2026-06-10  
**Repositorio:** `c:\Users\ruben\Documents\Mis-Proyectos\news`  
**Rama auditada:** `001-agente-cm-platform`  
**Tipo:** Auditoría forense de lectura — sin modificaciones  

---

## RESPUESTA A LA PREGUNTA CENTRAL

> **¿El sistema usa realmente fuentes externas o se retroalimenta de sus propios datos?**

**Respuesta: USA FUENTES EXTERNAS REALES — con limitaciones estructurales importantes.**

El flujo de datos es el siguiente:

```
RSS externos (La Nación, BBC, Clarin, etc.)
         ↓  [newsMonitor.js — fetchRSS, cada N segundos]
  monitored_articles (503 artículos en DB)
         ↓  [matchEntities — comparación de strings contra knowledge_entities]
  article_entity_matches (45 matches)
         ↓  [refreshTrendingTopics — ventana de 30 minutos]
  trending_topics (13 entidades)
         ↓  [checkAutoResearchTriggers — umbral 5 menciones / 3 fuentes]
  research_topics (crea topic "pending")

POST /research/investigate  →  connectors/rss.js  →  feeds RSS en tiempo real
         ↓  [scoreRelevance — proporción de palabras que matchean]
  research_sources (61 fuentes reales en DB)
         ↓  [AiService.generateResearchBrief — Claude Sonnet]
  research_briefs + knowledge_entities
```

Los datos de trending provienen 100% de artículos de RSS externos procesados por el monitor. Los datos de research también provienen de RSS externos. **No hay circularidad real.** Sin embargo, existen problemas de calidad que hacen que el sistema sea menos útil de lo que parece.

---

## HALLAZGOS POR SECCIÓN

---

### 1. FUENTE DE LOS DATOS: ¿RSS externo o DB interna?

#### 1.1 Monitor (`newsMonitor.js`)

**El monitor es 100% RSS externo.** Lee desde `tracked_sources` (tabla DB), pero cada fuente apunta a una URL de feed RSS real. El flujo exacto:

1. Consulta `tracked_sources WHERE enabled = true AND (last_checked IS NULL OR last_checked < now() - interval)`
2. Hace `fetch(source.rss_url)` con timeout de 8 segundos
3. Parsea XML con regex custom (sin dependencia externa)
4. Inserta en `monitored_articles` con `ON CONFLICT (hash) DO NOTHING` — deduplicación por SHA-256 de URL

**Fuentes activas y su producción (Query 1):**

| Fuente | Artículos | Último detectado |
|--------|-----------|-----------------|
| La Nación | 158 | 2026-06-10T00:39 |
| BBC Mundo | 111 | 2026-06-10T00:33 |
| TN | 102 | 2026-06-10T00:39 |
| Perfil | 79 | 2026-06-10T00:33 |
| TechCrunch | 23 | 2026-06-10T00:33 |
| Clarin | 20 | 2026-06-10T00:33 |
| Agenfor | 10 | 2026-06-10T00:33 |
| Infobae | **0** | null |
| Infobae -SEO | **0** | null |
| Noticias Formosa | **0** | **null (nunca checkeada)** |
| DW Español | **0** | null |

#### 1.2 Research (`connectors/rss.js`)

**El research también usa RSS externos.** El conector por defecto hace fetch a 7 feeds hardcodeados en `DEFAULT_FEEDS`:

```js
{ name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml' },
{ name: 'DW Español', url: 'https://rss.dw.com/rdf/rss-es-all' },
{ name: 'Infobae', url: 'https://www.infobae.com/feeds/rss/' },
{ name: 'La Nación', url: 'https://www.lanacion.com.ar/arcio/rss/' },
{ name: 'Clarin', url: 'https://www.clarin.com/rss/lo-ultimo/' },
{ name: 'Telam', url: 'https://www.telam.com.ar/rss/portada.xml' },
{ name: 'Perfil', url: 'https://www.perfil.com/feed' },
```

**IMPORTANTE:** Estos 7 feeds son **distintos** a los feeds configurados en `tracked_sources`. El research no usa la tabla `tracked_sources`. No existe sincronización entre ambas listas.

---

### 2. ANÁLISIS DE `research.js`

#### 2.1 Endpoint principal

`POST /research/investigate` — acepta `{ title, connectors: ['rss'] }`. El conector por defecto es `'rss'`. No hay NewsAPI, web scraping ni búsqueda web.

#### 2.2 Pipeline background (`_runPipeline`)

1. Llama `investigate(title, connectors)` → `fetchRSS(query, DEFAULT_FEEDS)`
2. Capa los resultados a **máximo 20 fuentes** (`sources.slice(0, 20)`)
3. Guarda en `research_sources` con `content` truncado a 2000 caracteres y `word_count`
4. Si hay fuentes Y hay `ANTHROPIC_API_KEY`, llama Claude con timeout de 90s
5. Si hay brief, extrae entidades y las upsertea en `knowledge_entities`
6. Estado final: `'completed'` | `'no_brief'` | `'no_sources'`

#### 2.3 Criterio de relevancia

```js
function scoreRelevance(item, query) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.filter(w => text.includes(w)).length;
  return matches / words.length;
}
// minScore por defecto: 0.2
// maxPerFeed: 5 artículos por feed
```

**La relevancia es una simple proporción de palabras.** Para la query "Política de Formosa":
- Palabras: ["política", "de", "formosa"]
- Un artículo que mencione sólo "política" y "de" (palabras muy comunes) puntúa 0.667
- "de" es una stopword que infla artificialmente el score

#### 2.4 ¿Por qué puede terminar con 0 resultados?

Tres causas verificadas por el código:

1. **Todos los feeds fallan por timeout/error de red** — el catch individual es silencioso (sólo `return`), `Promise.allSettled` absorbe todos los errores sin log
2. **No hay artículos con `score >= 0.2`** en los últimos items de los feeds
3. **Los feeds RSS no tienen artículos recientes sobre el tema** — el conector sólo ve los items que estén en el feed en ese momento (generalmente los últimos 20-50)

**Para "Política de Formosa":** Los 7 feeds hardcodeados son nacionales/internacionales generalistas. Ninguno es específico de Formosa. La probabilidad de encontrar artículos relevantes sobre política formoseña en BBC Mundo, Infobae general, La Nación general, etc. en ese momento preciso es baja. El resultado del Query 6 confirma que se encontraron 20 fuentes — aunque al revisar el contenido (Query 7) se observan artículos de quiniela, fútbol y noticias generales de La Nación y BBC que solo mencionan alguna de las palabras sueltas.

---

### 3. ANÁLISIS DE `newsMonitor.js`

#### 3.1 ¿Solo RSS o también sitemaps?

**El monitor solo procesa RSS** (`<item>` tags). La función `parseRssItems` sólo parsea items de RSS estándar. Sin embargo, en `monitor.js` existe la función `detectXmlFormat` que distingue entre RSS, Atom, Sitemap Index, Google News Sitemap y XML genérico — pero esto solo se usa en el endpoint de verificación `/verify`, **no en el job de monitoreo** (`runNewsMonitor`). Es capacidad de diagnóstico, no de ingesta real.

**Inconsistencia detectada:** Las fuentes `Infobae` y `TN` en `tracked_sources` apuntan a URLs de sitemaps de Google News (`arc/outboundfeeds/news-sitemap2/`, `arc/outboundfeeds/google-news-feed/?outputType=xml`), que son XML pero con formato `<url>` en lugar de `<item>`. El parser de `newsMonitor.js` usa `/<item>([\s\S]*?)<\/item>/g` y no encontrará ningún item en un sitemap — **esta es la razón por la que Infobae tiene 0 artículos**.

#### 3.2 Manejo de errores del monitor

```js
// processSource():
} catch (e) {
  console.error(`[Monitor] Source "${source.name}" failed: ${e.message}`);
}
return newIds; // retorna array vacío — no propaga el error
```

El error se logea en consola pero no se registra en la DB. No hay campo `last_error` en `tracked_sources`. Si una fuente falla silenciosamente durante días, el operador no lo sabrá a menos que revise logs o note que `article_count` no crece.

**El campo `last_checked` se actualiza** después de un procesamiento exitoso del fetch — si el fetch falla, `last_checked` no se actualiza, lo que causa que el worker reintente en el próximo ciclo. Esto es correcto, pero hay un edge case: si la fuente devuelve HTTP 200 pero XML inválido, el `last_checked` sí se actualiza (el update se hace después del loop de items, no condicionado a que haya items). Entonces una fuente con XML roto se marcará como "checkeada" y tardará el `check_interval` completo en reintentarse.

#### 3.3 Ventana de trending

```js
const TRENDING_WINDOW_MIN = 30; // minutos
const AUTO_RESEARCH_MENTIONS = 5;
const AUTO_RESEARCH_SOURCES  = 3;
```

`refreshTrendingTopics` consulta solo artículos de los últimos 30 minutos. Si el worker no corre con frecuencia suficiente, o si las fuentes no producen suficientes artículos en esa ventana, los trending se vacían. Con 503 artículos totales acumulados pero la ventana de 30 min, la mayoría del contenido histórico no alimenta trending.

**Sin embargo, el endpoint GET `/monitor/trending`** amplía la ventana a 6 horas:
```js
WHERE tt.last_seen_at > now() - interval '6 hours'
```
Esto muestra más datos al usuario que los que realmente están "trending now".

---

### 4. ANÁLISIS DE `knowledge.js`

#### 4.1 ¿Cómo se crean las entidades?

`knowledge.js` es solo lectura — no crea entidades. Las entidades se crean únicamente en `research.js` → `_extractAndSaveEntities()`:

```js
INSERT INTO knowledge_entities (name, entity_type, description, ...)
ON CONFLICT (lower(name), entity_type)
DO UPDATE SET mention_count = mention_count + 1, ...
```

**Única fuente de creación:** Claude (`AiService.extractEntities`) extrae entidades del brief generado a partir de fuentes RSS. No hay creación manual vía UI (no hay endpoint POST en `knowledge.js`).

#### 4.2 ¿De qué procesos reciben datos?

| Proceso | Qué hace |
|---------|----------|
| `research.js._extractAndSaveEntities()` | Crea/upsertea entidades desde briefs de Claude |
| `newsMonitor.matchEntities()` | **No crea entidades** — solo matchea entidades existentes contra títulos nuevos |

**El monitor NO crea entidades nuevas.** Solo hace matching de strings de entidades que ya existen contra títulos de artículos entrantes. Si no hay entidades en `knowledge_entities`, el monitor no producirá ningún match y `trending_topics` quedará vacío.

**Dependencia circular parcial:** Para que trending funcione se necesitan entidades → entidades solo se crean por research → research requiere que alguien lo active manualmente. El monitor puede disparar auto-research si hay trending, pero trending necesita entidades previas.

---

### 5. ANÁLISIS DE `topics.js`

#### 5.1 SQL exacto del trending

```sql
SELECT
  t.id, t.slug, t.name, t.category, t.region, t.coverage_scope,
  t.importance_score,
  COUNT(DISTINCT ta.article_id) AS article_count,
  COUNT(DISTINCT tr.research_topic_id) AS research_count,
  COUNT(DISTINCT te.entity_id) AS entity_count,
  COUNT(DISTINCT CASE WHEN ta.added_at > NOW() - INTERVAL '48 hours' THEN ta.article_id END) AS recent_articles
FROM topics t
LEFT JOIN topic_articles ta ON ta.topic_id = t.id
LEFT JOIN topic_research  tr ON tr.topic_id = t.id
LEFT JOIN topic_entities  te ON te.topic_id = t.id
GROUP BY t.id
ORDER BY
  (COUNT(DISTINCT ta.article_id) * 1.0
   + COUNT(DISTINCT tr.research_topic_id) * 2.0
   + COUNT(DISTINCT CASE WHEN ta.added_at > NOW() - INTERVAL '48 hours' THEN ta.article_id END) * 3.0
   + t.importance_score
  ) DESC
LIMIT $1
```

#### 5.2 ¿Usa `monitored_articles` o `research_topics`?

`topics.js` usa **ninguna de las dos directamente.** Usa la tabla `topics` (entidad editorial separada) con sus tablas de relación: `topic_articles`, `topic_research`, `topic_entities`. La tabla `topics` representa tópicos editoriales creados por el CMS, no los temas de investigación automática ni los artículos monitoreados.

**Son dos sistemas paralelos con vocabulario similar:**
- `trending_topics` (monitor) ← viene de `article_entity_matches` ← `monitored_articles`
- `topics` (editorial) ← creado manualmente, linked a `articles` editoriales propios

El score de trending de `topics.js` incluye un bonus de `research_topics` multiplicado por 2.0, pero solo si hay un `topic_research` (link manual) que conecte el topic editorial con un research_topic de investigación.

---

### 6. ESTADO DE LA BASE DE DATOS

**Query 3 — Conteos totales:**

| Tabla | Registros |
|-------|-----------|
| monitored_articles | 503 |
| research_topics | 6 |
| research_sources | 61 |
| knowledge_entities | 27 |
| entity_mentions | 30 |
| trending_topics | 13 |
| article_entity_matches | 45 |
| editorial_dossiers | 3 |
| editorial_angles | 12 |

**Query 9 — Verificación de coherencia trending:**

Los `mention_count` en `trending_topics` coinciden exactamente con los `real_article_matches` de `article_entity_matches`. No hay inflación ni datos fantasma. El sistema es coherente internamente.

**Query 5 — Entidades: research vs. monitor:**

| Entidad | Research mentions | Monitor mentions |
|---------|------------------|-----------------:|
| Argentina | 1 | 16 |
| Córdoba | 1 | 9 |
| Irán | 2 | 6 |
| Uruguay | 1 | 3 |
| Anthropic | 2 | 2 |
| SpaceX | 2 | 1 |
| Formosa | 1 | **0** |

"Formosa" como entidad existe (creada vía research de "Política de la provincia de Formosa") pero tiene **0 matches en monitor** — ningún artículo de los 503 monitoreados mencionó "Formosa" en el título.

---

## HALLAZGOS CLASIFICADOS

---

### 🔴 CRÍTICOS — Afectan la funcionalidad core

#### C1: Infobae y TN tienen 0 artículos — formato sitemap incompatible con parser RSS

- **Evidencia:** `tracked_sources`: Infobae URL = `https://www.infobae.com/arc/outboundfeeds/news-sitemap2/`; TN URL = `https://tn.com.ar/arc/outboundfeeds/google-news-feed/?outputType=xml`
- **Causa:** El parser en `newsMonitor.js` busca `<item>` tags. Los sitemaps de Google News usan `<url>` tags. Resultado: 0 artículos extraídos.
- **Impacto:** Infobae es el medio digital de mayor tráfico en Argentina. Su ausencia total en el monitor es una brecha de cobertura significativa.
- **Archivo:** `src/jobs/newsMonitor.js` línea 34 (`parseRssItems`)

#### C2: "Noticias Formosa" nunca ha sido procesada (`last_checked: null`)

- **Evidencia:** Query 2 — `last_checked: null`, aunque `enabled: true`
- **Causa probable:** La fuente fue insertada después de que el worker corriera por última vez, o hay un problema con su URL. No hay error registrado.
- **Impacto crítico:** Para un medio regional de Formosa, la fuente local más relevante nunca ha sido procesada. Todos los artículos sobre política formoseña vienen de medios nacionales.
- **Archivo:** `tracked_sources` table

#### C3: Bug en `editorial_workflow.js` — variable `angles` no definida

- **Evidencia:** Línea 329 en `src/routes/editorial_workflow.js`:
  ```js
  console.log(`[Dossier] Generated: ${dossierId} | ${angles.length} angles persisted`);
  ```
  La variable `angles` no está definida en ese scope. `noticiaFirst` es el array que se itera, pero `angles` nunca se declara. Esto causaría un `ReferenceError` en cada generación de dossier exitosa — lo cual a su vez marcaría el dossier como `'failed'` aunque el contenido ya fue guardado.
- **Impacto:** Todos los dossiers generados con éxito producen un error de JavaScript que ejecuta el bloque `catch` y sobreescribe el status a `'failed'`, aunque los datos ya estén persistidos correctamente.
- **Archivo:** `src/routes/editorial_workflow.js` línea 329

---

### 🟠 ADVERTENCIAS — Limitan la calidad o confiabilidad

#### W1: El conector RSS de research usa feeds hardcodeados distintos a `tracked_sources`

- **Evidencia:** `src/connectors/rss.js` define `DEFAULT_FEEDS` con 7 URLs. `tracked_sources` tiene 11 fuentes. No hay sincronización. DW Español está en ambos pero Agenfor, TechCrunch solo están en `tracked_sources`. Telam está solo en el conector pero no en `tracked_sources`.
- **Impacto:** Añadir una fuente en el panel de monitor no la agrega al research. Son dos listas que se gestionan por separado sin documentación de la distinción.
- **Archivos:** `src/connectors/rss.js`, `src/routes/monitor.js`

#### W2: Relevancia de research basada en stopwords — resultados espurios

- **Evidencia (Query 7):** Para "Política de Formosa", hay artículos con `relevance_score: 0.667` cuyo contenido es sobre quiniela provincial (Clarin), y artículos con score 0.5 sobre Sagrada Familia (BBC Mundo) — todas tienen "de" en el texto, que puntúa como match.
- **Causa:** `scoreRelevance` divide matches entre total de palabras incluyendo stopwords. "política de formosa" tiene 3 palabras; cualquier artículo que mencione "de" obtiene score mínimo 0.333.
- **Impacto:** Claude recibe hasta 12 fuentes de poca calidad, lo que puede producir briefs poco relevantes o con información incorrecta.
- **Archivo:** `src/connectors/rss.js` líneas 38-43

#### W3: `content` de research_sources es solo el description RSS (máx 500 chars), truncado a 2000

- **Evidencia:** En `newsMonitor.js` el `description` RSS se trunca a 500 chars. En `research.js`, `content` se limita a 2000 chars. Claude en `generateResearchBrief` solo usa los primeros 300 chars de content por fuente.
- **Impacto:** El research no hace fetch del artículo completo — solo usa el resumen RSS. Para artículos con paywalls o descripciones vagas, Claude sintetiza con información mínima.
- **Archivos:** `src/jobs/newsMonitor.js` línea 39, `src/connectors/rss.js` línea 69, `src/services/AiService.js` línea 1196

#### W4: Errores de fetch en research son completamente silenciosos

- **Evidencia:** `src/connectors/rss.js` línea 75: el catch del feed individual es vacío `} catch { // Individual feed failure is non-fatal }`. No hay logging.
- **Impacto:** Si todos los feeds fallan (problema de red, timeout), `investigate()` retorna array vacío y el topic queda en estado `'no_sources'`. El usuario ve error pero no hay diagnóstico de por qué.
- **Archivo:** `src/connectors/rss.js` línea 75

#### W5: El auto-research trigger crea topics en estado `'pending'` sin ejecutarlos

- **Evidencia:** `src/jobs/newsMonitor.js` línea 174:
  ```js
  INSERT INTO research_topics (title, status, ...) VALUES ($1, 'pending', ...)
  ```
  El estado es `'pending'`, no `'researching'`. El worker no llama `_runPipeline` sobre estos topics.
- **Impacto:** Los topics auto-detectados nunca se investigan automáticamente. Necesitan ser activados manualmente desde el CMS. El flujo "automático" está incompleto.
- **Query 6 confirma:** El topic "Argentina — tendencia detectada automáticamente" tiene `status: 'pending'` y `source_count: 0`.

#### W6: Falta de error logging en `tracked_sources` para fallos del monitor

- **Evidencia:** `processSource()` hace `console.error` pero no actualiza ningún campo en la DB. No hay `last_error_message`, `error_count`, ni `last_error_at`.
- **Impacto:** Impossible detectar fuentes con fallas recurrentes sin acceso a los logs del proceso.
- **Archivo:** `src/jobs/newsMonitor.js` línea 89

#### W7: `last_format_detected` y `last_verification_notes` son NULL para todas las fuentes activas

- **Evidencia:** Query 2 — todas las fuentes tienen `last_format_detected: null` y `last_verification_notes: null` a pesar de estar en `verification_status: 'approved'`.
- **Causa:** Fueron aprobadas vía `POST /approve` (que no setea estos campos) en lugar de vía `POST /verify` (que sí los setea). El estado `'approved'` no garantiza que el feed funcione.

---

### 🟢 FUNCIONAMIENTO CORRECTO

#### OK1: Deduplicación robusta en monitor

`ON CONFLICT (hash) DO NOTHING` con SHA-256 de la URL garantiza que ningún artículo se duplique. Verificado en código (`newsMonitor.js` línea 71).

#### OK2: Coherencia total entre `trending_topics.mention_count` y `article_entity_matches`

Query 9 confirma que los números en trending son exactamente los matches reales — no hay inflación ni datos fabricados.

#### OK3: Recovery de zombie topics al startup

`recoverZombieTopics()` limpia topics atascados en `'researching'` en el arranque del servidor, evitando estado indefinido tras crashes.

#### OK4: Límite de 20 fuentes con cap de 5 por feed

Evita que un solo feed domine el research. El corte en `sources.slice(0, 20)` previene inserciones masivas.

#### OK5: Timeout de 90s en Claude

`Promise.race` con timeout de 90s evita que un hang de la API de Anthropic bloquee el pipeline indefinidamente.

#### OK6: Trending tiene datos reales verificables

Los 13 trending topics tienen mention_counts que coinciden con article_entity_matches reales. La entidad "Argentina" tiene 16 matches reales en artículos de monitor de La Nación, BBC, Clarin y Perfil.

---

## ARQUITECTURA RESUMIDA

```
SISTEMA DE MONITOREO (continuo, automático)
  tracked_sources (DB) → fetch RSS externo → monitored_articles
  → matchEntities (string match vs knowledge_entities) → article_entity_matches
  → refreshTrendingTopics (ventana 30min) → trending_topics
  → checkAutoResearchTriggers → research_topics (status: 'pending') [INCOMPLETO: no ejecuta pipeline]

SISTEMA DE RESEARCH (manual, bajo demanda)
  POST /research/investigate → connectors/rss.js → DEFAULT_FEEDS hardcodeados
  → relevance scoring (simple word match) → research_sources (máx 20)
  → Claude generateResearchBrief → research_briefs
  → Claude extractEntities → knowledge_entities + entity_mentions

SISTEMA EDITORIAL (manual)
  research_topics completados → POST /editorial-workflow/dossiers
  → Claude generateDossier → editorial_dossiers + editorial_angles
  → POST /editorial-workflow/dossiers/:id/draft → borrador de artículo
  [BUG: _generateDossier tiene ReferenceError en línea 329]
```

---

## TABLA DE SÍNTESIS

| Componente | Usa fuentes externas | Usa solo DB | Funciona correctamente |
|------------|---------------------|-------------|------------------------|
| Monitor RSS | SI (fetch a URLs RSS) | NO | PARCIALMENTE (Infobae/TN = 0) |
| Research conector | SI (fetch a DEFAULT_FEEDS) | NO | SI (pero calidad baja) |
| Entity matching | NO (solo strings vs DB) | SI | SI |
| Trending | NO (calcula desde DB) | SI | SI |
| Auto-research | — | — | NO (crea pending, no ejecuta) |
| Dossier generation | NO (desde DB briefs) | SI | NO (ReferenceError bug) |

---

## RECOMENDACIONES PRIORIZADAS

1. **(C1)** Extender `parseRssItems` para soportar formato sitemap (`<url>/<loc>`) — o cambiar las URLs de Infobae y TN a sus feeds RSS tradicionales.
2. **(C2)** Verificar y corregir la URL de Noticias Formosa; ejecutar manualmente el monitor para validar.
3. **(C3)** Corregir la variable no definida `angles` en `editorial_workflow.js` línea 329 — cambiar a `noticiaFirst.length` o declarar `const angles = noticiaFirst`.
4. **(W2)** Filtrar stopwords en `scoreRelevance` antes de calcular el score para reducir falsos positivos.
5. **(W5)** Completar el auto-research trigger: después de insertar el topic `'pending'`, llamar `_runPipeline` o encolar en el worker para ejecución asíncrona.
6. **(W1)** Unificar `DEFAULT_FEEDS` del conector con `tracked_sources` — leer las fuentes desde la DB en lugar de tenerlas hardcodeadas.
7. **(W6)** Agregar campos `last_error_message` y `error_count` a `tracked_sources` para diagnóstico de fuentes fallidas.

---

*Auditoría realizada el 2026-06-10. Ningún archivo fue modificado durante este proceso.*
