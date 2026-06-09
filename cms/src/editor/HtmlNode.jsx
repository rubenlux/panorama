import React, { useState, useEffect } from "react";
import { NodeViewWrapper } from "@tiptap/react";

export default function HtmlNode(props) {
    const { node, updateAttributes, deleteNode, selected } = props;
    const { html, width, height } = node.attrs;
    const [isEditing, setIsEditing] = useState(!html);
    const [code, setCode] = useState(html || "");

    const handleSave = () => {
        updateAttributes({ html: code });
        setIsEditing(false);
    };

    return (
        <NodeViewWrapper
            style={{
                position: "relative",
                margin: "1em 0",
                width: "100%"
            }}
        >
            <div style={{
                border: selected ? "2px solid #3b82f6" : "1px dashed #cbd5e1",
                borderRadius: 8,
                background: "#f8fafc",
                padding: 10,
                position: "relative",
                minHeight: 80
            }}>
                {/* Header / Label */}
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderBottom: "1px solid #e2e8f0", paddingBottom: 8, marginBottom: 8
                }}>
                    <span style={{ fontSize: 12, fontWeight: "bold", color: "#64748b", display: "flex", gap: 5, alignItems: "center" }}>
                        <span style={{ background: "#cbd5e1", padding: "2px 6px", borderRadius: 4, color: "#fff" }}>&lt;/&gt;</span>
                        CÓDIGO / HTML RAW
                    </span>

                    <div style={{ display: "flex", gap: 5 }}>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                style={styles.btn}
                            >
                                ✏️ Editar
                            </button>
                        )}
                        <button
                            onClick={deleteNode}
                            style={{ ...styles.btn, background: "#fee2e2", color: "#ef4444" }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                {isEditing ? (
                    <div>
                        <textarea
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Pega aquí tu código HTML, Scripts (TikTok, Twitter, etc.)"
                            style={{
                                width: "100%",
                                minHeight: 150,
                                fontFamily: "monospace",
                                fontSize: 12,
                                padding: 8,
                                border: "1px solid #cbd5e1",
                                borderRadius: 4,
                                background: "#fff"
                            }}
                        />
                        <button
                            onClick={handleSave}
                            style={{
                                marginTop: 8,
                                background: "#3b82f6",
                                color: "white",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: 4,
                                fontSize: 13,
                                cursor: "pointer",
                                fontWeight: "600"
                            }}
                        >
                            Guardar Código
                        </button>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: "#334155", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 100, overflow: "hidden" }}>
                        {html || <span style={{ color: "#94a3b8" }}>(Código vacío)</span>}
                    </div>
                )}

                {!isEditing && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                        Este código se ejecutará al publicar la noticia.
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
}

const styles = {
    btn: {
        border: "none",
        background: "#e2e8f0",
        borderRadius: 4,
        padding: "4px 8px",
        fontSize: 11,
        cursor: "pointer",
        fontWeight: "500",
        color: "#475569"
    }
}
