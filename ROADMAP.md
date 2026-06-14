# ROADMAP MAESTRO — INSPYRA NEWS AUTONOMOUS EDITORIAL PLATFORM

## OBJETIVO FINAL

Construir una plataforma editorial autónoma capaz de:

* Detectar noticias.
* Monitorear medios.
* Monitorear redes sociales.
* Detectar tendencias.
* Detectar oportunidades editoriales.
* Corroborar información.
* Generar contenido.
* Generar SEO.
* Generar contenido para redes.
* Publicar automáticamente contenido de bajo riesgo.
* Escalar únicamente los casos sensibles a revisión humana.

La intervención humana debe tender al mínimo posible.

====================================================
## PRINCIPIOS ARQUITECTÓNICOS
==========================

1. La IA NO es la fuente de verdad.
La verdad proviene de:
* fuentes monitoreadas
* corroboración
* clustering
* scoring
* social intelligence

2. Ninguna noticia debe publicarse porque la IA la inventó.
3. Toda afirmación debe poder trazarse hasta artículos reales.
4. Todo proceso debe ser auditable.
5. Ningún proveedor AI debe quedar acoplado al sistema.

====================================================
## FASE 1 — NEWS INTELLIGENCE
==========================
Estado esperado: COMPLETADO
Módulos:
tracked_sources, monitored_articles, story_clusters, events, opportunities, dossiers
Objetivo: Detectar y agrupar noticias.

====================================================
## FASE 2 — CONTENT ENRICHMENT
===========================
Estado esperado: COMPLETADO
Objetivo: Nunca depender únicamente de RSS.
Implementar: fetch completo, playwright fallback, extraction_method, content_words, enrichment coverage
Métricas: coverage %, content completeness, source quality

====================================================
## FASE 3 — CLUSTER QUALITY
========================
Estado esperado: COMPLETADO
Objetivo: Eliminar contaminación.
Implementar: relevance_score, story_quality, story_confidence, story_context_score, clustering_audit
Todo cluster debe ser explicable.

====================================================
## FASE 4 — SOCIAL INTELLIGENCE
============================
Objetivo: Monitorear únicamente cuentas definidas por el usuario.
Plataformas: YouTube, Instagram, Facebook, TikTok, X, WhatsApp Channels
Entidades: social_sources, social_posts, social_clusters
Capacidades: clustering social, trending topics, engagement, content gap
Preguntas que debe responder:
¿Qué publica la competencia?
¿Qué publica Formosa?
¿Qué tema está creciendo?
¿Qué tema no estamos cubriendo?

====================================================
## FASE 5 — WHATSAPP INTELLIGENCE
==============================
Objetivo: Monitorear canales públicos.
Implementar: platform = whatsapp
Capturar: texto, imágenes, videos, links, fecha
Integrar con Social Intelligence.

====================================================
## FASE 6 — AI PROVIDER LAYER
==========================
Objetivo: Desacoplar completamente la IA.
Proveedores soportados: Anthropic API, OpenAI, OpenClaw, Ollama
Configuración: AI_PROVIDER=
Cambiar proveedor sin tocar lógica editorial.

====================================================
## FASE 7 — PUBLICATION ENGINE
===========================
Objetivo: Preparar distribución automática.
Nuevas tablas: publication_queue, publication_targets, publication_logs
Destinos: web, facebook, instagram, x, whatsapp, youtube
Capacidades: schedule, retry, failure tracking, audit trail

====================================================
## FASE 8 — FACT CONSISTENCY ENGINE
================================
Objetivo: Reducir errores. Detectar: contradicciones, fechas incompatibles, resultados incompatibles, personas incompatibles.
Resultado: FACT_CONFLICT -> Bloquear autopublicación.

====================================================
## FASE 9 — RISK CLASSIFIER
========================
Clasificar contenido: LOW RISK, MEDIUM RISK, HIGH RISK. La clasificación debe ser automática.

====================================================
## FASE 10 — PUBLICATION CONFIDENCE
================================
Nuevo score: publication_confidence (0-100)
Factores: story_confidence, story_context_score, source_count, content coverage, fact consistency, social corroboration

====================================================
## FASE 11 — AUTONOMOUS PUBLISHING
===============================
Reglas:
confidence >= 90 AND risk = low -> AUTO PUBLISH
confidence 75-89 -> AUTO PUBLISH + AUDIT
confidence 50-74 -> REVIEW QUEUE
confidence < 50 -> BLOCK

====================================================
## FASE 12 — CONTENT GENERATION
============================
Generar automáticamente: noticia, SEO, meta description, schema.org, facebook post, instagram caption, x thread, whatsapp summary, youtube community post
Todo basado únicamente en fuentes verificadas.

====================================================
## FASE 13 — DISTRIBUTION ENGINE
=============================
Una vez publicado: Web -> Facebook -> Instagram -> X -> WhatsApp -> YouTube Community
Distribución automática.

====================================================
## FASE 14 — EDITORIAL COMMAND CENTER
==================================
Dashboard central. Mostrar: Historias activas, Temas virales, Competencia, Content gap, Publicaciones pendientes, Automáticas, Alertas, Riesgos, Conflictos.

====================================================
## FASE 15 — AUTONOMOUS NEWSROOM
=============================
Estado final esperado. Pipeline: Detectar -> Corroborar -> Clusterizar -> Analizar -> Generar -> SEO -> Redes -> Publicar -> Distribuir. Intervención humana: Solo excepciones.

====================================================
## REGLA OBLIGATORIA
=================
Ninguna fase puede considerarse terminada sin:
1. Migración ejecutada.
2. Auditoría SQL.
3. Endpoint de diagnóstico.
4. Actualización de: ROADMAP.md, DATABASE_MAP.md, MODULE_REGISTRY.md, SYSTEM_STATUS.md, DECISIONS_LOG.md.
5. Definition of Done verificable.
6. Evidencia real de funcionamiento.
No aceptar "implementado" sin pruebas.
