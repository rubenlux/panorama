import React, { useEffect, useState } from "react";

const GOOGLE_FONTS_API_KEY = "AIzaSyAu232L9PA7Hj6v4q5x76ogttrUHoWtywc";

export default function Toolbar({ editor, onInsertImage, onInsertYoutube, onInsertVideo, onInsertIframe, onInsertHtml }) {
  const [fonts, setFonts] = useState([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [, forceUpdate] = useState({}); // Hack to force re-render on editor updates

  // Listen to editor updates to refresh toolbar state (isImage, active marks, etc.)
  useEffect(() => {
    if (!editor) return;

    const handler = () => forceUpdate({});

    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    editor.on("focus", handler);
    editor.on("blur", handler);

    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
      editor.off("focus", handler);
      editor.off("blur", handler);
    };
  }, [editor]);

  // Load mostly popular fonts
  useEffect(() => {
    setLoadingFonts(true);
    fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${GOOGLE_FONTS_API_KEY}&sort=popularity&capability=WOFF2`)
      .then(r => r.json())
      .then(data => {
        // Take top 200
        const top = (data.items || []).slice(0, 200).map(f => f.family);
        setFonts(["Inter", "Arial", "Georgia", ...top]);
      })
      .catch(e => console.error("Error loading fonts", e))
      .finally(() => setLoadingFonts(false));
  }, []);

  if (!editor) return null;

  // Check if image is selected
  // We strictly check if the *selection* currently points to an image node.
  const isImage = editor.isActive("image");

  // Forcedeselect image: move cursor after image
  const deselectImage = () => {
    const { from, to } = editor.state.selection;
    editor.chain().setTextSelection(to).focus().run();
  };

  // Helpers to apply styles
  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run();
  const toggleStrike = () => editor.chain().focus().toggleStrike().run();

  const setAlign = (align) => editor.chain().focus().setTextAlign(align).run();

  const toggleBullet = () => editor.chain().focus().toggleBulletList().run();

  const toggleOrdered = () => editor.chain().focus().toggleOrderedList().run();

  // Links
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const unsetLink = () => editor.chain().focus().unsetLink().run();

  const setFont = (family) => {
    if (!document.getElementById(`font-${family}`)) {
      const link = document.createElement("link");
      link.id = `font-${family}`;
      link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&display=swap`;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    editor.chain().focus().setFontFamily(family).run();
  };

  const setFontSize = (size) => {
    editor.chain().focus().setMark("textStyle", { fontSize: size + "px" }).run();
  };

  const setColor = (e) => {
    editor.chain().focus().setColor(e.target.value).run();
  };

  // IMAGE HELPERS
  const updateImage = (attrs) => {
    editor.chain().focus().updateAttributes("image", attrs).run();
  };

  const getImgAttr = (key, def) => {
    return editor.getAttributes("image")[key] || def;
  };

  // UI Components
  const Separator = () => <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 8px" }} />;

  const currentSize = editor.getAttributes("textStyle").fontSize ? parseInt(editor.getAttributes("textStyle").fontSize) : 16;

  // CHECK IF YOUTUBE IS SELECTED
  const isYoutube = editor.isActive("youtube");
  const isVideo = editor.isActive("video");
  const isIframe = editor.isActive("iframe");
  const isHtml = editor.isActive("htmlComponent");

  // IF HTML COMPONENT SELECTED
  if (isHtml) {
    return (
      <div className="toolbar-scroll" style={{ ...styles.container, background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
        <div style={styles.group}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#64748b", marginRight: 6 }}>CÓDIGO HTML</span>
        </div>
        <Separator />

        {/* Delete */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().deleteSelection().run()} style={{ ...styles.iconBtn, color: "red" }} title="Borrar Bloque">🗑️</button>
        </div>

        <Separator />

        {/* Helper to Close (Deselect) */}
        <button onClick={() => editor.chain().setTextSelection(editor.state.selection.to).focus().run()} style={styles.iconBtn} title="Cerrar">✕</button>
      </div>
    );
  }

  // IF YOUTUBE SELECTED
  if (isYoutube) {
    const width = editor.getAttributes("youtube").width || "100%";
    const align = editor.getAttributes("youtube").textAlign || "center";

    const updateYoutube = (attrs) => editor.chain().focus().updateAttributes("youtube", attrs).run();

    return (
      <div className="toolbar-scroll" style={{ ...styles.container, background: "#fff1f2", border: "1px solid #fda4af" }}>
        <div style={styles.group}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#e11d48", marginRight: 6 }}>YOUTUBE</span>
        </div>
        <Separator />

        {/* Width */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Ancho:</span>
          <button onClick={() => updateYoutube({ width: "100%" })} style={width === "100%" ? styles.activeBtn : styles.iconBtn}>100%</button>
          <button onClick={() => updateYoutube({ width: "75%" })} style={width === "75%" ? styles.activeBtn : styles.iconBtn}>75%</button>
          <button onClick={() => updateYoutube({ width: "50%" })} style={width === "50%" ? styles.activeBtn : styles.iconBtn}>50%</button>
        </div>

        <Separator />

        {/* Alignment */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().setTextAlign('left').run()} style={editor.isActive({ textAlign: 'left' }) ? styles.activeBtn : styles.iconBtn} title="Izq">⫷</button>
          <button onClick={() => editor.chain().focus().setTextAlign('center').run()} style={editor.isActive({ textAlign: 'center' }) ? styles.activeBtn : styles.iconBtn} title="Centro">≡</button>
          <button onClick={() => editor.chain().focus().setTextAlign('right').run()} style={editor.isActive({ textAlign: 'right' }) ? styles.activeBtn : styles.iconBtn} title="Der">⫸</button>
        </div>

        <Separator />

        {/* Change URL */}
        <div style={styles.group}>
          <button onClick={() => {
            const url = prompt("Nueva URL de YouTube:", editor.getAttributes("youtube").src);
            if (url) updateYoutube({ src: url });
          }} style={styles.iconBtn} title="Cambiar Video">🔗</button>
        </div>

        <Separator />

        {/* Delete / Deselect */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().deleteSelection().run()} style={{ ...styles.iconBtn, color: "red" }} title="Borrar Video">🗑️</button>
        </div>

        <Separator />

        {/* Insert Buttons */}
        <div style={styles.group}>
          <button onClick={onInsertImage} style={styles.iconBtn} title="Imagen">🖼️</button>
          <button onClick={onInsertYoutube} style={styles.iconBtn} title="YouTube">🔴</button>
        </div>

      </div>
    );
  }

  // IF VIDEO SELECTED
  if (isVideo) {
    const width = editor.getAttributes("video").width || "100%";
    const align = editor.getAttributes("video").textAlign || "center";

    const updateVideo = (attrs) => editor.chain().focus().updateAttributes("video", attrs).run();

    return (
      <div className="toolbar-scroll" style={{ ...styles.container, background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
        <div style={styles.group}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#059669", marginRight: 6 }}>VIDEO PC</span>
        </div>
        <Separator />

        {/* Width */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Ancho:</span>
          <button onClick={() => updateVideo({ width: "100%" })} style={width === "100%" ? styles.activeBtn : styles.iconBtn}>100%</button>
          <button onClick={() => updateVideo({ width: "75%" })} style={width === "75%" ? styles.activeBtn : styles.iconBtn}>75%</button>
          <button onClick={() => updateVideo({ width: "50%" })} style={width === "50%" ? styles.activeBtn : styles.iconBtn}>50%</button>
        </div>

        <Separator />

        {/* Alignment */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().setTextAlign('left').run()} style={editor.isActive({ textAlign: 'left' }) ? styles.activeBtn : styles.iconBtn} title="Izq">⫷</button>
          <button onClick={() => editor.chain().focus().setTextAlign('center').run()} style={editor.isActive({ textAlign: 'center' }) ? styles.activeBtn : styles.iconBtn} title="Centro">≡</button>
          <button onClick={() => editor.chain().focus().setTextAlign('right').run()} style={editor.isActive({ textAlign: 'right' }) ? styles.activeBtn : styles.iconBtn} title="Der">⫸</button>
        </div>

        <Separator />

        {/* Delete */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().deleteSelection().run()} style={{ ...styles.iconBtn, color: "red" }} title="Borrar Video">🗑️</button>
        </div>

        <Separator />

        {/* Helper to Close (Deselect) */}
        <button onClick={() => editor.chain().setTextSelection(editor.state.selection.to).focus().run()} style={styles.iconBtn} title="Cerrar">✕</button>
      </div>
    );
  }

  // IF IFRAME SELECTED
  if (isIframe) {
    const width = editor.getAttributes("iframe").width || "100%";
    const height = editor.getAttributes("iframe").height || 400;
    const align = editor.getAttributes("iframe").textAlign || "center";

    const updateIframe = (attrs) => editor.chain().focus().updateAttributes("iframe", attrs).run();

    return (
      <div className="toolbar-scroll" style={{ ...styles.container, background: "#f0f9ff", border: "1px solid #7dd3fc" }}>
        <div style={styles.group}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#0284c7", marginRight: 6 }}>EMBED / IFRAME</span>
        </div>
        <Separator />

        {/* Width */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Ancho:</span>
          <button onClick={() => updateIframe({ width: "100%" })} style={width === "100%" ? styles.activeBtn : styles.iconBtn}>100%</button>
          <button onClick={() => updateIframe({ width: "75%" })} style={width === "75%" ? styles.activeBtn : styles.iconBtn}>75%</button>
          <button onClick={() => updateIframe({ width: "50%" })} style={width === "50%" ? styles.activeBtn : styles.iconBtn}>50%</button>
        </div>

        <Separator />

        {/* Height */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Alto:</span>
          <input
            type="number"
            value={parseInt(height)}
            onChange={(e) => updateIframe({ height: parseInt(e.target.value) || 400 })}
            style={{ ...styles.select, width: 60 }}
          />
        </div>

        <Separator />

        {/* Alignment */}
        <div style={styles.group}>
          <button onClick={() => updateIframe({ textAlign: "left" })} style={align === "left" ? styles.activeBtn : styles.iconBtn} title="Izq">⫷</button>
          <button onClick={() => updateIframe({ textAlign: "center" })} style={align === "center" ? styles.activeBtn : styles.iconBtn} title="Centro">≡</button>
          <button onClick={() => updateIframe({ textAlign: "right" })} style={align === "right" ? styles.activeBtn : styles.iconBtn} title="Der">⫸</button>
        </div>

        <Separator />

        {/* Delete */}
        <div style={styles.group}>
          <button onClick={() => editor.chain().focus().deleteSelection().run()} style={{ ...styles.iconBtn, color: "red" }} title="Borrar Iframe">🗑️</button>
        </div>

        <Separator />

        {/* Caption / Epigraph */}
        <div style={styles.group}>
          <button
            onClick={() => {
              const current = editor.getAttributes("iframe").caption || "";
              const newCaption = prompt("Epígrafe para el Embed:", current);
              if (newCaption !== null) {
                updateIframe({ caption: newCaption });
              }
            }}
            style={styles.iconBtn}
            title="Editar Epígrafe"
          >
            📝
          </button>
        </div>

        <Separator />

        {/* Helper to Close (Deselect) */}
        <button onClick={() => editor.chain().setTextSelection(editor.state.selection.to).focus().run()} style={styles.iconBtn} title="Cerrar">✕</button>
      </div>
    );
  }

  // IF IMAGE SELECTED, SHOW MEDIA TOOLBAR
  if (isImage) {
    const width = getImgAttr("width", "100%");
    const height = getImgAttr("height", "auto");
    const opacity = getImgAttr("opacity", 1);
    const filter = getImgAttr("filter", "none");
    const align = getImgAttr("textAlign", "center");

    // Corners - Initialize with specific value, or fallback to global borderRadius
    const globalRadius = parseInt(getImgAttr("borderRadius", 0));
    const rTL = getImgAttr("borderRadiusTL", globalRadius);
    const rTR = getImgAttr("borderRadiusTR", globalRadius);
    const rBL = getImgAttr("borderRadiusBL", globalRadius);
    const rBR = getImgAttr("borderRadiusBR", globalRadius);

    const objPos = getImgAttr("objectPosition", "center");

    const updateCorner = (attr, value) => {
      updateImage({
        [attr]: value,
        borderRadius: 0 // Clear global radius to prioritize granular
      });
    };

    return (
      <div className="toolbar-scroll" style={{ ...styles.container, background: "#f8fafc", border: "1px solid #94a3b8" }}>
        <div style={styles.group}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#64748b", marginRight: 6 }}>IMAGEN</span>
        </div>
        <Separator />

        {/* Alignment */}
        <div style={styles.group}>
          <button onClick={() => updateImage({ textAlign: "left" })} style={align === "left" ? styles.activeBtn : styles.iconBtn} title="Izq">⫷</button>
          <button onClick={() => updateImage({ textAlign: "center" })} style={align === "center" ? styles.activeBtn : styles.iconBtn} title="Centro">≡</button>
          <button onClick={() => updateImage({ textAlign: "right" })} style={align === "right" ? styles.activeBtn : styles.iconBtn} title="Der">⫸</button>
        </div>

        <Separator />

        {/* Dimensions (Width / Height) */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Ancho:</span>
          <select style={styles.select} value={width} onChange={(e) => updateImage({ width: e.target.value })}>
            <option value="25%">25%</option>
            <option value="50%">50%</option>
            <option value="75%">75%</option>
            <option value="100%">100%</option>
            <option value="auto">Auto</option>
          </select>

          <span style={{ fontSize: 11, marginLeft: 4 }}>Alto:</span>
          <br />
          <input
            type="text"
            placeholder="auto"
            value={height === "auto" ? "" : height}
            onChange={(e) => updateImage({ height: e.target.value || "auto" })}
            style={{ ...styles.select, width: 50 }}
          />
        </div>

        <Separator />

        {/* Crop / Position */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Recorte:</span>
          <select style={styles.select} value={objPos} onChange={(e) => updateImage({ objectPosition: e.target.value })}>
            <option value="center">Centro</option>
            <option value="top">Arriba</option>
            <option value="bottom">Abajo</option>
            <option value="left">Izq</option>
            <option value="right">Der</option>
            <option value="top left">Sup-Izq</option>
            <option value="top right">Sup-Der</option>
          </select>
        </div>

        <Separator />

        {/* Opacity */}
        <div style={styles.group}>
          <span style={{ fontSize: 11 }}>Op:</span>
          <input
            type="range" min="0" max="1" step="0.1"
            value={opacity}
            onChange={(e) => updateImage({ opacity: e.target.value })}
            style={{ width: 40 }}
            title={`Opacidad: ${opacity}`}
          />
        </div>

        <Separator />

        {/* Corners (TL, TR, BL, BR) */}
        <div style={{ ...styles.group, flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <input type="number" placeholder="TL" title="Sup-Izq" min="0" max="100" style={{ ...styles.select, width: 36, padding: 1 }} value={rTL} onChange={(e) => updateCorner("borderRadiusTL", e.target.value)} />
            <input type="number" placeholder="TR" title="Sup-Der" min="0" max="100" style={{ ...styles.select, width: 36, padding: 1 }} value={rTR} onChange={(e) => updateCorner("borderRadiusTR", e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <input type="number" placeholder="BL" title="Inf-Izq" min="0" max="100" style={{ ...styles.select, width: 36, padding: 1 }} value={rBL} onChange={(e) => updateCorner("borderRadiusBL", e.target.value)} />
            <input type="number" placeholder="BR" title="Inf-Der" min="0" max="100" style={{ ...styles.select, width: 36, padding: 1 }} value={rBR} onChange={(e) => updateCorner("borderRadiusBR", e.target.value)} />
          </div>
        </div>

        <Separator />

        {/* Filters */}
        <div style={styles.group}>
          <select style={{ ...styles.select, width: 70 }} value={filter} onChange={(e) => updateImage({ filter: e.target.value })}>
            <option value="none">Normal</option>
            <option value="grayscale(100%)">B/N</option>
            <option value="sepia(100%)">Sepia</option>
            <option value="blur(2px)">Blur</option>
            <option value="contrast(150%)">Contr.</option>
            <option value="brightness(1.2)">Brillo</option>
          </select>
        </div>

        <Separator />

        {/* Epigraph */}
        <div style={styles.group}>
          <button
            onClick={() => {
              const currentCaption = getImgAttr("caption", "");
              const newCaption = window.prompt("Escriba el epígrafe de la imagen:", currentCaption);

              if (newCaption !== null) {
                updateImage({ caption: newCaption });
              }
            }}
            style={styles.iconBtn}
            title="Editar Epígrafe"
          >
            📝
          </button>
        </div>

        <Separator />

        {/* Helper to close */}
        <button
          onClick={(e) => {
            e.preventDefault();
            deselectImage();
          }}
          style={styles.iconBtn}
          title="Cerrar (Esc)"
        >
          ✕
        </button>
      </div>
    )
  }

  // STANDARD TEXT TOOLBAR
  return (
    <div className="toolbar-scroll" style={styles.container}>
      {/* Headings */}
      <div style={styles.group}>
        <select
          style={{ ...styles.select, fontWeight: "bold", width: 110 }}
          onChange={(e) => {
            const level = parseInt(e.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level }).run();
          }}
          value={(() => {
            if (editor.isActive('heading', { level: 2 })) return 2;
            if (editor.isActive('heading', { level: 3 })) return 3;
            if (editor.isActive('heading', { level: 4 })) return 4;
            if (editor.isActive('heading', { level: 5 })) return 5;
            if (editor.isActive('heading', { level: 6 })) return 6;
            return 0;
          })()}
        >
          <option value={0}>Párrafo</option>
          <option value={2}>Título 2</option>
          <option value={3}>Título 3</option>
          <option value={4}>Título 4</option>
          <option value={5}>Título 5</option>
          <option value={6}>Título 6</option>
        </select>
      </div>

      <Separator />

      {/* Font Family */}
      <div style={styles.group}>
        <select
          style={styles.select}
          onChange={(e) => setFont(e.target.value)}
          value={editor.getAttributes("textStyle").fontFamily || "Inter"}
        >
          <option value="">Default Font</option>
          {loadingFonts ? <option>Cargando...</option> : null}
          {fonts.map((f, i) => <option key={`${f}-${i}`} value={f}>{f}</option>)}
        </select>
      </div>

      <Separator />

      {/* Font Size */}
      <div style={styles.group}>
        <button style={styles.iconBtn} onClick={() => setFontSize(currentSize - 1)}>−</button>
        <span style={{ fontSize: 13, width: 24, textAlign: "center" }}>{currentSize}</span>
        <button style={styles.iconBtn} onClick={() => setFontSize(currentSize + 1)}>+</button>
      </div>

      <Separator />

      {/* Color */}
      <div style={styles.group}>
        <label style={{ ...styles.iconBtn, position: "relative", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer" }} title="Color de texto">
          <span style={{ fontSize: 14, fontWeight: "bold" }}>A</span>
          <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, height: 3, background: "linear-gradient(to right, red, orange, yellow, green, blue, violet)" }}></div>
          <input type="color" onChange={setColor} style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
        </label>
      </div>

      <Separator />

      {/* Formatting */}
      <div style={styles.group}>
        <button onClick={toggleBold} style={editor.isActive("bold") ? styles.activeBtn : styles.iconBtn} title="Negrita"><b>B</b></button>
        <button onClick={toggleItalic} style={editor.isActive("italic") ? styles.activeBtn : styles.iconBtn} title="Itálica"><i>I</i></button>
        <button onClick={toggleUnderline} style={editor.isActive("underline") ? styles.activeBtn : styles.iconBtn} title="Subrayado"><u>U</u></button>
        <button onClick={toggleStrike} style={editor.isActive("strike") ? styles.activeBtn : styles.iconBtn} title="Tachado"><s>S</s></button>
        <button onClick={setLink} style={editor.isActive("link") ? styles.activeBtn : styles.iconBtn} title="Crear Enlace">🔗</button>
        <button onClick={unsetLink} disabled={!editor.isActive("link")} style={editor.isActive("link") ? styles.iconBtn : { ...styles.iconBtn, opacity: 0.3 }} title="Quitar Enlace">❌</button>
      </div>

      <Separator />

      {/* Alignment */}
      <div style={styles.group}>
        <button onClick={() => setAlign("left")} style={editor.isActive({ textAlign: "left" }) ? styles.activeBtn : styles.iconBtn} title="Izquierda">⫷</button>
        <button onClick={() => setAlign("center")} style={editor.isActive({ textAlign: "center" }) ? styles.activeBtn : styles.iconBtn} title="Centro">≡</button>
        <button onClick={() => setAlign("right")} style={editor.isActive({ textAlign: "right" }) ? styles.activeBtn : styles.iconBtn} title="Derecha">⫸</button>
        <button onClick={() => setAlign("justify")} style={editor.isActive({ textAlign: "justify" }) ? styles.activeBtn : styles.iconBtn} title="Justificado">≣</button>
      </div>

      <Separator />

      {/* Lists */}
      <div style={styles.group}>
        <button onClick={toggleBullet} style={editor.isActive("bulletList") ? styles.activeBtn : styles.iconBtn} title="Viñetas">•=</button>
        <button onClick={toggleOrdered} style={editor.isActive("orderedList") ? styles.activeBtn : styles.iconBtn} title="Numerada">1.</button>
      </div>

      <Separator />

      {/* Insert */}
      <div style={styles.group}>
        <button onClick={onInsertImage} style={styles.iconBtn} title="Imagen">🖼️</button>
        <button onClick={onInsertVideo} style={styles.iconBtn} title="Video Local (MP4)">🎬</button>
        <button onClick={onInsertYoutube} style={styles.iconBtn} title="YouTube">🔴</button>
        <button onClick={onInsertIframe} style={styles.iconBtn} title="Iframe / Embed">🌐</button>
        <button onClick={onInsertHtml} style={styles.iconBtn} title="Insertar Código / HTML">
          <span style={{ fontWeight: "bold", fontSize: 12 }}>&lt;/&gt;</span>
        </button>
      </div>

    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    background: "white",
    padding: "6px 12px",
    borderRadius: 12,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    flexWrap: "wrap",
    border: "1px solid #e2e8f0"
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 4
  },
  select: {
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 13,
    outline: "none",
    maxWidth: 120,
    cursor: "pointer",
    background: "#f8fafc"
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 6,
    padding: "6px",
    minWidth: 28,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontSize: 14,
    transition: "background 0.2s"
  },
  activeBtn: {
    border: "none",
    background: "#eef2ff",
    borderRadius: 6,
    padding: "6px",
    minWidth: 28,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "bold"
  }
};
