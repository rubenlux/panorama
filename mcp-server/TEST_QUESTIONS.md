# The Definitive Experiment: 50 Questions

**Goal:** Compare OpenClaw current vs Claude Desktop + MCP

Test both with the same 50 real editorial questions. Measure:
- Response quality
- Accuracy
- Clarity
- Time to answer
- Number of tool calls needed

---

## Agenda & Overview (5 questions)

1. ¿Qué está pasando hoy?
2. ¿Cuál es la agenda editorial en este momento?
3. ¿Cuáles son los 5 temas más importantes ahora?
4. ¿Qué eventos hay siendo cubiertos?
5. ¿Qué oportunidades editoriales hay ahora?

## Entity Exploration (10 questions)

6. ¿Qué pasó con Boca Juniors?
7. ¿Qué está pasando con el terremoto en Venezuela?
8. ¿Cómo está la agenda sobre la Selección Argentina?
9. ¿Qué noticias hay sobre Milei?
10. ¿Qué está cubriendo Panorama sobre TyC Sports?
11. ¿Qué se sabe de Formosa?
12. ¿Cuál es el estado de la cobertura de River Plate?
13. ¿Qué pasó con Julián Álvarez?
14. ¿Cómo está el tema del dólar blue?
15. ¿Qué está sucediendo con las protestas?

## Timeline & Change Detection (10 questions)

16. ¿Qué cambió en la agenda desde esta mañana?
17. ¿Cómo evolucionó el terremoto en las últimas 6 horas?
18. ¿Qué historias ganaron importancia en el último ciclo?
19. ¿Qué temas perdieron tracción desde hace 2 horas?
20. ¿Cuándo empezó a cubrirse el caso de Lucas Trejo?
21. ¿Cómo fue el desarrollo de cobertura del caso Bullrich?
22. ¿En qué momento explotó el tema del Mundial?
23. ¿Qué temas salieron de la agenda hoy?
24. ¿Cuál fue el primer medio en publicar sobre el terremoto?
25. ¿Cómo se distribuye la cobertura a lo largo del día?

## Media Analysis (8 questions)

26. ¿Qué publicó Infobea en las últimas 2 horas?
27. ¿Cuál es la estrategia de cobertura de TyC Sports?
28. ¿Qué historias está priorizando La Nación?
29. ¿Cómo compara Clarín vs Infobea en cobertura del terremoto?
30. ¿Quién llegó primero con el caso de Lucas Trejo?
31. ¿Qué medios NO están cubriendo el terremoto?
32. ¿Cuál es la diferencia entre la agenda de Infobea y Olé?
33. ¿Qué fuentes exclusivas tiene cada medio?

## Social Intelligence (7 questions)

34. ¿Qué está explotando en redes sociales?
35. ¿Cuáles son los posts más virales?
36. ¿Qué están diciendo en Facebook sobre Boca?
37. ¿Hay gap entre redes y cobertura editorial?
38. ¿Qué publicó YouTube sobre el terremoto?
39. ¿Cuáles son los temas sin cobertura editorial pero viral en redes?
40. ¿Cómo reaccionó el público en redes a la noticia del terremoto?

## Comparison & Correlation (6 questions)

41. ¿Cómo compara la cobertura de Brasil vs Argentina en el Mundial?
42. ¿Cuál es la diferencia entre cobertura de deportes vs política?
43. ¿Hay correlación entre posts virales y cobertura editorial?
44. ¿Cómo se distribuye la cobertura entre temas domésticos e internacionales?
45. ¿Qué tema tiene más "profundidad" según número de fuentes?
46. ¿Hay solapamiento entre historias detectadas?

## Editorial Opportunities (4 questions)

47. ¿Qué oportunidades de cobertura hay?
48. ¿Hay ángulos no explorados en el terremoto?
49. ¿Qué story necesita profundización editorial?
50. ¿Hay hiatos de cobertura que deberíamos llenar?

---

## How to Run the Experiment

### Setup

1. **OpenClaw baseline:**
   ```bash
   curl -X POST http://localhost:5000/openclaw/ask \
     -H "Content-Type: application/json" \
     -d '{"question": "¿Qué está pasando hoy?"}'
   ```

2. **Claude Desktop + MCP:**
   - Add mcp-server to `~/.claude/claude.json`
   - Start Claude Desktop
   - Ask the same questions

### Measurement

For each question, track:

| Metric | OpenClaw | MCP | Winner |
|--------|----------|-----|--------|
| Tool calls | N | N | Fewer is better |
| Response time | Ns | Ns | Faster is better |
| Completeness | ⭐ | ⭐ | N/A |
| Accuracy | ⭐ | ⭐ | N/A |
| Clarity | ⭐ | ⭐ | N/A |

### Pass Criteria

**MCP wins if:**
- 70%+ of questions answered better or equal to OpenClaw
- Average tool calls < OpenClaw average
- Response time < OpenClaw response time
- Editor perceives better reasoning (subjective but important)

**If MCP wins:** Architecture shift is validated. OpenClaw becomes just a web client.

**If OpenClaw wins:** The MCP approach needs more work. May need:
- Additional tools
- Better summarization logic
- Different ranking

---

## Why This Matters

This isn't about OpenClaw vs MCP. It's about:

**Current model (OpenClaw):**
- Panorama sends 400KB of context
- OpenClaw filters it with prompts
- Claude reads through all the filtered data
- Result: slow, expensive, brittle

**Proposed model (MCP):**
- Panorama exposes smart tools
- Claude decides what to call
- Each tool returns focused data
- Result: fast, cheap, adaptable

If Claude with tools makes better decisions than OpenClaw with context, we know where to invest.
