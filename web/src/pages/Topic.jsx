import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiJson, resolveUrl } from "../api";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ENTITY_LABEL = { person: "Persona", company: "Empresa", product: "Producto", organization: "Organización", location: "Lugar" };

function ArticleCard({ article }) {
  return (
    <Link to={`/article/${article.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        {article.cover_image_url && (
          <img src={resolveUrl(article.cover_image_url)} alt=""
            style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontSize: 13, color: "var(--muted, #6b7280)", marginBottom: 2 }}>{article.category_name}</div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--heading, #111)" }}>{article.title}</h3>
          {article.published_at && (
            <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 4 }}>
              {format(new Date(article.published_at), "d 'de' MMMM yyyy", { locale: es })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function Topic() {
  const { slug } = useParams();
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiJson(`/topics/${slug}`)
      .then(setTopic)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted, #9ca3af)" }}>Cargando tema…</div>;
  if (error || !topic) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "var(--muted, #6b7280)" }}>Tema no encontrado</p>
      <Link to="/" style={{ color: "var(--accent, #2563eb)" }}>Volver al inicio</Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: "var(--muted, #9ca3af)", marginBottom: 20 }}>
        <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Panorama</Link>
        <span style={{ margin: "0 6px" }}>›</span>
        {topic.region && <><Link to={`/region/${topic.region}`} style={{ color: "inherit", textDecoration: "none" }}>{topic.region.toUpperCase()}</Link><span style={{ margin: "0 6px" }}>›</span></>}
        <span style={{ color: "var(--heading, #374151)" }}>{topic.name}</span>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, alignItems: "start" }}>
        {/* Main */}
        <main>
          {/* Topic header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {topic.category && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent, #2563eb)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {topic.category}
                </span>
              )}
              {topic.region && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted, #6b7280)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  · {topic.region}
                </span>
              )}
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800, lineHeight: 1.25, color: "var(--heading, #111)" }}>{topic.name}</h1>
            {topic.description && <p style={{ margin: 0, fontSize: 15, color: "var(--muted, #6b7280)", lineHeight: 1.6 }}>{topic.description}</p>}

            {/* Stats */}
            <div style={{ display: "flex", gap: 20, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border, #e5e7eb)" }}>
              {[
                { v: topic.articles?.length  || 0, l: "artículos" },
                { v: topic.research?.length  || 0, l: "investigaciones" },
                { v: topic.entities?.length  || 0, l: "entidades" },
              ].map(s => (
                <div key={s.l}>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{s.v}</span>
                  <span style={{ color: "var(--muted, #9ca3af)", fontSize: 13, marginLeft: 4 }}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Articles */}
          {(topic.articles || []).length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--heading, #111)" }}>Artículos</h2>
              {topic.articles.filter(a => a.status === "published").map(a => <ArticleCard key={a.id} article={a} />)}
            </section>
          )}

          {/* Timeline */}
          {(topic.events || []).length > 0 && (
            <section>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Timeline</h2>
              <div style={{ position: "relative", paddingLeft: 20 }}>
                <div style={{ position: "absolute", left: 6, top: 0, bottom: 0, width: 2, background: "var(--border, #e5e7eb)" }} />
                {topic.events.map((ev, i) => (
                  <div key={i} style={{ marginBottom: 16, position: "relative" }}>
                    <div style={{ position: "absolute", left: -18, top: 5, width: 8, height: 8, borderRadius: "50%", background: "var(--accent, #2563eb)" }} />
                    <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginBottom: 2 }}>
                      {ev.event_date ? format(new Date(ev.event_date), "d MMM yyyy", { locale: es }) : "Reciente"} · {ev.entity_name}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                    {ev.summary && <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted, #6b7280)" }}>{ev.summary}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Sidebar */}
        <aside>
          {/* Entities */}
          {(topic.entities || []).length > 0 && (
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Entidades clave</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topic.entities.slice(0, 8).map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#e5e7eb", color: "#374151", textTransform: "uppercase" }}>
                      {ENTITY_LABEL[e.entity_type] || e.entity_type}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Research */}
          {(topic.research || []).length > 0 && (
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Investigaciones</h3>
              {topic.research.map(r => (
                <div key={r.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                  {r.executive_summary && (
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted, #6b7280)", lineHeight: 1.4 }}>
                      {r.executive_summary.slice(0, 100)}…
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
