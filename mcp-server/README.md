# Panorama MCP Server

MCP (Model Context Protocol) server for Panorama editorial intelligence platform. Exposes 12 specialized tools for editorial analysis.

## Tools

### CRITICAL TOOLS (Phase out OpenClaw with these)

- **agenda.snapshot()** - Get complete editorial agenda (Top Stories, Events, Social, Opportunities, Coverage) in ONE call. Single tool for "What's happening?"
- **topic.snapshot(entity)** - Get complete snapshot of any entity/topic (Stories, Articles, Coverage, Social, Events) in ONE call. Single tool for "What about X?"
- **story.get(id)** - Get complete story as editorial cluster (articles, coverage, social, timeline, actions)

### Supporting Tools

#### Stories
- **stories.search()** - Search stories with filters (entity, timeframe, importance, status)
- **stories.timeline()** - Track how a story evolved over time

### Coverage
- **coverage.timeline()** - See chronological coverage of an entity by different media
- **coverage.by_media()** - Get all articles from a specific media outlet

### Social
- **social.top()** - Get trending social posts by engagement
- **social.by_entity()** - Find social posts about a specific entity

### Intelligence
- **events.search()** - Search for events
- **opportunities.top()** - Find editorial opportunities
- **entities.resolve()** - Resolve entity names (e.g., "Boca" → "Boca Juniors")
- **article.get()** - Get complete article data with URL

### Analysis
- **compare()** - Compare media, entities, or stories
- **evidence.get()** - Get all evidence (articles, events, social, coverage) for an entity

## Installation

```bash
npm install
npm run build
```

## Usage with Claude Desktop

Add to `~/.claude/claude.json`:

```json
{
  "mcpServers": {
    "panorama": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgres://user:password@host:5435/newsdb"
      }
    }
  }
}
```

Then in Claude Desktop, ask questions like:
- "¿Qué cambió en la agenda desde esta mañana?"
- "¿Quién publicó primero sobre el terremoto en Venezuela?"
- "¿Qué historias están creciendo?"
- "Compara la cobertura de Infobea vs La Nación"

## Development

```bash
npm run dev              # Run with ts-node for development
npm run build            # Compile TypeScript to JavaScript
npm run inspect          # Test with MCP Inspector
npm start                # Run the compiled server
```

## Architecture

**Two-brain system:**
- **Brain 1 (Deterministic):** This MCP server provides deterministic tools for data retrieval, filtering, sorting, grouping, and comparison
- **Brain 2 (LLM):** Claude uses these tools intelligently to answer editorial questions

Claude is the reasoning layer. This server is the data layer.
