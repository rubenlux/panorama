# 🚀 Guía Rápida - Sistema de Publicidad Inteligente

## ⚡ Inicio Rápido (5 minutos)

### Paso 1: Crear Datos de Prueba (1 min)

```bash
# Conectar a la base de datos
psql -U postgres -d news_db

# Ejecutar script de prueba
\i test_ads_data.sql
```

**Resultado**: 3 anunciantes y 4 campañas de ejemplo creadas ✅

---

### Paso 2: Verificar que Funciona (1 min)

Abrir el navegador en tu sitio y:

1. **Abrir DevTools** (F12)
2. **Ir a Console**
3. **Navegar a un artículo**

Deberías ver:
```
[Pixel] Init: v=abc123... s=xyz789...
[Pixel] Track: content_view { category: 'deportes', ... }
```

4. **Scroll hacia abajo** hasta ver un espacio publicitario

Deberías ver:
```
🎯 Targeted Ad Served! Matched interests: deportes
👁️ Ad Impression Recorded: Zapatillas Running 2026
```

**Si ves estos logs**: ✅ ¡Sistema funcionando!

---

### Paso 3: Crear tu Primera Campaña (3 min)

1. **Ir al CMS**: `http://localhost:5174/ads`

2. **Click en "Nueva Campaña"**

3. **Completar el formulario**:
   ```
   Nombre: Mi Primera Campaña
   Anunciante: Nike Argentina (o crear nuevo)
   Posición: article_sidebar_top
   Banner URL: https://via.placeholder.com/300x250.png?text=Mi+Anuncio
   Link Destino: https://example.com
   Tags: deportes, running
   ```

4. **Ver Vista Previa** → Verificar cómo se ve

5. **Click en "Publicar Campaña"**

**Resultado**: Tu anuncio ya está en vivo ✅

---

## 🎯 Cómo Funciona el Targeting

### Ejemplo Práctico:

1. **Usuario lee 3 artículos de deportes**
   - Sistema registra: `interests = ['deportes']`

2. **Usuario visita otro artículo**
   - Sistema carga anuncios para posición `article_sidebar_top`

3. **Backend busca campañas**:
   - ✅ Campaña Nike (tags: `['deportes', 'running']`) → **MATCH**
   - ❌ Campaña Coca-Cola (tags: `[]`) → General
   - ❌ Campaña Samsung (tags: `['tecnología']`) → No match

4. **Sistema muestra**: Anuncio de Nike ✅

---

## 📊 Ver Resultados

### Opción 1: SQL (Completo)
```bash
psql -U postgres -d news_db
\i verify_ads_system.sql
```

### Opción 2: Console del Navegador (Rápido)
```javascript
// Ver tu visitor ID
localStorage.getItem('pixel_vid')

// Ver eventos recientes
// (Requiere acceso a la BD, usar pgAdmin o psql)
```

### Opción 3: Logs del Backend
```bash
# Ver logs en tiempo real
tail -f pixel_debug.log
```

---

## 🎨 Posiciones Más Usadas

| Posición | Cuándo Usar | CTR Esperado |
|----------|-------------|--------------|
| `article_sidebar_top` | Anuncios cuadrados (300x250) | 1-2% |
| `article_top_banner` | Banners horizontales (728x90) | 0.5-1% |
| `article_sticky` | Anuncios verticales (157x601) | 2-3% |
| `article_sidebar_bottom_1` | Espacio adicional | 0.5-1% |

---

## 💡 Tips para Mejores Resultados

### 1. **Usa Tags Específicos**
❌ Malo: `tags: ['general']`
✅ Bueno: `tags: ['deportes', 'running', 'maratón']`

### 2. **Respeta los Tamaños**
Cada posición tiene un tamaño recomendado. Úsalo para mejor visualización.

### 3. **Prueba Diferentes Posiciones**
El sticky ad suele tener mejor CTR por su visibilidad constante.

### 4. **Usa GIFs Animados**
Los GIFs aumentan el CTR en ~30% vs imágenes estáticas.

### 5. **Monitorea el CTR**
- **< 0.5%**: Revisar creatividad o targeting
- **0.5-2%**: Normal ✅
- **> 2%**: ¡Excelente! 🎉

---

## 🔍 Troubleshooting Rápido

### ❌ No veo anuncios
```sql
-- Verificar campañas activas
SELECT name, position, status FROM campaigns WHERE status = 'active';
```
**Solución**: Crear al menos una campaña activa

### ❌ Veo "PUBLICIDAD" en gris
**Causa**: No hay campañas para esa posición
**Solución**: Crear campaña para esa posición específica

### ❌ Todos ven los mismos anuncios
**Causa**: Campañas sin tags (general)
**Solución**: Agregar tags a las campañas

### ❌ El pixel no registra categorías
```javascript
// Verificar en console
Pixel.track('content_view', { category: 'deportes' })
```
**Solución**: Verificar que los artículos tengan `category_name`

---

## 📈 Métricas Clave

### CTR (Click-Through Rate)
```sql
-- Ver CTR por campaña
SELECT 
    c.name,
    COUNT(*) FILTER (WHERE e.event = 'ad_impression') as impressions,
    COUNT(*) FILTER (WHERE e.event = 'ad_click') as clicks,
    ROUND(COUNT(*) FILTER (WHERE e.event = 'ad_click')::numeric / 
          COUNT(*) FILTER (WHERE e.event = 'ad_impression') * 100, 2) as ctr
FROM campaigns c
LEFT JOIN pixel_events e ON e.payload->>'campaign_id' = c.id::text
WHERE e.created_at > NOW() - INTERVAL '7 days'
GROUP BY c.name;
```

### Impresiones por Posición
```sql
SELECT 
    c.position,
    COUNT(*) as impressions
FROM campaigns c
JOIN pixel_events e ON e.payload->>'campaign_id' = c.id::text
WHERE e.event = 'ad_impression'
AND e.created_at > NOW() - INTERVAL '7 days'
GROUP BY c.position
ORDER BY impressions DESC;
```

---

## 🎯 Casos de Uso

### Caso 1: Anunciante Deportivo
```javascript
{
  name: "Nike Running 2026",
  position: "article_sidebar_top",
  tags: ["deportes", "running", "fitness"],
  banner_url: "https://cdn.nike.com/300x250.jpg"
}
```
**Resultado**: Solo usuarios interesados en deportes lo verán

### Caso 2: Campaña General
```javascript
{
  name: "Coca-Cola Verano",
  position: "article_top_banner",
  tags: [],  // Sin tags = todos lo ven
  banner_url: "https://cdn.cocacola.com/728x90.jpg"
}
```
**Resultado**: Todos los usuarios lo verán

### Caso 3: Sticky Ad Premium
```javascript
{
  name: "Samsung Galaxy S26",
  position: "article_sticky",
  tags: ["tecnología", "gadgets"],
  banner_url: "https://cdn.samsung.com/157x601.jpg"
}
```
**Resultado**: Alta visibilidad, solo para tech enthusiasts

---

## 📚 Recursos

- **Documentación Completa**: `SISTEMA_PUBLICIDAD.md`
- **Resumen Ejecutivo**: `RESUMEN_PUBLICIDAD.md`
- **Script de Prueba**: `test_ads_data.sql`
- **Script de Verificación**: `verify_ads_system.sql`

---

## 🆘 Soporte

### Logs a Revisar:
1. **Console del Navegador** (F12)
2. **Backend Logs** (`pixel_debug.log`)
3. **Base de Datos** (pgAdmin o psql)

### Comandos Útiles:
```bash
# Ver eventos recientes
psql -U postgres -d news_db -c "SELECT * FROM pixel_events ORDER BY created_at DESC LIMIT 10;"

# Ver campañas activas
psql -U postgres -d news_db -c "SELECT name, position, tags FROM campaigns WHERE status = 'active';"

# Ver impresiones de hoy
psql -U postgres -d news_db -c "SELECT COUNT(*) FROM pixel_events WHERE event = 'ad_impression' AND created_at > CURRENT_DATE;"
```

---

## ✅ Checklist de Verificación

- [ ] Ejecuté `test_ads_data.sql`
- [ ] Veo logs de pixel en console
- [ ] Creé mi primera campaña
- [ ] Veo anuncios en el sitio
- [ ] Los anuncios se trackean (impresiones)
- [ ] Los clics funcionan
- [ ] El targeting funciona (usuarios diferentes ven anuncios diferentes)

**Si todos están ✅**: ¡Sistema 100% operativo! 🎉

---

**Tiempo total de setup**: ~5 minutos
**Dificultad**: Fácil ⭐
**Resultado**: Sistema de ads profesional con targeting inteligente 🚀
