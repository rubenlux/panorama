-- Verificar campañas activas y sus posiciones
SELECT 
    c.id,
    c.name as "Nombre Campaña",
    c.position as "Posición",
    c.status as "Estado",
    c.banner_url as "Banner URL",
    c.tags as "Tags",
    a.name as "Anunciante"
FROM campaigns c
JOIN advertisers a ON c.advertiser_id = a.id
WHERE c.status = 'active'
ORDER BY c.created_at DESC;

-- Verificar si hay anuncios para las posiciones específicas
SELECT 
    position as "Posición",
    COUNT(*) as "Campañas Activas"
FROM campaigns
WHERE status = 'active'
GROUP BY position;
