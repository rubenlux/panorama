-- Correcciones de fuentes problemáticas del monitor de medios
-- Fecha: 29 de junio de 2026

-- 1. Eliminar Guau Formosa (ya hecho)
-- Problema: sitemap con fecha hardcodeada, URL rota cuando cambia la fecha

-- 2. Eliminar duplicado de Diario Ahora Litoral
-- Problema: sitemap index de WordPress sin recorrer sub-sitemaps
DELETE FROM tracked_sources
WHERE id IN (
  SELECT id FROM tracked_sources
  WHERE LOWER(name) LIKE '%diario ahora%'
  ORDER BY created_at DESC
  LIMIT 1
);

-- 3. Reemplazar ESPN por Arc Publishing URL estándar
-- Problema: rate limiting/bloqueo de IP en googlenewssitemap
UPDATE tracked_sources
SET url = 'https://www.espn.com.ar/arc/outboundfeeds/news-sitemap-index/?outputType=xml',
    updated_at = NOW()
WHERE LOWER(name) LIKE '%espn%';

-- Verificación
SELECT COUNT(*) as fuentes_restantes
FROM tracked_sources
WHERE LOWER(name) ILIKE '%guau%'
   OR LOWER(name) ILIKE '%diario ahora%'
   OR LOWER(name) ILIKE '%espn%';
