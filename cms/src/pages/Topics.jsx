import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../api.js";

const COVERAGE_OPTIONS = [
  { value: "international", label: "Internacional" },
  { value: "national",      label: "Nacional" },
  { value: "regional",      label: "Regional" },
  { value: "local",         label: "Local" },
];

const REGIONS = [
  { value: "",           label: "Sin región específica" },
  { value: "argentina",  label: "Argentina" },
  { value: "nea",        label: "NEA" },
  { value: "formosa",    label: "Formosa" },
  { value: "chaco",      label: "Chaco" },
  { value: "corrientes", label: "Corrientes" },
  { value: "misiones",   label: "Misiones" },
];

const COVERAGE_COLOR = {
  international: { bg: "#dbeafe", color: "#1d4ed8" },
  national:      { bg: "#dcfce7", color: "#166534" },
  regional:      { bg: "#fef9c3", color: "#854d0e" },
  local:         { bg: "#f3e8ff", color: "#6b21a8" },
};

function TopicCard({ topic, onClick }) {
  const cov = COVERAGE_COLOR[topic.coverage_scope] || COVERAGE_COLOR.national;
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, cursor: "pointer", transition: "box-shadow .15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111" }}>{topic.name}</h3>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: cov.bg, color: cov.color, whiteSpace: "nowrap", marginLeft: 8 }}>
          {COVERAGE_OPTIONS.find(c => c.value === topic.coverage_scope)?.label || topic.coverage_scope}
        </span>
      </div>
      {topic.description && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
          {topic.description.slice(0, 120)}{topic.description.length > 120 ? "…" : ""}
        </p>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {topic.category && <span style={{ fontSize: 12, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 20 }}>{topic.category}</span>}
        {topic.region   && <span style={{ fontSize: 12, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 20 }}>📍 {topic.region}</span>}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
        <Stat label="Artículos"     value={topic.article_count  || 0} />
        <Stat label="Investigaciones" value={topic.research_count || 0} />
        <Stat label="Entidades"     value={topic.entity_count   || 0} />
        <Stat label="Importancia"   value={parseFloat(topic.importance_score || 0).toFixed(1)} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{label}</div>
    </div>
  );
}

const EMPTY_FORM = { name: "", description: "", category: "", region: "", coverage_scope: "national", importance_score: 0 };

export default function Topics() {
  const navigate = useNavigate();
  const [topics, setTopics]       = useState([]);
  const [trending, setTrending]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [filterRegion, setFilterRegion]     = useState("");
  const [filterCoverage, setFilterCoverage] = useState("");
  const [search, setSearch]       = useState("");
  const [tab, setTab]             = useState("todos"); // todos | trending

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRegion)   params.set("region", filterRegion);
      if (filterCoverage) params.set("coverage_scope", filterCoverage);
      if (search)         params.set("search", search);
      const [t, tr] = await Promise.all([
        apiJson(`/topics?${params}`, { auth: true }),
        apiJson("/topics/trending?limit=8", { auth: true }),
      ]);
      setTopics(t);
      setTrending(tr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterRegion, filterCoverage, search]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const topic = await apiJson("/topics", { method: "POST", auth: true, body: form });
      setShowModal(false);
      setForm(EMPTY_FORM);
      navigate(`/topics/${topic.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  const displayed = tab === "trending" ? trending : topics;

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>🗂️ Topic Intelligence</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Temas que agrupan artículos, investigaciones y entidades
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/topics/regions")}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            🗺️ Regiones
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            + Nuevo Tema
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total temas",    value: topics.length },
          { label: "Con artículos",  value: topics.filter(t => t.article_count > 0).length },
          { label: "Con research",   value: topics.filter(t => t.research_count > 0).length },
          { label: "Regionales",     value: topics.filter(t => t.region).length },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 20px", flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 4 }}>
          {["todos", "trending"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: tab === t ? "#fff" : "transparent", color: tab === t ? "#111" : "#6b7280",
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.08)" : "none" }}>
              {t === "todos" ? "Todos" : "🔥 Trending"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tema…"
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }} />
        <select value={filterCoverage} onChange={e => setFilterCoverage(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
          <option value="">Toda cobertura</option>
          {COVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
          <option value="">Toda región</option>
          {REGIONS.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: 60 }}>Cargando…</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <p>No hay temas creados todavía.</p>
          <button onClick={() => setShowModal(true)}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            Crear el primer tema
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {displayed.map(t => (
            <TopicCard key={t.id} topic={t} onClick={() => navigate(`/topics/${t.id}`)} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 520 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700 }}>Nuevo Tema</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Nombre *
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: OpenAI GPT-5, Elecciones 2027…" required
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Descripción
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="De qué trata este tema…"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Categoría
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Economía, Política…"
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Cobertura
                  <select value={form.coverage_scope} onChange={e => setForm(f => ({ ...f, coverage_scope: e.target.value }))}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
                    {COVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Región
                  <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
                    {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Importancia (0-100)
                  <input type="number" min="0" max="100" step="0.5"
                    value={form.importance_score}
                    onChange={e => setForm(f => ({ ...f, importance_score: parseFloat(e.target.value) || 0 }))}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={creating}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                  {creating ? "Creando…" : "Crear Tema"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
