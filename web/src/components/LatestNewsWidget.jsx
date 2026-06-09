import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";

export default function LatestNewsWidget() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiJson("/articles?limit=5")
            .then(data => setArticles(data.items || []))
            .catch(err => console.error("Failed to load latest news:", err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: 10, color: "#666" }}>Cargando noticias...</div>;
    if (articles.length === 0) return null;

    return (
        <div style={{ marginBottom: 30, padding: 0 }}>
            <h4 style={{
                margin: "0 0 15px 0",
                fontSize: "1.1rem",
                borderBottom: "2px solid #2b5cff",
                paddingBottom: 8,
                display: "inline-block"
            }}>
                Últimas noticias
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {articles.map(a => (
                    <Link
                        key={a.id}
                        to={`/article/${a.slug}`}
                        style={{ textDecoration: "none", color: "inherit", display: "block" }}
                        className="latest-news-item"
                    >
                        <h5 style={{ margin: "0 0 5px 0", fontSize: "0.95rem", lineHeight: 1.4, fontWeight: "600" }}>
                            {a.title}
                        </h5>
                        <div style={{ fontSize: "0.8rem", color: "#666" }}>
                            {new Date(a.published_at || a.created_at).toLocaleDateString()}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
