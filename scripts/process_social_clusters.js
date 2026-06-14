import 'dotenv/config';
import { query } from '../src/routes/db.js';

async function run() {
  console.log('[AI Social Clustering] Analizando bases de datos en busca de publicaciones virales...');

  try {
    // 1. Obtener posts sin asignar a clusters de las últimas 72 horas
    const postsRes = await query(`
      SELECT p.id, p.title, p.keywords, p.views, p.source_id 
      FROM social_posts p
      WHERE p.id NOT IN (SELECT post_id FROM social_cluster_posts)
      AND p.captured_at >= now() - interval '72 hours'
    `);

    const unclustered = postsRes.rows;
    if (unclustered.length === 0) {
      console.log('No hay nuevos posts para agrupar.');
      process.exit(0);
    }
    
    console.log(`-> Procesando ${unclustered.length} posts huérfanos...`);

    // 2. Traer clusters activos
    const clustersRes = await query(`SELECT id, title, keywords FROM social_clusters WHERE status = 'active'`);
    const activeClusters = clustersRes.rows;

    let joined = 0;
    let created = 0;

    // Para la demostración heurística, usaremos similitud básica de palabras clave usando match de regex crudo o coincidencias exactas.
    // YouTube Playwright arroja titulos como "Patricia Bullrich cruzó a Adorni".
    for (const post of unclustered) {
      // Remover palabras muy comunes para comparar.
      const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'en', 'por', 'que', 'de', 'del', 'al', 'se', 'lo', 'con'];
      const words = post.title.toLowerCase().replace(/[^a-záéíóúñ0-9\\s]/g, '').split(' ')
        .filter(w => w.length > 4 && !stopWords.includes(w));
      
      let matchedCluster = null;

      // Buscar similitud con algún cluster activo
      for (const cluster of activeClusters) {
        if (!cluster.title) continue;
        const cWords = cluster.title.toLowerCase().split(' ').filter(w => w.length > 4);
        const intersection = words.filter(w => cWords.includes(w));
        
        if (intersection.length >= 2) {
          matchedCluster = cluster.id;
          break;
        }
      }

      if (matchedCluster) {
        await query(`INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [matchedCluster, post.id]);
        joined++;
      } else {
        // En esta fase cruda, todo post que no colisiona se convierte en un nuevo cluster "semilla".
        // La IA real consolidaría.
        const resClust = await query(`
          INSERT INTO social_clusters (title, keywords, post_count, source_count, total_engagement, engagement_score, viral_score, status)
          VALUES ($1, $2, 1, 1, $3::bigint, $3::float, $3::int, 'active')
          RETURNING id
        `, [post.title.substring(0, 100), JSON.stringify(words.slice(0, 5)), post.views]);
        
        const newId = resClust.rows[0].id;
        await query(`INSERT INTO social_cluster_posts (cluster_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [newId, post.id]);
        
        // Lo añadimos a caché local para cruzar los siguientes posts en la lista con éste.
        activeClusters.push({ id: newId, title: post.title, keywords: words.slice(0, 5) });
        created++;
      }
    }

    console.log(`-> ¡Agrupación completada! Creados: ${created} nuevos temas. Unidos a existentes: ${joined} posts.`);
    
    // Recalcular métricas de clusters activos
    console.log('-> Actualizando estadísticas de Viralidad (Viral Score)...');
    await query(`
      UPDATE social_clusters sc
      SET 
        post_count = (SELECT count(*) FROM social_cluster_posts WHERE cluster_id = sc.id),
        source_count = (
          SELECT count(DISTINCT p.source_id) FROM social_cluster_posts scp 
          JOIN social_posts p ON p.id = scp.post_id WHERE scp.cluster_id = sc.id
        ),
        total_engagement = (
          SELECT COALESCE(sum(p.views + p.likes), 0) FROM social_cluster_posts scp 
          JOIN social_posts p ON p.id = scp.post_id WHERE scp.cluster_id = sc.id
        ),
        viral_score = (
          SELECT LEAST(COALESCE(sum(p.views + p.likes) / 1000, 0) + (count(DISTINCT p.source_id) * 10), 100)
          FROM social_cluster_posts scp 
          JOIN social_posts p ON p.id = scp.post_id WHERE scp.cluster_id = sc.id
        )
      WHERE status = 'active'
    `);

    console.log('[✓] Pipeline de Inteligencia completado.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
