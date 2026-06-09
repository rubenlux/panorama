import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import VideoNode from "./VideoNode.jsx";

export default Node.create({
    name: "video",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            src: {
                default: null,
            },
            controls: {
                default: true,
            },
            width: {
                default: "100%",
            },
            height: {
                default: "auto",
            },
            textAlign: {
                default: "center",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "video",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "video",
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(VideoNode);
    },
});
