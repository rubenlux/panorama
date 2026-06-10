import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import fs from "fs";

export class AiService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = "claude-sonnet-4-6";
  }

  async transcribeAudio(filePath) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY in environment");
    }

    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
      });
      return transcription.text;
    } catch (error) {
      console.error("OpenAI Whisper Error:", error);
      throw new Error("Failed to transcribe audio: " + (error.message || error));
    }
  }

  async analyzeArticle(article) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildPrompt(article);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.2, // Low temperature for consistent JSON
        messages: [
          {
            "role": "user",
            "content": prompt
          }
        ]
      });

      // Extract JSON from response (Sonnet usually stays in character, but we find the JSON block just in case)
      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if full text is JSON (expected)
      return JSON.parse(text);

    } catch (error) {
      console.error("AI Analysis Detailed Error:", JSON.stringify(error, null, 2));
      if (error.response) {
        console.error("Anthropic API Status:", error.status);
        console.error("Anthropic API Headers:", error.headers);
        console.error("Anthropic API Error Body:", JSON.stringify(error.error, null, 2));
      }
      throw new Error("Failed to analyze article with AI: " + (error.message || error));
    }
  }

  _buildPrompt(data) {
    // data: { title, subtitle, slug, category, author, date, body, images }
    const imagesMeta = JSON.stringify(data.images || [], null, 2);

    return `
You will analyze a news article intended for publication on a digital news website.

Context:
- Content type: News / Journalism
- Language: Spanish
- Audience: General news readers
- SEO strategy: Organic search (Google)
- CMS: Custom editorial system
- The site uses its own internal analytics pixel (not Google Analytics)

Your tasks are divided into modules.
Analyze the content and return a structured report in JSON format ONLY. Do not strictly output markdown, just the JSON.

Article data:
- Title: ${data.title || "N/A"}
- Subtitle / Bajada: ${data.subtitle || "N/A"}
- Slug: ${data.slug || "N/A"}
- Category: ${data.category || "N/A"}
- Author: ${data.author || "N/A"}
- Publication date: ${data.date || new Date().toISOString()}
- Body (HTML or plain text): ${data.body || "N/A"}
- Images metadata:
${imagesMeta}

Primary keyword (if provided): ${data.primary_keyword || "Not provided"}

RETURN JSON STRUCTURE:
{
  "overall_score": number (0-100),

  "seo_audit": {
    "score": number,
    "critical_issues": ["string"],
    "warnings": ["string"],
    "recommendations": ["string"]
  },

  "readability_analysis": {
    "score": number,
    "long_paragraphs": ["string (preview)"],
    "long_sentences": ["string (preview)"],
    "passive_voice_warnings": ["string"],
    "recommendations": ["string"]
  },

  "keyword_analysis": {
    "primary_keyword_status": "string",
    "missing_keywords": ["string"],
    "semantic_variations": ["string"],
    "long_tail_suggestions": ["string"],
    "over_optimization_warnings": ["string"]
  },

  "search_intent_analysis": {
    "detected_intent": "informational | news | evergreen | mixed",
    "intent_match_score": number,
    "first_paragraph_feedback": "string",
    "recommendations": ["string"]
  },

  "content_structure": {
    "heading_issues": ["string"],
    "missing_subheadings": ["string"],
    "scannability_score": number,
    "recommendations": ["string"]
  },

  "images_seo": {
    "issues": ["string"],
    "missing_alt": ["string (url)"],
    "missing_captions": ["string (url)"],
    "recommendations": ["string"]
  },

  "internal_linking": {
    "opportunities": ["string"],
    "category_alignment_issues": ["string"],
    "recommendations": ["string"]
  },

  "editorial_suggestions": {
    "title_alternatives": ["string"],
    "meta_description_suggestion": "string",
    "slug_feedback": "string",
    "additional_notes": ["string"]
  },

  "final_summary": {
    "top_3_actions": ["string"],
    "estimated_seo_improvement": "low | medium | high"
  }
}

CONSTRAINTS:
- Do NOT change facts or data.
- Do NOT invent names, dates, or numbers.
- Do NOT rewrite quotes.
- Do NOT generate fake sources.
- Do NOT assume unpublished information.
- If information is insufficient, explicitly state it.
- Be concise but precise.
- Avoid generic SEO advice.
- Focus on actionable improvements.
- Prioritize changes with highest SEO and UX impact.
- Use professional editorial language (Spanish).
`;
  }

  async rewriteArticle(article) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildRewritePrompt(article);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.25, // Slightly higher for creativity in rewriting, but still controlled
        messages: [
          {
            "role": "user",
            "content": prompt
          }
        ]
      });

      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);

    } catch (error) {
      console.error("AI Rewrite Error:", error);
      throw new Error("Failed to rewrite article: " + (error.message || error));
    }
  }

  _buildRewritePrompt(data) {
    return `
You are a SENIOR NEWS EDITOR at a top-tier digital news agency (Reuters/BBC level).
Your task: REWRITE this article to meet STRICT professional standards while preserving ALL facts.

═══════════════════════════════════════════════════════════════
📰 CURRENT ARTICLE DATA:
═══════════════════════════════════════════════════════════════
Title: ${data.title || "Sin título"}
Volanta (Kicker): ${data.subtitle || "Sin volanta"}
Copete (Lead/Excerpt): ${data.excerpt || "Sin copete"}

Body:
${data.body || "Sin contenido"}

═══════════════════════════════════════════════════════════════
🎯 YOUR MISSION: FIX ALL SEO & EDITORIAL ISSUES
═══════════════════════════════════════════════════════════════

## 1️⃣ TITLE (Título Principal)
✅ MUST BE: 50-60 characters (STRICT)
✅ Include PRIMARY keyword naturally
✅ Be specific, newsworthy, and clickable
✅ Use active voice
❌ NO generic phrases like "Todo lo que necesitas saber"
❌ NO clickbait

## 2️⃣ VOLANTA (Kicker/Eyebrow)
✅ Contextual phrase (3-6 words)
✅ Adds context or category info
✅ Example: "Fútbol Internacional" or "Eliminatorias Qatar 2026"

## 3️⃣ COPETE (Lead Paragraph / Excerpt)
✅ MUST BE: 150-160 characters for meta description
✅ Answer: WHO, WHAT, WHEN, WHERE (the 4 W's)
✅ Must work standalone (for homepage previews)
✅ Include primary keyword naturally
✅ NO repetition of title words

## 4️⃣ BODY STRUCTURE (Inverted Pyramid + SEO)

### A) FIRST PARAGRAPH (Lead - Most Critical)
✅ Expand on the 5 W's + H (Who, What, When, Where, Why, How)
✅ 2-3 sentences MAX
✅ Front-load the most newsworthy info
✅ Include primary keyword in first 100 words

### B) MIDDLE SECTION (Supporting Details)
✅ Add 3-4 strategic H2 subheadings:
   - Use DESCRIPTIVE titles (not "Introducción" or "Contexto")
   - Examples: "Calendario de partidos de Argentina", "Impacto en la clasificación"
   - Include semantic variations of keywords
✅ Each section: 2-3 paragraphs
✅ Add relevant context (dates, names, stats)
✅ Use SHORT paragraphs (3-4 lines max)
✅ Use SHORT sentences (15-20 words average)

### C) CLOSING (Background / Less Critical Info)
✅ Historical context or related info
✅ Can be brief (1-2 paragraphs)
❌ NO conclusions or "moral of the story"
❌ News ends when facts end

### D) LENGTH REQUIREMENT
✅ MINIMUM: 300-400 words (expand if current article is too short)
✅ Add factual context if needed (tournament format, team records, etc.)

## 5️⃣ SEO OPTIMIZATION RULES

✅ Primary Keyword Density: 1-2% (natural, not forced)
✅ Use semantic variations (e.g., "Selección argentina", "equipo albiceleste", "Argentina")
✅ Include long-tail keywords naturally in H2s
✅ Add internal linking opportunities (mention related topics like "Mundial 2026", "Lionel Scaloni")
❌ NO keyword stuffing
❌ NO over-optimization

## 6️⃣ WRITING STYLE (CRITICAL)

✅ NEUTRAL TONE: Remove ALL subjective adjectives
   ❌ BAD: "increíble", "desafortunadamente", "emocionante"
   ✅ GOOD: "destacado", "importante", "significativo"
✅ ACTIVE VOICE: "Argentina enfrentará" (not "será enfrentada")
✅ PRECISION: Use exact dates, names, scores
✅ CLARITY: Short sentences, simple structure
✅ SPANISH: Neutral/International (avoid regionalisms)

## 7️⃣ FORMATTING (HTML)

✅ Use <h2> for main sections (3-4 total)
✅ Use <strong> for key names/terms (sparingly)
✅ Use <p> for all paragraphs
✅ Keep existing images/videos if present
❌ NO <h1> (reserved for title)
❌ NO excessive formatting

═══════════════════════════════════════════════════════════════
⚠️ CRITICAL CONSTRAINTS (DO NOT VIOLATE)
═══════════════════════════════════════════════════════════════

🚫 DO NOT change facts, dates, names, or scores
🚫 DO NOT invent quotes or sources
🚫 DO NOT add opinions or editorial commentary
🚫 DO NOT write conclusions or summaries at the end
🚫 DO NOT use flowery or emotional language
🚫 DO NOT exceed 60 characters in title
🚫 DO NOT write less than 300 words total

✅ DO preserve the essence and meaning
✅ DO add factual context if article is too short
✅ DO fix grammar and style issues
✅ DO optimize for SEO without being obvious

═══════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (JSON ONLY - NO MARKDOWN)
═══════════════════════════════════════════════════════════════

{
  "title": "Optimized title (50-60 chars)",
  "volanta": "Contextual kicker",
  "excerpt": "Lead paragraph optimized for meta description (150-160 chars)",
  "body": "<p>First paragraph with 5W+H...</p><h2>Descriptive Subheading</h2><p>Supporting details...</p>..."
}

═══════════════════════════════════════════════════════════════
🎬 BEGIN REWRITE NOW
═══════════════════════════════════════════════════════════════
`;
  }

  // ============================================================
  // EDITORIAL AI STUDIO METHODS
  // ============================================================

  async createDraftFromTopic(topicData) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildCreateDraftPrompt(topicData);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      });

      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Create Draft Error:", error);
      throw new Error("Failed to create draft: " + (error.message || error));
    }
  }

  _buildCreateDraftPrompt(data) {
    return `
Eres un ASISTENTE EDITORIAL PROFESIONAL (no un generador automático).

REGLAS CRÍTICAS:
🚫 NO inventes datos, fechas, nombres o cifras
🚫 NO agregues información que no tengas
🚫 NO escribas opiniones o juicios
✅ SI no tienes certeza, márcalo con ⚠️
✅ SI falta información, indícalo explícitamente
✅ SI hay datos sensibles, márcalos claramente

Tu rol: Asistir al editor humano, no reemplazarlo.

═══════════════════════════════════════════════════════════════
📋 DATOS DEL TEMA
═══════════════════════════════════════════════════════════════
Tema/Hecho: ${data.topic}
Tipo de nota: ${data.articleType || "breaking"}
País/Región: ${data.country || "Argentina"}
Público objetivo: ${data.targetAudience || "General"}
Contexto adicional: ${data.additionalContext || "No especificado"}

═══════════════════════════════════════════════════════════════
🎯 TU TAREA: CREAR BORRADOR EDITORIAL
═══════════════════════════════════════════════════════════════

1. VOLANTA (Kicker/Eyebrow)
   - 3-6 palabras contextuales
   - Ejemplo: "Política Nacional" o "Economía Argentina"

2. TÍTULO
   - 50-60 caracteres ESTRICTO
   - Específico y noticioso
   - Voz activa
   - Keyword natural

3. COPETE/EXCERPT
   - 150-160 caracteres para meta description
   - Responde: QUÉ, QUIÉN, CUÁNDO, DÓNDE
   - Funciona standalone

4. CUERPO
   - Estructura periodística (pirámide invertida)
   - 3-4 H2 DESCRIPTIVOS (no genéricos como "Introducción")
   - Párrafos cortos (3-4 líneas)
   - Mínimo 300 palabras
   - Usar <h2>, <p>, <strong> (sin <h1>)

5. NOTAS DE VERIFICACIÓN
   - Marca TODO lo que requiere fact-checking
   - Usa ⚠️ para elementos que necesitan verificación
   - Identifica datos sensibles (nombres, cifras, fechas)

6. NIVEL DE CONFIANZA
   - "high": Tema general con hechos públicos conocidos
   - "medium": Requiere verificación de algunos datos
   - "low": Información insuficiente o muy específica

═══════════════════════════════════════════════════════════════
⚠️ IMPORTANTE
═══════════════════════════════════════════════════════════════
- Si el tema es muy específico y no tienes datos concretos, indica claramente qué falta
- NO inventes nombres, fechas, cifras o declaraciones
- Marca EXPLÍCITAMENTE todo lo que requiere verificación humana
- Este es un BORRADOR, no una versión final

═══════════════════════════════════════════════════════════════
📤 OUTPUT (JSON ONLY)
═══════════════════════════════════════════════════════════════

{
  "volanta": "Volanta contextual",
  "title": "Título SEO (50-60 chars)",
  "excerpt": "Copete/bajada (150-160 chars)",
  "body": "<p>Primer párrafo con 5W...</p><h2>Subtítulo Descriptivo</h2><p>Contenido...</p>",
  "structure": ["H2 sugerido 1", "H2 sugerido 2", "H2 sugerido 3"],
  "verificationNotes": [
    "⚠️ Verificar fecha exacta del evento",
    "⚠️ Confirmar nombre completo",
    "⚠️ Validar cifras mencionadas"
  ],
  "sensitiveData": ["Nombres propios", "Cifras", "Fechas", "Declaraciones"],
  "confidence": "high" | "medium" | "low"
}
`;
  }

  async reformulateArticle(articleData) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildReformulatePrompt(articleData);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.25,
        messages: [{ role: "user", content: prompt }]
      });

      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Reformulate Error:", error);
      throw new Error("Failed to reformulate article: " + (error.message || error));
    }
  }

  _buildReformulatePrompt(data) {
    const objectiveDescriptions = {
      seo: "Optimizar para SEO sin cambiar el contenido factual",
      shorten: "Acortar el artículo manteniendo información clave",
      discover: "Adaptar para Google Discover (títulos más atractivos, formato móvil)",
      "tone-change": "Cambiar el tono según instrucciones",
      update: "Actualizar con nuevos datos manteniendo la estructura"
    };

    return `
Eres un ASISTENTE EDITORIAL PROFESIONAL especializado en reformulación.

REGLAS CRÍTICAS:
🚫 NO cambies hechos, datos, fechas o nombres
🚫 NO inventes nueva información
🚫 NO alteres el significado original (salvo que se pida cambio de tono)
✅ PRESERVA todos los hechos 100%
✅ GENERA un ChangeLog detallado de cada cambio
✅ EXPLICA por qué hiciste cada cambio

═══════════════════════════════════════════════════════════════
📋 ARTÍCULO ORIGINAL
═══════════════════════════════════════════════════════════════
Título: ${data.original.title}
Volanta: ${data.original.volanta || "N/A"}
Copete: ${data.original.excerpt || "N/A"}
Cuerpo:
${data.original.body}

═══════════════════════════════════════════════════════════════
🎯 OBJETIVO DE REFORMULACIÓN
═══════════════════════════════════════════════════════════════
Objetivo: ${objectiveDescriptions[data.objective] || data.objective}
Instrucciones adicionales: ${data.instructions || "Ninguna"}
${data.newData ? `Nuevos datos a incorporar:\n${data.newData}` : ""}

═══════════════════════════════════════════════════════════════
📝 GUÍAS SEGÚN OBJETIVO
═══════════════════════════════════════════════════════════════

${data.objective === "seo" ? `
SEO:
- Optimizar keyword density (1-2%)
- Mejorar meta description
- Agregar keywords en H2s naturalmente
- Mantener longitud de título (50-60 chars)
- NO sobre-optimizar
` : ""}

${data.objective === "shorten" ? `
ACORTAR:
- Eliminar redundancias
- Condensar párrafos largos
- Mantener información esencial
- Preservar citas y datos clave
` : ""}

${data.objective === "discover" ? `
GOOGLE DISCOVER:
- Título más atractivo (pero factual)
- Formato móvil (párrafos cortos)
- Copete más engaging
- Mantener credibilidad periodística
` : ""}

${data.objective === "tone-change" ? `
CAMBIO DE TONO:
- Ajustar según instrucciones
- Mantener hechos intactos
- Preservar citas textuales
` : ""}

${data.objective === "update" ? `
ACTUALIZAR:
- Incorporar nuevos datos
- Mantener estructura original
- Indicar qué se actualizó
- Preservar información previa relevante
` : ""}

═══════════════════════════════════════════════════════════════
📤 OUTPUT (JSON ONLY)
═══════════════════════════════════════════════════════════════

{
  "reformulated": {
    "title": "Título reformulado",
    "volanta": "Volanta reformulada",
    "excerpt": "Copete reformulado",
    "body": "<p>Cuerpo reformulado...</p>"
  },
  "changeLog": {
    "modified": [
      "Título acortado de 75 a 58 caracteres",
      "Keyword agregada en H2 principal",
      "Párrafo 3 condensado de 6 a 3 líneas"
    ],
    "removed": [
      "Párrafo redundante sobre contexto histórico",
      "Repetición de datos en sección 2"
    ],
    "improved": [
      "Optimizado keyword density de 0.5% a 1.2%",
      "Meta description mejorada para CTR",
      "Estructura H2 más descriptiva"
    ]
  },
  "seoImprovements": [
    "Keyword principal en título",
    "Meta description optimizada (158 chars)",
    "3 H2s con keywords semánticas"
  ]
}
`;
  }

  async structureChaoticData(rawData, context) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildStructureDataPrompt(rawData, context);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      });

      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Structure Data Error:", error);
      throw new Error("Failed to structure data: " + (error.message || error));
    }
  }

  _buildStructureDataPrompt(rawData, context) {
    return `
Eres un ASISTENTE EDITORIAL PROFESIONAL especializado en estructurar información desordenada.

REGLAS CRÍTICAS:
🚫 NO inventes información que no esté en los datos
🚫 NO agregues hechos que no puedas verificar
🚫 NO asumas fechas, nombres o cifras
✅ IDENTIFICA hechos vs opiniones
✅ SEPARA contexto de declaraciones
✅ MARCA información incompleta o ambigua
✅ INDICA explícitamente qué falta

═══════════════════════════════════════════════════════════════
📋 DATOS DESORDENADOS
═══════════════════════════════════════════════════════════════
${rawData}

═══════════════════════════════════════════════════════════════
📌 CONTEXTO
═══════════════════════════════════════════════════════════════
Categoría: ${context.category || "General"}
Tipo esperado: ${context.expectedType || "breaking"}
País: ${context.country || "Argentina"}

═══════════════════════════════════════════════════════════════
🎯 TU TAREA
═══════════════════════════════════════════════════════════════

1. ANALIZAR Y ESTRUCTURAR
   - Identificar hechos concretos
   - Separar contexto relevante
   - Extraer declaraciones/citas textuales
   - Crear timeline si hay eventos temporales

2. DETECTAR PROBLEMAS
   - Información incompleta
   - Datos sin fuente
   - Fechas ambiguas
   - Nombres sin confirmar

3. GENERAR ARTÍCULO
   - Estructura periodística coherente
   - Título, volanta, copete, cuerpo
   - H2s descriptivos
   - Párrafos cortos

═══════════════════════════════════════════════════════════════
⚠️ IMPORTANTE
═══════════════════════════════════════════════════════════════
- Si falta información crítica, INDÍCALO en warnings
- Si una fecha es ambigua, MÁRCALO
- Si un nombre está incompleto, SEÑÁLALO
- NO llenes vacíos con suposiciones

═══════════════════════════════════════════════════════════════
📤 OUTPUT (JSON ONLY)
═══════════════════════════════════════════════════════════════

{
  "structured": {
    "facts": [
      "Hecho concreto 1",
      "Hecho concreto 2"
    ],
    "context": [
      "Contexto relevante 1",
      "Contexto relevante 2"
    ],
    "quotes": [
      "Declaración textual 1",
      "Declaración textual 2"
    ],
    "timeline": [
      "Evento 1 - fecha",
      "Evento 2 - fecha"
    ]
  },
  "article": {
    "title": "Título SEO (50-60 chars)",
    "volanta": "Volanta contextual",
    "excerpt": "Copete (150-160 chars)",
    "body": "<p>Artículo estructurado...</p>"
  },
  "warnings": [
    "⚠️ Información incompleta sobre fecha exacta del evento",
    "⚠️ Requiere fuente para la cifra mencionada",
    "⚠️ Nombre del funcionario no especificado completamente"
  ],
  "confidence": "high" | "medium" | "low"
}
`;
  }

  async createArticleFromAudio(audioTranscript, context) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const prompt = this._buildAudioToArticlePrompt(audioTranscript, context);

    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      });

      const text = msg.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Audio to Article Error:", error);
      throw new Error("Failed to create article from audio: " + (error.message || error));
    }
  }

  // ============================================================
  // RESEARCH CENTER METHODS
  // ============================================================

  async extractEntities(topicTitle, brief) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const briefText = [
      brief.executive_summary || '',
      ...(Array.isArray(brief.key_facts) ? brief.key_facts : []),
      ...(Array.isArray(brief.timeline) ? brief.timeline : []),
    ].join('\n');

    const prompt = `Eres un sistema de extracción de entidades para una base de conocimiento periodística.

TEMA: ${topicTitle}

TEXTO A ANALIZAR:
${briefText.slice(0, 3000)}

Extrae todas las entidades nombradas relevantes. Para cada una identifica:
- Personas (políticos, empresarios, científicos, figuras públicas)
- Empresas (organizaciones comerciales, startups, corporaciones)
- Productos (software, hardware, servicios, medicamentos)
- Organizaciones (ONGs, gobiernos, partidos, instituciones)
- Países y Ciudades

También identifica eventos clave que involucren a estas entidades.

REGLAS:
🚫 NO inventes entidades que no estén en el texto
✅ Normaliza nombres (usa el nombre completo y canónico)
✅ Solo entidades que aparezcan explícitamente
✅ Para eventos, solo los que estén en el texto con una fecha aproximable

JSON ESTRICTO — sin markdown:
{
  "entities": [
    {
      "name": "Nombre canónico",
      "entity_type": "person|company|product|organization|location",
      "description": "Una oración que describa esta entidad en el contexto del tema",
      "confidence": 0.0-1.0
    }
  ],
  "events": [
    {
      "entity_name": "Nombre exacto de la entidad de arriba",
      "title": "Título del evento (máx 80 chars)",
      "summary": "Una oración descriptiva",
      "event_date": "YYYY-MM-DD o null si no es claro",
      "event_type": "announcement|launch|controversy|funding|political|merger|other"
    }
  ]
}`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1500,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  // ============================================================
  // EDITORIAL WORKFLOW METHODS (Sprint 4)
  // ============================================================

  // ── EDITORIAL WORKFLOW (Sprint 4 / 4.1) ──────────────────────────────────

  _buildBriefText(brief) {
    return `Resumen ejecutivo: ${brief.executive_summary || ''}
Hechos clave: ${(brief.key_facts || []).join(' | ')}
Controversias: ${(brief.controversies || []).join(' | ')}
Timeline: ${(brief.timeline || []).join(' | ')}
Oportunidades: ${brief.opportunities || ''}
Riesgos/vacíos: ${brief.risks || ''}`.trim();
  }

  _anglesPromptBlock() {
    return `ORDEN DE ÁNGULOS — REGLA OBLIGATORIA:
Posición 1 → SIEMPRE "noticia" (pirámide invertida, 5W+H en el lead, tono agencia)
Posición 2 → "analisis" o "cronica"
Posición 3 → "explicador" o "investigacion"
Posición 4 → "fact_check" o "investigacion"
❌ NUNCA omitas el tipo "noticia". ❌ NUNCA repitas tipos.

Tipos disponibles:
- noticia      → Informativa pura, pirámide invertida, 5W+H obligatorio en lead
- ultima_hora  → Breaking, urgente, datos concretos, sin análisis
- cronica      → Narrativa cronológica, contexto profundo
- analisis     → Interpretación, causas y consecuencias
- investigacion→ Múltiples fuentes, metodología transparente
- fact_check   → Verificación de afirmaciones, verdadero/falso
- explicador   → ¿Qué es? ¿Por qué importa? Pedagógico

Estructura de cada ángulo:
{
  "angle_type": "uno de los tipos listados arriba",
  "title": "Titular periodístico exacto (50-60 chars)",
  "summary": "2-3 oraciones: qué cubre, por qué es relevante, qué lo diferencia",
  "target_audience": "A quién está dirigido específicamente",
  "seo_keywords": ["kw1", "kw2", "kw3"]
}`;
  }

  _articleTypeInstructions(articleType) {
    const rules = {
      noticia: `
═══ TIPO: NOTICIA INFORMATIVA — PIRÁMIDE INVERTIDA ═══

LEAD OBLIGATORIO (primer <p> del body):
  Escribe UN párrafo de 2-3 oraciones que responda las 6 preguntas:
  ✅ QUIÉN — protagonista principal
  ✅ QUÉ   — el hecho central
  ✅ CUÁNDO — fecha o momento
  ✅ DÓNDE — lugar
  ✅ POR QUÉ — causa o relevancia
  ✅ CÓMO — de qué manera ocurrió
  Este párrafo debe poder leerse solo y dar la noticia completa.

ESTRUCTURA DEL BODY:
  <p>LEAD — 5W+H en 2-3 oraciones</p>
  <h2>Datos y detalles relevantes</h2>
  <p>Hechos secundarios, declaraciones, cifras</p>
  <h2>Contexto</h2>
  <p>Antecedentes necesarios para entender</p>

TONO: Agencia de noticias. Objetivo. Sin adjetivos valorativos.
❌ PROHIBIDO ABSOLUTAMENTE:
  - Introducción tipo blog ("En un mundo donde...", "Hoy en día...", "Es importante destacar...")
  - Conclusión o cierre editorial ("En definitiva...", "Queda por ver si...")
  - Opinión del autor
  - Preguntas retóricas
  - Adjetivos emocionales: "increíble", "preocupante", "histórico"
`,
      ultima_hora: `
═══ TIPO: ÚLTIMA HORA / BREAKING ═══
PRIMERA ORACIÓN: El hecho más importante. Sin contexto previo.
LEAD: Datos confirmados únicamente. Una oración por hecho.
LONGITUD: 250-400 palabras máximo — la rapidez es prioritaria
TONO: Urgente, directo, sin especulaciones
⚠️ Marcar con [EN DESARROLLO] cualquier dato no confirmado
❌ PROHIBIDO: Contexto histórico extenso, análisis, intro tipo blog, conclusión
`,
      cronica: `
═══ TIPO: CRÓNICA ═══
ESTRUCTURA: Cronológica o narrativa — puede empezar con un momento clave (no necesariamente la noticia principal)
ESTILO: Más narrativo que la noticia, puede incluir descripción de escenas
LEAD: Puede ser un gancho narrativo — escena, diálogo, descripción
CUERPO: Desarrollo cronológico con contexto rico
TONO: Más literario que la noticia, pero periodísticamente riguroso
`,
      analisis: `
═══ TIPO: ANÁLISIS ═══
ESTRUCTURA: Contexto → Hechos → Causas → Consecuencias → Perspectivas
LEAD: Puede presentar la pregunta central del análisis
CUERPO: Profundidad. Explica el "por qué" y el "qué significa".
TONO: Puede incluir interpretación del periodista pero fundamentada en hechos
❌ NO confundir con opinión: el análisis usa hechos como base, no percepciones personales
`,
      investigacion: `
═══ TIPO: INVESTIGACIÓN ═══
ESTRUCTURA: Hallazgo principal → Metodología → Evidencias → Contexto → Implicaciones
LEAD: El hallazgo más impactante, bien documentado
CUERPO: Múltiples fuentes citadas. Transparencia sobre método. ¿Qué documentos? ¿Qué fuentes?
TONO: Riguroso, documentado, preciso
⚠️ Cada afirmación importante debe tener fuente o marcarse como ⚠️ requiere verificación
`,
      fact_check: `
═══ TIPO: FACT CHECK ═══
ESTRUCTURA: Afirmación a verificar → Veredicto (VERDADERO/FALSO/PARCIALMENTE VERDADERO/SIN EVIDENCIA) → Evidencia → Contexto
LEAD: Identifica claramente qué afirmación se está verificando y quién la hizo
CUERPO: Evidencias concretas para cada veredicto. Fuentes citadas.
TONO: Neutral, preciso, basado en evidencia
Usar etiquetas claras: ✅ VERDADERO | ❌ FALSO | ⚠️ PARCIALMENTE VERDADERO | 🔍 SIN EVIDENCIA SUFICIENTE
`,
      explicador: `
═══ TIPO: EXPLICADOR ═══
ESTRUCTURA: Pregunta central → Respuesta directa → Contexto → Implicaciones → Qué viene después
LEAD: Plantea la pregunta que el lector tiene en mente
CUERPO: Pedagógico. Definir términos. Usar analogías. H2s como preguntas (¿Qué es X? ¿Por qué ocurre? ¿Qué significa para...?)
TONO: Accesible, claro, sin jerga sin explicar
Ideal para lectores que necesitan contexto para entender una noticia
`,
    };
    return rules[articleType] || rules.noticia;
  }

  async generateDossier(topicTitle, brief, entities = []) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

    const entityList = entities.slice(0, 20).map(e => `${e.name} (${e.entity_type})`).join(', ') || 'No hay entidades detectadas';
    const briefText = this._buildBriefText(brief);

    const prompt = `Eres un editor estratégico senior de una redacción digital.
Tu tarea: a partir de una investigación periodística, crear un DOSSIER EDITORIAL completo.

REGLAS CRÍTICAS:
🚫 NO inventes datos, citas, fechas o nombres que no estén en el brief
🚫 NO agregues información de entrenamiento si no está explícitamente en el brief
✅ Basa todas las recomendaciones en los hechos del brief
✅ El hero_image_prompt debe ser en inglés, fotorrealista, evocador

TEMA: ${topicTitle}

BRIEF DE INVESTIGACIÓN:
${briefText}

ENTIDADES DETECTADAS: ${entityList}

ÁNGULOS EDITORIALES:
${this._anglesPromptBlock()}
Genera EXACTAMENTE 4 ángulos respetando el orden obligatorio:
[0] noticia → [1] analisis o cronica → [2] explicador o investigacion → [3] fact_check o investigacion

Genera el dossier en JSON ESTRICTO sin markdown:
{
  "executive_summary": "Resumen editorial de 3-4 oraciones (reformular, no copiar del brief)",
  "verified_facts": ["Hecho verificado y citable 1", "Hecho 2", "Hecho 3"],
  "timeline": ["Evento más reciente — descripción breve", "Evento anterior — descripción"],
  "seo_keywords": ["keyword principal", "variación semántica 1", "long-tail 1", "long-tail 2"],
  "suggested_categories": ["Categoría Principal", "Categoría Secundaria"],
  "suggested_tags": ["tag1", "tag2", "tag3", "tag4"],
  "suggested_headlines": [
    "Titular directo y noticioso (50-60 chars)",
    "Titular con contexto o impacto",
    "Titular SEO-first con keyword"
  ],
  "suggested_angles": [
    {
      "angle_type": "noticia",
      "title": "Titular periodístico exacto (50-60 chars)",
      "summary": "2-3 oraciones: qué cubre y por qué es relevante",
      "target_audience": "A quién está dirigido",
      "seo_keywords": ["kw1", "kw2", "kw3"]
    }
  ],
  "hero_image_prompt": "Describe in English a photorealistic scene. Professional news photography style. No text in image."
}`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 3000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  async generateAngles(topicTitle, briefText, entityList, excludeTypes = []) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

    const exclude = excludeTypes.length
      ? `\nNO uses estos tipos que ya existen: ${excludeTypes.join(', ')}`
      : '';

    const prompt = `Eres un editor estratégico de una redacción digital.
Genera 4 ángulos editoriales para el siguiente tema periodístico.

REGLAS CRÍTICAS:
🚫 NO inventes datos que no estén en el brief
✅ El primer ángulo SIEMPRE debe ser "noticia" — pirámide invertida, 5W+H, tono de agencia
✅ Los otros 3 deben ser de tipos distintos (analisis/cronica/explicador/investigacion/fact_check)
${exclude}

TEMA: ${topicTitle}
BRIEF: ${briefText.slice(0, 800)}
ENTIDADES: ${entityList || '—'}

${this._anglesPromptBlock()}

Devuelve JSON ESTRICTO sin markdown — solo el array:
[
  {
    "angle_type": "tipo",
    "title": "Titular periodístico (50-60 chars)",
    "summary": "2-3 oraciones descriptivas",
    "target_audience": "Audiencia objetivo",
    "seo_keywords": ["kw1", "kw2", "kw3"]
  }
]`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1500,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  async regenerateAngle(topicTitle, briefText, entityList, angleType) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

    const typeInstructions = {
      noticia:       'Noticia informativa: pirámide invertida, 5W+H en el lead',
      ultima_hora:   'Última hora: urgente, datos confirmados, directo',
      cronica:       'Crónica: narrativa cronológica, contexto rico',
      analisis:      'Análisis: causas, consecuencias, interpretación fundamentada',
      investigacion: 'Investigación: múltiples fuentes, metodología, hallazgos documentados',
      fact_check:    'Fact Check: verifica afirmaciones, veredictos claros, evidencia',
      explicador:    'Explicador: pedagógico, ¿qué es? ¿por qué importa?',
    };

    const prompt = `Genera UN ángulo editorial de tipo "${angleType}" para el siguiente tema.

TIPO: ${angleType} — ${typeInstructions[angleType] || angleType}

TEMA: ${topicTitle}
BRIEF: ${briefText.slice(0, 600)}
ENTIDADES: ${entityList || '—'}

REGLAS:
🚫 NO inventes datos que no estén en el brief
✅ El título debe tener 50-60 caracteres
✅ El summary debe describir específicamente qué cubriría este artículo

Devuelve JSON ESTRICTO sin markdown:
{
  "angle_type": "${angleType}",
  "title": "Titular periodístico (50-60 chars)",
  "summary": "2-3 oraciones descriptivas del artículo",
  "target_audience": "Audiencia objetivo específica",
  "seo_keywords": ["kw1", "kw2", "kw3"]
}`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 600,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  async generateArticleDraft(topicTitle, dossier, angle, briefText = '') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

    const facts = (dossier.verified_facts || []).join('\n- ');
    const timeline = (dossier.timeline || []).join('\n- ');
    const seoKw = (dossier.seo_keywords || []).join(', ');
    const articleType = angle.angle_type || 'noticia';
    const typeInstructions = this._articleTypeInstructions(articleType);

    const noticiaReminder = (articleType === 'noticia' || articleType === 'ultima_hora') ? `
⚡ RECORDATORIO CRÍTICO PARA ESTE TIPO:
El PRIMER <p> del body = LEAD PERIODÍSTICO que responde 5W+H.
NO empieces con contexto. NO empieces con historia. Empieza con el hecho.
` : '';

    const prompt = `Eres un REDACTOR PERIODÍSTICO SENIOR. Tu tarea: generar un artículo COMPLETO y PROFESIONAL.

${typeInstructions}
${noticiaReminder}
REGLAS UNIVERSALES:
🚫 NO inventes datos, nombres, fechas o cifras que no estén en el dossier o brief
🚫 NO uses tu conocimiento de entrenamiento como fuente primaria
🚫 NO escribas introducción tipo blog ("En este artículo veremos...", "Es importante destacar que...")
🚫 NO escribas conclusión ni cierre editorial
✅ Mínimo 400 palabras en el body
✅ Título: exactamente 50-60 caracteres
✅ Marcá con ⚠️ todo lo que requiere verificación adicional
✅ Usá comillas «» para citas textuales

TEMA: ${topicTitle}

HECHOS VERIFICADOS (únicas fuentes válidas):
- ${facts || '(sin hechos verificados — usá solo lo del brief)'}

TIMELINE:
- ${timeline || '(sin timeline)'}

BRIEF ADICIONAL: ${briefText.slice(0, 500) || '—'}

ÁNGULO SELECCIONADO (generá SOLO este ángulo, no mezcles con otros):
Tipo: ${articleType}
Título sugerido: ${angle.title}
Descripción: ${angle.summary}
Audiencia: ${angle.target_audience}
Keywords: ${(angle.seo_keywords || angle.keywords || []).join(', ')}
Keywords SEO del dossier: ${seoKw}

OUTPUT (JSON ONLY, sin markdown, sin texto extra):
{
  "volanta": "Kicker contextual (3-6 palabras, tipo sección o contexto)",
  "title": "Título periodístico EXACTO (50-60 caracteres)",
  "excerpt": "Copete que responde QUIÉN+QUÉ+CUÁNDO+DÓNDE (150-160 chars)",
  "body": "<p>Lead: primer párrafo con las 5W+H...</p><h2>Subtítulo descriptivo</h2><p>Desarrollo...</p><h2>Contexto</h2><p>Antecedentes...</p>",
  "meta_title": "Meta title (50-60 chars)",
  "meta_description": "Meta description (150-160 chars, incluye keyword)",
  "og_title": "Título para redes sociales",
  "og_description": "Descripción para redes (120-140 chars)",
  "tags": ["tag1", "tag2", "tag3"],
  "categoria": "Categoría principal",
  "verification_notes": ["⚠️ Verificar: ..."]
}`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 4500,
      temperature: 0.35,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  async generateResearchBrief(topic, sources) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment");
    }

    const sourcesText = sources
      .slice(0, 12)
      .map((s, i) => `[${i + 1}] ${s.source_name} — ${s.title}\n${s.content?.slice(0, 300) || ''}`)
      .join('\n\n');

    const prompt = `Eres un investigador periodístico senior. Tu tarea es sintetizar múltiples fuentes en un brief ejecutivo estructurado.

REGLAS CRÍTICAS:
🚫 NO inventes datos que no estén en las fuentes
🚫 NO mezcles hechos de diferentes eventos
✅ CITA el número de fuente [1], [2]... cuando uses datos específicos
✅ INDICA cuando la información es parcial o requiere verificación

TEMA DE INVESTIGACIÓN: ${topic}

FUENTES ENCONTRADAS (${sources.length} total, analizando las más relevantes):
${sourcesText}

Genera un brief con este JSON ESTRICTO:
{
  "executive_summary": "Resumen ejecutivo de 3-4 oraciones que capture el estado actual del tema. Sé específico.",
  "key_facts": ["Hecho 1 con fuente [N]", "Hecho 2", "Hecho 3", "..."],
  "controversies": ["Controversia o punto de debate 1", "..."],
  "timeline": ["Evento más reciente - descripción breve", "..."],
  "opportunities": "Ángulos periodísticos que vale la pena desarrollar",
  "risks": "Información no verificada, contradicciones entre fuentes o vacíos importantes"
}

Si las fuentes no cubren bien el tema, indicarlo en risks. JSON ONLY, sin markdown.`;

    const msg = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  }

  _buildAudioToArticlePrompt(transcript, context) {
    return `
Eres un ASISTENTE EDITORIAL PROFESIONAL especializado en convertir transcripciones de audio en artículos periodísticos.

REGLAS CRÍTICAS:
🚫 NO inventes citas que no estén en la transcripción
🚫 NO agregues información externa
🚫 NO cambies el sentido de las declaraciones
✅ EXTRAE citas textuales con precisión
✅ ELIMINA muletillas pero mantén el sentido
✅ IDENTIFICA speakers si no están especificados
✅ MARCA citas directas con comillas

═══════════════════════════════════════════════════════════════
🎙️ TRANSCRIPCIÓN DE AUDIO
═══════════════════════════════════════════════════════════════
${transcript}

═══════════════════════════════════════════════════════════════
📌 CONTEXTO
═══════════════════════════════════════════════════════════════
Tipo de audio: ${context.audioType || "field-report"}
Speakers: ${context.speakers ? context.speakers.join(", ") : "No especificados"}
Categoría: ${context.category || "General"}
Ubicación: ${context.location || "No especificada"}
Fecha: ${context.date || new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════
🎯 TU TAREA: PIPELINE DE PROCESAMIENTO
═══════════════════════════════════════════════════════════════

PASO 1: ANÁLISIS DEL CONTENIDO
- ¿Es entrevista, declaración, conferencia, testimonio o reporte?
- ¿Quiénes hablan? (identifica speakers si no están especificados)
- ¿Hay timecodes? (formato 00:02:15)
- Elimina muletillas: "eh", "este", "bueno", "o sea", etc.

PASO 2: EXTRACCIÓN ESTRUCTURADA
- Citas textuales (con comillas)
- Ideas centrales de cada speaker
- Contexto necesario para entender
- Hechos mencionados

PASO 3: GENERACIÓN EDITORIAL
- Construir noticia periodística PROFESIONAL (no un resumen)
- Marcar citas directas claramente
- Resumir ideas sin perder precisión
- Agregar contexto donde sea necesario
- Estructura: título, volanta, copete, cuerpo con H2s

═══════════════════════════════════════════════════════════════
📝 TIPOS DE AUDIO - GUÍAS
═══════════════════════════════════════════════════════════════

${context.audioType === "interview" ? `
ENTREVISTA:
- Identificar pregunta-respuesta
- Extraer declaraciones clave
- Contextualizar quién es el entrevistado
- Usar citas directas para declaraciones importantes
` : ""}

${context.audioType === "statement" ? `
DECLARACIÓN:
- Identificar declarante
- Extraer mensaje principal
- Contextualizar por qué declara
- Citas textuales de frases clave
` : ""}

${context.audioType === "conference" ? `
CONFERENCIA:
- Resumir puntos principales
- Extraer anuncios o conclusiones
- Citas de momentos destacados
- Estructura cronológica si aplica
` : ""}

${context.audioType === "field-report" ? `
REPORTE DESDE EL LUGAR:
- Describir la situación
- Extraer hechos observados
- Incluir testimonios si los hay
- Contextualizar ubicación y momento
` : ""}

═══════════════════════════════════════════════════════════════
⚠️ IMPORTANTE
═══════════════════════════════════════════════════════════════
- Este es un BORRADOR PERIODÍSTICO, no una transcripción formateada
- Las citas deben ser TEXTUALES (entre comillas)
- Elimina muletillas pero NO cambies el sentido
- Si falta contexto crítico, márcalo en verificationNotes

═══════════════════════════════════════════════════════════════
📤 OUTPUT (JSON ONLY)
═══════════════════════════════════════════════════════════════

{
  "analysis": {
    "type": "interview" | "statement" | "conference" | "testimony" | "field-report",
    "speakers": ["Nombre 1", "Nombre 2"],
    "mainTopics": ["Tema 1", "Tema 2", "Tema 3"]
  },
  "quotes": [
    {
      "speaker": "Juan Pérez",
      "quote": "Texto exacto de la cita",
      "timestamp": "00:02:15"
    }
  ],
  "article": {
    "title": "Título SEO (50-60 chars)",
    "volanta": "Volanta contextual",
    "excerpt": "Copete (150-160 chars)",
    "body": "<p>Artículo periodístico con citas marcadas...</p><h2>Subtítulo</h2><p>Contenido...</p>"
  },
  "verificationNotes": [
    "⚠️ Verificar cargo exacto de Juan Pérez",
    "⚠️ Confirmar fecha mencionada en minuto 3:45",
    "⚠️ Validar cifra de 'mil personas' mencionada"
  ]
}
`;
  }
}
