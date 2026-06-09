# TECH_DEBT.md

> Registro de problemas conocidos, refactors futuros y optimizaciones pendientes.
> Prioridad: 🔴 Crítico | 🟡 Medio | 🟢 Bajo
> Última actualización: 2026-06-09

---

## 🔴 Seguridad Crítica

### JWT en localStorage
**Ubicación:** `cms/src/api.js` — `localStorage.getItem("cms_token")`
**Problema:** Vulnerable a XSS. Cualquier script inyectado puede robar el token de admin.
**Solución:** Migrar a httpOnly cookies con `SameSite=Strict`. Requiere cambios en backend (`auth.js`) y en el cliente CMS.
**Impacto:** Afecta a todos los usuarios del CMS.

### CORS completamente abierto
**Ubicación:** `src/app.js` — `cors({ origin: true, credentials: true })`
**Problema:** Acepta peticiones de cualquier origen. En producción, cualquier sitio puede hacer peticiones a la API con credenciales.
**Solución:** Restringir a `['http://localhost:5173', 'http://localhost:5174', 'https://tudominio.com']` según entorno.

### Sin rate limiting
**Ubicación:** Todos los endpoints de la API.
**Problema:** Los endpoints de login, publicación de comentarios, suscripción y pixel son atacables por fuerza bruta / flood.
**Solución:** `express-rate-limit` con ventanas específicas por endpoint (ej: login: 5 req/min).

### SSRF en media.js
**Ubicación:** `src/routes/media.js` — endpoint Pexels upload
**Problema:** El endpoint acepta una URL arbitraria y la descarga. Un atacante podría apuntar a recursos internos (metadata de AWS, IPs privadas, etc.).
**Solución:** Validar que la URL pertenezca a dominios permitidos (pexels.com, images.pexels.com). Usar allowlist.

### Pexels API Key hardcodeada
**Ubicación:** `src/routes/media.js`
**Problema:** La API key de Pexels está en el código fuente. Si el repositorio es público, queda expuesta.
**Solución:** Mover a variable de entorno `PEXELS_API_KEY`.

---

## 🟡 Calidad de Código y Arquitectura

### Duplicación del router `/ads`
**Ubicación:** `src/app.js` — `app.use("/ads", adsRoutes)` y `app.use("/ads", adsV2Routes)`
**Problema:** Dos routers montados en el mismo prefijo. Funciona por naming diferente pero es frágil. La primera ruta que matchee gana — el orden de registro importa.
**Solución:** Separar prefijos: `/ads` (v2, actual) y `/ads/legacy` (v1). O consolidar en un único router con versionado explícito.

### DashboardEditorial.jsx sin ruta
**Ubicación:** `cms/src/pages/DashboardEditorial.jsx`
**Problema:** El archivo existe pero no está registrado en `cms/src/App.jsx`.
**Solución:** Agregar la ruta o eliminar el archivo.

### Ruta duplicada en App.jsx del CMS
**Ubicación:** `cms/src/App.jsx` — líneas con `/users/new` duplicadas
```jsx
<Route path="users/new" element={<UserEditor mode="create" />} />
<Route path="users/new" element={<UserEditor mode="create" />} />  // duplicado
```
**Solución:** Eliminar la línea duplicada.

### `admin/` directory legacy
**Ubicación:** `admin/` en la raíz del proyecto.
**Problema:** Artefacto de una versión anterior. CLAUDE.md dice "do not add new code there" pero no lo elimina.
**Solución:** Verificar que ningún proceso lo usa y eliminar.

### Scripts de debug en raíz
**Ubicación:** `check_*.js`, `debug_*.js`, `list_tables.js`, `check_schema.js`, etc. (10+ archivos)
**Problema:** Scripts de diagnóstico temporales acumulados en la raíz del proyecto.
**Solución:** Mover a `scripts/dev/` o eliminar los que ya no se usan.

---

## 🟡 Performance

### Sin índices documentados
**Problema:** La tabla `pixel_events` crece rápidamente. Sin índices en `visitor_id` y `created_at`, las queries de analytics_v2 y ads_v2 se degradan con volumen.
**Query de diagnóstico:**
```sql
SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
```
**Índices recomendados:**
```sql
CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor ON pixel_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created ON pixel_events(created_at);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id, status);
```

### Analytics v2 con queries pesadas
**Ubicación:** `src/routes/analytics_v2.js`
**Problema:** Múltiples queries de agregación en `pixel_events` sin caché. Con volumen alto, el dashboard CMS puede ser lento.
**Solución:** Agregar caché en memoria (TTL 60s) o materializar vistas para métricas que no cambian en tiempo real.

---

## 🟢 Research Center — Pendiente para escala

### Sin cola de tareas persistente
**Ubicación:** `src/routes/research.js` — `setImmediate`
**Problema:** Si el servidor corre con pm2 cluster y el worker que inicia la investigación muere, el pipeline muere. La recovery actual resuelve tópicos zombie con >10 min en `researching`, pero no relanza el pipeline.
**Solución futura:** Bull/BullMQ con Redis, o pg-boss para persistencia en PostgreSQL.

### Sin deduplicación de investigaciones
**Problema:** Mismo tema investigado N veces = N llamadas a Claude.
**Solución futura:** Hash normalizado del título, UNIQUE constraint opcional, o UI que avise duplicado.

### Feeds RSS sin cobertura de breaking news
**Problema:** RSS es pull-based. Para breaking news (<15 min), se necesita WebSockets o webhooks de newsAPI.
**Solución futura:** NewsAPI.org o GDELT como conector adicional.

### pgvector no instalado
**Problema:** Las columnas `embedding` están preparadas en el schema pero `CREATE EXTENSION vector` no está ejecutado.
**Solución:** Cuando llegue Sprint 2 (Knowledge Base), ejecutar `CREATE EXTENSION IF NOT EXISTS vector` en la DB y agregar las columnas de embedding.

---

## 🟢 Mejoras Futuras

### Sin suite de tests
**Problema:** No existe ningún test (unitario, integración, e2e).
**Impacto:** Cambios estructurales no tienen red de seguridad.
**Solución:** Agregar Vitest para el frontend, Jest + Supertest para la API. Priorizar tests de smoke en rutas críticas.

### dangerouslySetInnerHTML en Article.jsx
**Ubicación:** `web/src/pages/Article.jsx` — renderiza `article.body` con `dangerouslySetInnerHTML`
**Problema:** Si un editor malicioso inyecta HTML en el body de un artículo, puede ejecutar XSS en lectores.
**Nota:** El backend usa `sanitize-html` — verificar que se aplica al guardar artículos. Si es así, el riesgo está mitigado en origen.
**Solución:** Confirmar que `articles.js` sanitiza `body` en POST/PUT antes de almacenar.

### Backup manual
**Ubicación:** `backups/` directory, `scripts/backup_data.js`
**Problema:** El backup es manual y guarda JSON. No hay backup automatizado de la base de datos.
**Solución:** Agregar al worker un cron de `pg_dump` o usar el backup automático de Docker/cloud.

### `image` vs `image_url` en articles
**Ubicación:** Tabla `articles` tiene dos columnas: `image` (texto legacy) e `image_url` (nuevo).
**Problema:** Duplicación de campo. El frontend usa `image_url` y hace fallback.
**Solución:** Migrar datos de `image` a `image_url` y eliminar la columna vieja.
