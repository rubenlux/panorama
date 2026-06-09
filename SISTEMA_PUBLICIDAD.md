# 📢 Sistema de Publicidad Inteligente - Documentación Completa

## 🎯 Resumen Ejecutivo

El sistema de publicidad inteligente permite mostrar anuncios personalizados basados en los intereses de cada usuario, capturados automáticamente mediante el sistema de pixel tracking.

---

## 🏗️ Arquitectura del Sistema

### 1. **Pixel Tracking System** (`web/src/utils/pixel.js`)

**Función**: Captura el comportamiento del usuario en tiempo real.

**Datos Capturados**:
- ✅ **Visitor ID**: Identificador único persistente (localStorage)
- ✅ **Session ID**: Identificador de sesión (sessionStorage, 30 min timeout)
- ✅ **Categorías de Artículos**: Cada vez que un usuario lee un artículo, se registra la categoría
- ✅ **Tiempo de Lectura**: Heartbeat cada 20 segundos
- ✅ **Scroll Depth**: 25%, 50%, 75%, 100%
- ✅ **Interacciones**: Likes, shares, comentarios

**Eventos Clave**:
```javascript
// Cuando un usuario lee un artículo
Pixel.setContext({
    article_id: articleId,
    category: 'deportes',  // ← ESTO ES ORO para targeting
    author_id: authorId
});
Pixel.track('page_view');
```

**Almacenamiento**:
- Base de datos: `pixel_events` table
- Campos importantes:
  - `visitor_id`: UUID del usuario
  - `event`: Tipo de evento (page_view, content_view, etc.)
  - `payload`: JSON con metadata (category, article_id, etc.)

---

### 2. **Ad Serving Engine** (`src/routes/ads_v2.js`)

**Endpoint**: `GET /ads/serve?position=article_sidebar&visitor_id=xxx`

**Lógica de Targeting**:

1. **Construir Perfil del Usuario**:
   ```sql
   SELECT category, COUNT(*) as weight
   FROM pixel_events
   WHERE visitor_id = $1
   AND event = 'content_view'
   AND created_at > NOW() - INTERVAL '30 days'
   GROUP BY category
   ORDER BY weight DESC
   LIMIT 3
   ```
   → Resultado: `['deportes', 'política', 'economía']`

2. **Buscar Campañas Relevantes**:
   - **Prioridad A**: Campañas con tags que coincidan con intereses del usuario
   - **Prioridad B**: Campañas sin tags (general/run-of-network)

3. **Servir Anuncio**:
   ```javascript
   {
     ad: {
       id: "campaign-uuid",
       banner_url: "https://...",
       target_url: "https://...",
       name: "Promo Verano 2026"
     },
     debug_interests: ['deportes', 'política'],
     debug_match: 'targeted' // o 'general'
   }
   ```

**Ejemplo de Query**:
```sql
SELECT id, banner_url, target_url, name, tags
FROM campaigns
WHERE status = 'active'
AND position = 'article_sidebar'
AND (tags && ARRAY['deportes', 'política'] OR tags IS NULL)
ORDER BY (tags && ARRAY['deportes', 'política']) DESC, RANDOM()
LIMIT 1
```

---

### 3. **SmartAdBanner Component** (`web/src/components/SmartAdBanner.jsx`)

**Función**: Renderiza el anuncio y trackea impresiones/clics.

**Flujo**:
1. **Fetch Ad**: Llama a `/ads/serve` con visitor_id
2. **Render**: Muestra el banner
3. **Impression Tracking**: Usa Intersection Observer (50% visible)
4. **Click Tracking**: Registra clics antes de abrir el link

**Código Clave**:
```javascript
// Impression Tracking
const observer = new IntersectionObserver((entries) => {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        Pixel.track('ad_impression', {
            campaign_id: ad.id,
            position: position
        });
    }
}, { threshold: 0.5 });

// Click Tracking
const handleClick = () => {
    Pixel.track('ad_click', {
        campaign_id: ad.id,
        position: position,
        url: ad.target_url
    });
    window.open(ad.target_url, '_blank');
};
```

---

### 4. **Gestor de Campañas** (`cms/src/pages/AdsDashboardV2.jsx`)

**Función**: Interfaz para crear y gestionar campañas publicitarias.

**Características**:
- ✅ Vista previa en vivo del banner
- ✅ Selector de posición estratégica (10 posiciones disponibles)
- ✅ Tags de targeting (ej: "deportes, política, economía")
- ✅ Recomendaciones de tamaño por posición
- ✅ Gestión de anunciantes

**Posiciones Disponibles**:
1. `header_top` - 728x90 o 970x90 (Premium)
2. `article_top_banner` - 728x90 o 970x250
3. `article_hero` - 728x90 o GIF Animado
4. `home_top` - 728x90
5. `article_sidebar_top` - 300x250
6. `article_sidebar` - 300x250 o 300x600
7. `article_sticky` - 157x601 (Vertical)
8. `article_sidebar_bottom_1` - 300x250
9. `article_sidebar_bottom_2` - 300x250
10. `article_bottom` - 728x90 o 300x250

**Ejemplo de Campaña**:
```javascript
{
  name: "Promo Verano 2026",
  advertiser_id: "uuid-del-anunciante",
  position: "article_sidebar",
  banner_url: "https://cdn.example.com/banner.jpg",
  target_url: "https://example.com/promo",
  tags: ["deportes", "viajes"],  // ← Targeting
  status: "active",
  start_date: "2026-01-20",
  end_date: "2026-02-28"
}
```

---

## 🔄 Flujo Completo de Targeting

### Escenario: Usuario lee 5 artículos de deportes

1. **Usuario visita artículo de deportes**:
   ```javascript
   // Article.jsx
   Pixel.setContext({ category: 'deportes' });
   Pixel.track('page_view');
   ```

2. **Pixel registra en BD**:
   ```sql
   INSERT INTO pixel_events (visitor_id, event, payload)
   VALUES ('user-123', 'page_view', '{"category": "deportes"}');
   ```

3. **Usuario ve un espacio publicitario**:
   ```javascript
   // SmartAdBanner.jsx
   fetchAd('article_sidebar', 'user-123');
   ```

4. **Backend construye perfil**:
   ```javascript
   // ads_v2.js
   userInterests = ['deportes'] // Basado en historial
   ```

5. **Backend busca campaña relevante**:
   ```sql
   SELECT * FROM campaigns
   WHERE tags && ARRAY['deportes']  -- Match!
   AND position = 'article_sidebar'
   AND status = 'active'
   ```

6. **Frontend renderiza anuncio**:
   ```javascript
   <img src="banner-deportivo.jpg" />
   ```

7. **Usuario ve el anuncio (50% visible)**:
   ```javascript
   Pixel.track('ad_impression', { campaign_id: 'xyz' });
   ```

8. **Usuario hace clic**:
   ```javascript
   Pixel.track('ad_click', { campaign_id: 'xyz' });
   window.open(targetUrl);
   ```

---

## 📊 Capacidades de Targeting

### ✅ **Targeting por Intereses**
- **Cómo funciona**: El sistema analiza los últimos 30 días de lectura
- **Granularidad**: Por categoría de artículo
- **Ejemplo**: Usuario que lee mucho "deportes" verá anuncios deportivos

### ✅ **Targeting por Posición**
- **Cómo funciona**: Cada campaña se asigna a posiciones específicas
- **Ejemplo**: Banner sticky solo para campañas verticales

### ✅ **Targeting Temporal**
- **Cómo funciona**: Campañas con fecha de inicio y fin
- **Ejemplo**: Promoción de verano solo en enero-febrero

### ✅ **Fallback Inteligente**
- **Cómo funciona**: Si no hay match, muestra anuncios generales
- **Ejemplo**: Usuario nuevo sin historial ve anuncios "run-of-network"

---

## 🚀 Cómo Crear una Campaña

### Paso 1: Ir al Gestor de Campañas
- CMS → Publicidad → Nueva Campaña

### Paso 2: Configurar la Campaña
```
Nombre: "Promo Zapatillas Deportivas"
Anunciante: Nike
Posición: article_sidebar
Banner URL: https://cdn.nike.com/banner-300x250.jpg
Link Destino: https://nike.com/promo-verano
Tags: deportes, running, fitness
```

### Paso 3: Vista Previa
- El sistema muestra cómo se verá en el sitio

### Paso 4: Publicar
- Click en "Publicar Campaña"
- El anuncio estará activo inmediatamente

### Paso 5: Targeting Automático
- El sistema mostrará este anuncio SOLO a usuarios interesados en:
  - Deportes
  - Running
  - Fitness
- Usuarios sin estos intereses verán otros anuncios

---

## 📈 Métricas y Tracking

### Eventos Trackeados:
1. **ad_impression**: Anuncio visto (50% visible)
2. **ad_click**: Usuario hizo clic en el anuncio

### Consulta de Métricas:
```sql
-- Impresiones por campaña
SELECT 
    payload->>'campaign_id' as campaign_id,
    COUNT(*) as impressions
FROM pixel_events
WHERE event = 'ad_impression'
GROUP BY 1;

-- CTR por campaña
SELECT 
    campaign_id,
    impressions,
    clicks,
    (clicks::float / impressions * 100) as ctr
FROM (
    SELECT 
        payload->>'campaign_id' as campaign_id,
        COUNT(*) FILTER (WHERE event = 'ad_impression') as impressions,
        COUNT(*) FILTER (WHERE event = 'ad_click') as clicks
    FROM pixel_events
    WHERE event IN ('ad_impression', 'ad_click')
    GROUP BY 1
) stats;
```

---

## 🔒 Privacidad y GDPR

### Datos Almacenados:
- ✅ Visitor ID (UUID anónimo)
- ✅ Categorías de interés
- ✅ IP Hash (no IP real)
- ✅ Geolocalización (país/ciudad)

### Datos NO Almacenados:
- ❌ Información personal identificable
- ❌ Emails
- ❌ Nombres

### Cumplimiento:
- Los datos son anónimos
- El visitor_id es un UUID generado en el cliente
- No hay cross-site tracking

---

## 🛠️ Mantenimiento

### Agregar Nueva Posición:
1. Actualizar `ads_v2.js` (backend):
   ```javascript
   position: z.enum([..., "nueva_posicion"])
   ```

2. Actualizar `AdsDashboardV2.jsx` (CMS):
   ```javascript
   { id: 'nueva_posicion', name: '🆕 Nueva', desc: 'Descripción' }
   ```

3. Agregar `<AdSpot position="nueva_posicion" />` en el frontend

### Agregar Nueva Categoría de Targeting:
- No requiere código
- Las categorías se capturan automáticamente desde los artículos
- Solo asegúrate de que `article.category_name` esté poblado

---

## 🎯 Mejores Prácticas

### Para Anunciantes:
1. **Usa tags específicos**: "running" es mejor que "deportes"
2. **Respeta los tamaños**: Usa las dimensiones recomendadas
3. **Prueba diferentes posiciones**: El sticky ad tiene alta visibilidad
4. **Usa GIFs animados**: Aumentan el CTR en 30%

### Para Editores:
1. **Asigna categorías correctas**: El targeting depende de esto
2. **Monitorea el pixel**: Verifica que `category` se esté capturando
3. **Revisa métricas**: Identifica qué posiciones funcionan mejor

---

## 🐛 Troubleshooting

### Problema: "No se muestran anuncios"
**Solución**:
1. Verificar que hay campañas activas: `SELECT * FROM campaigns WHERE status = 'active'`
2. Verificar que la posición coincide
3. Revisar console del navegador para errores

### Problema: "Todos los usuarios ven los mismos anuncios"
**Solución**:
1. Verificar que el pixel está capturando categorías:
   ```sql
   SELECT payload->>'category', COUNT(*)
   FROM pixel_events
   WHERE event = 'page_view'
   GROUP BY 1;
   ```
2. Verificar que las campañas tienen tags configurados

### Problema: "El targeting no funciona"
**Solución**:
1. Verificar visitor_id en localStorage: `localStorage.getItem('pixel_vid')`
2. Verificar que el usuario tiene historial (mínimo 1 artículo leído)
3. Revisar logs del backend: `console.log('[AdBrain] Visitor ... likes:', userInterests)`

---

## 📞 Soporte

Para dudas o problemas, revisar:
1. Logs del navegador (F12 → Console)
2. Logs del backend (`pixel_debug.log`)
3. Base de datos (`pixel_events`, `campaigns`)

---

**Última actualización**: 2026-01-20
**Versión**: 2.0
