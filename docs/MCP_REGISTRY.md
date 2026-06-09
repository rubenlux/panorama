# MCP_REGISTRY.md

> Registro de Model Context Protocol servers y herramientas externas conectadas.
> Última actualización: 2026-06-09

---

## Estado Actual

**MCPs integrados en el proyecto Panorama:** Ninguno en este momento.

El proyecto no utiliza MCP servers de forma directa. La integración con modelos de IA se realiza mediante SDKs HTTP directos (ver `AI_CORE.md`).

---

## MCPs Disponibles en el Entorno de Desarrollo

Los siguientes MCPs están disponibles en el entorno del desarrollador (Claude Code) pero **no están integrados en la aplicación Panorama**:

| MCP | Herramientas | Estado |
|---|---|---|
| Gmail | draft, label, thread, search | Disponible en Claude Code |
| Google Calendar | authenticate | Disponible en Claude Code |
| Google Drive | authenticate | Disponible en Claude Code |

---

## Integraciones Externas (No MCP)

Estas son las integraciones con servicios externos que sí están activas en la aplicación:

| Servicio | Tipo | Uso | Config |
|---|---|---|---|
| Anthropic API | HTTP SDK | IA editorial | `ANTHROPIC_API_KEY` en `.env` |
| OpenAI API | HTTP SDK | Transcripción de audio (Whisper) | `OPENAI_API_KEY` en `.env` |
| Pexels API | HTTP directo | Búsqueda de imágenes stock | Key hardcodeada en `media.js` — deuda técnica |

---

## Oportunidades de MCP Futuras

Si se expande la plataforma, los siguientes MCPs serían candidatos naturales:

| Caso de uso | MCP candidato |
|---|---|
| Envío de newsletters | MCP de Gmail / SendGrid |
| Gestión de agenda editorial | MCP de Google Calendar |
| Almacenamiento de assets en cloud | MCP de Google Drive / S3 |
| Monitoreo de menciones en redes | MCP de Twitter/X API |
| Análisis de SEO externo | MCP de herramientas SEO |

---

> Actualizar este documento cuando se integre cualquier MCP nuevo a la aplicación.
