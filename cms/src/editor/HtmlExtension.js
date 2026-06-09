import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import HtmlNode from "./HtmlNode.jsx";

export default Node.create({
    name: "htmlComponent", // 'html' might be reserved or confusing

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            html: {
                default: "",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "div[data-type='html-component']",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // When rendering to HTML (final output), we just output the raw HTML inside a wrapper
        // OR we can decide to output the raw HTML directly if possible.
        // Tiptap's renderHTML is for the editor's output mainly.
        // We will store it as a div with a data attribute, and handle the "Execute" on the frontend.
        return [
            "div",
            mergeAttributes(HTMLAttributes, { "data-type": "html-component" }),
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(HtmlNode);
    },
});
