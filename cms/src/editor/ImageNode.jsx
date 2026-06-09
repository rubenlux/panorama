import React from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { resolveUrl } from "../api.js";

export default function ImageNode(props) {
    const { node, selected } = props;
    const {
        src, alt, width, height,
        opacity, filter, textAlign,
        borderRadius, borderRadiusTL, borderRadiusTR, borderRadiusBL, borderRadiusBR,
        objectFit, objectPosition, caption
    } = node.attrs;

    const finalSrc = resolveUrl(src);

    // Construct border radius string
    // Prioritize specific corners if any are larger than 0
    let radiusStyle = borderRadius;
    const tl = parseInt(borderRadiusTL || 0);
    const tr = parseInt(borderRadiusTR || 0);
    const br = parseInt(borderRadiusBR || 0);
    const bl = parseInt(borderRadiusBL || 0);

    if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
        radiusStyle = `${tl}px ${tr}px ${br}px ${bl}px`;
    } else {
        // Fallback to simple radius
        radiusStyle = borderRadius && !String(borderRadius).endsWith("%") && !String(borderRadius).endsWith("px")
            ? `${borderRadius}px`
            : borderRadius || "0px";
    }

    return (
        <NodeViewWrapper
            className="image-node-view"
            style={{
                position: "relative",
                display: "flex",
                justifyContent: textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
                margin: "1em 0",
                lineHeight: 1.5 // Reset line height for container
            }}
        >
            <figure style={{
                margin: 0,
                display: "flex",
                flexDirection: "column",
                width: width,
                maxWidth: "100%",
                alignItems: "center" // Center caption relative to image
            }}>
                <img
                    src={finalSrc}
                    alt={alt}
                    onError={(e) => {
                        e.target.style.background = "#fee2e2";
                        e.target.style.padding = "20px";
                    }}
                    style={{
                        width: "100%", // Image takes full width of figure
                        height: height === "auto" ? "auto" : (!isNaN(height) ? `${height}px` : height),
                        opacity: opacity,
                        borderRadius: radiusStyle,
                        filter: filter,
                        objectFit: objectFit || "cover",
                        objectPosition: objectPosition || "center",
                        display: "block",
                        boxShadow: selected ? "0 0 0 3px #3b82f6" : "none",
                        transition: "all 0.2s ease"
                    }}
                />

                {caption && (
                    <figcaption style={{
                        marginTop: "8px",
                        textAlign: "center",
                        fontSize: "14px",
                        color: "#64748b",
                        fontStyle: "italic",
                        width: "100%"
                    }}>
                        {caption}
                    </figcaption>
                )}
            </figure>
        </NodeViewWrapper>
    );
}
