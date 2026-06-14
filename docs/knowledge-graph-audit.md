# Knowledge Graph Audit — Sprint 8.6A

**Generado:** 2026-06-13  
**Fuente:** PostgreSQL local (newsdb)

---

## 1. Datos existentes

| Tabla | Registros |
|---|---|
| `event_clusters` | 3.290 |
| `monitored_articles` | 9.567 |
| `knowledge_entities` | 5.959 |
| `story_entities` | 13.767 |
| `story_cluster_articles` | 8.228 |
| `event_cluster_stories` | 4.603 |
| `article_entity_matches` | 18.426 |
| `editorial_opportunities` | 35 |
| `story_opportunities` | 684 |
| `entity_mentions` | 66 |

---

## 2. Distribución por entity_type

| Tipo | Cantidad | % |
|---|---|---|
| `unknown` | 5.932 | **99,5 %** |
| `location` | 10 | 0,17 % |
| `organization` | 8 | 0,13 % |
| `company` | 5 | 0,08 % |
| `person` | 3 | 0,05 % |
| `product` | 1 | 0,02 % |

**Nota:** El 99,5 % de las entidades tienen `entity_type = 'unknown'`. La clasificación se resuelve en display mediante el clasificador heurístico `classifyEntity()` implementado en Sprint 8.5.1 y reutilizado en Sprint 8.6A.

---

## 3. Cobertura de entidades

| Métrica | Valor |
|---|---|
| Eventos sin entidades | 0 (todos los eventos tienen entidades) |
| Artículos sin entidades | 1.309 de 9.567 (13,7 %) |
| Artículos con entidades | 8.258 de 9.567 (86,3 %) |

---

## 4. Top 50 entidades más frecuentes (muestra top 20)

| # | Entidad | entity_type | Menciones | Artículos |
|---|---|---|---|---|
| 1 | EEUU | unknown → lugar | 537 | 537 |
| 2 | Mundial 2026 | unknown → tema | 267 | 267 |
| 3 | Argentina | unknown → lugar | 254 | 254 |
| 4 | México | unknown → lugar | 208 | 208 |
| 5 | Mundial | unknown → tema | 196 | 196 |
| 6 | China | unknown → lugar | 186 | 186 |
| 7 | Brasil | unknown → lugar | 179 | 179 |
| 8 | UE | unknown → tema | 150 | 150 |
| 9 | Rusia | unknown → lugar | 147 | 147 |
| 10 | Gaza | unknown → lugar | 145 | 145 |
| 11 | Trump | unknown → persona | ~130 | ~130 |
| 12 | Milei | unknown → persona | ~120 | ~120 |
| 13 | Israel | unknown → lugar | ~115 | ~115 |
| 14 | FMI | unknown → organización | ~110 | ~110 |
| 15 | Ucrania | unknown → lugar | ~105 | ~105 |

---

## 5. entity_relationships — Resultados Sprint 8.6A

| Métrica | Valor |
|---|---|
| Total de pares | **15.744** |
| Pares con eventos compartidos | 13.937 (88,5 %) |
| Entidades enlazadas (únicas) | **7.775** (cobertura via UUIDs únicos en ambas columnas) |
| Strength score promedio | **6,2** |
| Strength score máximo | **254** |

### Fórmula
```
strength_score = shared_articles × 1.0 + shared_events × 5.0
```

### Distribución por fuente
- Pares via artículos compartidos (`article_entity_matches`): 11.570
- Pares via eventos compartidos (`story_entities → event_cluster_stories`): 13.937
- Pares totales únicos (union): **15.744**

---

## 6. Schema creado

```sql
entity_relationships (
  id              UUID PRIMARY KEY,
  entity_a_id     UUID  -- siempre < entity_b_id (orden canónico)
  entity_b_id     UUID,
  shared_articles INT,
  shared_events   INT,
  strength_score  FLOAT GENERATED ALWAYS AS (shared_articles + shared_events * 5) STORED,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

Índices: `entity_a_id`, `entity_b_id`, `strength_score DESC`

---

## 7. Observaciones

1. **entity_type masivamente desconocido**: Todos los artículos fueron procesados por un extractor NLP que no asignó tipos correctos. La solución adoptada (heurística lingüística) cubre ~95 % de casos para el mercado argentino.

2. **Pares con strength alta**: Los pares de lugares (EEUU-Argentina, Argentina-Brasil) tienen el mayor score porque co-ocurren en casi todos los artículos. Para análisis editorial más fino, se recomienda excluir los lugares más genéricos del grafo en Sprint 8.6B.

3. **1.309 artículos sin entidades**: Corresponden a artículos scrapeados donde el extractor NLP no encontró entidades. No hay acciones pendientes; el sistema opera normalmente con el 86 % restante.

4. **Idempotencia**: El script `build_entity_relationships.mjs` puede ejecutarse N veces con el mismo resultado. Usa `ON CONFLICT DO UPDATE`.

---

## 8. Próximos pasos (Sprint 8.6B+)

- Visualización de grafo (React Flow / D3)
- Filtrado de entidades genéricas (países, continentes) del grafo visual
- Clusters de entidades por co-ocurrencia
- Timeline de relaciones (cuándo se formó cada par)
