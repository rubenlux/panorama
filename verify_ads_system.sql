-- Script de Verificación del Sistema de Publicidad Inteligente

-- ========================================
-- 1. VERIFICAR ESTRUCTURA DE TABLAS
-- ========================================

-- Verificar tabla de anunciantes
SELECT 'advertisers' as tabla, COUNT(*) as registros FROM advertisers;

-- Verificar tabla de campañas
SELECT 'campaigns' as tabla, COUNT(*) as registros FROM campaigns;

-- Verificar tabla de eventos de pixel
SELECT 'pixel_events' as tabla, COUNT(*) as registros FROM pixel_events;

-- ========================================
-- 2. VERIFICAR CAMPAÑAS ACTIVAS
-- ========================================

SELECT 
    c.name as "Campaña",
    a.name as "Anunciante",
    c.position as "Posición",
    c.tags as "Tags (Targeting)",
    c.status as "Estado",
    c.start_date as "Inicio",
    c.end_date as "Fin"
FROM campaigns c
JOIN advertisers a ON c.advertiser_id = a.id
WHERE c.status = 'active'
ORDER BY c.created_at DESC;

-- ========================================
-- 3. VERIFICAR TRACKING DE CATEGORÍAS
-- ========================================

-- Ver categorías capturadas en los últimos 7 días
SELECT 
    payload->>'category' as "Categoría",
    COUNT(*) as "Vistas",
    COUNT(DISTINCT visitor_id) as "Usuarios Únicos"
FROM pixel_events
WHERE event = 'content_view'
AND created_at > NOW() - INTERVAL '7 days'
AND payload->>'category' IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

-- ========================================
-- 4. VERIFICAR PERFILES DE USUARIOS
-- ========================================

-- Top 10 usuarios más activos y sus intereses
SELECT 
    visitor_id as "Usuario (ID)",
    array_agg(DISTINCT payload->>'category') as "Intereses",
    COUNT(*) as "Artículos Leídos"
FROM pixel_events
WHERE event = 'content_view'
AND created_at > NOW() - INTERVAL '30 days'
AND payload->>'category' IS NOT NULL
GROUP BY 1
ORDER BY 3 DESC
LIMIT 10;

-- ========================================
-- 5. VERIFICAR IMPRESIONES DE ANUNCIOS
-- ========================================

-- Impresiones por campaña (últimos 7 días)
SELECT 
    payload->>'campaign_id' as "Campaign ID",
    COUNT(*) as "Impresiones",
    COUNT(DISTINCT visitor_id) as "Usuarios Únicos"
FROM pixel_events
WHERE event = 'ad_impression'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 2 DESC;

-- ========================================
-- 6. VERIFICAR CLICS EN ANUNCIOS
-- ========================================

-- Clics por campaña (últimos 7 días)
SELECT 
    payload->>'campaign_id' as "Campaign ID",
    COUNT(*) as "Clics",
    COUNT(DISTINCT visitor_id) as "Usuarios Únicos"
FROM pixel_events
WHERE event = 'ad_click'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 2 DESC;

-- ========================================
-- 7. CALCULAR CTR (Click-Through Rate)
-- ========================================

WITH stats AS (
    SELECT 
        payload->>'campaign_id' as campaign_id,
        COUNT(*) FILTER (WHERE event = 'ad_impression') as impressions,
        COUNT(*) FILTER (WHERE event = 'ad_click') as clicks
    FROM pixel_events
    WHERE event IN ('ad_impression', 'ad_click')
    AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1
)
SELECT 
    c.name as "Campaña",
    s.impressions as "Impresiones",
    s.clicks as "Clics",
    CASE 
        WHEN s.impressions > 0 
        THEN ROUND((s.clicks::numeric / s.impressions * 100), 2)
        ELSE 0 
    END as "CTR %"
FROM stats s
JOIN campaigns c ON c.id::text = s.campaign_id
ORDER BY s.impressions DESC;

-- ========================================
-- 8. VERIFICAR TARGETING (Simulación)
-- ========================================

-- Simular qué anuncios vería un usuario específico
-- Reemplaza 'VISITOR_ID_AQUI' con un visitor_id real

WITH user_interests AS (
    SELECT 
        visitor_id,
        array_agg(DISTINCT payload->>'category') as interests
    FROM pixel_events
    WHERE visitor_id = 'VISITOR_ID_AQUI'  -- ← Reemplazar con ID real
    AND event = 'content_view'
    AND created_at > NOW() - INTERVAL '30 days'
    AND payload->>'category' IS NOT NULL
    GROUP BY visitor_id
)
SELECT 
    c.name as "Campaña",
    c.position as "Posición",
    c.tags as "Tags",
    ui.interests as "Intereses del Usuario",
    CASE 
        WHEN c.tags && ui.interests THEN 'MATCH ✓'
        WHEN c.tags IS NULL OR c.tags = '{}' THEN 'GENERAL'
        ELSE 'NO MATCH'
    END as "Targeting"
FROM campaigns c
CROSS JOIN user_interests ui
WHERE c.status = 'active'
ORDER BY 
    CASE 
        WHEN c.tags && ui.interests THEN 1
        WHEN c.tags IS NULL OR c.tags = '{}' THEN 2
        ELSE 3
    END;

-- ========================================
-- 9. VERIFICAR COBERTURA DE POSICIONES
-- ========================================

-- Ver qué posiciones tienen campañas activas
SELECT 
    position as "Posición",
    COUNT(*) as "Campañas Activas",
    array_agg(name) as "Nombres"
FROM campaigns
WHERE status = 'active'
GROUP BY position
ORDER BY 2 DESC;

-- ========================================
-- 10. HEALTH CHECK GENERAL
-- ========================================

SELECT 
    'Total Anunciantes' as "Métrica",
    COUNT(*)::text as "Valor"
FROM advertisers

UNION ALL

SELECT 
    'Campañas Activas',
    COUNT(*)::text
FROM campaigns
WHERE status = 'active'

UNION ALL

SELECT 
    'Eventos de Pixel (24h)',
    COUNT(*)::text
FROM pixel_events
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Usuarios Únicos (24h)',
    COUNT(DISTINCT visitor_id)::text
FROM pixel_events
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Impresiones de Ads (24h)',
    COUNT(*)::text
FROM pixel_events
WHERE event = 'ad_impression'
AND created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Clics en Ads (24h)',
    COUNT(*)::text
FROM pixel_events
WHERE event = 'ad_click'
AND created_at > NOW() - INTERVAL '24 hours';

-- ========================================
-- NOTAS DE USO:
-- ========================================
-- 
-- 1. Ejecuta este script completo para verificar el sistema
-- 2. Para la sección 8 (Targeting), reemplaza 'VISITOR_ID_AQUI' con un ID real
-- 3. Si alguna consulta devuelve 0 resultados, verifica:
--    - Que las campañas estén activas
--    - Que el pixel esté funcionando
--    - Que haya tráfico en el sitio
-- 4. El CTR normal está entre 0.5% - 2%
-- 5. Si no hay impresiones, verifica que AdSpot esté activado
