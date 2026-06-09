import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../api.js";

const REGION_EMOJI = {
  argentina:  "🇦🇷",
  nea:        "🗺️",
  formosa:    "📍",
  chaco:      "📍",
  corrientes: "📍",
  misiones:   "📍",
};

export default function Regions() {
  const navigate = useNavigate();
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/topics/regions", { auth: true })
      .then(setRegions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>🗺️ Hubs Regionales</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>Cobertura periodística por región</p>
        </div>
        <button onClick={() => navigate("/topics")}
          style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          ← Todos los Temas
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: 60 }}>Cargando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {regions.map(r => (
            <div key={r.slug}
              onClick={() => navigate(`/topics/regions/${r.slug}`)}
              style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, cursor: "pointer", transition: "box-shadow .15s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{REGION_EMOJI[r.slug] || "📍"}</div>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>{r.name}</h2>
              <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{r.topic_count || 0}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Temas</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{r.article_count || 0}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Artículos</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
