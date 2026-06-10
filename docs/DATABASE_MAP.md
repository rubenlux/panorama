# DATABASE_MAP.md

> Mapa completo de la base de datos. Actualizar ante cualquier migración.
> Última actualización: 2026-06-10 (Sprint 6.3) | Motor: PostgreSQL 15 | DB: newsdb | Port: 5435

---

## Tablas del Sistema (52 tablas)

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
| origin | varchar | — | `'manual'` |
| dossier_id | uuid | FK → editorial_dossiers.id (nullable) | — |
| coverage_scope | varchar | CHECK (international/national/regional/local) | `'national'` |
| region | varchar | — | — |

**Status values:** `draft` | `published` | `archived`
**origin values:** `manual` | `research` | `dossier`

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

---

### `editorial_dossiers`
Guías editoriales generadas por Claude a partir de investigaciones. Centro del Editorial Workflow Engine.

| Columna | Tipo | Default |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| topic_id | uuid FK → research_topics (nullable) | — |
| status | varchar NOT NULL | `'generating'` |
| executive_summary | text | — |
| verified_facts | jsonb | `[]` |
| timeline | jsonb | `[]` |
| entities | jsonb | `[]` (snapshot de entidades detectadas) |
| seo_keywords | text[] | — |
| suggested_categories | text[] | — |
| suggested_tags | text[] | — |
| suggested_headlines | text[] | — |
| suggested_angles | jsonb | `[]` (Story Builder: ángulos editoriales) |
| hero_image_prompt | text | — (prompt en inglés para generador de imágenes) |
| created_by | uuid FK → users (nullable) | — |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

**status values:** `generating` | `ready` | `failed`

**`suggested_angles` structure:**
```json
[{
  "angle_type": "informativo|analisis|impacto_social|economico|tecnologico|politico|cultural",
  "title": "Título del enfoque",
  "summary": "2-3 oraciones del enfoque",
  "target_audience": "Audiencia objetivo",
  "keywords": ["kw1", "kw2"]
}]
```

**`articles` (columnas agregadas Sprint 4):**
- `origin VARCHAR DEFAULT 'manual'` — `manual` | `research` | `dossier`
- `dossier_id UUID FK → editorial_dossiers (nullable)` — referencia al dossier origen

---

### `topics` *(Sprint 5)*
Temas inteligentes que agrupan artículos, investigaciones, entidades y eventos.

| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| slug | VARCHAR UNIQUE | — |
| name | VARCHAR | — |
| description | TEXT | — |
| category | VARCHAR | — |
| region | VARCHAR | — |
| coverage_scope | VARCHAR | `'national'` — `international`/`national`/`regional`/`local` |
| importance_score | DECIMAL(5,2) | 0 |
| created_at / updated_at | TIMESTAMPTZ | NOW() |

### `topic_articles` *(Sprint 5)*
| Columna | Tipo |
|---|---|
| topic_id | UUID FK → topics.id |
| article_id | UUID FK → articles.id |
| relevance_score | DECIMAL(3,2) DEFAULT 1.0 |
| added_at | TIMESTAMPTZ |

### `topic_research` *(Sprint 5)*
| Columna | Tipo |
|---|---|
| topic_id | UUID FK → topics.id |
| research_topic_id | UUID FK → research_topics.id |
| added_at | TIMESTAMPTZ |

### `topic_entities` *(Sprint 5)*
| Columna | Tipo |
|---|---|
| topic_id | UUID FK → topics.id |
| entity_id | UUID FK → knowledge_entities.id |
| prominence_score | DECIMAL(3,2) DEFAULT 1.0 |
| added_at | TIMESTAMPTZ |

### `topic_events` *(Sprint 5)*
| Columna | Tipo |
|---|---|
| topic_id | UUID FK → topics.id |
| event_id | UUID FK → knowledge_events.id |
| added_at | TIMESTAMPTZ |

---

---

## Tablas post-Sprint 5 *(Sprints 5.3–6.3)*

### `tracked_sources` — columnas agregadas
| Columna | Tipo | Default |
|---|---|---|
| verification_status | VARCHAR(20) | `'pending'` — pending\|verified\|failed\|approved |
| verified_at | TIMESTAMPTZ | — |
| verified_by | INTEGER FK → users.id | — |
| trust_score | FLOAT | `5.0` |
| last_verification_notes | TEXT | — |
| last_format_detected | VARCHAR(30) | — — rss\|atom\|news-sitemap\|sitemap-index\|urlset |

### `source_verifications` *(Sprint 5.x)*
Historial de verificaciones de fuentes RSS.
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| source_id | UUID FK → tracked_sources | — |
| status | VARCHAR(20) | — |
| checked_by | INTEGER FK → users.id | — |
| notes | TEXT | — |
| http_status | INTEGER | — |
| response_ms | INTEGER | — |
| created_at | TIMESTAMPTZ | now() |

### `monitored_articles` — columnas agregadas *(Sprint 5.8)*
| Columna | Tipo | Default |
|---|---|---|
| content_text | TEXT | — — texto completo del artículo |
| content_words | INTEGER | — — word count de content_text |
| extraction_method | VARCHAR(20) | — — fetch\|playwright\|paywall\|rss_only\|NULL(pending) |
| extracted_at | TIMESTAMPTZ | — |

### `trend_clusters` *(Sprint 5.3)*
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| entity_id | UUID FK → knowledge_entities | — |
| status | VARCHAR(20) | `'active'` — active\|summarizing\|ready\|stale |
| headline | TEXT | — |
| summary | TEXT | — |
| editorial_angles | JSONB | `'[]'` |
| article_count | INTEGER | 0 |
| source_count | INTEGER | 0 |
| last_seen | TIMESTAMPTZ | now() |
| created_at / updated_at | TIMESTAMPTZ | — |

### `trend_cluster_articles` *(Sprint 5.3)*
| Columna | Tipo |
|---|---|
| trend_id | UUID FK → trend_clusters |
| article_id | UUID FK → monitored_articles |
UNIQUE(trend_id, article_id)

### `story_clusters` *(Sprint 5.5)*
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| title | TEXT | — |
| slug | TEXT UNIQUE | — |
| story_type | VARCHAR(50) | — — news\|breaking_news\|event\|politics\|etc |
| summary | TEXT | — |
| editorial_opportunities | JSONB | `'[]'` |
| keywords | JSONB | `'[]'` |
| importance_score | INTEGER | 0 |
| coverage_status | VARCHAR(30) | — — monitoring\|growing\|breaking\|cooling\|archived |
| status | VARCHAR(30) | `'active'` — active\|summarizing\|ready\|stale\|followed |
| source_count | INTEGER | 0 |
| article_count | INTEGER | 0 |
| is_recurring | BOOLEAN | false |
| first_seen / last_seen | TIMESTAMPTZ | — |
| story_quality | VARCHAR(10) | `'fair'` — poor\|fair\|good\|excellent ← story_context_score con caps duros *(Sprint 6.2, redefinido en 6.4)* |
| avg_relevance | FLOAT | — — AVG(relevance_score) de artículos *(Sprint 6.2)* |
| story_context_score | INTEGER | 0 — 0-100: suma de 4 componentes *(Sprint 6.2, calculado por CTE en 6.4)* |
| context_relevance_score | INTEGER | 0 — 0-35: avg_relevance × 35 *(Sprint 6.4)* |
| context_depth_score | INTEGER | 0 — 0-25: total_words/5000 × 25 *(Sprint 6.4)* |
| context_diversity_score | INTEGER | 0 — 0-15: sources/5 × 15 *(Sprint 6.4)* |
| context_coverage_score | INTEGER | 0 — 0-25: enriched_fraction × 25 *(Sprint 6.4)* |
| story_confidence | VARCHAR(10) | `'low'` — low\|medium\|high ← source_count (1=low, 2-3=medium, 4+=high) *(Sprint 6.4)* |

### `story_cluster_articles` *(Sprint 5.5)*
| Columna | Tipo | Default |
|---|---|---|
| story_id | UUID FK → story_clusters | — |
| article_id | UUID FK → monitored_articles | — |
| relevance_score | FLOAT | 1.0 — Jaccard similarity (0.20–1.0) |
| linked_at | TIMESTAMPTZ | — |
| matching_reason | TEXT | — — 'story_seed'\|'keyword_jaccard'\|'legacy' *(Sprint 6.3)* |
| shared_keywords | JSONB | `'[]'` — keywords que causaron el match *(Sprint 6.3)* |
| shared_entities | JSONB | `'[]'` — entidades compartidas *(Sprint 6.3)* |
| keyword_similarity | NUMERIC | — — score Jaccard de keywords *(Sprint 6.3)* |
| title_similarity | NUMERIC | — — mismo que keyword_similarity para story matches *(Sprint 6.3)* |
| entity_similarity | NUMERIC | — — para uso futuro *(Sprint 6.3)* |
UNIQUE(story_id, article_id)

### `story_entities` *(Sprint 5.5)*
| Columna | Tipo |
|---|---|
| story_id | UUID FK → story_clusters |
| entity_id | UUID FK → knowledge_entities |
| role | VARCHAR(50) |
UNIQUE(story_id, entity_id)

### `story_opportunities` *(Sprint 5.6.1)*
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| story_cluster_id | UUID FK → story_clusters | — |
| title | TEXT NOT NULL | — |
| description | TEXT | — |
| opportunity_type | VARCHAR(20) | — — NEWS\|SEO\|ANALYSIS\|EXPLAINER\|SOCIAL\|FACT_CHECK\|LIVE_COVERAGE\|OPINION |
| traffic_score | INTEGER | — — 0-100 |
| seo_score | INTEGER | — — 0-100 |
| urgency_score | INTEGER | — — 0-100 |
| editorial_score | INTEGER | — — 0-100 |
| composite_score | FLOAT | — — editorial×0.4 + traffic×0.3 + seo×0.2 + urgency×0.1 |
| status | VARCHAR(20) | `'pending'` — pending\|in_progress\|done\|dismissed |
| created_at / updated_at | TIMESTAMPTZ | — |

### `event_clusters` *(Sprint 5.6)*
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| headline | TEXT | — |
| summary | TEXT | — |
| event_type | VARCHAR(50) | `'general'` |
| importance_score | INTEGER | 5 |
| editorial_score | INTEGER | 0 — calcEditorialScore formula |
| coverage_status | VARCHAR(30) | `'monitoring'` |
| status | VARCHAR(30) | `'active'` — active\|summarizing\|followed\|stale |
| story_count / article_count / source_count | INTEGER | 0 |
| main_entities | JSONB | `'[]'` |
| timeline | JSONB | `'[]'` |
| first_detected_at / last_updated_at / updated_at | TIMESTAMPTZ | — |

### `event_cluster_stories` *(Sprint 5.6)*
| Columna | Tipo |
|---|---|
| event_id | UUID FK → event_clusters |
| story_id | UUID FK → story_clusters |
| linked_at | TIMESTAMPTZ |
UNIQUE(event_id, story_id)

### `editorial_opportunities` *(Sprint 5.6 — eventos)*
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| event_id | UUID FK → event_clusters | — |
| type | VARCHAR(50) | — — noticia\|analisis\|reportaje\|etc |
| title | TEXT | — |
| reason | TEXT | — |
| seo_value / traffic_potential | FLOAT | — |
| difficulty | VARCHAR(20) | — |
| status | VARCHAR(20) | `'pending'` — pending\|in_progress\|done\|dismissed |
| created_at | TIMESTAMPTZ | — |

### `research_topics` — columnas agregadas *(Sprint 5.7)*
| Columna | Tipo |
|---|---|
| source_type | VARCHAR(20) | — story\|event\|opportunity\|manual |
| source_id | UUID | — ID del objeto origen |
| source_title | TEXT | — |
| source_score | INTEGER | — importance/editorial score del origen |

### `ai_generation_logs` *(Sprint 6.2)*
Trazabilidad de exactamente qué contexto recibió Claude en cada llamada.
| Columna | Tipo | Default |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| story_id | UUID FK → story_clusters (nullable) | — |
| event_id | UUID FK → event_clusters (nullable) | — |
| generation_type | VARCHAR(50) NOT NULL | — — story_summary\|opportunities\|event_summary\|story_dossier\|event_dossier\|opportunity_dossier |
| article_count | INTEGER | 0 |
| article_titles | JSONB | `'[]'` |
| total_words_sent | INTEGER | 0 |
| created_at | TIMESTAMPTZ | now() |

**Índices:** ai_gen_logs_story_idx, ai_gen_logs_event_idx, ai_gen_logs_created_idx

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
| `scripts/migrate_editorial_workflow.js` | Sprint 4: `editorial_dossiers` + columnas `origin`/`dossier_id` en `articles` |
| `scripts/migrate_topic_intelligence.js` | Sprint 5: `topics`, `topic_articles`, `topic_research`, `topic_entities`, `topic_events` + columnas `coverage_scope`/`region` en `articles` |
| `scripts/migrate_story_clusters.js` | Sprint 5.5: `story_clusters`, `story_cluster_articles`, `story_entities` |
| `scripts/migrate_source_verification.js` | Sprint 5.x: `source_verifications`, columnas de verificación en `tracked_sources` |
| `scripts/migrate_article_content.js` | Sprint 5.8: `content_text`, `content_words`, `extraction_method`, `extracted_at` en `monitored_articles` |
| `scripts/migrate_event_clusters.js` | Sprint 5.6: `event_clusters`, `event_cluster_stories`, `editorial_opportunities` |
| `scripts/migrate_story_opportunities.js` | Sprint 5.6.1: `story_opportunities` |
| `scripts/migrate_dossier_traceability.js` | Sprint 5.7: columnas `source_type/id/title/score` en `research_topics` |
| `scripts/migrate_clustering_quality.js` | Sprint 6.2: `story_quality`, `avg_relevance`, `story_context_score`, `ai_generation_logs` |
| `scripts/migrate_story_traceability.js` | Sprint 6.3: trazabilidad en `story_cluster_articles`, fix `story_context_score`, stale huérfanas |
| `scripts/migrate_editorial_scoring.js` | Sprint 6.4: 4 componentes + `story_confidence`, nueva fórmula de `story_quality` con caps duros |

## Estado de Índices
> Pendiente de documentar. Ejecutar: `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename`
