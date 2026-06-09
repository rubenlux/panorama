# PROJECT_OVERVIEW.md

> Fuente de verdad del sistema. Actualizar con cada cambio estructural.
> Última actualización: 2026-06-09

---

## Descripción General

**Panorama** es una plataforma de periodismo digital full-stack de producción real. Permite publicar noticias, gestionar anuncios con targeting inteligente basado en comportamiento del usuario, y analizar el rendimiento editorial con datos de audiencia en tiempo real.

## Objetivo del Producto

Proveer una plataforma de noticias completa con:
- Publicación editorial con editor enriquecido (TipTap)
- Monetización mediante sistema de publicidad con perfilado de usuarios
- Analytics editorial profundo (comportamiento, geografía, engagement)
- IA asistiendo la creación de contenido (Claude + Whisper)

## Arquitectura Global

```
┌─────────────────────────────────────────────────────────┐
│                     PANORAMA PLATFORM                    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   WEB (web/) │  │  CMS (cms/)  │  │  API (src/)  │  │
│  │  React 19    │  │  React 19    │  │  Express 5   │  │
│  │  Port 5174   │  │  Port 5173   │  │  Port 5000   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └─────────────────┴──────────────────┘          │
│                           │ HTTP/REST                   │
│                    ┌──────┴───────┐                     │
│                    │  PostgreSQL  │                     │
│                    │  Port 5435   │                     │
│                    │  (Docker)    │                     │
│                    └─────────────┘                     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  Worker      │  │  uploads/    │                    │
│  │  (cron jobs) │  │  (static)    │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Stack Tecnológico

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | LTS | Runtime |
| Express | 5.x | Framework HTTP |
| PostgreSQL | 15 | Base de datos principal |
| `pg` | 8.x | Pool de conexiones |
| JWT (`jsonwebtoken`) | 9.x | Autenticación |
| `bcryptjs` | 3.x | Hash de contraseñas |
| `helmet` | 8.x | Seguridad HTTP headers |
| `cors` | 2.x | Cross-Origin |
| `multer` | 2.x | Upload de archivos |
| `sanitize-html` | 2.x | Sanitización de HTML |
| `geoip-lite` | 1.x | Geolocalización por IP |
| `node-cron` | 4.x | Tareas programadas |
| `zod` | 3.x | Validación de esquemas |

### Frontends (CMS y Web)
| Tecnología | Versión | Uso |
|---|---|---|
| React | 19.x | UI framework |
| Vite | 7.x | Build tool / dev server |
| React Router | 7.x | Navegación SPA |
| TipTap | 3.x | Editor de texto enriquecido (solo CMS) |
| Recharts | 3.x | Gráficos analíticos (solo CMS) |
| D3 | 4.x | Visualizaciones avanzadas (solo CMS) |
| date-fns | 4.x | Formateo de fechas |
| lucide-react | 0.56x | Iconos |

### IA / Servicios Externos
| Servicio | SDK | Uso |
|---|---|---|
| Anthropic (Claude) | `@anthropic-ai/sdk` 0.71x | Análisis de artículos, reescritura, generación de borradores |
| OpenAI (Whisper) | `openai` 6.x | Transcripción de audio |
| Pexels API | HTTP directo | Búsqueda de imágenes stock |

## Servicios Existentes

| Servicio | Puerto | Proceso | Comando |
|---|---|---|---|
| API REST | 5000 | `node src/server.js` | `npm run dev` |
| CMS Admin | 5173 | Vite dev server | `cd cms && npm run dev` |
| Web Pública | 5174 | Vite dev server | `cd web && npm run dev` |
| Worker | — | `node src/worker.js` | `npm run worker` |
| PostgreSQL | 5435 | Docker container | `npm run db:up` |

## Módulos del Sistema

1. **Artículos** — CRUD completo, estados (draft/published/archived), SEO metadata
2. **Categorías** — Taxonomía con slug, color, visibilidad en menú, flag de tag
3. **Usuarios** — Roles (admin/editor/author), perfiles, tracking de actividad
4. **Media** — Upload de archivos, carpetas, integración Pexels
5. **Comentarios** — Sistema con moderación (pending/approved/rejected), threading
6. **Publicidad v2** — Smart serving con perfilado de intereses + targeting por tags
7. **Pixel / Analytics** — Tracking de eventos del visitante, perfiles de audiencia
8. **Analytics v2** — Insights editoriales: autores, categorías, tráfico, geografía
9. **AI Core** — Análisis de artículos, reescritura, generación de borradores, transcripción de audio
10. **Reels** — Videos cortos estilo Instagram Reels
11. **Suscriptores** — Newsletter y lista de emails
12. **Configuración** — Settings key-value del sitio (título, favicon, etc.)
13. **Worker** — Cron job diario para calcular revenue publicitario
