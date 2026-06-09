# DATABASE_MAP.md

> Mapa completo de la base de datos. Actualizar ante cualquier migración.
> Última actualización: 2026-06-09 (Sprint 3) | Motor: PostgreSQL 15 | DB: newsdb | Port: 5435

---

## Tablas del Sistema (30 tablas)

### `articles`
Tabla principal del contenido editorial.

| Columna | Tipo | Restricción | Default |
|---|---|---|---|
| id | uuid | PK NOT NULL | gen_random_uuid() |
| author_id | uuid | FK → users.id | — |
| title | varchar | NOT NULL | — |
| slug | varchar | NOT NULL UNIQUE | — |
| excerpt | text | — | — |
| body | text | — | — |
| status | varchar | — | `'draft'` |
| published_at | timestamp | — | — |
| created_at | timestamp | — | CURRENT_TIMESTAMP |
| updated_at | timestamptz | NOT NULL | now() |
| image | text | — | — |
| image_url | text | — | — |
| volanta | varchar | — | — |
| epigraph | text | — | — |
| word_count | integer | — | 0 |

**Status values:** `draft` | `published` | `archived`

---

### `categories`
Taxonomía del sitio. Controla menú de navegación.

| Columna | Tipo | Restricción | Default |
|---|---|---|---|
| id | uuid | PK NOT NULL | gen_random_uuid() |
| name | varchar | NOT NULL | — |
| slug | varchar | NOT NULL UNIQUE | — |
| show_in_menu | boolean | — | true |
| color | varchar | — | `'#3b82f6'` |
| is_tag | boolean | — | false |
| created_at | timestamp | — | CURRENT_TIMESTAMP |
| updated_at | timestamp | — | CURRENT_TIMESTAMP |

**Nota:** `is_tag=true` marca categorías que funcionan como etiquetas. `show_in_menu=false` las oculta del navbar.

---

### `article_categories`
Relación N:M entre artículos y categorías.

| Columna | Tipo | Restricción |
|---|---|---|
| article_id | uuid | PK + FK → articles.id |
| category_id | uuid | PK + FK → categories.id |

---

### `article_seo`
Metadatos SEO por artículo (1:1 con articles).

| Columna | Tipo |
|---|---|
| article_id | uuid PK FK |
| meta_title | varchar |
| meta_description | text |
| canonical_url | text |
| og_title | varchar |
| og_description | text |
| og_image | text |
| schema_json | text |
| keywords | text |

---

### `article_stats`
Contadores de engagement por artículo (1:1 con articles).

| Columna | Tipo | Default |
|---|---|---|
| article_id | uuid PK FK | — |
| views | integer | 0 |
| unique_views | integer | 0 |
| likes | integer | 0 |
| shares | integer | 0 |
| comments_count | integer | 0 |
| avg_read_time | integer | 0 |
| last_viewed_at | timestamp | — |
| total_read_time_seconds | bigint | 0 |
| bounce_rate | real | 0 |

---

### `users`
Usuarios del CMS. Roles: admin, editor, author.

| Columna | Tipo | Restricción | Default |
|---|---|---|---|
| id | uuid | PK NOT NULL | gen_random_uuid() |
| email | varchar | NOT NULL UNIQUE | — |
| password_hash | varchar | NOT NULL | — |
| role | varchar | — | `'editor'` |
| name | text | — | — |
| bio | text | — | — |
| avatar_url | text | — | — |
| social_links | jsonb | — | `{}` |
| created_at | timestamp | — | CURRENT_TIMESTAMP |
| updated_at | timestamp | — | CURRENT_TIMESTAMP |

**Roles:** `admin` | `editor` | `author`

---

### `user_activity`
Log de actividad de usuarios CMS (heartbeat, acciones).

| Columna | Tipo | Default |
|---|---|---|
| id | integer | serial |
| user_id | uuid FK → users.id | — |
| event | text | — |
| payload | jsonb | `{}` |
| created_at | timestamptz | now() |

---

### `comments`
Comentarios de lectores en artículos. Sistema con moderación.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| article_id | uuid FK → articles.id | — |
| parent_id | uuid FK → comments.id | — |
| user_id | uuid FK → users.id | — |
| author_name | varchar | — |
| author_email | varchar | — |
| body | text | — |
| status | varchar | `'pending'` |
| ip_hash | varchar | — |
| user_agent | text | — |
| created_at | timestamp | CURRENT_TIMESTAMP |

**Status:** `pending` | `approved` | `rejected`

---

### `media`
Biblioteca de archivos subidos.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| url | text NOT NULL | — |
| filename | text NOT NULL | — |
| mime | varchar | — |
| size_bytes | bigint | — |
| created_by | uuid FK → users.id | — |
| folder | text | `'general'` |
| created_at | timestamp | CURRENT_TIMESTAMP |

---

### `folders`
Carpetas para organizar archivos de media.

| Columna | Tipo |
|---|---|
| id | integer serial PK |
| name | text NOT NULL |
| created_at | timestamp |

---

### `pixel_events`
Todos los eventos de tracking del visitante. Tabla de volumen alto.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| visitor_id | text NOT NULL | — |
| session_id | text NOT NULL | — |
| event | text NOT NULL | — |
| url | text | — |
| referrer | text | — |
| user_agent | text | — |
| ip_hash | text | — |
| device_type | varchar | — |
| payload | jsonb | `{}` |
| created_at | timestamptz | CURRENT_TIMESTAMP |
| geo_country | varchar | — |
| geo_city | varchar | — |
| utm_source | varchar | — |
| utm_medium | varchar | — |
| utm_campaign | varchar | — |

**Eventos conocidos:** `page_view`, `time_on_content`, `scroll_depth`, `exit_intent`, `content_loaded`, `internal_link_click`

---

### `visitor_profiles`
Perfil agregado por visitante. Base del targeting de ads.

| Columna | Tipo | Default |
|---|---|---|
| visitor_id | text PK | — |
| first_seen_at | timestamptz | — |
| last_seen_at | timestamptz | — |
| total_sessions | integer | 0 |
| category_affinity | jsonb | `{}` |
| engagement_score | double precision | 0.0 |
| updated_at | timestamptz | CURRENT_TIMESTAMP |

**`category_affinity`:** `{ "politica": 5, "deportes": 2, ... }` — cuenta de vistas por categoría.

---

### `events`
Analytics v1 — tracking básico de artículos (deprecado en favor de pixel_events).

| Columna | Tipo |
|---|---|
| id | uuid PK |
| article_id | uuid FK → articles.id |
| type | varchar NOT NULL |
| session_id | varchar |
| metadata | jsonb |
| created_at | timestamp |

---

### `advertisers`
Anunciantes del sistema publicitario.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text NOT NULL | — |
| email | text | — |
| contact_name | text | — |
| active | boolean | true |
| created_at | timestamp | now() |

---

### `campaigns`
Campañas publicitarias. Contienen la lógica de targeting por tags.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| advertiser_id | uuid FK → advertisers.id | — |
| name | text NOT NULL | — |
| status | text | `'active'` |
| start_date | timestamptz | now() |
| end_date | timestamptz | — |
| target_impressions | integer | — |
| priority | integer | 1 |
| banner_url | text NOT NULL | — |
| target_url | text NOT NULL | — |
| position | text NOT NULL | — |
| tags | text[] | `{}` |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

**Status:** `active` | `paused` | `archived`

---

### `ads`
Unidades de anuncio individuales. Legacy — relacionadas con campaigns.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| sponsor_name | varchar NOT NULL | — |
| type | varchar | `'banner'` |
| position | varchar | — |
| image_url | text NOT NULL | — |
| link_url | text | — |
| impressions | integer | 0 |
| clicks | integer | 0 |
| active | boolean | true |
| start_date | timestamp | CURRENT_TIMESTAMP |
| end_date | timestamp | — |
| campaign_id | uuid FK → campaigns.id | — |
| ad_slot_id | uuid FK → ad_slots.id | — |
| alt_text | text | — |
| starts_at | timestamp | — |
| ends_at | timestamp | — |

---

### `ad_slots`
Posiciones de anuncio disponibles en el sitio.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text NOT NULL | — |
| position | text NOT NULL | — |
| device | text | `'all'` |
| width | integer | — |
| height | integer | — |
| active | boolean | true |
| created_at | timestamp | now() |

---

### `ad_events`
Eventos de impresión y click de anuncios.

| Columna | Tipo |
|---|---|
| id | uuid PK |
| ad_id | uuid FK → ads.id |
| type | text NOT NULL (`impression` / `click`) |
| ip | text |
| user_agent | text |
| article_id | uuid FK → articles.id |
| created_at | timestamp |

---

### `ad_revenue`
Revenue calculado por el worker cron (CPM/CPC/FIXED).

| Columna | Tipo |
|---|---|
| id | uuid PK |
| ad_id | uuid NOT NULL FK → ads.id |
| impressions | integer NOT NULL |
| clicks | integer NOT NULL |
| revenue | numeric NOT NULL |
| period_start | date NOT NULL |
| period_end | date NOT NULL |
| created_at | timestamptz |

**UNIQUE:** `(ad_id, period_start, period_end)` — permite upsert diario.

---

### `settings`
Key-value store de configuración del sitio.

| Columna | Tipo | Default |
|---|---|---|
| key | varchar PK | — |
| value | text | — |
| type | varchar | `'string'` |
| group_name | varchar | `'general'` |
| updated_at | timestamp | now() |

**Keys conocidas:** `site_title`, `site_favicon`, `site_description`, `homepage_layout`, `ads_enabled`

---

### `subscribers`
Lista de emails para newsletter.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| email | varchar NOT NULL UNIQUE | — |
| source | varchar | — |
| status | varchar | `'active'` |
| created_at | timestamp | CURRENT_TIMESTAMP |

---

### `reels`
Videos cortos embebidos de plataformas externas.

| Columna | Tipo | Default |
|---|---|---|
| id | integer PK serial | — |
| title | varchar NOT NULL | — |
| description | text | — |
| url | text NOT NULL | — |
| thumbnail | text | — |
| platform | varchar | `'instagram'` |
| status | varchar | `'active'` |
| order_index | integer | 0 |
| created_at | timestamptz | CURRENT_TIMESTAMP |
| updated_at | timestamptz | CURRENT_TIMESTAMP |

---

### `reel_settings`
Configuración visual del componente Reels.

| Columna | Tipo | Default |
|---|---|---|
| id | integer PK serial | — |
| background_color | varchar | `'#1e3a8a'` |
| updated_at | timestamptz | CURRENT_TIMESTAMP |

---

### `products`
Productos para sección de e-commerce ligero.

| Columna | Tipo | Default |
|---|---|---|
| id | integer PK serial | — |
| name | varchar NOT NULL | — |
| category | varchar | — |
| price | numeric NOT NULL | — |
| old_price | numeric | — |
| image_url | text | — |
| target_url | text | — |
| status | varchar | `'active'` |
| created_at | timestamptz | CURRENT_TIMESTAMP |

---

### `pgmigrations`
Registro interno de migraciones (node-pg-migrate).

---

---

### `research_topics`
Investigaciones del Centro de Investigación AI.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| title | text NOT NULL | — |
| status | text NOT NULL | `'pending'` |
| created_by | uuid FK → users.id | — |
| category | varchar | — |
| tags | text[] | `{}` |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

**Status:** `researching` → `completed` / `no_brief` / `no_sources` / `failed`

---

### `research_sources`
Fuentes encontradas por los conectores de investigación.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| topic_id | uuid FK → research_topics | — |
| url | text | — |
| title | text | — |
| source_name | text | — |
| published_at | timestamptz | — |
| content | text (max 2000 chars) | — |
| relevance_score | real | 0 |
| connector | text | `'rss'` |
| language | varchar | `'es'` |
| entities | jsonb | `[]` |
| word_count | integer | — |
| created_at | timestamptz | now() |

---

### `research_briefs`
Brief generado por Claude a partir de las fuentes.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| topic_id | uuid FK → research_topics | — |
| executive_summary | text | — |
| key_facts | jsonb | `[]` |
| controversies | jsonb | `[]` |
| timeline | jsonb | `[]` |
| opportunities | text | — |
| risks | text | — |
| source_attribution | jsonb | `{}` |
| model_used | varchar | `'claude-sonnet-4-5-20250929'` |
| prompt_version | integer | 1 |
| generated_at | timestamptz | now() |

---

---

### `knowledge_entities`
Base del Knowledge Base. Entidades nombradas extraídas automáticamente de cada investigación.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | varchar NOT NULL | — |
| entity_type | varchar NOT NULL | — |
| description | text | — |
| first_seen_at | timestamptz | now() |
| last_seen_at | timestamptz | now() |
| mention_count | integer | 1 |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

**entity_type values:** `person` | `company` | `product` | `organization` | `location`

**UNIQUE:** `(lower(name), entity_type)` — misma entidad = mismo nombre normalizado + mismo tipo.

---

### `entity_mentions`
Registro de qué investigación mencionó a cada entidad.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| entity_id | uuid FK → knowledge_entities | — |
| topic_id | uuid FK → research_topics | — |
| source_id | uuid FK → research_sources (nullable) | — |
| confidence | real | 1.0 |
| created_at | timestamptz | now() |

**UNIQUE:** `(entity_id, topic_id)` — una mención por entidad por investigación.

---

### `knowledge_events`
Eventos vinculados a entidades (lanzamientos, anuncios, controversias).

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| entity_id | uuid FK → knowledge_entities | — |
| title | varchar NOT NULL | — |
| summary | text | — |
| event_date | date | — |
| event_type | varchar | `'news'` |
| source_topic_id | uuid FK → research_topics (nullable) | — |
| created_at | timestamptz | now() |

**event_type values:** `announcement` | `launch` | `controversy` | `funding` | `political` | `merger` | `other` | `news`

---

---

### `tracked_sources`
Fuentes RSS monitoreadas por el News Intelligence Engine.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | varchar NOT NULL | — |
| type | varchar | `'news'` |
| rss_url | text NOT NULL | — |
| homepage | text | — |
| enabled | boolean | true |
| check_interval | integer | 60 (segundos) |
| last_checked | timestamptz | — |
| created_at | timestamptz | now() |

**type values:** `news` | `blog` | `company` | `government`

**Seeds iniciales (8):** Infobae, La Nación, Clarín, Télam, Perfil, BBC Mundo, DW Español, TechCrunch

---

### `monitored_articles`
Artículos detectados por el monitor RSS. Deduplicados por hash SHA-256 de URL.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| source_id | uuid FK → tracked_sources | — |
| external_id | text | — |
| title | text NOT NULL | — |
| url | text NOT NULL | — |
| summary | text | — |
| published_at | timestamptz | — |
| detected_at | timestamptz | now() |
| hash | varchar NOT NULL UNIQUE | SHA-256 de URL |

**UNIQUE:** `(hash)` — deduplicación por URL normalizada en lowercase.

---

### `article_entity_matches`
Matches entre artículos monitoreados y entidades del Knowledge Base (matching string, sin IA).

| Columna | Tipo |
|---|---|
| id | uuid PK |
| article_id | uuid FK → monitored_articles |
| entity_id | uuid FK → knowledge_entities |
| matched_at | timestamptz |

**UNIQUE:** `(article_id, entity_id)` — un match por par artículo-entidad.

---

### `trending_topics`
Entidades tendencia detectadas en la ventana de 30 minutos.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| entity_id | uuid FK → knowledge_entities UNIQUE | — |
| mention_count | integer | 0 |
| source_count | integer | 0 |
| last_seen_at | timestamptz | now() |
| auto_researched | boolean | false |
| updated_at | timestamptz | now() |

**UNIQUE:** `(entity_id)` — una fila por entidad, actualizada en cada ciclo del monitor.

**auto_researched:** Se resetea a `false` automáticamente cuando la entidad lleva `AUTO_RESEARCH_COOLDOWN` (120 min) sin actividad, para permitir re-trigger.

---

## Migraciones Conocidas

| Script | Propósito |
|---|---|
| `src/migration/001_init.js` | Esquema inicial |
| `src/migration/002_add_user_profile.js` | Perfil de usuario (bio, avatar, social_links) |
| `scripts/phase1_migration.js` → `phase8_ads_migration.js` | Migraciones incrementales del sistema de ads y analytics |
| `scripts/migrate_settings.js` | Tabla settings |
| `scripts/migrate_word_count.js` | Columna word_count en articles |
| `scripts/migrate_community.js` | Funcionalidades de comunidad |
| `scripts/migrate_pixel_geo.js` | Campos geo en pixel_events |
| `scripts/migrate_productivity.js` | Tablas de productividad |
| `scripts/migrate_knowledge_base.js` | Sprint 2: `knowledge_entities`, `entity_mentions`, `knowledge_events` |
| `scripts/migrate_news_intelligence.js` | Sprint 3: `tracked_sources`, `monitored_articles`, `article_entity_matches`, `trending_topics` |

## Estado de Índices
> Pendiente de documentar. Ejecutar: `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename`
