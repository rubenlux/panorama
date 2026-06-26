# MCP Server Setup for Claude Desktop

## 1. Build the Server

```bash
cd mcp-server
npm install
npm run build
```

Status: ✅ **Built and ready**

## 2. Add to Claude Desktop Configuration

Edit `~/.claude/claude.json` (create if doesn't exist):

```json
{
  "mcpServers": {
    "panorama": {
      "command": "node",
      "args": ["/absolute/path/to/news/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgres://postgres:postgres@127.0.0.1:5435/newsdb"
      }
    }
  }
}
```

**Key:** Use absolute path to `dist/index.js`, not relative.

## 3. Start Claude Desktop

- Close and reopen Claude Desktop (it reads the config on startup)
- If MCP tab appears, connection is working ✅

## 4. Test the Connection

Ask Claude: "¿Qué está pasando hoy?"

Claude should respond with a tool call to `agenda.snapshot()`. If it works:
- MCP Server is connected
- Database connection is working
- You're ready for testing

## 5. Run the 50-Question Experiment

1. Open `TEST_QUESTIONS.md`
2. Ask Claude the first 5 questions
3. Compare responses vs OpenClaw
4. Track metrics in the table

**Goal:** If MCP wins 70%+ of questions, the architecture shift is validated.

---

## Troubleshooting

**MCP tab doesn't appear:**
- Check `~/.claude/claude.json` syntax (valid JSON?)
- Check path is absolute, not relative
- Try restarting Claude Desktop

**Tool calls fail:**
- Verify `DATABASE_URL` is correct
- Check database is running: `npm run db:up` in root
- Verify tables exist: `psql -c "\dt" -d newsdb`

**Slow responses:**
- First call primes connection pool (normal, slow)
- Subsequent calls are faster
- If consistently slow, check database performance

---

## Next Steps After Testing

If MCP proves better:
1. Keep MCP Server running
2. Convert OpenClaw to be a web client of MCP
3. Replace 12+ functions with tool calls
4. Simplify architecture by 70%

If OpenClaw wins:
- May need additional tools
- May need better summarization
- Keep iterating until MCP wins
