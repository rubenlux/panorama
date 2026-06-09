import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiJson } from "../api.js";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const COVERAGE_OPTIONS = [
  { value: "international", label: "Internacional" },
  { value: "national",      label: "Nacional" },
  { value: "regional",      label: "Regional" },
  { value: "local",         label: "Local" },
];

const REGIONS = [
  { value: "",           label: "Sin región" },
  { value: "argentina",  label: "Argentina" },
  { value: "nea",        label: "NEA" },
  { value: "formosa",    label: "Formosa" },
  { value: "chaco",      label: "Chaco" },
  { value: "corrientes", label: "Corrientes" },
  { value: "misiones",   label: "Misiones" },
];

const ENTITY_COLOR = {
  person:       { bg: "#dbeafe", color: "#1d4ed8" },
  company:      { bg: "#dcfce7", color: "#166534" },
  product:      { bg: "#fef3c7", color: "#92400e" },
  organization: { bg: "#ede9fe", color: "#6d28d9" },
  location:     { bg: "#fce7f3", color: "#9d174d" },
};

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
      fontWeight: 600, fontSize: 14,
      background: active ? "#2563eb" : "#f3f4f6",
      color: active ? "#fff" : "#374151",
    }}>{children}</button>
  );
}

export default function TopicDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState("articles");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [editForm, setEditForm] = useState({});

  // Link article state
  const [articleSearch, setArticleSearch] = useState("");
  const [articleResults, setArticleResults] = useState([]);
  const [searchingArticles, setSearchingArticles] = useState(false);

  // Link research state
  const [researchList, setResearchList] = useState([]);
  const [loadingResearch, setLoadingResearch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await apiJson(`/topics/${id}`, { auth: true });
      setTopic(t);
      setEditForm({
        name: t.name, description: t.description || "",
        category: t.category || "", region: t.region || "",
        coverage_scope: t.coverage_scope || "national",
        importance_score: t.importance_score || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Search articles for linking
  useEffect(() => {
    if (!articleSearch.trim()) { setArticleResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingArticles(true);
      try {
        const res = await apiJson(`/articles?search=${encodeURIComponent(articleSearch)}&limit=10`, { auth: true });
        const items = Array.isArray(res) ? res : (res.articles || res.data || []);
        setArticleResults(items);
      } catch { setArticleResults([]); } finally { setSearchingArticles(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [articleSearch]);

  async function loadResearch() {
    setLoadingResearch(true);
    try {
      const res = await apiJson("/research/topics?limit=50", { auth: true });
      setResearchList(Array.isArray(res) ? res : (res.topics || []));
    } catch { } finally { setLoadingResearch(false); }
  }

  useEffect(() => { if (tab === "research") loadResearch(); }, [tab]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiJson(`/topics/${id}`, { method: "PATCH", auth: true, body: editForm });
      setTopic(t => ({ ...t, ...updated }));
      setEditing(false);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el tema "${topic.name}"?`)) return;
    await apiJson(`/topics/${id}`, { method: "DELETE", auth: true });
    navigate("/topics");
  }

  async function linkArticle(article) {
    const already = topic.articles.some(a => a.id === article.id);
    if (already) return;
    await apiJson(`/topics/${id}/articles`, { method: "POST", auth: true, body: { article_id: article.id } });
    setArticleSearch("");
    setArticleResults([]);
    load();
  }

  async function unlinkArticle(articleId) {
    await apiJson(`/topics/${id}/articles/${articleId}`, { method: "DELETE", auth: true });
    load();
  }

  async function linkResearch(rt) {
    const already = topic.research.some(r => r.id === rt.id);
    if (already) return;
    await apiJson(`/topics/${id}/research`, { method: "POST", auth: true, body: { research_topic_id: rt.id } });
    load();
  }

  if (loading) return <div style={{ padding: 32, color: "#9ca3af" }}>Cargando…</div>;
  if (!topic)  return <div style={{ padding: 32, color: "#ef4444" }}>Tema no encontrado</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>
        <Link to="/topics" style={{ color: "#6b7280", textDecoration: "none" }}>← Temas</Link>
      </div>

      {/* Header */}
      {editing ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Editar Tema</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Nombre
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Descripción
              <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={3} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Categoría
                <input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Cobertura
                <select value={editForm.coverage_scope} onChange={e => setEditForm(f => ({ ...f, coverage_scope: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
                  {COVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Región
                <select value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}>
                  {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Importancia
                <input type="number" min="0" max="100" step="0.5"
                  value={editForm.importance_score}
                  onChange={e => setEditForm(f => ({ ...f, importance_score: parseFloat(e.target.value) || 0 }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(false)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{topic.name}</h1>
              {topic.description && <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>{topic.description}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {topic.category      && <span style={{ fontSize: 12, background: "#f3f4f6", padding: "3px 10px", borderRadius: 20, color: "#374151" }}>{topic.category}</span>}
                {topic.region        && <span style={{ fontSize: 12, background: "#f3f4f6", padding: "3px 10px", borderRadius: 20, color: "#374151" }}>📍 {topic.region}</span>}
                {topic.coverage_scope && <span style={{ fontSize: 12, background: "#dbeafe", padding: "3px 10px", borderRadius: 20, color: "#1d4ed8" }}>{COVERAGE_OPTIONS.find(c => c.value === topic.coverage_scope)?.label}</span>}
                <span style={{ fontSize: 12, background: "#fef9c3", padding: "3px 10px", borderRadius: 20, color: "#854d0e" }}>
                  Importancia: {parseFloat(topic.importance_score || 0).toFixed(1)}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(true)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Editar
              </button>
              <button onClick={handleDelete}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Eliminar
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 20, marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            {[
              { label: "Artículos",      value: topic.articles?.length  || 0 },
              { label: "Investigaciones",value: topic.research?.length  || 0 },
              { label: "Entidades",      value: topic.entities?.length  || 0 },
              { label: "Eventos",        value: topic.events?.length    || 0 },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <TabButton active={tab === "articles"}  onClick={() => setTab("articles")}>📰 Artículos ({topic.articles?.length || 0})</TabButton>
        <TabButton active={tab === "research"}  onClick={() => setTab("research")}>🔬 Investigaciones ({topic.research?.length || 0})</TabButton>
        <TabButton active={tab === "entities"}  onClick={() => setTab("entities")}>🏷️ Entidades ({topic.entities?.length || 0})</TabButton>
        <TabButton active={tab === "timeline"}  onClick={() => setTab("timeline")}>⏱️ Timeline ({topic.events?.length || 0})</TabButton>
      </div>

      {/* ARTICLES TAB */}
      {tab === "articles" && (
        <div>
          {/* Search to link */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, position: "relative" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#374151" }}>Vincular artículo</p>
            <input value={articleSearch} onChange={e => setArticleSearch(e.target.value)}
              placeholder="Buscar por título…"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
            {searchingArticles && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Buscando…</div>}
            {articleResults.length > 0 && (
              <div style={{ position: "absolute", left: 16, right: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 50, maxHeight: 300, overflowY: "auto" }}>
                {articleResults.map(a => (
                  <div key={a.id} onClick={() => linkArticle(a)}
                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 14 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                    <span style={{ fontWeight: 600 }}>{a.title}</span>
                    <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: 8 }}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* List */}
          {(topic.articles || []).length === 0
            ? <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Sin artículos vinculados</div>
            : (topic.articles || []).map(a => (
              <div key={a.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {a.category_name} · {a.status} · {a.published_at ? format(new Date(a.published_at), "d MMM yyyy", { locale: es }) : "—"}
                  </div>
                </div>
                <button onClick={() => unlinkArticle(a.id)}
                  style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Desvincular
                </button>
              </div>
            ))}
        </div>
      )}

      {/* RESEARCH TAB */}
      {tab === "research" && (
        <div>
          {/* Already linked */}
          {(topic.research || []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "0 0 10px" }}>Vinculadas</p>
              {topic.research.map(r => (
                <div key={r.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                  {r.executive_summary && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{r.executive_summary?.slice(0, 120)}…</p>}
                  <span style={{ fontSize: 11, background: r.status === "completed" ? "#dcfce7" : "#fef3c7", color: r.status === "completed" ? "#166534" : "#92400e", padding: "2px 8px", borderRadius: 20, display: "inline-block", marginTop: 6 }}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
          {/* Link new */}
          <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "0 0 10px" }}>Agregar investigación</p>
          {loadingResearch ? <div style={{ color: "#9ca3af" }}>Cargando…</div> : (
            researchList.filter(r => !topic.research.some(tr => tr.id === r.id)).map(r => (
              <div key={r.id} style={{ background: "#fff", border: "1px dashed #e5e7eb", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{r.status}</span>
                </div>
                <button onClick={() => linkResearch(r)}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  + Vincular
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ENTITIES TAB */}
      {tab === "entities" && (
        <div>
          {(topic.entities || []).length === 0
            ? <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Sin entidades vinculadas</div>
            : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {topic.entities.map(e => {
                  const ec = ENTITY_COLOR[e.entity_type] || ENTITY_COLOR.organization;
                  return (
                    <div key={e.id} style={{ background: ec.bg, borderRadius: 10, padding: "10px 16px", minWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ec.color }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: ec.color, opacity: 0.8, textTransform: "capitalize" }}>{e.entity_type}</div>
                      {e.description && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#374151" }}>{e.description?.slice(0, 80)}…</p>}
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Prominencia: {parseFloat(e.prominence_score || 1).toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* TIMELINE TAB */}
      {tab === "timeline" && (
        <div>
          {(topic.events || []).length === 0
            ? <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Sin eventos en el timeline</div>
            : (
              <div style={{ position: "relative", paddingLeft: 24 }}>
                <div style={{ position: "absolute", left: 8, top: 0, bottom: 0, width: 2, background: "#e5e7eb" }} />
                {topic.events.map((ev, i) => (
                  <div key={i} style={{ marginBottom: 20, position: "relative" }}>
                    <div style={{ position: "absolute", left: -20, top: 4, width: 10, height: 10, borderRadius: "50%", background: "#2563eb", border: "2px solid #fff" }} />
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                        {ev.event_date ? format(new Date(ev.event_date), "d MMM yyyy", { locale: es }) : "Fecha no especificada"} · {ev.entity_name}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                      {ev.summary && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{ev.summary}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
