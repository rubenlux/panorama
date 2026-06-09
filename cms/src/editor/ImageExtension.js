import { mergeAttributes, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import ImageNode from "./ImageNode.jsx";

export default Image.extend({
    name: "image",

    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: "100%",
                renderHTML: (attributes) => ({
                    width: attributes.width,
                }),
            },
            height: {
                default: null,
            },
            textAlign: {
                default: "center",
            },
            opacity: {
                default: 1,
            },
            borderRadius: { default: "0" },
            borderRadiusTL: { default: 0 },
            borderRadiusTR: { default: 0 },
            borderRadiusBL: { default: 0 },
            borderRadiusBR: { default: 0 },
            filter: { default: "none" },
            objectFit: { default: "cover" },
            objectPosition: { default: "center" },
            aspectRatio: { default: "auto" },
            height: { default: "auto" },
            caption: {
                default: "",
            },
            src: {
                default: null,
            },
            alt: {
                default: null,
            },
            title: {
                default: null,
            },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(ImageNode);
    },
});
