import React, { useEffect, useState } from "react";
import { apiJson, pickItems } from "../api.js";

export default function Categories() {
    const [items, setItems] = useState([]);
    const [name, setName] = useState("");
    const [err, setErr] = useState("");
    const [msg, setMsg] = useState("");

    async function load() {
        setErr("");
        try {
            const data = await apiJson("/categories");
            setItems(pickItems(data));
        } catch (e) {
            setErr(e.message);
        }
    }

    useEffect(() => { load(); }, []);

    const [color, setColor] = useState("#3b82f6");

    async function updateCategory(id, updates) {
        setErr(""); setMsg("");
        try {
            const currentItem = items.find(i => i.id === id);
            await apiJson(`/categories/${id}`, {
                method: "PUT",
                body: { ...currentItem, ...updates },
                auth: true
            });
            await load();
        } catch (e) {
            setErr(e.message);
        }
    }

    async function add(e) {
        e.preventDefault();
        setErr(""); setMsg("");
        if (!name.trim()) return;

        try {
            await apiJson("/categories", {
                method: "POST",
                body: { name, color, show_in_menu: true },
                auth: true
            });
            setName("");
            setColor("#3b82f6");
            setMsg("Categoría creada");
            await load();
        } catch (e) {
            setErr(e.message);
        }
    }

    async function remove(id) {
        if (!confirm("¿Eliminar categoría?")) return;
        setErr(""); setMsg("");
        try {
            await apiJson(`/categories/${id}`, { method: "DELETE", auth: true });
            await load();
        } catch (e) {
            setErr(e.message);
        }
    }

    return (
        <div style={{ padding: 20 }}>
            {/* Header */}
            <div style={{ marginBottom: 30 }}>
                <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>Categorías y Etiquetas</h1>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Organización del contenido, colores y etiquetas del sitio.</p>
            </div>

            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr", gap: 30, alignItems: "start" }}>

                {/* Create Form */}
                <div style={{ background: "white", padding: 24, borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Nueva Categoría</div>
                    <form onSubmit={add}>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>Nombre</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Tecnología"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, outline: "none", background: "#f8fafc" }}
                            />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>Color Identificativo</label>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    style={{ width: 50, height: 40, border: "none", borderRadius: 8, cursor: 'pointer' }}
                                />
                                <input
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            style={{ width: "100%", padding: "12px", background: "#2563EB", color: "white", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                        >
                            Crear Categoría
                        </button>
                    </form>
                    {err && <div style={{ color: "#ef4444", marginTop: 12, fontSize: 13, background: "#fef2f2", padding: 8, borderRadius: 6 }}>⚠️ {err}</div>}
                    {msg && <div style={{ color: "#16a34a", marginTop: 12, fontSize: 13, background: "#dcfce7", padding: 8, borderRadius: 6 }}>✅ {msg}</div>}
                </div>

                {/* Categories Table */}
                <div className="horizontal-scroll" style={{ background: "white", borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 600 }}>
                        <thead style={{ background: "#f8fafc" }}>
                            <tr>
                                <th style={{ textAlign: "left", padding: "16px 20px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Categoría</th>
                                <th style={{ textAlign: "center", padding: "16px 20px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>En Menú</th>
                                <th style={{ textAlign: "center", padding: "16px 20px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Es Etiqueta</th>
                                <th style={{ textAlign: "center", padding: "16px 20px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Color</th>
                                <th style={{ textAlign: "right", padding: "16px 20px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((c) => (
                                <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                                    <td style={{ padding: "16px 20px" }}>
                                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{c.name}</div>
                                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.slug}</div>
                                    </td>
                                    <td style={{ padding: "16px 20px", textAlign: "center" }}>
                                        <input
                                            type="checkbox"
                                            checked={c.show_in_menu}
                                            onChange={(e) => updateCategory(c.id, { show_in_menu: e.target.checked })}
                                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ padding: "16px 20px", textAlign: "center" }}>
                                        <input
                                            type="checkbox"
                                            checked={c.is_tag}
                                            onChange={(e) => updateCategory(c.id, { is_tag: e.target.checked })}
                                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ padding: "16px 20px", textAlign: "center" }}>
                                        <input
                                            type="color"
                                            value={c.color || '#3b82f6'}
                                            onChange={(e) => updateCategory(c.id, { color: e.target.value })}
                                            style={{ width: 30, height: 30, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                                        <button
                                            onClick={() => remove(c.id)}
                                            style={{ color: "#ef4444", background: "#fef2f2", border: "none", padding: "6px 12px", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
                                        >
                                            Eliminar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>No hay categorías definidas.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
