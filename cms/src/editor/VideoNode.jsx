import React from "react";
import { NodeViewWrapper } from "@tiptap/react";

export default function VideoNode(props) {
    const { node, updateAttributes, selected } = props;
    const { src, width, height, textAlign, controls } = node.attrs;

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
                display: "inline-block",
                position: "relative",
                width: width || "100%",
                maxWidth: "100%",
                transition: "width 0.2s",
                border: selected ? "2px solid #3b82f6" : "2px solid transparent",
                borderRadius: 8,
                overflow: "hidden"
            }}>
                <video
                    src={src}
                    controls={controls}
                    style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                        objectFit: "cover"
                    }}
                />
            </div>
        </NodeViewWrapper>
    );
}
