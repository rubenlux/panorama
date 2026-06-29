# Fase 2A/2B/2C: Content Tools Architecture Specification

**Status**: Specification locked. Fase 2A implementation starting (MVP Nivel 1 only).

**Design principle**: Product-first, not database-first. These tools are designed for Claude to work as an editor without leaving Panorama.

**Fase 2A MVP Scope**: Implement `content.open()` Nivel 1 only. Levels 2-3 deferred until measurement-driven. Don't implement `content.explore()` or `content.compare()` yet; keep them specified for reference only.

---

## Architectural Rules (INVIOLABLE)

1. **Single Responsibility**: `content.open()` opens exactly one content. Never returns collections. Other tools exist for that.

2. **Optional Heavy Blocks**: html, images, videos, transcript, embedding can weigh 100s of KB. Use `include` parameter to control what's returned. If not specified, return only essentials.

3. **Schema Versioning**: Panorama evolves. Enhancements tomorrow, AI enrichment next week, OCR next year. Object must include `schema_version` so Claude doesn't break.

4. **Provenance Block**: Document pipeline state. When Claude says "no transcript", we know if it never existed, failed, or is still processing.

5. **Clear Block Boundaries**: Each block has one responsibility. No information duplication. No entities in editorial, no relations in enrichment.

---

## Tool 1: `content.open(selector, options?)`

Opens exactly one content item. Never consulta Internet.

### Input

```typescript
{
  // One of these selectors (mutually exclusive)
  selector: {
    id?: string,              // monitored_articles.id
    url?: string,             // original article URL
    article_id?: string,      // monitored_articles.id (alias for id)
    story_id?: string,        // story_cluster.id
    story_article_index?: number  // index in story cluster articles
  },

  // Optional: what to include (default: essentials only)
  include?: {
    html?: boolean,           // original HTML (can be 100+ KB)
    images?: boolean,         // list of images + URLs
    videos?: boolean,         // list of videos + metadata
    transcript?: boolean,     // full transcript if exists
    embedding?: boolean,      // embedding vector (skip by default, 1536 dims)
    relations?: boolean       // timeline of related articles (default: true)
  }
}
```

### Output

```typescript
{
  schema_version: "1.0",

  metadata: {
    id: string,               // UUID
    title: string,
    subtitle: string | null,
    published_at: string,     // ISO 8601
    language: string | null,  // "es", "en", etc.
    word_count: number,
    reading_time: number | null  // minutes
  },

  source: {
    id: string,               // RSS source UUID
    name: string,             // "Infobae", "TN", etc.
    url: string,              // https://source.com
    author: string | null,
    rss: string,              // RSS feed URL
    trust_score: number | null  // 0-10
  },

  content: {
    summary: string,          // first 300 chars, clean
    text: string,             // full content, stripped HTML
    html?: string,            // original HTML (if include.html=true)
    images?: Array<{          // if include.images=true
      url: string,
      caption: string | null,
      alt: string | null
    }>,
    videos?: Array<{          // if include.videos=true
      url: string,
      platform: "youtube" | "facebook" | "other",
      transcript?: string
    }>
  },

  enrichment: {
    category: string | null,  // "sports", "politics", "health", etc.
    entities: Array<{
      id: string,
      name: string,
      type: string,           // "PERSON", "ORG", "LOCATION", etc.
      confidence: number      // 0-1
    }>,
    keywords: Array<{
      keyword: string,
      frequency: number
    }>,
    sentiment: "positive" | "negative" | "neutral" | null,
    transcript?: string,      // if include.transcript=true
    embedding_status: "available" | "pending" | "failed" | null
  },

  editorial: {
    // Context: what Panorama knows about this in the editorial graph
    story_id: string | null,
    story_title: string | null,
    story_importance: number | null,  // 1-10
    
    event_id: string | null,
    event_title: string | null,
    
    coverage_status: "breaking" | "growing" | "cooling" | "monitoring" | null,
    importance_score: number | null,  // 1-10
    source_count: number | null,      // how many sources cover same story
    article_count: number | null      // articles in cluster
  },

  relations?: {
    // if include.relations=true (default)
    previous_articles: Array<{
      id: string,
      title: string,
      published_at: string,
      source: string
    }>,
    newer_articles: Array<{
      id: string,
      title: string,
      published_at: string,
      source: string
    }>,
    related_articles: Array<{
      id: string,
      title: string,
      published_at: string,
      source: string
    }>
  },

  provenance: {
    // Pipeline state: when Claude says "missing X", we know why
    ingested_at: string,      // ISO 8601
    last_enriched_at: string | null,
    pipeline_version: string, // e.g. "2.0"
    content_hash: string,     // SHA256 of text content
    fetch_status: "complete" | "incomplete" | "failed",
    fetch_status_reason?: string  // if failed: why
  }
}
```

### Error Responses

```typescript
{
  error: "NOT_FOUND",
  message: "No content found matching selector"
}

{
  error: "CONTENT_NOT_AVAILABLE",
  message: "Content was deleted or marked private"
}

{
  error: "INVALID_SELECTOR",
  message: "Selector must include exactly one of: id, url, article_id, story_id+story_article_index"
}
```

### Constraints

- ✅ Never consults Internet (no web scraping, no API calls outside Panorama)
- ✅ Returns exactly one content (never collections)
- ✅ `include` parameter controls payload size (html/transcript can be 100+ KB)
- ✅ If data doesn't exist → return NOT_FOUND, not null/empty
- ✅ If field processing failed → leave null, document in provenance

---

## Tool 2: `content.explore(selector, context?)`

Explores the editorial graph around one content: timeline, coverage changes, who added what.

### Input

```typescript
{
  // Required: which content to explore around
  selector: {
    id?: string,
    url?: string,
    story_id?: string
  },

  // Optional: what to explore
  context?: {
    direction?: "before" | "after" | "all",      // default: "all"
    days?: number,                                // default: 7 (max: 30)
    include_variants?: boolean,                   // other stories same topic
    include_gap_analysis?: boolean                // what's missing from coverage
  }
}
```

### Output

```typescript
{
  schema_version: "1.0",

  timeline: {
    // Articles covering same story, in chronological order
    articles: Array<{
      id: string,
      title: string,
      published_at: string,
      source: string,
      url: string,
      summary: string,
      added_new_information: boolean  // did this article add facts vs. repeat?
    }>
  },

  coverage_evolution: {
    // How coverage changed over time
    stages: Array<{
      period: "breaking" | "developing" | "established",
      duration: string,  // "2 hours" | "3 days"
      sources_count: number,
      articles_count: number,
      new_angles: string[]  // "economic impact", "political reaction", etc.
    }>
  },

  media_roles: {
    // Which media did what
    first_to_publish: { source: string, published_at: string },
    most_prolific: { source: string, count: number },
    latest: { source: string, published_at: string },
    unique_angles: Array<{
      source: string,
      angle: string,
      first_reported_at: string
    }>
  },

  variants: [
    // Other stories on same topic (if include_variants=true)
    {
      story_id: string,
      title: string,
      context: string,  // how it differs from main story
      articles: number
    }
  ],

  gaps?: {
    // Missing coverage angles (if include_gap_analysis=true)
    likely_questions_unanswered: string[],
    sources_silent: string[],  // major sources not covering
    timeline_gaps: string[]    // long periods without updates
  },

  provenance: {
    queried_at: string,
    data_window: { from: string, to: string },
    sources_included: number
  }
}
```

---

## Tool 3: `content.compare(ids)`

Compares multiple articles side-by-side: what differs, what's shared, what's new.

### Input

```typescript
{
  // 2-5 content IDs to compare
  ids: string[],

  // Optional: what dimensions to compare
  compare?: {
    facts?: boolean,         // which facts are unique/shared
    sources?: boolean,       // source distribution
    sentiment?: boolean,
    entities?: boolean,
    quotes?: boolean,
    perspective?: boolean    // editorial angle differences
  }
}
```

### Output

```typescript
{
  schema_version: "1.0",

  overview: {
    // What's the same across all
    shared_facts: string[],
    common_entities: string[],
    common_keywords: string[]
  },

  by_article: {
    // What's unique to each
    [article_id]: {
      unique_facts: string[],
      unique_angles: string[],
      unique_sources: string[],
      unique_quotes: string[]
    }
  },

  differences: {
    // Structured comparison
    tone: { [article_id]: "neutral" | "critical" | "supportive" },
    depth: { [article_id]: "brief" | "medium" | "detailed" },
    perspective: { [article_id]: string },  // e.g., "political left", "business focus"
    verification: { [article_id]: { sources_cited: number, quotes: number } }
  },

  timeline: {
    // Order of publication
    earliest: { id: string, published_at: string },
    latest: { id: string, published_at: string },
    sequence: Array<{ id: string, published_at: string, lag_from_first: string }>
  },

  provenance: {
    compared_at: string,
    articles_count: number
  }
}
```

---

## Implementation Roadmap

### Phase 2A MVP: `content.open()` — Nivel 1 Only

**Scope**: Build the MVP contract that solves the core problem:
```
Claude reads article completo sin salir a Internet
↓
Facebook / SEO / Resumen / Dossier / Comparación
```

**Implement (Nivel 1 — obligatorio):**
- ✅ All selector types (id, url, article_id, story_id+index)
- ✅ `metadata` block (id, title, subtitle, published_at, language, word_count)
- ✅ `source` block (id, name, url, rss)
- ✅ `content.text` (full article, stripped HTML)
- ✅ `content.summary` (first 300 chars, clean)
- ✅ `content.html` (original HTML if available)
- ✅ `editorial` block (story_id, story_title, event_id, coverage_status, importance_score)
- ✅ `provenance` block (ingested_at, fetch_status, reason if failed)
- ✅ `schema_version`
- ✅ Proper error responses

**Don't implement yet (Nivel 2/3):**
- `include` parameter (implement when you need to control payload)
- `content.images`, `content.videos`
- `enrichment.entities`, `enrichment.keywords`, `enrichment.sentiment`
- `enrichment.transcript`, `enrichment.embedding_status`
- `relations` block
- `metadata.reading_time`, `metadata.author`
- `source.trust_score`

These can return `null` for now. They'll be added when:
1. Panorama has enriched them fully
2. Claude actually requests them
3. Measurement shows they're needed

**Rules:**
- Never consult Internet
- Return exactly one content
- Document all pipeline failures in provenance
- Fields can be null; that's OK
- No over-engineering

**Success Criteria for Fase 2A:**
- [ ] Claude can open any article from `monitor_feed` results
- [ ] Claude stops using web_search/Playwright/Apify for content already in Panorama
- [ ] `content.open()` works for id, url, article_id selectors
- [ ] Errors are clear and actionable
- [ ] One week of usage with Claude Desktop validates the contract

### Phase 2B: `content.explore()` — Deferred

**Status**: Specified, not implemented.

After one week of using `content.open()` with Claude Desktop, measure:
- How often does Claude ask to compare articles?
- How often does Claude navigate the editorial graph?
- How often does Claude want timeline/coverage evolution?

**Trigger for implementation**: If `content.explore()` patterns appear in >70% of editing sessions, promote to priority. Otherwise, stay documented.

### Phase 2C: `content.compare()` — Deferred

**Status**: Specified, not implemented.

Same measurement approach as Fase 2B. Only implement if measurement shows real need.

---

## Design Debt Avoidance

**Why these rules prevent future bloat:**

1. **Single Responsibility** → No "give me 5 related + 20 medios + 30 entities" mega-queries
2. **Optional Blocks** → Payload stays manageable as enrichment expands
3. **Schema Versioning** → Can add fields without breaking Claude
4. **Provenance** → Debugging failures (why is X missing?) becomes obvious
5. **Clear Boundaries** → No confusion about "where does X live?" in the response

---

## MVP-First Philosophy

**Why Nivel 1 only?**

1. **You don't know what fields exist yet.** You know `metadata`, `source`, `content.text` exist. You're not 100% sure about `entities`, `embedding`, `sentiment` today.

2. **You don't know what Claude will request.** Will Claude ask for `relations` every time? Or never? One week of usage tells you.

3. **The core problem is solved at Nivel 1.** Claude can read the full article without leaving Panorama. That's the win.

4. **Nivel 2/3 can wait.** They're enhancements. If Claude never asks for `compare()`, why build it?

5. **Measurement > Assumption.** Don't build for hypothetical use cases. Build, measure, then iterate.

**The Real Goal of Fase 2A**

Not: "Build the perfect content object."

Rather: "Panorama becomes Claude's primary content source."

That's an architecture win worth 10 new tools.

---

## Testing Checklist (Nivel 1 MVP)

- [ ] `content.open({id: "..."})` returns exactly one article with Nivel 1 fields
- [ ] `content.open({url: "https://..."})` works (resolves URL → monitored_articles.id)
- [ ] `content.open({article_id: "..."})` works (alias for id)
- [ ] `content.open({story_id: "...", story_article_index: 0})` returns first article in cluster
- [ ] `metadata` block populated (id, title, published_at, language, word_count)
- [ ] `source` block populated (id, name, url, rss)
- [ ] `content.text` = full article text, clean HTML stripped
- [ ] `content.summary` = first 300 chars
- [ ] `content.html` = original HTML if available, else null
- [ ] `editorial` block populated (story_id, coverage_status, importance_score, etc.)
- [ ] `provenance` block populated (ingested_at, fetch_status, reason if failed)
- [ ] `schema_version: "1.0"` always present
- [ ] Nivel 2/3 fields return null (not error, not omitted)
- [ ] Never makes HTTP/web requests outside Panorama
- [ ] Error responses are actionable (NOT_FOUND, INVALID_SELECTOR, etc.)
- [ ] Missing/null fields are documented in `provenance`
- [ ] One week of Claude Desktop usage validates the contract

---

## Measurement: Advancing to Fase 2B

**After 1 week using Fase 2A with Claude Desktop, measure:**

1. How many times did Claude ask to compare articles?
2. How many times did Claude ask for timeline/coverage evolution?
3. How many times did Claude ask for related articles?
4. Did Claude ever need `entities`, `sentiment`, or `embedding` from `content.open()`?

**If any of these appear >70% of conversations:**
- Promote that feature to Fase 2B

**If any appear <2 times per week:**
- Document learning, prioritize differently

**Success = Fase 2A shipped + real data for Fase 2B**
