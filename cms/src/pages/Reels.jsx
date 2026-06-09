import React, { useState, useEffect } from "react";
import { apiJson, pickItems, resolveUrl } from "../api";

export default function Reels() {
    const [reels, setReels] = useState([]);
    const [backgroundColor, setBackgroundColor] = useState("#1e3a8a");
    const [editingReel, setEditingReel] = useState(null);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        url: "",
        thumbnail: "",
        platform: "instagram",
        status: "active",
        order_index: 0
    });

    const [loading, setLoading] = useState(false);

    // Media Modal States
    const [showMediaModal, setShowMediaModal] = useState(false);
    const [mediaItems, setMediaItems] = useState([]);
    const [mediaTarget, setMediaTarget] = useState(null); // "url" | "thumbnail"
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folders, setFolders] = useState([]);

    useEffect(() => {
        loadData();
        loadFolders();
    }, []);

    const loadData = async () => {
        try {
            const reelsData = await apiJson("/reels/admin/list", { auth: true });
            setReels(reelsData.reels || []);

            const settingsData = await apiJson("/reels/settings", { auth: true });
            if (settingsData.settings) {
                setBackgroundColor(settingsData.settings.background_color);
            }
        } catch (e) {
            console.error("Error loading reels data:", e);
        }
    };

    const loadFolders = async () => {
        try {
            const data = await apiJson("/media/folders", { auth: true });
            setFolders(data);
        } catch (e) {
            console.error(e);
        }
    };

    const loadMedia = async (folder = null) => {
        try {
            let url = "/media";
            if (folder) url += `?folder=${folder}`;
            const data = await apiJson(url, { auth: true });
            setMediaItems(pickItems(data));
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpload = async (file, folder = "general") => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", folder);

        const token = localStorage.getItem("cms_token");
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:5001"}/media`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: fd
            });
            if (!res.ok) throw new Error("Upload failed");
            await loadMedia(currentFolder);
        } catch (e) {
            alert(e.message);
        }
    };

    const onSelectMediaItem = (url, mimeType) => {
        setShowMediaModal(false);
        if (mediaTarget === "url") {
            setFormData({ ...formData, url, platform: "local" });
        } else if (mediaTarget === "thumbnail") {
            setFormData({ ...formData, thumbnail: url });
        }
    };

    const openMediaModal = (target) => {
        setMediaTarget(target);
        setShowMediaModal(true);
        loadMedia(currentFolder);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingReel) {
                await apiJson(`/reels/${editingReel.id}`, {
                    method: "PUT",
                    auth: true,
                    body: formData
                });
            } else {
                await apiJson("/reels", {
                    method: "POST",
                    auth: true,
                    body: formData
                });
            }
            setFormData({
                title: "",
                description: "",
                url: "",
                thumbnail: "",
                platform: "instagram",
                status: "active",
                order_index: 0
            });
            setEditingReel(null);
            loadData();
        } catch (e) {
            alert("Error saving reel: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (reel) => {
        setEditingReel(reel);
        setFormData({
            title: reel.title,
            description: reel.description || "",
            url: reel.url,
            thumbnail: reel.thumbnail || "",
            platform: reel.platform,
            status: reel.status,
            order_index: reel.order_index
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que quieres eliminar este reel?")) return;
        try {
            await apiJson(`/reels/${id}`, { method: "DELETE", auth: true });
            loadData();
        } catch (e) {
            alert("Error deleting reel: " + e.message);
        }
    };

    const handleSettingsSubmit = async () => {
        try {
            await apiJson("/reels/settings", {
                method: "PUT",
                auth: true,
                body: { background_color: backgroundColor }
            });
            alert("Configuración guardada");
        } catch (e) {
            alert("Error saving settings: " + e.message);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h1>Gestión de Reels</h1>
                <div style={{ display: "flex", gap: 10, alignItems: "center", background: "white", padding: "10px 20px", borderRadius: 8, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                    <label style={{ fontWeight: "bold" }}>Color de Fondo:</label>
                    <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        style={{ border: "none", width: 40, height: 40, padding: 0, cursor: "pointer" }}
                    />
                    <button
                        onClick={handleSettingsSubmit}
                        style={{ padding: "8px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                    >
                        Guardar Color
                    </button>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 30 }}>
                {/* LIST */}
                <div style={{ background: "white", padding: 20, borderRadius: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #f1f5f9", textAlign: "left" }}>
                                <th style={{ padding: "12px 8px" }}>Info</th>
                                <th style={{ padding: "12px 8px" }}>Plataforma</th>
                                <th style={{ padding: "12px 8px" }}>Orden</th>
                                <th style={{ padding: "12px 8px" }}>Estado</th>
                                <th style={{ padding: "12px 8px" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reels.map((reel) => (
                                <tr key={reel.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={{ padding: "12px 8px" }}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                            <img src={reel.thumbnail || "https://placehold.co/50x80"} style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 4 }} />
                                            <div style={{ fontWeight: "bold" }}>{reel.title}</div>
                                        </div>
                                    </td>
                                    <td style={{ padding: "12px 8px" }}>{reel.platform}</td>
                                    <td style={{ padding: "12px 8px" }}>{reel.order_index}</td>
                                    <td style={{ padding: "12px 8px" }}>
                                        <span style={{
                                            padding: "4px 8px",
                                            borderRadius: 12,
                                            fontSize: 12,
                                            background: reel.status === "active" ? "#dcfce7" : "#fee2e2",
                                            color: reel.status === "active" ? "#166534" : "#991b1b"
                                        }}>
                                            {reel.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: "12px 8px" }}>
                                        <button onClick={() => handleEdit(reel)} style={{ marginRight: 8, background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}>Editar</button>
                                        <button onClick={() => handleDelete(reel.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>Eliminar</button>
                                    </td>
                                </tr>
                            ))}
                            {reels.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: "center", padding: 40, opacity: 0.5 }}>No hay reels configurados</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* FORM & PREVIEW */}
                <div style={{ display: "grid", gap: 20, alignSelf: "start" }}>
                    <div style={{ background: "white", padding: 25, borderRadius: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                        <h3>{editingReel ? "Editar Reel" : "Nuevo Reel"}</h3>
                        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 15, marginTop: 20 }}>
                            <div>
                                <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Título</label>
                                <input
                                    required
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                    placeholder="Ej: Robo en Bernal"
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Descripción</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd", minHeight: 60 }}
                                    placeholder="Opcional..."
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>URL del Reel o Video Local (9:16 recomendado)</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        required
                                        value={formData.url}
                                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                                        style={{ flex: 1, padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                        placeholder="https://... o selecciona de biblioteca"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => openMediaModal("url")}
                                        style={{ padding: "0 15px", background: "#f3f4f6", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
                                    >
                                        📁
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Imagen de Portada (Miniatura)</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        value={formData.thumbnail}
                                        onChange={e => setFormData({ ...formData, thumbnail: e.target.value })}
                                        style={{ flex: 1, padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                        placeholder="URL de la imagen o biblioteca"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => openMediaModal("thumbnail")}
                                        style={{ padding: "0 15px", background: "#f3f4f6", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
                                    >
                                        📁
                                    </button>
                                </div>
                                <p style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Relación 9:16 recomendada para mejor visualización.</p>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                    <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Plataforma</label>
                                    <select
                                        value={formData.platform}
                                        onChange={e => setFormData({ ...formData, platform: e.target.value })}
                                        style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                    >
                                        <option value="instagram">Instagram</option>
                                        <option value="tiktok">TikTok</option>
                                        <option value="facebook">Facebook</option>
                                        <option value="local">Video Local / Subido</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Orden</label>
                                    <input
                                        type="number"
                                        value={formData.order_index}
                                        onChange={e => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                                        style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: "bold" }}>Estado</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                                >
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo</option>
                                </select>
                            </div>

                            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{ flex: 1, padding: "12px", background: "#10b981", color: "white", border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer" }}
                                >
                                    {loading ? "Guardando..." : "Guardar Reel"}
                                </button>
                                {editingReel && (
                                    <button
                                        type="button"
                                        onClick={() => { setEditingReel(null); setFormData({ title: "", description: "", url: "", thumbnail: "", platform: "instagram", status: "active", order_index: 0 }); }}
                                        style={{ padding: "12px", background: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer" }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* REAL-TIME PREVIEW */}
                    <div style={{ background: "white", padding: 25, borderRadius: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                        <h3 style={{ marginBottom: 15 }}>Vista Previa</h3>
                        <div style={{
                            width: "100%",
                            aspectRatio: "9/16",
                            background: "#000",
                            borderRadius: 12,
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontSize: 12,
                            textAlign: "center"
                        }}>
                            {formData.url ? (
                                formData.url.includes('tiktok.com') || formData.url.includes('instagram.com') || formData.url.includes('facebook.com') ? (
                                    <iframe
                                        src={(() => {
                                            const url = formData.url;
                                            if (!url) return "";

                                            // TikTok
                                            if (url.includes('tiktok.com')) {
                                                const videoId = url.split('/video/')[1]?.split('?')[0];
                                                if (videoId) return `https://www.tiktok.com/embed/v2/${videoId}`;
                                            }

                                            // Instagram
                                            if (url.includes('instagram.com')) {
                                                const cleanUrl = url.split('?')[0].replace(/\/$/, "");
                                                return `${cleanUrl}/embed`;
                                            }

                                            // Facebook
                                            if (url.includes('facebook.com') || url.includes('fb.watch')) {
                                                return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0&t=0`;
                                            }

                                            return url;
                                        })()}
                                        style={{ width: "100%", height: "100%", border: "none" }}
                                        allowFullScreen
                                    ></iframe>
                                ) : (
                                    <video
                                        src={formData.url}
                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        controls
                                    ></video>
                                )
                            ) : (
                                <div style={{ padding: 20 }}>Ingresa una URL para ver la previsualización</div>
                            )}
                        </div>
                        {formData.title && (
                            <div style={{ marginTop: 15 }}>
                                <div style={{ fontWeight: "bold", fontSize: 14 }}>{formData.title}</div>
                                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{formData.description}</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MEDIA MODAL */}
            {showMediaModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.5)", zIndex: 9999,
                    display: "flex", justifyContent: "center", alignItems: "center"
                }}>
                    <div style={{ background: "white", width: 900, height: 600, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <div style={{ padding: 15, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0 }}>Biblioteca de Medios</h3>
                            <button onClick={() => setShowMediaModal(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
                        </div>
                        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                            <div style={{ width: 200, borderRight: "1px solid #eee", background: "#f8fafc", padding: 10 }}>
                                <button
                                    onClick={() => { setCurrentFolder(null); loadMedia(null); }}
                                    style={{ textAlign: "left", width: "100%", padding: 8, border: "none", background: !currentFolder ? "#e2e8f0" : "transparent", borderRadius: 6, cursor: "pointer", marginBottom: 5 }}
                                >
                                    📁 Todo
                                </button>
                                {folders.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => { setCurrentFolder(f.name); loadMedia(f.name); }}
                                        style={{ textAlign: "left", width: "100%", padding: 8, border: "none", background: currentFolder === f.name ? "#e2e8f0" : "transparent", borderRadius: 6, cursor: "pointer", marginBottom: 2 }}
                                    >
                                        📁 {f.name}
                                    </button>
                                ))}
                            </div>
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 15 }}>
                                <div style={{ marginBottom: 15, display: "flex", gap: 10, alignItems: "center" }}>
                                    <div style={{ position: "relative" }}>
                                        <button style={{ background: "#3b82f6", color: "white", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>Subir Archivo</button>
                                        <input
                                            type="file"
                                            accept={mediaTarget === "url" ? "video/*" : "image/*"}
                                            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], currentFolder || "general")}
                                            style={{ position: "absolute", top: 0, left: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
                                        />
                                    </div>
                                    <span style={{ fontSize: 13, color: "#666" }}>{mediaTarget === "url" ? "Sube videos verticales (9:16) para mejor resultado." : "Sube imágenes para miniatura."}</span>
                                </div>
                                <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 15 }}>
                                    {mediaItems.map(m => {
                                        const u = resolveUrl(m.url || m.public_url || m.path);
                                        const isVideo = m.mime_type?.startsWith("video/") || u.match(/\.(mp4|webm|ogg)$/i);
                                        return (
                                            <div key={m.id || u} onClick={() => onSelectMediaItem(u, m.mime_type)} style={{ border: "1px solid #eee", borderRadius: 8, padding: 5, cursor: "pointer" }}>
                                                {isVideo ? (
                                                    <div style={{ height: 100, background: "#000", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10 }}>VIDEO</div>
                                                ) : (
                                                    <img src={u} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }} />
                                                )}
                                                <div style={{ fontSize: 11, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: 4 }}>{m.filename}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
