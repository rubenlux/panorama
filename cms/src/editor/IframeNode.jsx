import React from "react";
import { NodeViewWrapper } from "@tiptap/react";

export default function IframeNode(props) {
    const { node, deleteNode, selected } = props;
    const { src, width, height, textAlign } = node.attrs;

    return (
        <NodeViewWrapper
            style={{
                position: "relative",
                margin: "0.5em 0",
                textAlign: textAlign || "center",
                lineHeight: 0
            }}
        >
            <div style={{
                position: "relative",
                border: selected ? "2px solid #3b82f6" : "1px solid transparent",
                width: width,
                height: height || 400,
                maxWidth: "100%",
                display: "inline-block",
                verticalAlign: "top",
                transition: "width 0.2s"
            }}>
                {(src && src.match(/^https?:\/\//i)) ? (
                    <iframe
                        src={src}
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        allowFullScreen
                        style={{ display: "block", width: "100%", height: "100%", pointerEvents: selected ? "none" : "auto" }}
                    />
                ) : (
                    <div style={{
                        width: "100%", height: "100%", background: "#f8d7da", color: "#721c24",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px dashed #f5c6cb", flexDirection: "column", padding: 10
                    }}>
                        <strong>⚠️ URL inválida</strong>
                        <div style={{ fontSize: 12, marginTop: 4 }}>"{src || "vacío"}"</div>
                        <div style={{ fontSize: 11, marginTop: 4 }}>Debe empezar con http:// o https://</div>
                    </div>
                )}
                {/* Overlay to catch clicks and select the node */}
                {!selected && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: "pointer", background: "transparent" }} />
                )}
            </div>
            {/* Caption Display in Editor */}
            {node.attrs.caption && (
                <div style={{ fontSize: "0.9em", color: "#666", fontStyle: "italic", marginTop: 6, textAlign: "center" }}>
                    {node.attrs.caption}
                </div>
            )}
        </NodeViewWrapper>
    );
}
