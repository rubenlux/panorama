import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiJson } from "../api.js";

// ── Type config ───────────────────────────────────────────────────────────────
const ANGLE_TYPES = {
  noticia:       { label: "Noticia",       emoji: "📰", color: "#1d4ed8", bg: "#dbeafe",
                   desc: "Pirámide invertida · 5W+H · Hechos primero" },
  ultima_hora:   { label: "Última Hora",   emoji: "🔴", color: "#dc2626", bg: "#fee2e2",
                   desc: "Breaking · Urgente · Datos confirmados" },
  cronica:       { label: "Crónica",       emoji: "📝", color: "#7c3aed", bg: "#ede9fe",
                   desc: "Narrativa cronológica · Contexto rico" },
  analisis:      { label: "Análisis",      emoji: "🔍", color: "#065f46", bg: "#d1fae5",
                   desc: "Causas · Consecuencias · Interpretación" },
  investigacion: { label: "Investigación", emoji: "🕵️", color: "#92400e", bg: "#fef3c7",
                   desc: "Múltiples fuentes · Metodología documentada" },
  fact_check:    { label: "Fact Check",    emoji: "✅", color: "#166534", bg: "#dcfce7",
                   desc: "Verifica afirmaciones · Veredictos claros" },
  explicador:    { label: "Explicador",    emoji: "💡", color: "#0e7490", bg: "#cffafe",
                   desc: "¿Qué es? ¿Por qué importa? · Pedagógico" },
};

const SCORE_CHECKS = [
  { key: "hasLead",    label: "Lead periodístico",
    test: (b) => b.length > 200 && b.split("</p>").length > 2 },
  { key: "has5W",      label: "5W+H en el cuerpo",
    test: (b) => {
      const t = b.toLowerCase();
      const hits = ["quién","quien","qué","que ","cuándo","cuando","dónde","donde","por qué","porque"]
        .filter(w => t.includes(w));
      return hits.length >= 4;
    }},
  { key: "hasSources", label: "Fuentes citadas",
    test: (b) => /según|informó|declaró|dijo|afirmó|reportó|de acuerdo/i.test(b) },
  { key: "hasContext", label: "Contexto incluido",
    test: (b) => b.replace(/<[^>]+>/g, "").length > 1200 },
  { key: "hasQuotes",  label: "Citas textuales",
    test: (b) => /[«""]/.test(b) },
];

function calcScore(body) {
  const results = {};
  SCORE_CHECKS.forEach(c => { results[c.key] = c.test(body || ""); });
  const score = Object.values(results).filter(Boolean).length;
  return { results, score, max: SCORE_CHECKS.length };
}

// ── AngleCard ─────────────────────────────────────────────────────────────────
function AngleCard({ angle, onGenerate, onRegenerate, generating, regenerating }) {
  const type = ANGLE_TYPES[angle.angle_type] || { label: angle.angle_type, emoji: "✍️", color: "#374151", bg: "#f3f4f6", desc: "" };
  const kw = Array.isArray(angle.seo_keywords) ? angle.seo_keywords : [];

  return (
    <div style={{ background: "#fff", border: `2px solid ${type.bg}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{type.emoji}</span>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, background: type.bg, color: type.color, padding: "3px 10px", borderRadius: 20 }}>{type.label}</span>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{type.desc}</div>
        </div>
      </div>

      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "#111" }}>{angle.title}</h3>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{angle.summary}</p>

      <div>
        {angle.target_audience && (
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
            <span style={{ opacity: 0.5 }}>👤</span> {angle.target_audience}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {kw.map(k => <span key={k} style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 20 }}>{k}</span>)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button onClick={() => onRegenerate(angle.id)} disabled={regenerating === angle.id}
          style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
          {regenerating === angle.id ? "⟳…" : "⟳ Regenerar"}
        </button>
        <button onClick={() => onGenerate(angle.id)} disabled={!!generating}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "none",
            background: generating === angle.id ? "#818cf8" : `linear-gradient(135deg, ${type.color}, #6366f1)`,
            color: "#fff", cursor: generating ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13 }}>
          {generating === angle.id ? "✨ Generando…" : "✨ Generar artículo"}
        </button>
      </div>
    </div>
  );
}

// ── PreviewModal ──────────────────────────────────────────────────────────────
function PreviewModal({ draft, angle, onClose, onEdit }) {
  const score = calcScore(draft.body || "");
  const type = ANGLE_TYPES[angle?.angle_type] || { label: "", emoji: "✍️", color: "#374151", bg: "#f3f4f6" };
  const scoreColor = score.score >= 4 ? "#16a34a" : score.score >= 3 ? "#d97706" : "#dc2626";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780, marginBottom: 40 }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, background: type.bg, color: type.color, padding: "3px 10px", borderRadius: 20 }}>{type.emoji} {type.label}</span>
            <h2 style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{draft.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#9ca3af", flexShrink: 0 }}>✕</button>
        </div>

        {/* Score periodístico */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f3f4f6", background: "#f9fafb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Score periodístico</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{score.score}/{score.max}</span>
            <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3 }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${(score.score / score.max) * 100}%`, background: scoreColor, transition: "width .3s" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SCORE_CHECKS.map(c => (
              <span key={c.key} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                background: score.results[c.key] ? "#dcfce7" : "#fee2e2",
                color: score.results[c.key] ? "#166534" : "#dc2626" }}>
                {score.results[c.key] ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {draft.volanta && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
              {draft.volanta}
            </div>
          )}
          <p style={{ margin: "0 0 16px", fontSize: 15, color: "#374151", fontStyle: "italic", borderLeft: "3px solid #e5e7eb", paddingLeft: 12, lineHeight: 1.6 }}>
            {draft.excerpt}
          </p>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "#374151", maxHeight: 360, overflowY: "auto", paddingRight: 8 }}
            dangerouslySetInnerHTML={{ __html: draft.body || "" }} />

          {/* SEO preview */}
          {draft.meta_title && (
            <div style={{ marginTop: 20, background: "#f9fafb", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase" }}>Vista previa SEO</div>
              <div style={{ color: "#1a0dab", fontSize: 16, fontWeight: 600 }}>{draft.meta_title}</div>
              <div style={{ color: "#006621", fontSize: 12, marginTop: 1 }}>panorama.com/…</div>
              <div style={{ color: "#545454", fontSize: 13, marginTop: 3 }}>{draft.meta_description}</div>
            </div>
          )}

          {/* Verification notes */}
          {draft.verification_notes?.length > 0 && (
            <div style={{ marginTop: 16, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#c2410c", marginBottom: 8 }}>⚠️ Notas de verificación</div>
              {draft.verification_notes.map((n, i) => (
                <div key={i} style={{ fontSize: 13, color: "#7c2d12", marginBottom: 4 }}>{n}</div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
            Volver
          </button>
          <button onClick={onEdit}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
            Editar en borrador →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DossierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dossier, setDossier] = useState(null);
  const [angles, setAngles]   = useState([]);
  const [drafts, setDrafts]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [generating,   setGenerating]   = useState(null);
  const [regenerating, setRegenerating] = useState(null);
  const [refreshing,   setRefreshing]   = useState(false);
  const [preview, setPreview]           = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { dossier: d, drafts: dr, angles: an } = await apiJson(`/editorial-workflow/dossiers/${id}`, { auth: true });
      setDossier(d);
      setDrafts(dr || []);
      setAngles(an || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (dossier?.status !== "generating") return;
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
  }, [dossier?.status, load]);

  async function handleGenerate(angleId) {
    setGenerating(angleId);
    try {
      const { draft, angle } = await apiJson(`/editorial-workflow/dossiers/${id}/draft`, {
        method: "POST", auth: true, body: { angle_id: angleId }
      });
      setPreview({ draft, angle });
    } catch (err) {
      alert(`Error generando artículo: ${err.message}`);
    } finally { setGenerating(null); }
  }

  async function handleRegenerate(angleId) {
    setRegenerating(angleId);
    try {
      const updated = await apiJson(`/editorial-workflow/dossiers/${id}/angles/regenerate`, {
        method: "POST", auth: true, body: { angle_id: angleId }
      });
      setAngles(prev => prev.map(a => a.id === angleId ? updated : a));
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally { setRegenerating(null); }
  }

  async function handleRefreshAngles() {
    if (!confirm("¿Generar 4 nuevos ángulos editoriales? Se borrarán los actuales.")) return;
    setRefreshing(true);
    try {
      const newAngles = await apiJson(`/editorial-workflow/dossiers/${id}/angles/refresh`, { method: "POST", auth: true });
      setAngles(newAngles);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally { setRefreshing(false); }
  }

  function handleEditDraft() {
    if (!preview) return;
    navigate("/posts/new", {
      state: {
        prefilled: {
          volanta: preview.draft.volanta,
          title:   preview.draft.title,
          excerpt: preview.draft.excerpt,
          body:    preview.draft.body,
          seo: {
            meta_title:       preview.draft.meta_title,
            meta_description: preview.draft.meta_description,
            og_title:         preview.draft.og_title,
            og_description:   preview.draft.og_description,
          },
          origin:     "dossier",
          dossier_id: id,
          _verification_notes: preview.draft.verification_notes,
        },
        _angle: preview.angle,
      }
    });
  }

  if (loading) return <div style={{ padding: 32, color: "#9ca3af" }}>Cargando dossier…</div>;
  if (!dossier) return <div style={{ padding: 32, color: "#ef4444" }}>Dossier no encontrado</div>;

  const isReady     = dossier.status === "ready";
  const isGenerating = dossier.status === "generating";

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>
        <Link to="/dossiers" style={{ color: "#6b7280", textDecoration: "none" }}>← Dossiers</Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{dossier.topic_title || "Dossier"}</h1>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
          background: isReady ? "#dcfce7" : isGenerating ? "#fef9c3" : "#fee2e2",
          color:      isReady ? "#166534" : isGenerating ? "#854d0e" : "#dc2626" }}>
          {isReady ? "✓ Listo" : isGenerating ? "⏳ Generando…" : "✗ Error"}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>
        Dossier editorial · {new Date(dossier.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
      </div>

      {isGenerating && (
        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "#854d0e", fontSize: 14 }}>
          ⏳ Claude está analizando el brief y generando el dossier… Esto tarda 15-30 segundos.
        </div>
      )}

      {dossier.status === 'failed' && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "#991b1b", fontSize: 14 }}>
          <strong>Error en la generación:</strong>{' '}
          {dossier.failure_reason || 'La generación con IA falló. Revisá los logs del servidor.'}
        </div>
      )}

      {drafts.length > 0 && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: "#0c4a6e" }}>{drafts.length} borrador{drafts.length > 1 ? "es" : ""} generado{drafts.length > 1 ? "s" : ""}:</span>{" "}
          {drafts.map((d, i) => (
            <Link key={d.id} to={`/posts/${d.slug}`} style={{ color: "#0369a1", marginLeft: i > 0 ? 8 : 4 }}>{d.title}</Link>
          ))}
        </div>
      )}

      {isReady && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, alignItems: "start" }}>
          {/* Story Builder */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🎬 Story Builder</h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#9ca3af" }}>
                  Elegí un ángulo editorial → Generá el artículo → Revisá → Editá
                </p>
              </div>
              <button onClick={handleRefreshAngles} disabled={refreshing || !!generating}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>
                {refreshing ? "⟳ Generando…" : "⟳ Nuevos ángulos"}
              </button>
            </div>

            {angles.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
                <p>Sin ángulos. Hacé clic en "Nuevos ángulos" para generarlos.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {angles.map(angle => (
                  <AngleCard key={angle.id} angle={angle}
                    onGenerate={handleGenerate} onRegenerate={handleRegenerate}
                    generating={generating} regenerating={regenerating} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: dossier info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {dossier.executive_summary && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>📋 Resumen ejecutivo</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{dossier.executive_summary}</p>
              </div>
            )}

            {(() => {
              const facts = Array.isArray(dossier.verified_facts) ? dossier.verified_facts : [];
              return facts.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>✅ Hechos verificados</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {facts.map((f, i) => <li key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 5, lineHeight: 1.5 }}>{f}</li>)}
                  </ul>
                </div>
              );
            })()}

            {(() => {
              const kw = Array.isArray(dossier.seo_keywords) ? dossier.seo_keywords : [];
              const hl = Array.isArray(dossier.suggested_headlines) ? dossier.suggested_headlines : [];
              const cats = Array.isArray(dossier.suggested_categories) ? dossier.suggested_categories : [];
              const tags = Array.isArray(dossier.suggested_tags) ? dossier.suggested_tags : [];
              if (!kw.length && !hl.length) return null;
              return (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>🔍 Guía SEO</h3>
                  {kw.length > 0 && <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 5, textTransform: "uppercase" }}>Keywords</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {kw.map(k => <span key={k} style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 20 }}>{k}</span>)}
                    </div>
                  </>}
                  {cats.length > 0 && <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 5, textTransform: "uppercase" }}>Categorías</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {cats.map(c => <span key={c} style={{ fontSize: 11, background: "#f3e8ff", color: "#7c3aed", padding: "2px 8px", borderRadius: 20 }}>{c}</span>)}
                    </div>
                  </>}
                  {tags.length > 0 && <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 5, textTransform: "uppercase" }}>Tags</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {tags.map(t => <span key={t} style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 20 }}>#{t}</span>)}
                    </div>
                  </>}
                  {hl.length > 0 && <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 5, textTransform: "uppercase" }}>Titulares sugeridos</div>
                    {hl.map((h, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#374151", padding: "6px 8px", marginBottom: 3, background: i === 0 ? "#fef9c3" : "#f9fafb", borderRadius: 6 }}>
                        {i === 0 && <span style={{ fontSize: 9, background: "#fde047", color: "#854d0e", padding: "1px 5px", borderRadius: 10, marginRight: 5 }}>★</span>}
                        {h}
                      </div>
                    ))}
                  </>}
                </div>
              );
            })()}

            {dossier.hero_image_prompt && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>🖼️ Hero Image Prompt</h3>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontStyle: "italic", lineHeight: 1.6 }}>{dossier.hero_image_prompt}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {preview && (
        <PreviewModal
          draft={preview.draft}
          angle={preview.angle}
          onClose={() => setPreview(null)}
          onEdit={handleEditDraft}
        />
      )}
    </div>
  );
}
