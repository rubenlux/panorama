import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiJson } from "../api";
import { format } from "date-fns";

export default function Category() {
    const { slug } = useParams();
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        apiJson(`/articles?category=${slug}`)
            .then((data) => setArticles(data.items || []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) return <div>Cargando...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            <h1 style={{ marginBottom: 30, fontSize: "2.5rem", borderBottom: "1px solid #ddd", paddingBottom: 10 }}>
                Categoría: {slug}
            </h1>

            {articles.length === 0 ? (
                <p>No hay noticias en esta categoría.</p>
            ) : (
                <div style={{ display: "grid", gap: 30 }}>
                    {articles.map((article) => (
                        <article key={article.id} style={{ display: "grid", gap: 10 }}>
                            <h2 style={{ fontSize: "1.8rem", margin: 0 }}>
                                <Link to={`/article/${article.slug}`} style={{ color: "#333", textDecoration: "none" }}>{article.title}</Link>
                            </h2>
                            <div style={{ color: "#666", fontSize: "0.9rem" }}>
                                Publicado el {article.published_at ? format(new Date(article.published_at), "dd/MM/yyyy") : "Borrador"}
                            </div>
                            {article.excerpt && (
                                <p style={{ margin: 0, fontSize: "1.1rem", lineHeight: 1.5 }}>
                                    {article.excerpt}
                                </p>
                            )}
                            <Link to={`/article/${article.slug}`} style={{ color: "#2b5cff", textDecoration: "none", fontWeight: "bold" }}>
                                Leer más &rarr;
                            </Link>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
