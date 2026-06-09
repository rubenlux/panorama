import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { apiJson, pickItems, pickArticle, resolveUrl } from "../api.js";
import { SeoValidator } from "../utils/SeoValidator.js";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import VideoExtension from "../editor/VideoExtension.js";
import IframeExtension from "../editor/IframeExtension.js";
import HtmlExtension from "../editor/HtmlExtension.js";
import ImageExtension from "../editor/ImageExtension.js";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

import Toolbar from "../editor/Toolbar.jsx";
import PexelsModal from "../components/PexelsModal.jsx";
import AiAnalysisPanel from "../components/AiAnalysisPanel.jsx";

/**
 * Inserción de imagen en cuerpo:
 * - Inserta la imagen
 * - Luego agrega un párrafo “epígrafe” (opcional)
 */
function insertImageWithCaption(editor, url, defaultAlt) {
  if (!editor) return;
  const alt = defaultAlt || "imagen";

  // Use a timeout to ensure the media modal is closed and editor has focus
  setTimeout(() => {
    editor.chain().focus()
      .setImage({ src: url, alt: alt })
      .run();
  }, 100);
}

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export default function PostEditor({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();

  // Get prefilled data from Editorial Studio if available
  const prefilled = location.state?.prefilled;

  const [kicker, setKicker] = useState(prefilled?.volanta || "");
  const [title, setTitle] = useState(prefilled?.title || "");
  const [deck, setDeck] = useState(prefilled?.excerpt || "");
  const [seo, setSeo] = useState({
    meta_title: "",
    meta_description: "",
    canonical_url: "",
    og_title: "",
    og_description: "",
  });

  const [status, setStatus] = useState("draft");

  // destacada
  const [featuredUrl, setFeaturedUrl] = useState("");
  const [featuredCaption, setFeaturedCaption] = useState("");

  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);

  // Media Modal
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showPexels, setShowPexels] = useState(false); // Pexels Modal State
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaTarget, setMediaTarget] = useState(null); // "featured" | "body" | "video"
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]); // Dynamic folders list

  // AI Panel
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Debug log to verify HMR
  useEffect(() => console.log("PostEditor loaded version 3 - FIX APPLIED"), []);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [info, setInfo] = useState("");
  const [showCats, setShowCats] = useState(false);

  // SEO Report
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }), // Support align on headings and paragraphs
      ImageExtension,
      Youtube.configure({ inline: false, width: 640, height: 480 }),
      VideoExtension,
      IframeExtension,
      HtmlExtension,
      Placeholder.configure({ placeholder: "Cuerpo de la noticia..." }),
    ],
    content: "<p></p>",
  });

  // SEO Report (Must be after editor init)
  const seoReport = useMemo(() => {
    const v = new SeoValidator({
      title, volanta: kicker, epigraph: featuredCaption, seo, image_url: featuredUrl
    }, editor?.getHTML() || "");
    return v.run();
  }, [title, kicker, featuredCaption, seo, featuredUrl, editor?.getHTML()]);

  async function loadCategories() {
    const data = await apiJson("/categories");
    setCategories(pickItems(data));
  }

  async function loadFolders() {
    try {
      const data = await apiJson("/media/folders", { auth: true });
      setFolders(data);
    } catch (e) {
      console.error("Failed to load folders", e);
    }
  }

  async function loadMedia(folder = null) {
    try {
      let url = "/media";
      if (folder) url += `?folder=${folder}`;
      const data = await apiJson(url, { auth: true });
      setMediaItems(pickItems(data));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpload(file, folder = "general") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    // Using fetch directly as handleUpload placeholder was a bit messy
    const token = localStorage.getItem("cms_token");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:5001"}/media`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      await loadMedia(currentFolder);
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadPostIfEdit() {
    if (mode !== "edit") return;

    // Use Admin endpoint to allow fetching drafts
    const data = await apiJson(`/articles/admin/${slug}`, { auth: true });
    const a = pickArticle(data);

    setTitle(a.title || "");
    setKicker(a.volanta || "");
    setDeck(a.excerpt || "");
    setStatus(a.status || "draft");
    setFeaturedUrl(a.image_url || "");
    setFeaturedCaption(a.epigraph || ""); // Load epigraph
    setSeo({
      meta_title: a.meta_title || "",
      meta_description: a.meta_description || "",
      canonical_url: a.canonical_url || "",
      og_title: a.og_title || "",
      og_description: a.og_description || "",
      keywords: a.keywords || "", // Load keywords
    });

    if (editor) editor.commands.setContent(a.body || "<p></p>");
  }


  useEffect(() => {
    loadCategories().catch(() => { });
    loadFolders().catch(() => { });
  }, []);
  useEffect(() => { if (editor) loadPostIfEdit().catch((e) => setErr(e.message)); }, [editor]);

  // Load prefilled content from Editorial Studio
  useEffect(() => {
    if (prefilled && editor && mode === "create") {
      editor.commands.setContent(prefilled.body || "<p></p>");
    }
  }, [prefilled, editor, mode]);

  function toggleCat(catSlug) {
    setSelectedCats((prev) => prev.includes(catSlug) ? prev.filter((x) => x !== catSlug) : [...prev, catSlug]);
  }

  async function chooseFeatured() {
    setMediaTarget("featured");
    setShowMediaModal(true);
    loadFolders(); // Refresh folders when opening modal
    loadMedia();
  }

  function insertImageBody() {
    setMediaTarget("body");
    setShowMediaModal(true);
    loadFolders();
    loadMedia();
  }

  // Open modal for local video upload/selection
  function insertLocalVideo() {
    setMediaTarget("video");
    setShowMediaModal(true);
    loadFolders();
    loadMedia();
  }

  function openPexels(target = "body") {
    setMediaTarget(target);
    setShowPexels(true);
  }

  function onSelectMediaItem(url, mimeType, filename) {
    console.log(">> PostEditor: Selecting media item", { url, mimeType, filename });
    setShowMediaModal(false);
    const isVideo = mimeType?.startsWith("video/") || url.match(/\.(mp4|webm|ogg)$/i);

    if (mediaTarget === "featured") {
      setFeaturedUrl(url);
    } else if (mediaTarget === "body") {
      if (isVideo) {
        editor.chain().focus().insertContent({ type: "video", attrs: { src: url } }).run();
      } else {
        insertImageWithCaption(editor, url, filename?.split(".")[0]);
      }
    } else if (mediaTarget === "video") {
      // Force video node even if mime missing
      editor.chain().focus().insertContent({ type: "video", attrs: { src: url } }).run();
    }
  }

  function insertYoutubeUrl() {
    const url = prompt("URL de YouTube:");
    if (url && editor) {
      editor.commands.setYoutubeVideo({ src: url });
    }
  }

  function insertIframeCode() {
    const input = prompt("Pega la URL del Iframe (o el código <iframe... completo):");
    if (!input || !editor) return;

    let src = input.trim();

    // 1. Try to extract 'src' from an HTML tag
    if (src.includes("<")) {
      // Check for iframe specifically
      if (src.includes("<iframe")) {
        // Use [\s\S]*? to match across newlines if any
        const match = src.match(/<iframe[\s\S]*?src=["'](.*?)["']/i);
        if (match && match[1]) {
          src = match[1];
        } else {
          alert("Parece ser un código iframe, pero no pude extraer la URL 'src'.");
          return;
        }
      } else {
        // It has tags but is not an iframe (likely a script embed)
        alert("El código pegado parece ser un Script (ej: Twitter/X, TikTok) y no un Iframe estándar.\n\nPor razones de seguridad, esta herramienta solo soporta IFRAMES (<iframe...>) o URLs directas.");
        return;
      }
    }

    // Check if the resulting URL is a JS file (common mistake with Twitter embeds)
    if (src.split("?")[0].endsWith(".js")) {
      alert("La URL detectada apunta a un archivo Javascript (.js). Esto no se puede visualizar en un iframe.");
      return;
    }

    // 2. URL Cleaning & Protocol Check
    if (!src || src === "about:blank") return;

    // Remove leading slash if user pasted absolute path (unlikely but possible)
    if (src.startsWith("/")) {
      alert("URL inválida. Debe ser absoluta (http:// o https://)");
      return;
    }

    // Fix missing protocol
    if (!src.match(/^https?:\/\//i)) {
      if (src.startsWith("www.")) {
        src = "https://" + src;
      } else if (src.includes(".")) {
        src = "https://" + src;
      } else {
        alert("La URL no parece válida.");
        return;
      }
    }

    // 3. SMART CONVERSIONS (YouTube, Vimeo, etc.)
    if (src.includes("youtube.com") || src.includes("youtu.be")) {
      let videoId = null;
      if (src.includes("v=")) {
        const vMatch = src.match(/v=([^&]+)/);
        if (vMatch) videoId = vMatch[1];
      } else if (src.includes("youtu.be/")) {
        videoId = src.split("youtu.be/")[1]?.split("?")[0];
      } else if (src.includes("/shorts/")) {
        videoId = src.split("/shorts/")[1]?.split("?")[0];
      } else if (src.includes("/embed/")) {
        videoId = null;
      }

      if (videoId) {
        src = `https://www.youtube.com/embed/${videoId}`;
      }
    }

    // Vimeo
    if (src.includes("vimeo.com")) {
      const vimeoId = src.match(/vimeo\.com\/(\d+)/);
      if (vimeoId && vimeoId[1]) {
        src = `https://player.vimeo.com/video/${vimeoId[1]}`;
      }
    }

    editor.chain().focus().insertContent({ type: "iframe", attrs: { src: src } }).run();
  }

  function insertHtmlBlock() {
    editor.chain().focus().insertContent({ type: "htmlComponent", attrs: { html: "" } }).run();
  }

  function generateAutoSeo() {
    if (!title) {
      alert("Primero escribe un título.");
      return;
    }
    const plainText = editor?.getText() || "";
    let desc = deck || plainText;
    if (desc.length > 155) {
      desc = desc.substring(0, 155);
      const lastSpace = desc.lastIndexOf(" ");
      if (lastSpace > 0) desc = desc.substring(0, lastSpace) + "...";
    }

    const keywords = title.split(" ").filter(w => w.length > 3).join(", ");

    const currentSlug = slug || title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    const canonical = `${window.location.origin}/${currentSlug}`;

    setSeo({
      ...seo,
      meta_title: title.substring(0, 60),
      meta_description: desc,
      og_title: title,
      og_description: desc,
      canonical_url: canonical,
      keywords: seo.keywords || keywords
    });
    setInfo("SEO generado automáticamente ✨");
  }

  async function save(nextStatus) {
    setSaving(true);
    setErr("");
    setInfo("");

    try {

      if (!title.trim()) throw new Error("Falta título");
      if (!editor) throw new Error("Editor no listo");

      if (nextStatus === "published") {
        if (seoReport.errors.length > 0) {
          const msg = `Tu SEO es frágil. Tienes ${seoReport.errors.length} problemas críticos (ej: ${seoReport.errors[0]}).\n\n¿Estás seguro de que quieres publicar así?`;
          if (!window.confirm(msg)) {
            setSaving(false);
            return;
          }
        }
      }

      const payload = {
        title: title.trim(),
        volanta: kicker,
        image_url: featuredUrl,
        epigraph: featuredCaption,
        excerpt: deck && deck.trim() ? deck.trim() : undefined,
        body: editor.getHTML(),
        status: nextStatus,
        categorySlugs: selectedCats,
        seo: seo,
      };

      if (mode === "create") {
        const data = await apiJson("/articles", { method: "POST", body: payload, auth: true });
        const created = pickArticle(data);
        const newSlug = created?.slug || data?.article?.slug;
        if (!newSlug) throw new Error("Creado pero no recibí slug en la respuesta");
        navigate(`/posts/${newSlug}`);
        setStatus(nextStatus);
        setInfo("Creado OK");
      } else {
        await apiJson(`/articles/${slug}`, { method: "PATCH", body: payload, auth: true });
        setStatus(nextStatus);
        setInfo("Guardado OK");
      }

      if (nextStatus === "published") {
        alert("¡Publicado correctamente! 🚀");
      }
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  const header = useMemo(() => (
    <div className="responsive-stack" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{mode === "create" ? "Nueva noticia" : `Editar: ${slug}`}</h2>
      <button className="full-width-mobile" onClick={() => navigate("/posts")} style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>Volver</button>
    </div>
  ), [mode, slug, navigate]);

  return (
    <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div>
        {header}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <input value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder="Volanta" style={{ padding: 12, borderRadius: 20, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" }} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" style={{ padding: 12, fontSize: 18, fontWeight: 800, borderRadius: 20, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" }} />
          <textarea value={deck} onChange={(e) => setDeck(e.target.value)} placeholder="Copete / bajada" rows={3} style={{ padding: 12, borderRadius: 20, border: "1px solid #ddd", resize: "vertical", width: "100%", boxSizing: "border-box" }} />
        </div>

        <div style={{ marginTop: 12, position: "sticky", top: 10, zIndex: 100, background: "white", paddingBottom: 10 }}>
          <Toolbar
            editor={editor}
            onInsertImage={insertImageBody}
            onInsertYoutube={insertYoutubeUrl}
            onInsertVideo={insertLocalVideo}
            onInsertIframe={insertIframeCode}
            onInsertHtml={insertHtmlBlock}
          />
          <button
            type="button"
            onClick={() => openPexels("body")}
            style={{
              marginTop: 5, padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1",
              background: "white", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6
            }}
          >
            📸 Insertar foto de Pexels
          </button>
        </div>

        <div style={{ marginTop: 12, background: "#f8f9fa", borderRadius: 20, padding: 20, border: "1px solid #e2e8f0" }}>
          <EditorContent editor={editor} style={{ minHeight: 300 }} />
        </div>

        {err ? <div style={{ marginTop: 10, color: "crimson" }}>{err}</div> : null}
        {info ? <div style={{ marginTop: 10, color: "green" }}>{info}</div> : null}

        {/* Render AI Panel if active */}
        {showAiPanel && (
          <AiAnalysisPanel
            article={{
              title,
              volanta: kicker,
              slug,
              excerpt: deck,
              body: editor?.getHTML(),
              categorySlugs: selectedCats,
              image_url: featuredUrl,
              epigraph: featuredCaption,
              keywords: seo.keywords,
              editor: editor
            }}
            onClose={() => setShowAiPanel(false)}
            onRewrite={(newData) => {
              if (newData.title) setTitle(newData.title);
              if (newData.volanta) setKicker(newData.volanta);
              if (newData.excerpt) setDeck(newData.excerpt);
              if (newData.body && editor) {
                editor.commands.setContent(newData.body);
              }
              alert("¡Noticia reescrita por AI con éxito! ✨");
            }}
          />
        )}
      </div>

      <aside style={{ display: "grid", gap: 12, position: "sticky", top: 16 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Publicación</div>
          <div style={{ marginBottom: 10 }}>Estado actual: <b>{status}</b></div>

          {/* AI Button */}
          <button
            onClick={() => setShowAiPanel(true)}
            style={{
              width: '100%', padding: '10px', marginBottom: 10,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              color: 'white', border: 'none', borderRadius: 20,
              cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            ✨ Analizar con IA
          </button>

          <button disabled={saving} onClick={() => save("draft")} style={{ width: "100%", padding: 12, borderRadius: 20, backgroundColor: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Guardar borrador
          </button>
          <button disabled={saving} onClick={() => save("published")} style={{ width: "100%", padding: 12, marginTop: 8, background: "#f97316", color: "white", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Publicar
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!slug) {
                alert("Por favor guarda el artículo primero para poder previsualizarlo.");
                return;
              }
              try {
                // Autosave then open preview
                await save("draft");
                // Small delay to ensure save completes
                setTimeout(() => {
                  window.open(`/posts/preview/${slug}`, '_blank');
                }, 300);
              } catch (e) {
                alert("Error al guardar: " + e.message);
              }
            }}
            style={{ width: "100%", padding: 10, marginTop: 12, background: "white", color: "#334155", borderRadius: 20, border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            👁️ Vista Preliminar
          </button>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 12, position: "relative" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Categorías</div>

          <button
            type="button"
            onClick={() => setShowCats(!showCats)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd",
              background: "#fff", textAlign: "left", cursor: "pointer", display: "flex",
              justifyContent: "space-between", alignItems: "center"
            }}
          >
            <span>{selectedCats.length > 0 ? `${selectedCats.length} seleccionadas` : "Seleccionar categorías..."}</span>
            <span>{showCats ? "▲" : "▼"}</span>
          </button>

          {showCats && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "white",
              border: "1px solid #ddd", borderRadius: 8, marginTop: 4, zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 220, overflow: "auto", padding: 8
            }}>
              {categories.map((c) => (
                <label key={c.slug} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedCats.includes(c.slug)} onChange={() => toggleCat(c.slug)} />
                  {c.name}
                </label>
              ))}
              {categories.length === 0 ? <div style={{ opacity: 0.7, padding: 8 }}>No hay categorías</div> : null}
            </div>
          )}
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Imagen destacada</div>

          {featuredUrl ? (
            <img src={resolveUrl(featuredUrl)} alt="destacada" style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />
          ) : (
            <div style={{ opacity: 0.7, marginBottom: 10 }}>Sin imagen</div>
          )}

          <button type="button" onClick={chooseFeatured} style={{ width: "100%", padding: 10, borderRadius: 20, background: "white", border: "1px solid #ddd", cursor: "pointer" }}>
            {featuredUrl ? "Cambiar destacada" : "Elegir destacada"}
          </button>

          <button
            type="button"
            onClick={() => openPexels("featured")}
            style={{ width: "100%", padding: 8, marginTop: 8, borderRadius: 20, background: "transparent", border: "1px dashed #cbd5e1", color: "#64748b", cursor: "pointer", fontSize: 13 }}
          >
            📸 Buscar en Pexels
          </button>


          <textarea
            value={featuredCaption}
            onChange={(e) => setFeaturedCaption(e.target.value)}
            placeholder="Epígrafe de la destacada"
            rows={2}
            style={{ marginTop: 10, width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            SEO & Metadatos
            <button type="button" onClick={generateAutoSeo} style={{ fontSize: 11, background: "#8b5cf6", color: "white", border: "none", borderRadius: 10, padding: "4px 8px", cursor: "pointer" }}>
              ✨ Auto
            </button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Google Search</div>
            <input value={seo.meta_title} onChange={e => setSeo({ ...seo, meta_title: e.target.value })} placeholder="Meta Title (60 chars)" style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd" }} />
            <textarea value={seo.meta_description} onChange={e => setSeo({ ...seo, meta_description: e.target.value })} placeholder="Meta Description (160 chars)" rows={3} style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd" }} />

            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Social (OG)</div>
            <input value={seo.og_title} onChange={e => setSeo({ ...seo, og_title: e.target.value })} placeholder="OG Title (opcional)" style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd" }} />
            <textarea value={seo.og_description} onChange={e => setSeo({ ...seo, og_description: e.target.value })} placeholder="OG Description (opcional)" rows={2} style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd" }} />

            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Avanzado</div>

            <input value={seo.canonical_url} onChange={e => setSeo({ ...seo, canonical_url: e.target.value })} placeholder="Canonical URL" style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd" }} />
            <input value={seo.keywords || ""} onChange={e => setSeo({ ...seo, keywords: e.target.value })} placeholder="Keywords (separadas por coma)" style={{ padding: 8, borderRadius: 15, border: "1px solid #ddd", marginTop: 6 }} />
          </div>
        </div>
      </aside>

      {/* SEO Score Card */}
      <div style={{ background: "white", borderRadius: 12, padding: 12, border: seoReport.score < 50 ? "2px solid red" : seoReport.score < 90 ? "2px solid orange" : "2px solid green" }}>
        <div style={{ fontWeight: 800, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span>SEO Score</span>
          <span style={{ fontSize: 18 }}>{Math.round(seoReport.score)}/100</span>
        </div>

        {seoReport.errors.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: "red", fontSize: 11 }}>PROBLEMAS CRÍTICOS (SEO FRÁGIL):</strong>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "red" }}>
              {seoReport.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {seoReport.warnings.length > 0 && (
          <div>
            <strong style={{ color: "orange", fontSize: 11 }}>MEJORAS:</strong>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#d97706" }}>
              {seoReport.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {showMediaModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 9999,
          display: "flex", justifyContent: "center", alignItems: "center"
        }}>
          <div style={{ background: "white", width: 900, height: 600, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* HEADER */}
            <div style={{ padding: 15, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Biblioteca de Medios</h3>
              <button onClick={() => setShowMediaModal(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

              {/* SIDEBAR (Folders) */}
              <div style={{ width: 200, borderRight: "1px solid #eee", background: "#f8fafc", padding: 10, display: "flex", flexDirection: "column" }}>
                <button
                  onClick={() => { setCurrentFolder(null); loadMedia(null); }}
                  style={{
                    textAlign: "left", padding: "8px 12px", border: "none", background: !currentFolder ? "#e2e8f0" : "transparent",
                    borderRadius: 6, cursor: "pointer", fontWeight: !currentFolder ? "bold" : "normal", marginBottom: 5
                  }}
                >
                  📂 Todo
                </button>

                <div style={{ fontSize: 12, color: "#64748b", margin: "10px 0 5px 5px", textTransform: "uppercase", fontWeight: "bold" }}>Carpetas</div>

                {folders.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setCurrentFolder(f.name); loadMedia(f.name); }}
                    style={{
                      textAlign: "left", padding: "8px 12px", border: "none", background: currentFolder === f.name ? "#e2e8f0" : "transparent",
                      borderRadius: 6, cursor: "pointer", marginBottom: 2, textTransform: "capitalize"
                    }}
                  >
                    📁 {f.name}
                  </button>
                ))}
              </div>

              {/* CONTENT */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 15 }}>

                {/* UPLOAD & TOOLBAR */}
                <div style={{ marginBottom: 15, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ position: "relative", overflow: "hidden" }}>
                    <button style={{ background: "#3b82f6", color: "white", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>
                      ⬆️ Subir a {currentFolder ? `"${currentFolder}"` : "General"}
                    </button>
                    <input
                      type="file"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleUpload(e.target.files[0], currentFolder || "general");
                      }}
                      style={{ position: "absolute", top: 0, left: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
                    />
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {mediaItems.length} archivos
                  </div>
                </div>

                {/* GRID */}
                <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 15, alignContent: "start" }}>
                  {mediaItems.map(m => {
                    const u = resolveUrl(m.url || m.public_url || m.path);
                    return (
                      <div key={m.id || u} className="media-item-card" style={{ position: "relative", border: "1px solid #eee", borderRadius: 8, padding: 5, group: "item" }}>
                        {/* DELETE BUTTON */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm("¿Eliminar este archivo?")) {
                              await apiJson(`/media/${m.id}`, { method: "DELETE", auth: true });
                              loadMedia(currentFolder);
                            }
                          }}
                          title="Eliminar"
                          style={{
                            position: "absolute", top: 4, right: 4, background: "rgba(255,0,0,0.8)", color: "white",
                            border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", zIndex: 10, display: "none"
                          }}
                          className="delete-btn"
                        >
                          ✕
                        </button>

                        <div
                          onClick={() => onSelectMediaItem(u, m.mime_type || m.mime, m.filename)}
                          style={{ cursor: "pointer" }}
                        >
                          <img src={u} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, background: "#f1f5f9" }} />
                          <div style={{ fontSize: 11, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: 4, fontWeight: "500" }}>{m.filename}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>{m.folder || "general"}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <style>{`
                .media-item-card:hover { border-color: #3b82f6 !important; background: #eff6ff; }
                .media-item-card:hover .delete-btn { display: block !important; }
              `}</style>

              </div>
            </div>
          </div>
        </div>
      )}

      {showPexels && (
        <PexelsModal
          onClose={() => setShowPexels(false)}
          onSelect={(url, mime, filename) => {
            setShowPexels(false);
            onSelectMediaItem(url, mime, filename);
          }}
        />
      )}
    </div>
  );
}
