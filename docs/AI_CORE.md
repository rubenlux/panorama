# AI_CORE.md

> Documentación del sistema de IA integrado en Panorama.
> Última actualización: 2026-06-09

---

## Modelos Utilizados

| Modelo | Proveedor | SDK | Uso |
|---|---|---|---|
| `claude-sonnet-4-5-20250929` | Anthropic | `@anthropic-ai/sdk` 0.71x | Análisis de artículos, reescritura, generación de borradores, reformulación, estructuración de datos, generación de briefs de investigación, extracción de entidades |
| `whisper-1` | OpenAI | `openai` 6.x | Transcripción de archivos de audio |

---

## Arquitectura de IA

```
CMS (PostEditor / EditorialStudio)
         │
         ▼
  /ai/analyze        → AiService.analyzeArticle()
  /ai/rewrite        → AiService.rewriteArticle()
  /editorial-studio/ → AiService.createDraft()
                        AiService.reformulate()
                        AiService.structureData()
                        AiService.transcribeAudio()  → OpenAI Whisper
                        AiService.createDraftFromAudio()
  /research/         → AiService.generateResearchBrief()   (temp 0.2, max 2000 tokens)
                        AiService.extractEntities()         (temp 0.1, max 1500 tokens)
         │
         ▼
  src/services/AiService.js
  ├── this.anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  └── this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
```

**Regla:** Nunca importar `@anthropic-ai/sdk` u `openai` directamente en un archivo de ruta. Siempre usar `AiService`.

---

## AiService — Métodos Disponibles

### `analyzeArticle(article)`
- **Input:** `{ title, body, excerpt, category_name? }`
- **Modelo:** Claude Sonnet
- **Temperatura:** 0.2 (respuestas consistentes)
- **Max tokens:** 4000
- **Output:** JSON estructurado con análisis de SEO, legibilidad, sugerencias editoriales
- **Endpoint:** `POST /ai/analyze`

### `rewriteArticle(article, instructions)`
- **Input:** artículo + instrucciones de estilo
- **Modelo:** Claude Sonnet
- **Output:** Artículo reescrito según instrucciones
- **Endpoint:** `POST /ai/rewrite`

### `createDraft(prompt, context?)`
- **Input:** Titular o idea inicial
- **Modelo:** Claude Sonnet
- **Output:** Borrador completo de artículo (HTML compatible con TipTap)
- **Endpoint:** `POST /editorial-studio/create-draft`

### `reformulate(text, style)`
- **Input:** Fragmento de texto + estilo deseado (formal, coloquial, técnico, etc.)
- **Modelo:** Claude Sonnet
- **Output:** Texto reformulado
- **Endpoint:** `POST /editorial-studio/reformulate`

### `structureData(text)`
- **Input:** Texto libre con datos
- **Modelo:** Claude Sonnet
- **Output:** JSON estructurado extraído del texto
- **Endpoint:** `POST /editorial-studio/structure-data`

### `transcribeAudio(filePath)`
- **Input:** Path al archivo de audio (mp3, wav, m4a, etc.)
- **Modelo:** OpenAI Whisper
- **Output:** Texto transcripto
- **Endpoint:** `POST /editorial-studio/transcribe` (multipart)

### `createDraftFromAudio(transcript)`
- **Input:** Texto transcripto
- **Modelo:** Claude Sonnet
- **Output:** Borrador de artículo completo
- **Endpoint:** `POST /editorial-studio/from-audio`

---

## Prompts del Sistema

Los prompts viven dentro de `AiService.js` en el método `_buildPrompt()`. El código fuente completo está en `src/services/AiService.js`.

El análisis de artículos retorna un JSON con al menos:
- Score de legibilidad
- Sugerencias de título SEO
- Palabras clave detectadas
- Resumen ejecutivo
- Recomendaciones editoriales

---

## Agentes y Workflows

### Editorial Studio (CMS)
**Ubicación:** `cms/src/pages/EditorialStudio.jsx`

Workflow de creación asistida:
1. Editor ingresa título o idea
2. Opción A: Generar borrador (`create-draft`) — Claude escribe el artículo
3. Opción B: Subir audio (`transcribe`) — Whisper transcribe → Claude genera borrador
4. Editor revisa y edita en TipTap
5. Opción: Analizar artículo (`analyze`) — Claude da feedback editorial
6. Opción: Reformular sección seleccionada (`reformulate`)
7. Publicar desde el editor

### Análisis en PostEditor (CMS)
**Ubicación:** `cms/src/pages/PostEditor.jsx` + `cms/src/components/AiAnalysisPanel.jsx`

Al abrir un artículo existente, el editor puede:
- Click en "Analizar con IA" → `POST /ai/analyze`
- Ver el panel de análisis (`AiAnalysisPanel.jsx`) con sugerencias
- Click en "Reescribir" → `POST /ai/rewrite`

---

## Variables de Entorno Requeridas

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...   # Requerido para Claude
OPENAI_API_KEY=sk-svcacct-...        # Requerido solo para transcripción de audio
```

Si falta `ANTHROPIC_API_KEY`, `AiService` lanza `Error: Missing ANTHROPIC_API_KEY in environment`.
Si falta `OPENAI_API_KEY`, el método `transcribeAudio()` lanza error específico.

---

## Limitaciones y Consideraciones

- **Costo:** Cada llamada a Claude genera tokens facturable. El análisis de artículos largos puede consumir 3000-4000 tokens por llamada.
- **Latencia:** Las respuestas de Claude toman 3-8 segundos. El CMS muestra loading states durante las llamadas.
- **Modelo hardcodeado:** `claude-sonnet-4-5-20250929` está en el constructor de `AiService`. Para cambiar de modelo, editar esa línea. No está en env vars.
- **Sin caché:** Cada análisis hace una llamada nueva a la API aunque el artículo no haya cambiado.
