-- Script para crear datos de prueba del sistema de publicidad

-- 1. Crear anunciante de prueba
INSERT INTO advertisers (id, name, contact_email, created_at)
VALUES 
    (gen_random_uuid(), 'Nike Argentina', 'marketing@nike.com.ar', NOW()),
    (gen_random_uuid(), 'Coca-Cola', 'ads@cocacola.com', NOW()),
    (gen_random_uuid(), 'Samsung', 'publicidad@samsung.com', NOW())
ON CONFLICT DO NOTHING;

-- 2. Crear campañas de ejemplo para diferentes posiciones

-- Campaña 1: Banner deportivo (targeting: deportes)
INSERT INTO campaigns (
    id, 
    advertiser_id, 
    name, 
    status, 
    start_date, 
    end_date, 
    banner_url, 
    target_url, 
    position, 
    tags,
    created_at
)
SELECT 
    gen_random_uuid(),
    a.id,
    'Zapatillas Running 2026',
    'active',
    NOW(),
    NOW() + INTERVAL '90 days',
    'https://via.placeholder.com/300x250.png?text=Nike+Running+2026',
    'https://nike.com/running',
    'article_sidebar_top',
    ARRAY['deportes', 'running', 'fitness'],
    NOW()
FROM advertisers a
WHERE a.name = 'Nike Argentina'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Campaña 2: Banner general (sin targeting)
INSERT INTO campaigns (
    id, 
    advertiser_id, 
    name, 
    status, 
    start_date, 
    banner_url, 
    target_url, 
    position, 
    tags,
    created_at
)
SELECT 
    gen_random_uuid(),
    a.id,
    'Coca-Cola Verano',
    'active',
    NOW(),
    'https://via.placeholder.com/728x90.png?text=Coca-Cola+Verano+2026',
    'https://cocacola.com',
    'article_top_banner',
    ARRAY[]::text[], -- Sin tags = general
    NOW()
FROM advertisers a
WHERE a.name = 'Coca-Cola'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Campaña 3: Sticky Ad (targeting: tecnología)
INSERT INTO campaigns (
    id, 
    advertiser_id, 
    name, 
    status, 
    start_date, 
    banner_url, 
    target_url, 
    position, 
    tags,
    created_at
)
SELECT 
    gen_random_uuid(),
    a.id,
    'Samsung Galaxy S26',
    'active',
    NOW(),
    'https://via.placeholder.com/157x601.png?text=Galaxy+S26',
    'https://samsung.com/galaxy',
    'article_sticky',
    ARRAY['tecnología', 'gadgets', 'móviles'],
    NOW()
FROM advertisers a
WHERE a.name = 'Samsung'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Campaña 4: Sidebar Bottom (targeting: política)
INSERT INTO campaigns (
    id, 
    advertiser_id, 
    name, 
    status, 
    start_date, 
    banner_url, 
    target_url, 
    position, 
    tags,
    created_at
)
SELECT 
    gen_random_uuid(),
    a.id,
    'Nike Lifestyle',
    'active',
    NOW(),
    'https://via.placeholder.com/300x250.png?text=Nike+Lifestyle',
    'https://nike.com/lifestyle',
    'article_sidebar_bottom_1',
    ARRAY['moda', 'lifestyle'],
    NOW()
FROM advertisers a
WHERE a.name = 'Nike Argentina'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Verificar que se crearon correctamente
SELECT 
    c.name as campaign_name,
    a.name as advertiser_name,
    c.position,
    c.tags,
    c.status
FROM campaigns c
JOIN advertisers a ON c.advertiser_id = a.id
ORDER BY c.created_at DESC;
