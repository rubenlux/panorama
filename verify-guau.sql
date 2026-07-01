SELECT 
  COUNT(*) as total_guau,
  MAX(detected_at) as newest
FROM monitored_articles
WHERE source_id = (SELECT id FROM rss_sources WHERE name = 'Guau Formosa' LIMIT 1);
