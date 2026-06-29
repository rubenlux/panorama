# AUDIT 2 — COVERAGE (Clustering, Deduplicación, Grouping)

**Objetivo**: Rastrear cómo un artículo válido (con contenido) se agrupan o se descartan en Coverage.

**Pregunta**: ¿El problema es el Crawler o es Coverage el que descarta cosas válidas?

---

## Hipótesis a Investigar

Coverage puede estar perdiendo contenido por:

1. **Deduplicación agresiva** — Dos artículos legítimamente distintos se tratan como duplicados
2. **Clustering incorrecto** — Artículos de un tema se agrupan con otro tema completamente distinto
3. **Umbral de similitud muy alto** — Artículos que deberían clusterizarse se rechazan
4. **Eliminar artículos sin categoría** — Si article.category_id es NULL, se descartan
5. **Filtro de longitud mínima** — Artículos cortos (100-200 palabras) se rechazan

---

## Los 4 Casos

### Caso A: Artículo Válido pero Sin Cluster

```
Artículo:        ID = xxxx, content_text completo (800+ palabras), extraction_method='fetch'
Esperado:        Debe aparecer en una story_cluster
Pregunta:        ¿Por qué no se agrupó? ¿No pasó algún gate?
```

**Trace**:
```sql
-- Artículos con contenido válido pero sin cluster
SELECT ma.id, ma.title, ma.url, ma.word_count, ma.extraction_method
FROM monitored_articles ma
LEFT JOIN story_cluster_articles sca ON ma.id = sca.article_id
WHERE sca.article_id IS NULL  -- no aparece en clustering
  AND ma.content_text IS NOT NULL  -- tiene contenido
  AND ma.extraction_method IN ('fetch', 'playwright')  -- extracción exitosa
  AND ma.created_at > now() - interval '7 days'
LIMIT 10;

-- Para cada uno:
SELECT * FROM pipeline_decisions
WHERE entity_id = '[ARTICLE_ID]' AND entity_type = 'article'
ORDER BY created_at DESC;

-- ¿Cuál fue la razón de rechazo?
```

---

### Caso B: Clustering Incorrecto (Contaminación)

```
Artículos:       Caso Lozano (4 fragmentos), Caso Boca (sports vs entertainment)
Esperado:        Cada tema en su propio cluster
Pregunta:        ¿Por qué se fragmentan? ¿Qué gate falla?
```

**Trace**:
```sql
-- Stories recientes con >2 artículos
SELECT sc.id, sc.title, sc.article_count
FROM story_clusters sc
WHERE sc.created_at > now() - interval '7 days'
  AND sc.article_count > 2
ORDER BY sc.article_count DESC;

-- Para cada story:
SELECT sca.article_id, ma.title, ma.url, sca.category_match, sca.entity_score, sca.keyword_score
FROM story_cluster_articles sca
JOIN monitored_articles ma ON sca.article_id = ma.id
WHERE sca.story_cluster_id = '[STORY_ID]'
ORDER BY sca.article_id;

-- ¿Hay artículos de categoría diferente?
SELECT sca.category_match, COUNT(*) as count
FROM story_cluster_articles sca
WHERE sca.story_cluster_id = '[STORY_ID]'
GROUP BY sca.category_match;

-- Investigar Gate 2 (entities):
SELECT * FROM pipeline_decisions
WHERE entity_id IN (
  SELECT article_id FROM story_cluster_articles 
  WHERE story_cluster_id = '[STORY_ID]'
);
```

---

### Caso C: Deduplicación Incorrecto (Artículos Distintos Fusionados)

```
Artículos:       Reuters + TN = mismo contenido
Esperado:        Agruparse en un cluster, no perder ninguno
Pregunta:        ¿Se deduplican correctamente? ¿Se preservan ambas fuentes?
```

**Trace**:
```sql
-- Buscar content_hash duplicados (mismo contenido, URLs distintas)
SELECT content_hash, COUNT(DISTINCT article_id) as unique_articles
FROM crawl_content_versions
WHERE content_hash IS NOT NULL
GROUP BY content_hash
HAVING COUNT(DISTINCT article_id) > 1
ORDER BY unique_articles DESC
LIMIT 5;

-- Para cada hash:
SELECT ma.id, ma.title, ma.url, ma.domain
FROM monitored_articles ma
WHERE ma.id IN (
  SELECT article_id FROM crawl_content_versions
  WHERE content_hash = '[DUPLICATED_HASH]'
);

-- ¿Coverage los agrupó juntos?
SELECT DISTINCT story_cluster_id
FROM story_cluster_articles sca
WHERE sca.article_id IN (
  SELECT ma.id FROM monitored_articles ma
  WHERE ma.id IN (
    SELECT article_id FROM crawl_content_versions
    WHERE content_hash = '[DUPLICATED_HASH]'
  )
);

-- ¿Están en el mismo cluster o en clusters distintos?
```

---

### Caso D: Artículos Cortos Rechazados

```
Artículos:       Tweets reposteados, noticias de flash
Esperado:        Clustering funciona incluso con 50-100 palabras
Pregunta:        ¿Hay un MIN_WORDS para clustering? ¿Dónde está?
```

**Trace**:
```sql
-- Artículos cortos (50-200 palabras) con contenido válido
SELECT ma.id, ma.title, ma.word_count, ma.extraction_method
FROM monitored_articles ma
WHERE ma.word_count BETWEEN 50 AND 200
  AND ma.content_text IS NOT NULL
  AND ma.extraction_method IN ('fetch', 'playwright')
  AND ma.created_at > now() - interval '7 days'
LIMIT 10;

-- ¿Cuántos se clusterizaron?
SELECT ma.id, ma.word_count, sca.story_cluster_id IS NOT NULL as was_clustered
FROM monitored_articles ma
LEFT JOIN story_cluster_articles sca ON ma.id = sca.article_id
WHERE ma.word_count BETWEEN 50 AND 200
  AND ma.content_text IS NOT NULL
  AND ma.extraction_method IN ('fetch', 'playwright')
  AND ma.created_at > now() - interval '7 days'
LIMIT 20;

-- Ratio de clustering por rango de word_count:
SELECT 
  CASE 
    WHEN ma.word_count < 100 THEN '< 100 words'
    WHEN ma.word_count < 300 THEN '100-299 words'
    WHEN ma.word_count < 500 THEN '300-499 words'
    ELSE '500+ words'
  END as word_range,
  COUNT(*) as total,
  COUNT(CASE WHEN sca.article_id IS NOT NULL THEN 1 END) as clustered,
  ROUND(100.0 * COUNT(CASE WHEN sca.article_id IS NOT NULL THEN 1 END) / COUNT(*), 1) as clustering_pct
FROM monitored_articles ma
LEFT JOIN story_cluster_articles sca ON ma.id = sca.article_id
WHERE ma.content_text IS NOT NULL
  AND ma.extraction_method IN ('fetch', 'playwright')
  AND ma.created_at > now() - interval '7 days'
GROUP BY word_range
ORDER BY word_range;
```

---

## Auditoría Paso a Paso

### Paso 1: Buscar Artículos Válidos Sin Cluster

```bash
psql $DATABASE_URL << EOF
SELECT ma.id, ma.title, ma.word_count, ma.extraction_method
FROM monitored_articles ma
LEFT JOIN story_cluster_articles sca ON ma.id = sca.article_id
WHERE sca.article_id IS NULL  
  AND ma.content_text IS NOT NULL  
  AND ma.extraction_method IN ('fetch', 'playwright')
  AND ma.created_at > now() - interval '1 day'
LIMIT 5;
EOF
```

**Resultado esperado**: Artículos con ID válido, word_count > 100, extraction_method='fetch'

### Paso 2: Investigar Por Qué No Se Clusterizó

Para cada artículo del Paso 1:

```bash
ARTICLE_ID="f7a9c8e2-1234-5678-9abc-def0123456"

psql $DATABASE_URL << EOF
-- ¿Hay alguna decisión de rechazo?
SELECT * FROM pipeline_decisions
WHERE entity_id = '$ARTICLE_ID'
  AND module = 'coverage'
  AND accepted = FALSE;

-- Si no hay entry, ¿por qué no entró a coverage?
-- Puede ser: no se procesó todavía, o hay un gate silencioso.
EOF
```

### Paso 3: Investigar Clustering Contaminado

Buscar historias fragmentadas:

```bash
psql $DATABASE_URL << EOF
-- Historias que parecen ser la misma (mismo title prefijo)
-- pero fueron creadas como clusters separados
SELECT 
  LEFT(title, 30) as title_prefix,
  COUNT(DISTINCT id) as cluster_count,
  SUM(article_count) as total_articles
FROM story_clusters
WHERE created_at > now() - interval '7 days'
GROUP BY title_prefix
HAVING COUNT(DISTINCT id) > 1
ORDER BY cluster_count DESC;
EOF
```

### Paso 4: Validar Deduplicación

```bash
psql $DATABASE_URL << EOF
-- Contenidos idénticos en URLs distintas
SELECT 
  content_hash,
  COUNT(DISTINCT article_id) as article_count,
  COUNT(DISTINCT story_cluster_id) as cluster_count
FROM crawl_content_versions ccv
LEFT JOIN story_cluster_articles sca ON ccv.article_id = sca.article_id
WHERE ccv.content_hash IS NOT NULL
GROUP BY content_hash
HAVING COUNT(DISTINCT article_id) > 1
  AND COUNT(DISTINCT story_cluster_id) > 1  -- están en clusters DISTINTOS!
ORDER BY article_count DESC;
EOF
```

---

## Documentar Hallazgos

Formato:

```
CASO A: Artículos Válidos Sin Cluster
======================================
ID: f7a9c8e2-1234-5678-9abc-def0123456
Title: "Argentina gana Copa América"
Word count: 485
Extraction: fetch (éxito)

Hallazgo:
├─ NO aparece en story_cluster_articles
├─ NO hay pipeline_decision de rechazo
└─ Bug: Coverage nunca lo procesó

Ubicación: newsMonitor.js :: createClusters() (línea ~2100)
Hipótesis: El artículo se creó después de que Coverage corrió?
           O hay condición silenciosa que lo rechaza?

---

CASO B: Fragmentación (Lozano)
==============================
Expected: 1 story_cluster para "Lozano transferencia"
Actual: 4 story_clusters

Halllazgo:
├─ Cluster 1: 3 artículos de "Lozano pide salida"
├─ Cluster 2: 2 artículos de "Boca rechaza 10M"
├─ Cluster 3: 1 artículo de "Lozano no seguiría"
├─ Cluster 4: 2 artículos de "Otra transferencia"

Bug: Gate 2 (entities) fallando? El `detectStoryCategory()` está 
     fragmentando porque detecta categorías distintas?

Location: newsMonitor.js :: detectStories() (línea ~595)
Fix propuesto: Revisar Gate 1 (category matching).
```

---

## Conexión con Monitor Audit

**Si Monitor es OK pero Coverage falla**:
- Problema está en Coverage.js
- Los artículos llegan completos y válidos, Coverage los rechaza

**Si Monitor está rotos**:
- Hay artículos vacíos (extraction_method='rss_only')
- Coverage recibe basura, no es culpa de Coverage

**Resultado esperado**:
- Audit Coverage identifica qué gate está fallando
- Audit Monitor identifica qué está roto en Crawler
- Fixes apuntan a lugares específicos, no a refactors genéricos

---

**Próximo paso**: Ejecutar queries, documentar 4 casos, identificar gates que fallan.
