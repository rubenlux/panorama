# AUDIT 3 — SOCIAL (Facebook, YouTube, Clustering de Posts)

**Objetivo**: Rastrear cómo Social Intelligence extrae contenido, agrupa posts, detecta gaps.

**Pregunta**: ¿Funciona el scrape de Facebook/YouTube? ¿Las transcripciones se extraen? ¿El clustering de posts es confiable?

---

## Hipótesis a Investigar

Social Intelligence puede estar fallando en:

1. **Facebook scraper** — No extrae posts, o extrae incompletos
2. **YouTube transcripts** — Timeout, IP-blocked, quality baja
3. **Social clustering** — Posts de un tema se fragmentan en clusters distintos
4. **Gap detection** — Oportunidades falsas (ruido) o no detecta verdaderos gaps
5. **Metadata** — Videos sin views, posts sin engagement metrics

---

## Los 5 Casos

### Caso A: Facebook Post Completo

```
Página:         TN, Clarín, o Similar
Esperado:       Posts descargados, contenido extraído, engagement capturado
Pregunta:       ¿El scraper extrae posts correctamente?
```

**Trace**:
```sql
-- Posts de Facebook
SELECT sp.id, sp.source_id, sp.title, sp.engagement_count, sp.captured_at
FROM social_posts sp
WHERE sp.platform = 'facebook'
  AND sp.captured_at > now() - interval '7 days'
LIMIT 10;

-- Para cada post:
-- ¿Se capturó contenido?
SELECT sp.id, sp.title, sp.platform, sp.engagement_count,
       vs.transcript_text IS NOT NULL as has_transcript
FROM social_posts sp
LEFT JOIN video_transcripts vs ON sp.id = vs.post_id
WHERE sp.id = '[POST_ID]';

-- ¿Se clusterizó?
SELECT * FROM social_cluster_posts
WHERE post_id = '[POST_ID]';

-- ¿Qué social_cluster?
SELECT * FROM social_clusters
WHERE id = (
  SELECT cluster_id FROM social_cluster_posts WHERE post_id = '[POST_ID]'
);
```

---

### Caso B: YouTube Transcript Extraction

```
Video:          Popular YouTube video de TN, Clarín, etc.
Esperado:       Transcript extraído (Playwright method), quality_score > 70
Pregunta:       ¿El scraper de YouTube funciona? ¿La transcripción es completa?
```

**Trace**:
```sql
-- Posts de YouTube
SELECT sp.id, sp.title, sp.url, sp.captured_at
FROM social_posts sp
WHERE sp.platform = 'youtube'
  AND sp.captured_at > now() - interval '7 days'
LIMIT 10;

-- Para cada video:
-- ¿Se extrajo transcript?
SELECT vt.post_id, vt.transcript_text, vt.transcript_length, vt.quality_score, vt.fetched_at
FROM video_transcripts vt
WHERE vt.post_id = '[VIDEO_POST_ID]';

-- ¿Se analizó?
SELECT ta.post_id, ta.summary, ta.main_topics, ta.editorial_type, ta.generated_at
FROM transcript_analysis ta
WHERE ta.post_id = '[VIDEO_POST_ID]';

-- Timeline: cuándo se capturó, cuándo se extrajo transcript
SELECT sp.captured_at, vt.fetched_at, 
  EXTRACT(EPOCH FROM vt.fetched_at - sp.captured_at) as seconds_to_transcript
FROM social_posts sp
LEFT JOIN video_transcripts vt ON sp.id = vt.post_id
WHERE sp.id = '[VIDEO_POST_ID]';
```

---

### Caso C: Transcript Failure (IP Blocked, Timeout, etc)

```
Videos:         Algunos YouTubes no tienen transcripts
Esperado:       transcript_text = NULL con razón documentada
Pregunta:       ¿Por qué fallan? ¿IP blocked? ¿Timeout? ¿Video sin transcript?
```

**Trace**:
```sql
-- Videos capturados pero SIN transcript
SELECT sp.id, sp.title, sp.url, sp.captured_at
FROM social_posts sp
LEFT JOIN video_transcripts vt ON sp.id = vt.post_id
WHERE sp.platform = 'youtube'
  AND sp.captured_at > now() - interval '7 days'
  AND vt.post_id IS NULL
LIMIT 10;

-- ¿Hay logs de error?
-- (Buscar en application logs, no en base de datos)
-- Patrón: "[TRANSCRIPT] Error fetching video_id: timeout | blocked | invalid"

-- ¿Cuál es la tasa de éxito de transcripts?
SELECT 
  COUNT(*) as total_youtube_posts,
  COUNT(CASE WHEN vt.post_id IS NOT NULL THEN 1 END) as with_transcript,
  ROUND(100.0 * COUNT(CASE WHEN vt.post_id IS NOT NULL THEN 1 END) / COUNT(*), 1) as success_pct
FROM social_posts sp
LEFT JOIN video_transcripts vt ON sp.id = vt.post_id
WHERE sp.platform = 'youtube'
  AND sp.captured_at > now() - interval '7 days';
```

---

### Caso D: Social Clustering — Posts Agrupados Correctamente

```
Posts:          Multiple de mismo tema (ej: "Elecciones", "Tormenta", etc.)
Esperado:       Todos en mismo social_cluster
Pregunta:       ¿Se agrupan correctamente? ¿Gap score es correcto?
```

**Trace**:
```sql
-- Clusters grandes (>3 posts)
SELECT sc.id, sc.title, COUNT(*) as post_count, sc.gap_score, sc.opportunity_score
FROM social_clusters sc
JOIN social_cluster_posts scp ON sc.id = scp.cluster_id
WHERE sc.created_at > now() - interval '7 days'
GROUP BY sc.id
HAVING COUNT(*) > 3
ORDER BY post_count DESC
LIMIT 5;

-- Para cada cluster:
-- ¿Los posts son del mismo tema?
SELECT scp.post_id, sp.title, sp.platform, sp.captured_at, sp.engagement_count
FROM social_cluster_posts scp
JOIN social_posts sp ON scp.post_id = sp.id
WHERE scp.cluster_id = '[CLUSTER_ID]'
ORDER BY sp.captured_at DESC;

-- ¿El gap_score es correcto?
SELECT sc.gap_score, sc.opportunity_score,
  (SELECT COUNT(*) FROM story_clusters WHERE title ILIKE '%' || sc.title || '%') as matching_stories
FROM social_clusters sc
WHERE sc.id = '[CLUSTER_ID]';
```

---

### Caso E: Social ↔ Story Linking (Gap Detection)

```
Situación:      Social cluster existe, pero NO hay story_cluster relacionado
Esperado:       opportunity_score > 70, editorial debe ver el gap
Pregunta:       ¿Se detectan gaps correctamente? ¿False positives?
```

**Trace**:
```sql
-- Clusters con alto opportunity_score
SELECT sc.id, sc.title, sc.opportunity_score, sc.gap_score, sc.viral_score
FROM social_clusters sc
WHERE sc.opportunity_score > 70
  AND sc.created_at > now() - interval '7 days'
ORDER BY sc.opportunity_score DESC
LIMIT 10;

-- Para cada uno:
-- ¿Existe story relacionado?
SELECT COUNT(*) as matching_stories
FROM story_clusters
WHERE title ILIKE '%' || '[SOCIAL_CLUSTER_TITLE]' || '%'
  AND created_at > now() - interval '7 days';

-- Si NO existe story:
-- ¿Es un verdadero gap o false positive?
-- Manual check: ¿Deberían haber reporteado este tema?

-- Distribution de opportunity_score:
SELECT 
  CASE 
    WHEN opportunity_score >= 70 THEN 'MUY_ALTA (≥70)'
    WHEN opportunity_score >= 40 THEN 'MEDIA (40-69)'
    ELSE 'BAJA (<40)'
  END as opportunity_tier,
  COUNT(*) as cluster_count
FROM social_clusters
WHERE created_at > now() - interval '7 days'
GROUP BY opportunity_tier
ORDER BY opportunity_tier;
```

---

## Auditoría Paso a Paso

### Paso 1: ¿Funciona Facebook?

```bash
psql $DATABASE_URL << EOF
-- Últimos posts de Facebook
SELECT sp.id, sp.title, sp.platform, sp.engagement_count, sp.captured_at
FROM social_posts sp
WHERE sp.platform = 'facebook'
  AND sp.captured_at > now() - interval '1 day'
LIMIT 5;

-- ¿Hay posts?
-- Si COUNT = 0: Facebook scraper está roto
-- Si COUNT > 0: va bien
EOF
```

**Esperado**: 5+ posts en últimas 24h

**Si falla**: Check `src/jobs/socialMonitor.js` → `fetchLatest()` para Facebook

---

### Paso 2: ¿Funciona YouTube?

```bash
psql $DATABASE_URL << EOF
-- Últimos videos de YouTube
SELECT sp.id, sp.title, sp.url
FROM social_posts sp
WHERE sp.platform = 'youtube'
  AND sp.captured_at > now() - interval '1 day'
LIMIT 5;

-- ¿Hay videos?
-- Si COUNT = 0: YouTube scraper está roto
EOF
```

**Esperado**: 5+ videos en últimas 24h

**Si falla**: Check `src/connectors/social/fetchers.js` → YouTube fetcher

---

### Paso 3: ¿Funcionan Transcripts?

```bash
psql $DATABASE_URL << EOF
-- YouTube videos con transcripts
SELECT 
  COUNT(*) as total_videos,
  COUNT(CASE WHEN vt.transcript_text IS NOT NULL THEN 1 END) as with_transcript,
  ROUND(100.0 * COUNT(CASE WHEN vt.transcript_text IS NOT NULL THEN 1 END) / COUNT(*), 1) as success_pct
FROM social_posts sp
LEFT JOIN video_transcripts vt ON sp.id = vt.post_id
WHERE sp.platform = 'youtube'
  AND sp.captured_at > now() - interval '1 day';
EOF
```

**Esperado**: > 50% success rate

**Si falla**: Check transcript provider (Playwright vs legacy)

---

### Paso 4: ¿Se Agrupan Posts?

```bash
psql $DATABASE_URL << EOF
-- Social clusters creados hoy
SELECT COUNT(*) as clusters_today
FROM social_clusters
WHERE created_at > now() - interval '1 day';

-- Distribution de tamaños
SELECT 
  (SELECT COUNT(*) FROM social_cluster_posts scp WHERE scp.cluster_id = sc.id) as cluster_size,
  COUNT(*) as cluster_count
FROM social_clusters sc
WHERE sc.created_at > now() - interval '1 day'
GROUP BY cluster_size
ORDER BY cluster_size;
EOF
```

**Esperado**: Clusters variados (1-10+ posts)

**Si falla**: Check `src/jobs/socialMonitor.js` → `clusterNewPosts()`

---

### Paso 5: ¿Se Detectan Gaps?

```bash
psql $DATABASE_URL << EOF
-- Clusters con high opportunity_score
SELECT COUNT(*) as high_opportunity_clusters
FROM social_clusters
WHERE opportunity_score > 70
  AND created_at > now() - interval '1 day';

-- Correlación con stories
SELECT 
  sc.opportunity_score BETWEEN 70 AND 100 as high_opp,
  COUNT(CASE WHEN story_clusters.id IS NOT NULL THEN 1 END) as with_story,
  COUNT(CASE WHEN story_clusters.id IS NULL THEN 1 END) as without_story
FROM social_clusters sc
LEFT JOIN story_clusters ON sc.title ILIKE '%' || story_clusters.title || '%'
WHERE sc.created_at > now() - interval '7 days'
GROUP BY high_opp;
EOF
```

**Esperado**: Gaps detectados (high_opportunity sin corresponding story)

---

## Documentar Hallazgos

Formato:

```
FACEBOOK SCRAPER
================
Status: ✅ FUNCIONA / ❌ ROTO

Hallazgos:
├─ Posts capturados en últimas 24h: 15
├─ Sources activos: 3 (TN, Clarín, Infobae)
└─ Engagement total: 45.2K

Caso específico:
├─ Post ID: sp_abc123
├─ URL: https://facebook.com/tn/posts/xyz
├─ Title: "Elecciones 2025"
├─ Engagement: 2.3K likes, 450 comments
└─ Capturado: 2026-06-29 14:23 UTC

---

YOUTUBE TRANSCRIPTS
====================
Status: ✅ FUNCIONA / ❌ ROTO

Hallazgos:
├─ Videos capturados: 22
├─ Transcripts extraídos: 18 (81.8%)
├─ Quality score promedio: 76
└─ Tiempo promedio para transcript: 12s

Casos fallidos:
├─ Video ID: sp_def456
├─ URL: https://youtube.com/watch?v=xxx
├─ Reason: timeout (20s limit)
├─ Location: src/jobs/socialMonitor.js :: fetchPendingTranscripts()

---

SOCIAL CLUSTERING
==================
Status: ✅ FUNCIONA / ⚠️ PARCIAL

Hallazgos:
├─ Clusters creados hoy: 7
├─ Tamaño promedio: 3.4 posts
├─ Clusters > 5 posts: 2
└─ Opportunity_score > 70: 1

Gap detection:
├─ High-opportunity clusters: 1
├─ Con story relacionado: 0  ← Potential gap?
├─ Gap score: 0.85
└─ Viral score: 82
```

---

## Conexión con Monitor y Coverage

**Si Social falla pero Monitor/Coverage OK**:
- Problema está en Social Intelligence
- Crawler y Coverage son confiables

**Si Monitor falla**:
- Los artículos no tienen contenido completo
- Social puede estar analizando fragmentos

**Resultado esperado**:
- Audit Social identifica qué falla (Facebook, YouTube, transcripts, clustering)
- Fixes son específicos (aumentar timeout, mejorar selector, etc.)

---

**Próximo paso**: Ejecutar queries, documentar 5 casos, identificar dónde rompe exactamente.
