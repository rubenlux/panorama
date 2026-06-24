import React, { useState, useRef, useEffect } from "react";
import { apiJson } from "../api.js";
import { Send, Loader, MessageCircle } from "lucide-react";
import "./OpenClaw.css";

export default function OpenClaw() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const response = await apiJson("/openclaw/ask", {
        method: "POST",
        auth: true,
        body: { question },
      });

      const { answer, elapsed, sources, synthesized, context } = response;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer || formatContext(context),
          metadata: {
            elapsed: Math.round(elapsed),
            sources: countSources(context),
            synthesized,
          },
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "❌ Error al procesar tu pregunta. Intenta de nuevo.",
          metadata: { error: true },
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  };

  return (
    <div className="openclaw-container">
      {/* Header */}
      <div className="openclaw-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🤖</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>OpenClaw</h1>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#64748b" }}>
              Conversación sobre Panorama
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="openclaw-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="openclaw-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Preguntame cualquier cosa
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
              sobre Panorama. Puedo ayudarte con:
            </p>
            <div className="openclaw-suggestions">
              <div
                className="openclaw-suggestion"
                onClick={() => {
                  setInput("¿Qué está pasando hoy?");
                  inputRef.current?.focus();
                }}
              >
                <span style={{ fontSize: 16 }}>🔥</span>
                <span>¿Qué está pasando hoy?</span>
              </div>
              <div
                className="openclaw-suggestion"
                onClick={() => {
                  setInput("¿Qué pasó con Boca?");
                  inputRef.current?.focus();
                }}
              >
                <span style={{ fontSize: 16 }}>⚽</span>
                <span>¿Qué pasó con [entidad]?</span>
              </div>
              <div
                className="openclaw-suggestion"
                onClick={() => {
                  setInput("¿Qué oportunidades tengo?");
                  inputRef.current?.focus();
                }}
              >
                <span style={{ fontSize: 16 }}>🎯</span>
                <span>¿Qué oportunidades tengo?</span>
              </div>
              <div
                className="openclaw-suggestion"
                onClick={() => {
                  setInput("¿Qué cambió en coverage?");
                  inputRef.current?.focus();
                }}
              >
                <span style={{ fontSize: 16 }}>📊</span>
                <span>¿Qué cambió en coverage?</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 20px" }}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`openclaw-message openclaw-message-${msg.role}`}>
                {msg.role === "user" ? (
                  <div className="openclaw-user-msg">
                    <div>👤</div>
                    <div>{msg.content}</div>
                  </div>
                ) : (
                  <div className="openclaw-assistant-msg">
                    <div>🤖</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#1f2937" }}>
                        {msg.content}
                      </div>
                      {msg.metadata && !msg.metadata.error && (
                        <div className="openclaw-metadata">
                          <div className="openclaw-sources">
                            <span>Fuentes:</span>
                            {msg.metadata.sources.editorial && <span>✓ Editorial</span>}
                            {msg.metadata.sources.coverage && <span>✓ Coverage</span>}
                            {msg.metadata.sources.social && <span>✓ Social</span>}
                            {msg.metadata.sources.knowledge && <span>✓ Knowledge</span>}
                          </div>
                          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#64748b" }}>
                            <span>Tiempo: {msg.metadata.elapsed}ms</span>
                            <span>
                              LLM:{" "}
                              {msg.metadata.synthesized ? "Claude Haiku" : "No"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="openclaw-message openclaw-message-assistant">
                <div>🤖</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader size={16} className="openclaw-spinner" />
                  <span style={{ color: "#64748b" }}>Pensando...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="openclaw-input-area">
        <form onSubmit={handleAsk} style={{ display: "flex", gap: 8, width: "100%" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Pregunta algo..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="openclaw-input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="openclaw-button"
          >
            {loading ? <Loader size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Format raw context into readable text (fallback)
 */
function formatContext(context) {
  if (!context || Object.keys(context).length === 0) {
    return "No encontré información relevante. Intenta otra pregunta.";
  }

  let text = "";

  if (context.stories?.items?.length) {
    text += "**Historias:**\n";
    context.stories.items.slice(0, 3).forEach((s) => {
      text += `• ${s.title}\n`;
    });
    text += "\n";
  }

  if (context.events?.items?.length) {
    text += "**Eventos:**\n";
    context.events.items.forEach((e) => {
      text += `• ${e.headline}\n`;
    });
    text += "\n";
  }

  if (context.opportunities?.items?.length) {
    text += "**Oportunidades:**\n";
    context.opportunities.items.slice(0, 3).forEach((o) => {
      text += `• ${o.title}\n`;
    });
    text += "\n";
  }

  if (context.social?.length) {
    text += "**Social:**\n";
    context.social.forEach((s) => {
      text += `• ${s.title}\n`;
    });
    text += "\n";
  }

  if (context.coverage?.length) {
    text += "**Coverage:**\n";
    context.coverage.forEach((c) => {
      text += `• ${c.source_name}: ${c.change_type}\n`;
    });
  }

  return text || "No hay información disponible.";
}

/**
 * Count sources used in the response
 */
function countSources(context) {
  return {
    editorial: (context.stories?.items?.length || 0) + (context.events?.items?.length || 0) > 0,
    coverage: (context.coverage?.length || 0) > 0,
    social: (context.social?.length || 0) > 0,
    knowledge: (context.entityProfile) ? true : false,
  };
}
