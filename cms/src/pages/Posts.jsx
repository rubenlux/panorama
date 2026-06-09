import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson, getToken, pickItems, resolveUrl } from "../api.js";
import { jwtDecode } from "jwt-decode";
import { FiEdit2, FiTrash2, FiSearch, FiRefreshCw, FiPlus } from "react-icons/fi";

// Utility for formatting dates
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function Badge({ status }) {
  const isPub = status === "published";
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: isPub ? "#22c55e" : "#9ca3af", // Strong green or Gray
        color: "white",
        border: "none",
      }}
    >
      {isPub ? "Publicado" : "Borrador"}
    </span>
  );
}

export default function Posts() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("published"); // Default to published
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [authors, setAuthors] = useState([]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("reader");

  useEffect(() => {
    try {
      const token = getToken();
      if (token) setRole(jwtDecode(token).role);
    } catch (e) { }
  }, []);

  const isAdmin = role === "admin";

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      // If status is empty, we might want to fetch all. 
      // Adjust backend if needed, or send both.
      // For now, let's assume backend handles text optional or allow "all"
      // But current backend defaults to "draft". Let's fix backend to allow "all" or handle efficiently.
      // We will send status only if selected.
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (authorId) qs.set("author_id", authorId);

      // Let's ask for a higher limit for the table
      qs.set("limit", "50");

      const data = await apiJson(`/articles/admin/list?${qs.toString()}`, { auth: true });
      setItems(pickItems(data));
    } catch (e) {
      setErr(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(slug) {
    if (!confirm("¿Estás seguro de que deseas eliminar esta entrada?")) return;
    try {
      await apiJson(`/articles/${slug}`, { method: "DELETE", auth: true });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  useEffect(() => {
    load();
    // Fetch Authors for filter
    apiJson("/users?role=editor", { auth: true }).then(data => {
      setAuthors(data.items || []); // Assuming users endpoint exists or similar
    }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, authorId, dateFrom, dateTo]); // Reload when filter changes

  const clearFilters = () => {
    setQ("");
    setStatus("published");
    setDateFrom("");
    setDateTo("");
    setAuthorId("");
    load(); // Force reload if deps don't catch (they should)
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Top Bar: Title + Breadcrumbs/Actions if needed */}
      <div className="responsive-stack" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111827" }}>Entradas</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>Gestiona tus artículos y noticias.</p>
        </div>
        <div className="responsive-stack" style={{ display: "flex", gap: 10 }}>
          <button
            onClick={load}
            className="full-width-mobile"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "8px 16px", background: "white", border: "1px solid #d1d5db",
              borderRadius: 8, cursor: "pointer", fontWeight: 500, color: "#374151"
            }}
          >
            <FiRefreshCw />
            Refrescar
          </button>
          <Link
            to="/posts/new"
            className="full-width-mobile"
            style={{
              padding: "8px 16px",
              background: "#2563eb",
              color: "white",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
              display: "flex", alignItems: "center", justifyCenter: "center", gap: 6
            }}
          >
            <FiPlus /> Crear Entrada
          </Link>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="responsive-stack" style={{
        background: "white", padding: 16, borderRadius: "12px 12px 0 0",
        borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, alignItems: "center",
        flexWrap: "wrap",
      }}>
        {/* Search */}
        <div className="full-width-mobile" style={{ position: "relative", width: 250, display: "flex", alignItems: "center" }}>
          <FiSearch style={{ position: "absolute", left: 12, color: "#9ca3af" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Buscar por título..."
            style={{
              width: "100%", padding: "10px 12px 10px 36px", borderRadius: 8,
              border: "1px solid #d1d5db", fontSize: 13, outline: "none"
            }}
          />
        </div>

        {/* Filters Group */}
        <div className="responsive-stack" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Date From */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="full-width-mobile"
              style={{ padding: "8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none", color: "#374151" }}
            />
          </div>

          {/* Date To */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="full-width-mobile"
              style={{ padding: "8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none", color: "#374151" }}
            />
          </div>

          {/* Author Select */}
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            className="full-width-mobile"
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db",
              fontSize: 13, background: "white", cursor: "pointer", outline: "none", color: "#374151"
            }}
          >
            <option value="">Todos los autores</option>
            {authors.map(u => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>

          {/* Status Select */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="full-width-mobile"
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db",
              fontSize: 13, background: "white", cursor: "pointer", outline: "none", color: "#374151"
            }}
          >
            <option value="">Todos los estados</option>
            <option value="published">Publicados</option>
            <option value="draft">Borradores</option>
          </select>
        </div>

        {/* Clear Filters */}
        {(q || dateFrom || dateTo || authorId || status !== "published") && (
          <button
            onClick={clearFilters}
            style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}
          >
            Borrar Filtros
          </button>
        )}

        <div style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
          {items.length} resultados
        </div>
      </div>



      {/* Table Area */}
      <div className="horizontal-scroll" style={{ background: "white", borderRadius: "0 0 12px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        {err ? <div style={{ padding: 20, color: "crimson" }}>Error: {err}</div> : null}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 800 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>ID</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Imagen</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Nombre</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Categorías</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Autor</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Fecha</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280" }}>Estado</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, color: "#6b7280", textAlign: "right" }}>Operaciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: 30, textAlign: "center" }}>Cargando...</td></tr>
            ) : null}

            {!loading && items.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: 30, textAlign: "center", color: "#6b7280" }}>No se encontraron entradas.</td></tr>
            ) : null}

            {items.map((item, idx) => {
              const imgUrl = item.image ? resolveUrl(item.image) : null;
              // Parse categories: expecting an array of objects {name, slug} or strings
              // The backend query we wrote returns json_agg of {name, slug}
              let cats = [];
              if (Array.isArray(item.categories)) {
                cats = item.categories;
              }

              return (
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6", transition: "background 0.2s" }} className="hover-row">
                  <td style={{ padding: 16, color: "#6b7280" }}>
                    {/* Short ID or just index for reference */}
                    {item.id ? item.id.substring(0, 4) : idx + 1}
                  </td>
                  <td style={{ padding: 16 }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: 6, background: "#f3f4f6",
                      overflow: "hidden", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: 20, opacity: 0.3 }}>📷</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: 16 }}>
                    <Link to={`/posts/${item.slug}`} style={{ fontWeight: 600, color: "#111827", textDecoration: "none", display: "block", marginBottom: 4 }}>
                      {item.title}
                    </Link>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontFamily: "monospace" }}>/{item.slug}</div>
                  </td>
                  <td style={{ padding: 16 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cats.length > 0 ? cats.map((c, i) => (
                        <span key={i} style={{ fontSize: 12, color: "#4b5563", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
                          {c.name || c}
                        </span>
                      )) : <span style={{ color: "#d1d5db" }}>-</span>}
                    </div>
                  </td>
                  <td style={{ padding: 16, color: "#4b5563" }}>
                    {item.author_email || "Admin"}
                  </td>
                  <td style={{ padding: 16, color: "#4b5563" }}>
                    {formatDate(item.created_at)}
                  </td>
                  <td style={{ padding: 16 }}>
                    <Badge status={item.status} />
                  </td>
                  <td style={{ padding: 16, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Link
                        to={`/posts/${item.slug}`}
                        style={{
                          padding: 8, background: "#3b82f6", color: "white", borderRadius: 6, display: "inline-flex",
                          alignItems: "center", justifyContent: "center", transition: "0.2s", textDecoration: "none"
                        }}
                        title="Editar"
                      >
                        <FiEdit2 />
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={() => deletePost(item.slug)}
                          style={{
                            padding: 8, background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", display: "inline-flex",
                            alignItems: "center", justifyContent: "center", transition: "0.2s"
                          }}
                          title="Eliminar"
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 10 }}>
        <button disabled style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "#f97316", color: "white", cursor: "pointer", opacity: 0.5 }}>Anterior</button>
        <button disabled style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "#f97316", color: "white", cursor: "pointer", opacity: 0.5 }}>Siguiente</button>
      </div>
    </div >
  );
}
