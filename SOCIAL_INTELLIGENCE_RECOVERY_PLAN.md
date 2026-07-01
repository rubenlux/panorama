# SOCIAL INTELLIGENCE — PLAN DE RECUPERACIÓN

**Basado en:** Auditoría de ejecución (SQL queries contra BD en vivo)  
**Priorización:** Máximo ROI (recuperar 2 plataformas completas antes de pulir 1)  
**Fecha:** 2026-07-01

---

## PRIORIDAD Y JUSTIFICACIÓN

| Prioridad | Tarea | Razón | ROI |
|---|---|---|---|
| **P0** | Arreglar worker `running` bug | Contamina toda conclusión sobre otras plataformas | Alto (afecta 4 plataformas) |
| **P1** | Diagnosticar Instagram | Parado hace 11d, pero funcionó antes → probablemente recoverable | Alto (0→408 posts) |
| **P1** | Diagnosticar X | Parado hace 11d, pero funcionó antes → probablemente recoverable | Alto (0→1522 posts) |
| **P2** | Arreglar Facebook datos | Funciona pero URLs/títulos incorrectos, es degradación no regresión | Bajo (13k→mejor 13k) |

---

## P0: ARREGLAR WORKER `running` BUG

### Síntoma

```
worker_runs tabla:
- Status: running, items_found: 0, duration: 1939s+ (stuck)
- Sucede en cada ciclo
- finishRun() nunca se llama
```

### Diagnosis requerida

1. **¿Dónde quedó colgado?**
   - Agregar logging en socialMonitor.js para marcar cada paso:
     ```
     [start]
     [ensureSchema OK]
     [startRun OK]
     [facebook processing]
     [youtube processing]
     [instagram processing]
     [x processing]
     [clusterNewPosts OK]
     [finishRun]  ← ¿llega aquí?
     ```

2. **¿Por qué items_found = 0?**
   - ¿Todas las plataformas retornan []?
   - ¿O solo algunas?

3. **Ejecutar manualmente cada plataforma**
   ```bash
   node -e "
   const {getFetcher} = require('./src/jobs/socialMonitor.js');
   const source = {platform: 'facebook', ...};
   getFetcher(source).fetchLatest().then(r => console.log(r.length));
   "
   ```

### Solución esperada

- Identificar qué fetcher retorna []
- Agregar try-catch en finishRun() para que siempre ejecute

---

## P1A: DIAGNOSTICAR INSTAGRAM

### Síntoma

- Última captura: 2026-06-19 13:46:35
- 11 días sin posts nuevos
- Pero funcionó en el pasado (408 posts en BD)

### Diagnosis requerida

1. **¿Qué pasó el 2026-06-19?**
   ```bash
   git log --all --oneline --since="2026-06-18" --until="2026-06-20"
   # Ver cambios en:
   # - fetchLatest()
   # - freshness_window
   # - fetchAlgorithm
   # - Instagram selector
   ```

2. **¿Está pausado manualmente?**
   ```sql
   SELECT * FROM settings 
   WHERE key LIKE '%instagram%' OR key LIKE '%social%pause%';
   ```

3. **Ejecutar fetcher manualmente**
   ```bash
   POST /social/sources/{instagram_id}/check
   # Capturar logs, ver qué retorna
   ```

4. **¿El selector cambió?**
   - Instagram usa clases Stylex
   - Las clases cambian frecuentemente
   - Revisar si selector aún es válido

### Solución esperada

- Recuperar 408 posts/día nuevamente
- ROI: alto (plataforma completa)

---

## P1B: DIAGNOSTICAR X / TWITTER

### Síntoma

- Última captura: 2026-06-19 20:10:18
- 11 días sin posts nuevos
- Pero funcionó en el pasado (1.522 posts en BD)
- **MISMO DÍA que Instagram** (correlación)

### Diagnosis requerida

1. **¿Qué cambio en el codebase el 2026-06-19?**
   ```bash
   git log --all --oneline --since="2026-06-18" --until="2026-06-20"
   git show <commit>  # Ver cada cambio
   ```

2. **¿Es realmente 429 o es que no se ejecuta?**
   ```bash
   POST /social/sources/{x_id}/check
   # Capturar response HTTP + body
   # Si es 429: error_message debe mostrar "429"
   # Si es 0 posts: puede ser auth, puede ser pausa
   ```

3. **¿Token X expiró?**
   ```bash
   grep X_AUTH_TOKEN .env
   grep X_CT0 .env
   # Ver si están presentes
   # Verificar si fueron actualizados el 2026-06-19
   ```

4. **¿Hay pausa manual?**
   ```sql
   SELECT * FROM settings 
   WHERE key LIKE '%x%' OR key LIKE '%twitter%';
   ```

### Solución esperada

- Si es token: renovar en .env
- Si es selector: actualizar
- Si es pausa: reactivar
- ROI: 1.522 posts/día nuevamente

---

## P2: ARREGLAR FACEBOOK (después, no antes)

### Por qué es P2

- Facebook está activo (13.651 posts, último hace 30 min)
- Los datos tienen errores (URLs/títulos) pero llegan
- Es degradación, no regresión
- Instagram + X son 0 posts hace 11 días (regresión)

### Qué hay que arreglar

- URLs: 60% son solo dominio, no post-specific
- Títulos: Fragmentados con "Ver más"

### Solución esperada

- Validar data quality en Facebook
- Mejorar extractor si el impacto lo justifica
- ROI: mejorar 13k posts existentes

---

## HOJA DE RUTA EJECUTABLE

### Fase 1: Estabilización (Hoy)

**Objetivo:** Arreglar el worker bug y diagnosticar Instagram/X

```
1. Agregar logging detallado en socialMonitor.js
   - Marcar cada paso de ejecución
   - Identificar dónde se cuelga

2. Ejecutar /check manual para cada plataforma
   POST /social/sources/{id}/check
   - Facebook: ¿retorna posts?
   - YouTube: ¿retorna posts?
   - Instagram: ¿retorna posts?
   - X: ¿retorna posts o 429?

3. Revisar git log 2026-06-18 to 2026-06-20
   - ¿Qué cambió cuando Instagram/X se pararon?

4. Revisar settings table
   - ¿Hay pausas manuales?
   - ¿Hay cambios de config?
```

**Resultado esperado:**
- Identificar bug worker
- Identificar por qué Instagram/X se pararon
- Tener dirección clara para fixes

---

### Fase 2: Recuperación (Mañana)

**Objetivo:** Recuperar Instagram y X

```
1. Aplicar fixes basados en Fase 1
   - Si es token X: renovar
   - Si es selector Instagram: actualizar
   - Si es pausa: reactivar
   - Si es algo else: basarse en logs

2. Validar que ambas plataformas retornen posts
   POST /check manual

3. Arreglar worker bug (finishRun no se ejecuta)
   - Agregar try-finally
   - Garantizar que siempre se completa
```

**Resultado esperado:**
- Instagram: 400+ posts/día nuevamente
- X: 1500+ posts/día nuevamente
- Worker: siempre completa (running → success/error)

---

### Fase 3: Pulido (Después)

**Objetivo:** Si hay tiempo, mejorar Facebook

```
1. Diagnosticar URLs/títulos incorrectos
   - ¿Dónde se corrompen?
   - ¿Es selector o extración?

2. Validar 10 posts aleatorios
   - Original en Facebook
   - Vs guardado en BD
   - Mapear diferencias

3. Aplicar fix si el ROI lo justifica
```

**Resultado esperado:**
- Facebook: URLs y títulos correctos en 13k posts

---

## MÉTRICAS DE ÉXITO

### Fase 1 (Hoy)

- [ ] Worker completa siempre (status = success or error, never running)
- [ ] Logs claros muestran dónde se ejecuta cada paso
- [ ] Tenemos Git history del 2026-06-19
- [ ] Tenemos respuesta manual de /check para 4 plataformas

### Fase 2 (Mañana)

- [ ] Instagram: items_found > 0 (target: 400+)
- [ ] X: items_found > 0 (target: 1500+)
- [ ] Worker completa en < 5 min

### Fase 3 (Bonus)

- [ ] Facebook: URLs 100% correctas
- [ ] Facebook: Títulos sin "Ver más" ni fragmentos

---

## NOTAS IMPORTANTES

1. **No asumir**, diagnosticar
   - Instagram/X parados el MISMO DÍA
   - Probablemente un cambio de código causó ambos

2. **El worker bug contamina todo**
   - No podés confiar en ninguna métrica si el worker se cuelga
   - Arreglar P0 primero

3. **Recovery > Improvement**
   - Recuperar Instagram (0→408) es mejor ROI que mejorar Facebook (13k→13k mejorado)

4. **Evidencia observable**
   - SQL queries, logs manuales, respuestas HTTP
   - No especular

---

## COMANDOS ÚTILES PARA DIAGNOSIS

```bash
# Ver qué pasó el 19/6
git log --all --oneline --since="2026-06-18" --until="2026-06-20"

# Ejecutar fetcher manual (si es posible)
node -e "
  const {getFetcher} = require('./src/jobs/socialMonitor.js');
  const {query} = require('./src/routes/db.js');
  
  (async () => {
    const sources = await query('SELECT * FROM social_sources WHERE platform = $1', ['instagram']);
    for (const source of sources.rows) {
      const fetcher = getFetcher(source);
      try {
        const posts = await fetcher.fetchLatest();
        console.log(\`\${source.name}: \${posts.length} posts\`);
      } catch (e) {
        console.log(\`\${source.name}: ERROR - \${e.message}\`);
      }
    }
  })();
"

# Ver último log del worker
psql $DATABASE_URL -c "
  SELECT worker_name, status, items_found, error_message, started_at
  FROM worker_runs
  WHERE worker_name = 'social_monitor'
  ORDER BY started_at DESC LIMIT 10;
"

# Ver qué cambios afectaron social_* archivos
git log -p --since="2026-06-18" --until="2026-06-20" -- \
  src/jobs/socialMonitor.js \
  src/connectors/social/fetchers.js
```

---

**Esta hoja de ruta maximiza ROI: recuperar dos plataformas (Instagram, X) antes de pulir una (Facebook).**
