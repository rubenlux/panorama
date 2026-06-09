import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiJson, pickArticle, resolveUrl } from "../api";

export default function ArticlePreview() {
    const { slug } = useParams();
    const [article, setArticle] = useState(null);
    const [err, setErr] = useState("");

    useEffect(() => {
        apiJson(`/articles/admin/${slug}`, { auth: true })
            .then(data => setArticle(pickArticle(data)))
            .catch(e => setErr(e.message));
    }, [slug]);

    if (err) return <div style={{ padding: 40, color: "red", textAlign: "center" }}>Error: {err}</div>;
    if (!article) return <div style={{ padding: 40, textAlign: "center" }}>Cargando vista preliminar...</div>;

    // Basic styling mimicking a news article
    return (
        <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: "40px 20px" }}>
            <div style={{ maxWidth: 800, margin: "0 auto", background: "white", padding: 40, borderRadius: 8, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>

                {/* Header */}
                <div style={{ marginBottom: 30 }}>
                    <span style={{
                        background: "#2563EB", color: "white", padding: "4px 8px",
                        borderRadius: 4, fontSize: 12, fontWeight: "bold", textTransform: "uppercase"
                    }}>
                        Vista Preliminar (Borrador)
                    </span>
                    <h1 style={{ fontSize: "2.5rem", fontWeight: 800, lineHeight: 1.2, marginTop: 16, marginBottom: 16, color: "#111827" }}>
                        {article.title}
                    </h1>
                    {article.volanta && (
                        <h4 style={{ fontSize: "1.25rem", color: "#6B7280", fontWeight: 500, marginTop: 0, marginBottom: 16 }}>
                            {article.volanta}
                        </h4>
                    )}
                    {article.excerpt && (
                        <p style={{ fontSize: "1.25rem", color: "#374151", lineHeight: 1.6, fontStyle: "italic", borderLeft: "4px solid #3B82F6", paddingLeft: 16 }}>
                            {article.excerpt}
                        </p>
                    )}
                </div>

                {/* Featured Image */}
                {article.image_url && (
                    <div style={{ marginBottom: 40 }}>
                        <img
                            src={resolveUrl(article.image_url)}
                            alt={article.title}
                            style={{ width: "100%", height: "auto", borderRadius: 8, maxHeight: 500, objectFit: "cover" }}
                        />
                        {article.epigraph && (
                            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>
                                {article.epigraph}
                            </p>
                        )}
                    </div>
                )}

                {/* Body - using basic HTML rendering */}
                <div className="article-body" style={{ fontSize: "1.125rem", lineHeight: 1.75, color: "#374151" }}
                    dangerouslySetInnerHTML={{ __html: article.body }}
                />
            </div>

            {/* Global Preview Styles */}
            <style>{`
                .article-body p { margin-bottom: 1.5em; }
                .article-body h2 { font-size: 1.8rem; font-weight: 800; margin-top: 2em; margin-bottom: 0.8em; color: #111827; }
                .article-body h3 { font-size: 1.5rem; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.8em; color: #1f2937; }
                .article-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; }
                .article-body blockquote { border-left: 4px solid #e5e7eb; padding-left: 16px; font-style: italic; color: #4b5563; }
                .article-body ul { list-style-type: disc; padding-left: 20px; margin-bottom: 1.5em; }
                .article-body video { max-width: 100%; height: auto; border-radius: 8px; }
            `}</style>
        </div>
    );
}
