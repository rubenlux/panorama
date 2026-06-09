import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiJson, resolveUrl } from "../api";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const REGION_NAME = {
  argentina:  "Argentina",
  nea:        "Nordeste Argentino",
  formosa:    "Formosa",
  chaco:      "Chaco",
  corrientes: "Corrientes",
  misiones:   "Misiones",
};

const ENTITY_LABEL = { person: "Persona", company: "Empresa", product: "Producto", organization: "Org.", location: "Lugar" };

export default function Region() {
  const { slug } = useParams();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    apiJson(`/topics/regions/${slug}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted, #9ca3af)" }}>Cargando región…</div>;
  if (error || !data) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "var(--muted, #6b7280)" }}>Región no encontrada</p>
      <Link to="/" style={{ color: "var(--accent, #2563eb)" }}>Volver al inicio</Link>
    </div>
  );

  const { region, topics, articles, entities } = data;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: "var(--muted, #9ca3af)", marginBottom: 20 }}>
        <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Panorama</Link>
        <span style={{ margin: "0 6px" }}>›</span>
        <span>Regiones</span>
        <span style={{ margin: "0 6px" }}>›</span>
        <span style={{ color: "var(--heading, #374151)" }}>{REGION_NAME[slug] || slug}</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 800, color: "var(--heading, #111)" }}>
          {REGION_NAME[slug] || region.name}
        </h1>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { v: topics?.length  || 0, l: "temas activos" },
            { v: articles?.length || 0, l: "noticias recientes" },
            { v: entities?.length || 0, l: "entidades clave" },
          ].map(s => (
            <div key={s.l}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>{s.v}</span>
              <span style={{ color: "var(--muted, #9ca3af)", fontSize: 13, marginLeft: 4 }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, alignItems: "start" }}>
        {/* Main */}
        <main>
          {/* Recent articles */}
          {articles?.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--heading, #111)", paddingBottom: 8, borderBottom: "2px solid var(--accent, #2563eb)" }}>
                Noticias recientes
              </h2>
              <div style={{ display: "grid", gap: 14 }}>
                {articles.slice(0, 10).map(a => (
                  <Link key={a.id} to={`/article/${a.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                      {a.cover_image_url && (
                        <img src={resolveUrl(a.cover_image_url)} alt=""
                          style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ fontSize: 12, color: "var(--muted, #6b7280)", marginBottom: 2 }}>{a.category_name}</div>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{a.title}</h3>
                        {a.published_at && (
                          <div style={{ fontSize: 11, color: "var(--muted, #9ca3af)", marginTop: 3 }}>
                            {format(new Date(a.published_at), "d MMM yyyy", { locale: es })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Active topics */}
          {topics?.length > 0 && (
            <section>
              <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, paddingBottom: 8, borderBottom: "2px solid var(--accent, #2563eb)" }}>
                Temas activos
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {topics.map(t => (
                  <Link key={t.id} to={`/topic/${t.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ background: "#f9fafb", borderRadius: 10, padding: 14,
                      border: "1px solid var(--border, #e5e7eb)", transition: "box-shadow .15s" }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.07)"}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
                      {t.category && <div style={{ fontSize: 12, color: "var(--muted, #6b7280)" }}>{t.category}</div>}
                      <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 8 }}>
                        {t.article_count || 0} artículos
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Sidebar — top entities */}
        <aside>
          {entities?.length > 0 && (
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Entidades más mencionadas</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {entities.map(e => (
                  <div key={e.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                      <span style={{ fontSize: 11, color: "var(--muted, #9ca3af)" }}>{e.mention_count}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted, #9ca3af)", textTransform: "capitalize" }}>
                      {ENTITY_LABEL[e.entity_type] || e.entity_type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
