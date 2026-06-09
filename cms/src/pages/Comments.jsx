import React, { useEffect, useState } from "react";
import { apiJson, pickItems } from "../api.js";

export default function Comments() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const data = await apiJson(`/admin/comments?status=${encodeURIComponent(status)}`, { auth: true });
      setItems(pickItems(data));
    } catch (e) {
      setErr(e.message);
      setItems([]);
    }
  }

  useEffect(() => { load(); }, [status]);

  async function setCommentStatus(id, nextStatus) {
    try {
      await apiJson(`/admin/comments/${id}`, { method: "PATCH", body: { status: nextStatus }, auth: true });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 25 }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>Comentarios</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Moderación de la comunidad.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: 'center' }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, fontWeight: 600, color: "#334155", outline: "none" }}
          >
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
            <option value="spam">Spam</option>
          </select>
          <button
            onClick={load}
            style={{ padding: "10px 16px", borderRadius: 10, background: "white", border: "1px solid #cbd5e1", fontSize: 14, fontWeight: 600, color: "#334155", cursor: "pointer" }}
          >
            Refrescar
          </button>
        </div>
      </div>

      {err && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 16, borderRadius: 12, marginBottom: 20 }}>{err}</div>}

      <div style={{ background: "white", borderRadius: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={{ textAlign: "left", padding: "16px 24px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Autor</th>
              <th style={{ textAlign: "left", padding: "16px 24px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Comentario</th>
              <th style={{ textAlign: "left", padding: "16px 24px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Artículo</th>
              <th style={{ textAlign: "right", padding: "16px 24px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "20px 24px", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.author_name || c.authorName || "Anónimo"}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{new Date(c.created_at || Date.now()).toLocaleDateString()}</div>
                </td>
                <td style={{ padding: "20px 24px", verticalAlign: "top", maxWidth: 500 }}>
                  <div style={{ color: "#334155", lineHeight: 1.6, background: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 14 }}>
                    {c.body}
                  </div>
                </td>
                <td style={{ padding: "20px 24px", verticalAlign: "top" }}>
                  <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, display: "inline-block" }}>
                    {c.article_title || c.articleTitle || "Ver Artículo"}
                  </div>
                </td>
                <td style={{ padding: "20px 24px", verticalAlign: "top", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {status !== 'approved' && (
                      <button
                        onClick={() => setCommentStatus(c.id, "approved")}
                        style={{ background: "#dcfce7", color: "#166534", border: "none", padding: "8px 12px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                      >
                        Aprobar
                      </button>
                    )}
                    {status !== 'rejected' && (
                      <button
                        onClick={() => setCommentStatus(c.id, "rejected")}
                        style={{ background: "#fee2e2", color: "#991b1b", border: "none", padding: "8px 12px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                      >
                        Rechazar
                      </button>
                    )}
                    {status !== 'spam' && (
                      <button
                        onClick={() => setCommentStatus(c.id, "spam")}
                        style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 12px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                      >
                        Spam
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="4" style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>No hay comentarios en esta sección</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
