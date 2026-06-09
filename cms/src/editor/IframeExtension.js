import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import IframeNode from "./IframeNode.jsx";

export default Node.create({
    name: "iframe",

    group: "block",

    atom: true,

    addAttributes() {
        return {
            src: {
                default: null,
            },
            width: {
                default: "100%",
            },
            height: {
                default: 400,
            },
            frameborder: {
                default: 0,
            },
            allowfullscreen: {
                default: true,
            },
            textAlign: {
                default: "center",
            },
            caption: {
                default: "",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "iframe",
            },
            {
                tag: "figure",
                getAttrs: node => {
                    const iframe = node.querySelector("iframe");
                    if (!iframe) return false;
                    return {}; // relies on iframe inner parse?
                    // Actually Tiptap parsing is tricky with wrappers. 
                    // Let's stick to parsing the iframe tag mostly, but allowing it to be wrapped.
                }
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // We render a figure wrapper to support caption
        const { caption, textAlign, ...iframeAttrs } = HTMLAttributes;

        return [
            "figure",
            { style: `text-align: ${textAlign}; margin: 0 0 1.5em 0;` },
            ["iframe", iframeAttrs],
            ["figcaption", caption || ""]
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(IframeNode);
    },
});
