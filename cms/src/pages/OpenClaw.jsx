import React, { useState, useRef, useEffect } from "react";
import { apiJson } from "../api.js";
import { Send, Loader, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import "./OpenClaw.css";

export default function OpenClaw() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('openclaw_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('openclaw_history', JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

      const { answer, detailed_sources, evidence, modules_count, elapsed, model } = response;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          detailed_sources,
          evidence,
          metadata: {
            elapsed: Math.round(elapsed),
            model,
            modules_count
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

  const clearHistory = () => {
    if (window.confirm('¿Limpiar historial?')) {
      setMessages([]);
      localStorage.removeItem('openclaw_history');
    }
  };

  const toggleEvidence = (msgIdx, section) => {
    const key = `${msgIdx}-${section}`;
    setExpandedEvidence(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="openclaw-container">
      {/* Header */}
      <div className="openclaw-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28 }}>🤖</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>OpenClaw</h1>
              <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#64748b" }}>
                Editor Editorial de Panorama
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                color: "#64748b",
                fontWeight: 500,
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#f1f5f9";
              }}
            >
              <Trash2 size={14} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="openclaw-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="openclaw-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Preguntame cualquier cosa sobre Panorama
            </h2>
            <div className="openclaw-suggestions">
              <div onClick={() => setInput("¿Qué está pasando hoy?")}>¿Qué está pasando hoy?</div>
              <div onClick={() => setInput("¿Qué pasó con Boca?")}>¿Qué pasó con [entidad]?</div>
              <div onClick={() => setInput("¿Qué oportunidades tengo?")}>¿Qué oportunidades tengo?</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 20px" }}>
            {messages.map((msg, msgIdx) => (
              <div key={msgIdx} className={`openclaw-message openclaw-message-${msg.role}`}>
                {msg.role === "user" ? (
                  <div className="openclaw-user-msg">
                    <div>👤</div>
                    <div>{msg.content}</div>
                  </div>
                ) : (
                  <div className="openclaw-assistant-msg">
                    <div>🤖</div>
                    <div style={{ flex: 1 }}>
                      {/* Respuesta */}
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#1f2937", marginBottom: 16 }}>
                        {msg.content}
                      </div>

                      {/* Fuentes Detalladas */}
                      {msg.detailed_sources && Object.keys(msg.detailed_sources).length > 0 && (
                        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                            FUENTES UTILIZADAS
                          </div>
                          {Object.entries(msg.detailed_sources).map(([theme, sourceData], idx) => (
                            <div key={idx} style={{ marginBottom: 12, paddingLeft: 12, borderLeft: "3px solid #2b5cff" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1f2937", marginBottom: 8 }}>
                                {theme}
                              </div>

                              {sourceData.articles.length > 0 && (
                                <div style={{ marginBottom: 8, fontSize: 11 }}>
                                  <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                                    Editorial
                                  </div>
                                  {sourceData.articles.map((a, i) => (
                                    <div key={i} style={{ marginBottom: 4, paddingLeft: 8, color: "#64748b" }}>
                                      • {a.source}
                                      <br />
                                      {a.articles_count > 0 && <span>{a.articles_count} artículos • </span>}
                                      {a.sources_count > 0 && <span>{a.sources_count} medios</span>}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {sourceData.social.length > 0 && (
                                <div style={{ marginBottom: 8, fontSize: 11 }}>
                                  <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                                    Social
                                  </div>
                                  {sourceData.social.map((s, i) => (
                                    <div key={i} style={{ marginBottom: 4, paddingLeft: 8, color: "#64748b" }}>
                                      • {s.platforms?.join(', ')}
                                      <br />
                                      {s.engagement?.toLocaleString()} interacciones
                                    </div>
                                  ))}
                                </div>
                              )}

                              {sourceData.coverage.length > 0 && (
                                <div style={{ fontSize: 11 }}>
                                  <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                                    Coverage
                                  </div>
                                  {sourceData.coverage.map((c, i) => (
                                    <div key={i} style={{ marginBottom: 4, paddingLeft: 8, color: "#64748b" }}>
                                      • {c.source}: {c.change_type}
                                      <br />
                                      {c.title}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Evidencia */}
                      {msg.evidence && (
                        <div className="openclaw-evidence">
                          {msg.evidence.articles.length > 0 && (
                            <div className="evidence-section">
                              <button
                                className="evidence-header"
                                onClick={() => toggleEvidence(msgIdx, 'articles')}
                              >
                                <span>📰 Artículos ({msg.evidence.articles.length})</span>
                                {expandedEvidence[`${msgIdx}-articles`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              {expandedEvidence[`${msgIdx}-articles`] && (
                                <div className="evidence-items">
                                  {msg.evidence.articles.slice(0, 5).map((a, i) => (
                                    <div key={i} className="evidence-item">
                                      <div className="evidence-title">{a.title}</div>
                                      <div className="evidence-meta">
                                        <span>{a.score}</span>
                                        <span>{a.article_count} artículos</span>
                                        <span>{a.source_count} medios</span>
                                      </div>
                                    </div>
                                  ))}
                                  {msg.evidence.articles.length > 5 && (
                                    <div className="evidence-more">+{msg.evidence.articles.length - 5} más</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.evidence.social.length > 0 && (
                            <div className="evidence-section">
                              <button
                                className="evidence-header"
                                onClick={() => toggleEvidence(msgIdx, 'social')}
                              >
                                <span>📱 Redes Sociales ({msg.evidence.social.length})</span>
                                {expandedEvidence[`${msgIdx}-social`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              {expandedEvidence[`${msgIdx}-social`] && (
                                <div className="evidence-items">
                                  {msg.evidence.social.slice(0, 5).map((s, i) => (
                                    <div key={i} className="evidence-item">
                                      <div className="evidence-title">{s.title}</div>
                                      <div className="evidence-meta">
                                        <span>{s.platforms?.join(', ') || 'N/A'}</span>
                                        <span>{s.engagement?.toLocaleString()} interacciones</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.evidence.events.length > 0 && (
                            <div className="evidence-section">
                              <button
                                className="evidence-header"
                                onClick={() => toggleEvidence(msgIdx, 'events')}
                              >
                                <span>🔔 Eventos ({msg.evidence.events.length})</span>
                                {expandedEvidence[`${msgIdx}-events`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              {expandedEvidence[`${msgIdx}-events`] && (
                                <div className="evidence-items">
                                  {msg.evidence.events.map((e, i) => (
                                    <div key={i} className="evidence-item">
                                      <div className="evidence-title">{e.headline}</div>
                                      <div className="evidence-meta">
                                        <span>{e.story_count} historias</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.evidence.opportunities.length > 0 && (
                            <div className="evidence-section">
                              <button
                                className="evidence-header"
                                onClick={() => toggleEvidence(msgIdx, 'opportunities')}
                              >
                                <span>🎯 Oportunidades ({msg.evidence.opportunities.length})</span>
                                {expandedEvidence[`${msgIdx}-opportunities`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              {expandedEvidence[`${msgIdx}-opportunities`] && (
                                <div className="evidence-items">
                                  {msg.evidence.opportunities.slice(0, 3).map((o, i) => (
                                    <div key={i} className="evidence-item">
                                      <div className="evidence-title">{o.title}</div>
                                      <div className="evidence-meta">
                                        <span>{o.type}</span>
                                        <span>Score: {o.score}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Metadata */}
                      {msg.metadata && !msg.metadata.error && (
                        <div className="openclaw-metadata">
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                            <div style={{ marginBottom: 8 }}>Módulos consultados:</div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
                              {msg.metadata.modules_count?.articles > 0 && <span>✓ Editorial ({msg.metadata.modules_count.articles})</span>}
                              {msg.metadata.modules_count?.events > 0 && <span>✓ Eventos ({msg.metadata.modules_count.events})</span>}
                              {msg.metadata.modules_count?.social > 0 && <span>✓ Social ({msg.metadata.modules_count.social})</span>}
                              {msg.metadata.modules_count?.coverage > 0 && <span>✓ Coverage ({msg.metadata.modules_count.coverage})</span>}
                              {msg.metadata.modules_count?.opportunities > 0 && <span>✓ Opportunities ({msg.metadata.modules_count.opportunities})</span>}
                              {msg.metadata.modules_count?.entities > 0 && <span>✓ Knowledge ({msg.metadata.modules_count.entities})</span>}
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <span>Tiempo: {msg.metadata.elapsed}ms</span>
                              <span style={{ marginLeft: 16 }}>LLM: {msg.metadata.model}</span>
                            </div>
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
                  <span>Pensando...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
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
          <button type="submit" disabled={loading || !input.trim()} className="openclaw-button">
            {loading ? <Loader size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
