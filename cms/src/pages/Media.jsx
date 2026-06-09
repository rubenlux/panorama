import React, { useEffect, useState } from "react";
import { apiJson, apiUpload, pickItems, resolveUrl } from "../api.js";
import { Folder, Trash2, Upload, Plus, ArrowLeft, Image as ImageIcon } from "lucide-react";

export default function Media() {
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // null means root (folder view)
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Load folders
  async function loadFolders() {
    try {
      const data = await apiJson("/media/folders", { auth: true });
      setFolders(data);
    } catch (e) {
      console.error(e);
    }
  }

  // Load media items for current folder
  async function loadMedia() {
    setLoading(true);
    setErr("");
    try {
      const folderName = currentFolder?.name || "general";
      const data = await apiJson(`/media?folder=${folderName}`, { auth: true });
      setItems(pickItems(data));
    } catch (e) {
      setErr(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (currentFolder) {
      loadMedia();
    } else {
      setItems([]);
    }
  }, [currentFolder]);

  async function handleUpload(file) {
    if (!currentFolder) {
      setErr("Please select a folder first");
      return;
    }
    setErr(""); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", currentFolder.name);

      // using raw fetch to pass extra body fields if apiUpload doesn't support generic body with file easily
      // modifying apiUpload call or using apiUpload with manual FormData management is possible but apiUpload builds FormData internally. 
      // Let's assume apiUpload needs patch or we use raw logic.
      // Wait, apiUpload takes 'file' and puts it in 'file'. It doesn't optionally take other fields easily in current helper. 
      // Let's use apiJson-like approach or just direct fetch for specific multipart needs.
      // actually let's just use the helper if we can, but current helper apiUpload only appends file. 
      // I'll implement a custom upload here to send 'folder'.

      const token = localStorage.getItem("cms_token");
      const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:5000"}/media`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setMsg("Subida OK");
      loadMedia(); // refresh
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este archivo?")) return;
    try {
      await apiJson(`/media/${id}`, { method: "DELETE", auth: true });
      setMsg("Eliminado");
      loadMedia();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleCreateFolder() {
    const name = prompt("Nombre de la nueva carpeta:");
    if (!name) return;
    try {
      await apiJson("/media/folders", { method: "POST", body: { name }, auth: true });
      loadFolders();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDeleteFolder(f) {
    if (!confirm(`¿Eliminar carpeta ${f.name}? (Debe estar vacía)`)) return;
    try {
      await apiJson(`/media/folders/${f.id}`, { method: "DELETE", auth: true });
      loadFolders();
    } catch (e) {
      alert(e.message);
    }
  }

  async function copyUrl(url) {
    await navigator.clipboard.writeText(url);
    setMsg("URL copiada");
    setTimeout(() => setMsg(""), 1200);
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {currentFolder ? (
            <>
              <button onClick={() => setCurrentFolder(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <ArrowLeft />
              </button>
              <span>{currentFolder.name}</span>
            </>
          ) : "Medios / Carpetas"}
        </h2>
        <div>
          {!currentFolder && (
            <button onClick={handleCreateFolder} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>
              <Plus size={16} /> Nueva Carpeta
            </button>
          )}
        </div>
      </div>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ padding: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 6, marginBottom: 12 }}>{err}</div>}

      {!currentFolder ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 20 }}>
          {folders.map(f => (
            <div key={f.id} onClick={() => setCurrentFolder(f)} style={{
              background: "white", padding: 20, borderRadius: 12, cursor: "pointer",
              border: "1px solid #eee", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              position: "relative"
            }}>
              <Folder size={48} color="#3b82f6" fill="#eff6ff" />
              <div style={{ fontWeight: 500 }}>{f.name}</div>
              {f.name !== "general" && (
                <div onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }} style={{ position: "absolute", top: 8, right: 8, padding: 4, color: "#ef4444", opacity: 0.6, cursor: "pointer" }}>
                  <Trash2 size={14} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 20, background: "white", padding: 20, borderRadius: 12, border: "2px dashed #e5e7eb", textAlign: "center" }}>
            <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Upload size={32} color="#9ca3af" />
              <span style={{ color: "#6b7280" }}>Click para subir archivos a <b>{currentFolder.name}</b></span>
              <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </label>
          </div>

          {loading ? <div>Cargando...</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 20 }}>
              {items.map((m) => {
                const url = resolveUrl(m.url || m.public_url || m.path);
                return (
                  <div key={m.id || url} style={{ background: "white", borderRadius: 12, overflow: "hidden", border: "1px solid #eee" }}>
                    <div style={{ height: 140, overflow: "hidden", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={url} alt={m.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={m.filename}>
                        {m.filename}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => copyUrl(url)} style={{ flex: 1, padding: "6px", fontSize: 12, background: "#f3f4f6", border: "none", borderRadius: 4, cursor: "pointer" }}>
                          Copiar
                        </button>
                        <button onClick={() => handleDelete(m.id)} style={{ padding: "6px", color: "white", background: "#ef4444", border: "none", borderRadius: 4, cursor: "pointer" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ color: "#9ca3af", gridColumn: "1/-1", textAlign: "center", padding: 40 }}>Carpeta vacía</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
