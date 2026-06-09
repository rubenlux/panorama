# API_REGISTRY.md

> Registro completo de endpoints. Base URL: `http://localhost:5000`
> Prefijo: **ninguno** — las rutas se montan directo (no `/api/...`)
> Última actualización: 2026-06-09

Leyenda auth: `—` público | `🔑` requireAuth | `👑` requireAuth + admin | `✏️` requireAuth + admin/editor

---

## /health

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Health check + ping DB |

---

## /auth

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ email, password, name?, role? }` | `{ token, user }` |
| POST | `/auth/login` | — | `{ email, password }` | `{ token, user: { id, email, role, name } }` |

---

## /articles

| Método | Ruta | Auth | Query/Body | Respuesta |
|---|---|---|---|---|
| GET | `/articles` | — | `?status=published&category=slug&search=text&limit=20&offset=0` | `{ items: [...], total }` |
| GET | `/articles/stats` | — | — | Stats agregadas |
| GET | `/articles/:slug` | — | — | `{ article, seo, stats }` |
| POST | `/articles` | 🔑 editor+ | `{ title, body, excerpt, category_ids, status, ... }` | `{ article }` |
| PUT | `/articles/:slug` | 🔑 editor+ | `{ title, body, ... }` | `{ article }` |
| PATCH | `/articles/:slug` | 🔑 editor+ | `{ status }` | `{ article }` |
| DELETE | `/articles/:slug` | 👑 admin | — | `{ ok: true }` |

---

## /categories

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| GET | `/categories` | — | — | `{ items: [{ id, name, slug, show_in_menu, color, is_tag }] }` |
| POST | `/categories` | ✏️ | `{ name, slug, color?, show_in_menu?, is_tag? }` | `{ category }` |
| PUT | `/categories/:id` | ✏️ | `{ name, slug, ... }` | `{ category }` |
| DELETE | `/categories/:id` | ✏️ | — | `{ ok: true }` |

---

## /users

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| POST | `/users/activity/heartbeat` | 🔑 | `{ event, payload }` | `{ ok }` |
| GET | `/users/performance/stats` | ✏️ | — | Stats de rendimiento por usuario |
| GET | `/users/performance/export` | ✏️ | — | CSV download |
| GET | `/users` | ✏️ | — | `{ items: [...] }` |
| POST | `/users` | 👑 | `{ email, password, role, name }` | `{ user }` |
| GET | `/users/:id` | 🔑 | — | `{ user }` |
| PATCH | `/users/:id` | 🔑 | `{ name, bio, avatar_url, social_links }` | `{ user }` |
| DELETE | `/users/:id` | 👑 | — | `{ ok: true }` |

---

## /comments

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| GET | `/articles/:slug/comments` | — | — | `{ items: [...] }` (solo aprobados) |
| POST | `/articles/:slug/comments` | — | `{ author_name, author_email, body, parent_id? }` | `{ comment }` (status: pending) |
| GET | `/comments` | ✏️ | `?status=pending` | Todos los comentarios |
| PATCH | `/comments/:id` | ✏️ | `{ status }` | `{ comment }` |
| DELETE | `/comments/:id` | ✏️ | — | `{ ok: true }` |

---

## /media

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| GET | `/media/folders` | 🔑 | — | `{ items: [...] }` |
| POST | `/media/folders` | ✏️ | `{ name }` | `{ folder }` |
| DELETE | `/media/folders/:id` | ✏️ | — | `{ ok: true }` |
| GET | `/media` | ✏️ | `?folder=X` | `{ items: [...] }` |
| POST | `/media` | ✏️ | multipart: `file` | `{ media: { url, filename, mime, size_bytes } }` |
| DELETE | `/media/:id` | ✏️ | — | `{ ok: true }` |
| GET | `/media/pexels/search` | 🔑 | `?q=nature&per_page=20` | `{ photos: [...] }` |
| POST | `/media/pexels/upload` | ✏️ | `{ url, alt }` | `{ media }` |

---

## /stats

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/stats` | ✏️ | `{ articles_total, published, draft, views_today, ... }` |

---

## /analytics

| Método | Ruta | Auth | Body |
|---|---|---|---|
| POST | `/analytics/track` | — | `{ article_id, type, session_id, metadata }` |

---

## /analytics/v2

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/analytics/v2/editorial/overview` | ✏️ | KPIs globales |
| GET | `/analytics/v2/editorial/realtime` | ✏️ | Lectores activos ahora |
| GET | `/analytics/v2/editorial/insights/authors` | ✏️ | Performance por autor |
| GET | `/analytics/v2/editorial/insights/categories` | ✏️ | Performance por categoría |
| GET | `/analytics/v2/editorial/insights/traffic` | ✏️ | Fuentes de tráfico |
| GET | `/analytics/v2/editorial/insights/history` | ✏️ | Histórico pageviews |
| GET | `/analytics/v2/editorial/insights/geo` | ✏️ | Distribución geográfica |
| GET | `/analytics/v2/editorial/insights/journey` | ✏️ | Recorridos de usuario |
| GET | `/analytics/v2/editorial/insights/flow` | ✏️ | Flujo de navegación |
| GET | `/analytics/v2/editorial/insights/engagement` | ✏️ | Métricas de engagement |
| GET | `/analytics/v2/editorial/article/:id` | ✏️ | Analytics de un artículo |
| GET | `/analytics/v2/editorial/ads/campaign/:id` | ✏️ | Analytics de campaña |

---

## /ads (legacy ads.js + ads_v2.js — mismo prefijo)

### Público / Frontend
| Método | Ruta | Auth | Query | Respuesta |
|---|---|---|---|---|
| GET | `/ads/active` | — | `?position=X` | Lista de ads activos (legacy) |
| POST | `/ads/:id/impression` | — | — | Registra impresión |
| POST | `/ads/:id/click` | — | — | Registra click |
| GET | `/ads/serve` | — | `?position=X&visitor_id=Y` | Smart ad serving (v2) |

### Admin (legacy)
| Método | Ruta | Auth |
|---|---|---|
| GET | `/ads/admin/slots` | 👑 |
| GET | `/ads` | 👑 |
| GET | `/ads/admin/advertisers` | 👑 |
| POST | `/ads/admin/advertisers` | 👑 |
| GET | `/ads/admin/campaigns` | 👑 |
| POST | `/ads/admin/campaigns` | 👑 |
| POST | `/ads` | 👑 |
| GET | `/ads/admin/kpis` | 👑 |
| GET | `/ads/admin/chart` | 👑 |
| GET | `/ads/admin/campaigns/active-list` | 👑 |
| GET | `/ads/admin/ads/top` | 👑 |
| GET | `/ads/admin/alerts` | 👑 |
| GET | `/ads/admin/campaigns/:id/stats` | 👑 |
| GET | `/ads/admin/campaigns/:id/ads` | 👑 |
| GET | `/ads/admin/campaigns/:id/export` | 👑 |

### Admin (v2)
| Método | Ruta | Auth |
|---|---|---|
| GET | `/ads/manage/advertisers` | 👑 |
| POST | `/ads/manage/advertisers` | 👑 |
| GET | `/ads/manage/campaigns` | 👑 |
| POST | `/ads/manage/campaigns` | 👑 |
| PUT | `/ads/manage/campaigns/:id` | 👑 |
| DELETE | `/ads/manage/campaigns/:id` | 👑 |

---

## /pixel

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/pixel/pixel.js` | — | Sirve script cliente de tracking |
| POST | `/pixel/events` | — | Recibe `{ events: [...] }` batch |

---

## /settings

| Método | Ruta | Auth | Body |
|---|---|---|---|
| GET | `/settings` | — | — | Devuelve `{ settings: { key: value, ... } }` |
| POST | `/settings/batch` | 👑 | `{ key: value, ... }` |

---

## /subscribers

| Método | Ruta | Auth | Body |
|---|---|---|---|
| POST | `/subscribers` | — | `{ email, source? }` |
| GET | `/subscribers` | 👑 | — |

---

## /marketing

| Método | Ruta | Auth |
|---|---|---|
| POST | `/marketing/subscribe` | — |
| GET | `/marketing/subscribers` | ✏️ |

---

## /reels

| Método | Ruta | Auth |
|---|---|---|
| GET | `/reels/settings` | — |
| PUT | `/reels/settings` | ✏️ |
| GET | `/reels` | — |
| GET | `/reels/admin/list` | ✏️ |
| POST | `/reels` | ✏️ |
| PUT | `/reels/:id` | ✏️ |
| DELETE | `/reels/:id` | 👑 |

---

## /products

| Método | Ruta | Auth |
|---|---|---|
| GET | `/products` | — |
| POST | `/products` | 👑 |
| DELETE | `/products/:id` | 👑 |

---

## /ai

| Método | Ruta | Auth | Body |
|---|---|---|---|
| POST | `/ai/analyze` | 🔑 | `{ article: { title, body, excerpt } }` |
| POST | `/ai/rewrite` | 🔑 | `{ article, instructions }` |

---

## /editorial-studio

| Método | Ruta | Auth | Body |
|---|---|---|---|
| POST | `/editorial-studio/create-draft` | 🔑 | `{ prompt, context? }` |
| POST | `/editorial-studio/reformulate` | 🔑 | `{ text, style }` |
| POST | `/editorial-studio/structure-data` | 🔑 | `{ text }` |
| POST | `/editorial-studio/from-audio` | 🔑 | `{ transcript }` |
| POST | `/editorial-studio/transcribe` | 🔑 | multipart: `audio` |

---

## /uploads (static)

| Patrón | Descripción |
|---|---|
| `GET /uploads/:filename` | Sirve archivos subidos. Headers CORS abiertos. |
