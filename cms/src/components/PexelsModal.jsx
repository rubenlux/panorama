import React, { useState } from "react";
import { apiJson } from "../api";

export default function PexelsModal({ onClose, onSelect }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [uploading, setUploading] = useState(null); // ID of image being uploaded

    async function search(e, newSearch = false) {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const p = newSearch ? 1 : page;
            const data = await apiJson(`/media/pexels/search?q=${encodeURIComponent(query)}&page=${p}&per_page=20`, { auth: true });

            if (newSearch) {
                setResults(data.photos || []);
                setPage(2);
            } else {
                setResults(prev => [...prev, ...(data.photos || [])]);
                setPage(prev => prev + 1);
            }
        } catch (err) {
            alert("Error buscando en Pexels: " + err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSelect(photo) {
        if (uploading) return;
        setUploading(photo.id);

        try {
            // Upload to our server
            const res = await apiJson("/media/pexels/upload", {
                method: "POST",
                auth: true,
                body: {
                    url: photo.src.large2x || photo.src.large,
                    photographer: photo.photographer,
                    photographer_url: photo.photographer_url,
                    alt: photo.alt
                }
            });

            if (res.success && res.media) {
                // Return the local URL
                onSelect(res.media.url, res.media.mime_type, res.media.filename);
            } else {
                throw new Error("Error en subida");
            }
        } catch (e) {
            alert("Falló la descarga: " + e.message);
            setUploading(null);
        }
    }

    return (
        <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)", zIndex: 10000,
            display: "flex", justifyContent: "center", alignItems: "center",
            backdropFilter: "blur(4px)"
        }}>
            <div style={{
                background: "white", width: 900, height: "80vh", borderRadius: 16,
                display: "flex", flexDirection: "column", overflow: "hidden",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}>
                {/* Header */}
                <div style={{ padding: 20, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>📸</span>
                        <h3 style={{ margin: 0, color: "#0f172a" }}>Pexels Stock Photos</h3>
                    </div>
                    <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 24, color: "#64748b" }}>✕</button>
                </div>

                {/* Search Bar */}
                <div style={{ padding: 20, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <form onSubmit={(e) => search(e, true)} style={{ display: "flex", gap: 10 }}>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar fotos gratis (ej: Negocios, Paisaje...)"
                            style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 16 }}
                            autoFocus
                        />
                        <button type="submit" disabled={loading} style={{ background: "#2563EB", color: "white", padding: "0 24px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer" }}>
                            {loading ? "Buscando..." : "Buscar"}
                        </button>
                    </form>
                </div>

                {/* Grid */}
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                        {results.map(photo => (
                            <div key={photo.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", cursor: "pointer", group: "item" }} onClick={() => handleSelect(photo)}>
                                <img
                                    src={photo.src.medium}
                                    alt={photo.alt}
                                    style={{ width: "100%", height: 140, objectFit: "cover", display: "block", transition: "transform 0.2s" }}
                                />
                                <div style={{
                                    position: "absolute", bottom: 0, left: 0, right: 0,
                                    background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
                                    padding: "20px 8px 8px", color: "white", fontSize: 11
                                }}>
                                    {photo.photographer}
                                </div>
                                {uploading === photo.id && (
                                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563EB", fontWeight: "bold" }}>
                                        Descargando...
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {results.length === 0 && !loading && (
                        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                            {query ? "No se encontraron resultados" : "Escribe algo para buscar"}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div style={{ textAlign: "center", marginTop: 30, marginBottom: 20 }}>
                            <button
                                onClick={() => search(null, false)}
                                disabled={loading}
                                style={{ padding: "10px 20px", borderRadius: 20, border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontWeight: 600, color: "#475569" }}
                            >
                                {loading ? "Cargando..." : "Cargar más fotos"}
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ padding: "10px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b", textAlign: "right" }}>
                    Photos provided by Pexels
                </div>
            </div>
        </div>
    );
}
