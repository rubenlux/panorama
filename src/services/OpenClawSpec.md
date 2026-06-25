# OpenClaw V1 - Especificación Real de APIs

## Validación de Endpoints Existentes

### ✅ Endpoints Confirmados que Existen

#### Editorial Intelligence
- `GET /stories` - params: `limit, offset, hours, sort, include_all`
- `GET /stories/:id` - story detail
- `GET /stories/:id/articles` - articles in story
- `GET /trends` - params: `limit, offset`
- `GET /trends/:id` - trend detail
- `GET /events` - params: `limit, offset, hours, sort`
- `GET /events/:id` - event detail
- `GET /events/:id/stories` - stories in event
- `GET /events/:id/articles` - articles in event
- `GET /opportunities` - params: `limit, offset, status, sort`
- `GET /opportunities/summary` - summary stats

#### Knowledge Graph
- `GET /knowledge/entities` - params: `search, type, limit, offset`
- `GET /knowledge/entities/:id` - entity detail (with related events, mentions)

#### Social Intelligence
- `GET /social/clusters` - params: `limit, offset` (NO entity_id filter available)
- `GET /social/top-sources` - top sources by engagement
- `GET /social/posts/:id/transcript` - transcript data

#### Coverage
- `GET /coverage/stats` - coverage statistics
- `GET /coverage/feed` - params: `limit, offset, change_type` (NO entity_id filter)
- `GET /coverage/sources` - tracked sources

#### Articles
- `GET /articles` - params: `limit, offset, q (search)`

---

## ❌ Endpoints NOT Available (Will Need Custom Queries)

These endpoints DO NOT EXIST but will be needed:
- `GET /stories?entity_id=X` ❌
- `GET /events?entity_id=X` ❌
- `GET /articles?entity_id=X` ❌
- `GET /coverage/feed?entity_id=X` ❌
- `GET /social/clusters?entity_id=X` ❌

**Solution:** OpenClawService will query database directly for these, using:
```sql
-- Get stories with entity
SELECT DISTINCT sc.* FROM story_clusters sc
JOIN story_entities se ON se.story_id = sc.id
JOIN knowledge_entities ke ON ke.id = se.entity_id
WHERE LOWER(ke.name) ILIKE $1
LIMIT 5;

-- Get articles with entity
SELECT DISTINCT ma.* FROM monitored_articles ma
JOIN article_entity_matches aem ON aem.article_id = ma.id
JOIN knowledge_entities ke ON ke.id = aem.entity_id
WHERE LOWER(ke.name) ILIKE $1
LIMIT 5;

-- Get events with entity
SELECT DISTINCT ec.* FROM event_clusters ec
JOIN event_cluster_stories ecs ON ecs.event_id = ec.id
JOIN story_clusters sc ON sc.id = ecs.story_id
JOIN story_entities se ON se.story_id = sc.id
JOIN knowledge_entities ke ON ke.id = se.entity_id
WHERE LOWER(ke.name) ILIKE $1
LIMIT 3;
```

---

## OpenClawService Implementation Strategy

### Query Pattern
```javascript
// For each question type:
// 1. If exists as public API endpoint → use it
// 2. If needs entity filtering → use direct DB query
// 3. Apply MAX_CONTEXT_SOURCES = 5 limit
// 4. Set timeout = 3s per query
// 5. On timeout/error → return partial context, continue
```

### Context Sources (Max 5 per question)

```javascript
const contextSources = {
  stories: 2,        // Top 2 stories
  events: 1,         // Top 1 event
  articles: 1,       // Top 1 article
  socialClusters: 1  // Top 1 social cluster
  // Total: 5 sources max
};
```

### Response Structure (Before LLM)

```json
{
  "entity": "Boca",
  "context": {
    "stories": [
      {
        "id": "uuid",
        "title": "...",
        "importance_score": 85,
        "article_count": 14,
        "source_count": 8,
        "sources": ["TyC", "Olé"],
        "entities": ["Ibáñez", "Rojo"]
      }
    ],
    "events": [
      {
        "id": "uuid",
        "title": "...",
        "importance_score": 92,
        "status": "breaking"
      }
    ],
    "articles": [
      {
        "id": "uuid",
        "title": "...",
        "url": "...",
        "published_at": "2026-06-24T14:30:00Z"
      }
    ],
    "socialClusters": [
      {
        "id": "uuid",
        "title": "...",
        "total_engagement": 45000,
        "gap_score": 0.8
      }
    ]
  },
  "fetchedAt": "2026-06-24T15:00:00Z",
  "timeElapsed": 1.2
}
```

### Then LLM

```javascript
const prompt = `
Basándote en este contexto sobre ${entity}:
${JSON.stringify(context, null, 2)}

Responde la pregunta de forma natural y concisa.
`;

const answer = await claude.message({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 500,
  system: "Eres un asistente de inteligencia editorial de Panorama...",
  messages: [{ role: "user", content: prompt }]
});
```

---

## Session Memory (Minimal)

```javascript
// In-memory session state
const sessionState = {
  userId: "...",
  lastEntity: "Boca",      // For follow-up questions
  lastContext: {...},      // Full context from last query
  conversationHistory: [   // Last 5 turns max
    { question: "...", answer: "..." }
  ],
  expiresAt: Date.now() + 3600000  // 1 hour
};

// Usage:
// User: "¿Qué pasó con Boca?"
// → Store lastEntity = "Boca"
// 
// User: "¿Y en redes?"
// → Assume entity = sessionState.lastEntity ("Boca")
// → Parse as "¿Y [en redes] [con Boca]?"
```

---

## Timeout Strategy

```javascript
const TIMEOUTS = {
  singleQuery: 3000,     // 3s per API call
  totalRequest: 5000,    // 5s total for all queries
  llmResponse: 10000     // 10s for LLM
};

// Implementation:
Promise.race([
  fetchStories(entity),
  timeout(3000)
]).catch(err => {
  if (err.code === 'TIMEOUT') {
    return { stories: [], error: 'Stories unavailable' };
  }
  throw err;
});
```

---

## Phase 1 Use Cases (ACTUAL)

### 1. "¿Qué está pasando hoy?"
```
API calls:
GET /stories?limit=5&sort=score
GET /trends?limit=5
GET /events?limit=3&sort=score
GET /opportunities?limit=3&sort=score
GET /coverage/stats

DB queries: 0
Total calls: 5
Timeout: 5s
```

### 2. "¿Qué pasó con Boca?"
```
API calls:
GET /knowledge/entities?search=Boca

DB queries:
- stories with Boca (LIMIT 2)
- articles with Boca (LIMIT 1)
- events with Boca (LIMIT 1)
- social clusters with Boca (via /social/clusters, filter client-side)

Total calls: 1 API + ~4 DB queries
Timeout: 5s
Max context: 5 sources
```

### 3. "¿Qué tendencias hay?"
```
API calls:
GET /trends?limit=10
GET /trends/:id (expand top 3)

DB queries: 0
Total calls: ~4
Timeout: 5s
```

### 4. "¿Y en redes?"
```
Session memory: lastEntity = "Boca"
Rewrite to: "¿Qué pasó con Boca en redes?"

API calls:
GET /knowledge/entities?search=Boca (from memory, could skip)
GET /social/clusters?limit=50 (filter by Boca keyword client-side)

DB queries:
- social posts with Boca

Total calls: 1-2 API
Timeout: 3s (faster, cached entity)
```

---

## Phase 2+ Dependencies

### When Performance Matters
```
POST /openclaw/ask → (3-4 calls, 5s)
If used 20+ times/day → Add in-memory response cache (5-10 min TTL)

Example:
cache.get("boca:what_happened") → hit → serve directly
vs
fresh queries
```

### Telegram Integration (Phase 4)
```
Only if OpenClaw is used consistently (>10 times/day)
→ Add context cache layer
→ Add Telegram webhook
→ Add scheduled alerts
```

---

## Constraints for V1

1. ✅ No Redis
2. ✅ No dossier auto-generation
3. ✅ No publication
4. ✅ Max 5 context sources per question
5. ✅ 5s timeout for full request
6. ✅ Session memory only (in-memory, expires in 1h)
7. ✅ Structured response before LLM
8. ✅ Clear error messaging when sources unavailable

