import React, { useState, useEffect } from "react";
import { apiJson } from "../api.js";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Sankey
} from 'recharts';
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { scaleLinear } from "d3-scale";

// Geo Map URL
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function Card({ title, subtitle, badge, badgeColor = "#ff6b6b", onClick }) {
  return (
    <div style={{ ...styles.card, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{subtitle}</div>
        </div>
        {badge ? (
          <span style={{ ...styles.badge, background: badgeColor }}>{badge}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  // Existing specific stats
  const [stats, setStats] = useState({ articles: 0, users: 0, comments: 0, categories: 0 });

  // New Pixel Data
  const [realtime, setRealtime] = useState([]);
  const [overview, setOverview] = useState(null);
  const [authors, setAuthors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [engagement, setEngagement] = useState([]);
  const [traffic, setTraffic] = useState([]);
  const [geo, setGeo] = useState([]);
  const [journey, setJourney] = useState([]); // List for old widget
  const [trafficFlow, setTrafficFlow] = useState({ nodes: [], links: [] }); // Graph for new Sankey
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Parallel Fetch: Legacy Stats + New Pixel Analytics
        const [statsRes, ovData, rtData, authData, catData, engData, trafficData, geoData, journeyData, histData, flowData] = await Promise.all([
          apiJson("/stats", { auth: true }),
          apiJson('/analytics/v2/editorial/overview', { auth: true }),
          apiJson('/analytics/v2/editorial/realtime', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/authors', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/categories', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/engagement', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/traffic', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/geo', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/journey', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/history', { auth: true }),
          apiJson('/analytics/v2/editorial/insights/flow', { auth: true })
        ]);

        if (statsRes?.stats) setStats(statsRes.stats);
        setOverview(ovData);
        setRealtime(rtData.data || []);
        setAuthors(authData.data || []);
        setCategories(catData.data || []);
        setEngagement(engData.data || []);
        setTraffic(trafficData.data || []);
        setGeo(geoData.data || []);
        setJourney(journeyData.data || []);
        setHistory(histData.data || []);
        setTrafficFlow(flowData.data || { nodes: [], links: [] });

      } catch (e) {
        console.error("Dashboard Data Fetch Error", e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  const kpis = overview?.kpis || { views_24h: 0, active_users_5m: 0 };
  const topArticles = overview?.top_articles || [];

  // Chart Data Preparation
  const chartData = realtime.map(r => ({
    time: new Date(r.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    views: parseInt(r.views)
  }));

  // NEW: History & Map Data Prep
  const historyChartData = history.map(h => ({
    date: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    views: parseInt(h.views),
    visitors: parseInt(h.visitors)
  }));

  // ... (render existing widgets) ...

  {/* 3. Traffic Journey (Sankey Flow or Enhanced List) */ }
  <div style={{ ...styles.panel, marginTop: 20 }}>
    <div style={styles.panelHeader}>
      <div style={styles.panelTitle}>📍 Flujo de Tráfico (Journey)</div>
      <div style={styles.panelSub}>Source ➔ Destination</div>
    </div>
    <div style={{ height: 300, marginTop: 20 }}>
      {trafficFlow.nodes.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={trafficFlow}
            node={{ stroke: '#77c878', strokeWidth: 0 }}
            nodePadding={50}
            margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
            link={{ stroke: '#77c878' }}
          >
            <Tooltip />
          </Sankey>
        </ResponsiveContainer>
      ) : (
        <div style={styles.empty}>Sin datos de flujo suficientes para graficar</div>
      )}
    </div>
  </div>

  const maxGeoViews = Math.max(...(geo.length > 0 ? geo.map(g => parseInt(g.views)) : [0]), 10);
  const colorScale = scaleLinear()
    .domain([0, maxGeoViews])
    .range(["#E2E8F0", "#3B82F6"]);

  return (
    <div>
      {/* Top Header */}
      <div style={styles.topRow}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>News CMS</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", marginTop: 2 }}>
            Panel de Control
          </div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ fontWeight: 600, color: "#64748b", fontSize: 14 }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* Row 1: Operational Shortcuts (Preserved) */}
      <div style={styles.gridCards}>
        <Card
          title="Crear Noticia"
          subtitle="Redactar artículo"
          badge="+" badgeColor="#22c55e"
          onClick={() => navigate("/posts/new")}
        />
        <Card
          title="Artículos"
          subtitle={`${stats.articles} Publicados`}
          badge="Total" badgeColor="#3b82f6"
        />
        <Card
          title="Comentarios"
          subtitle={`${stats.comments} Aprobados`}
          badge="Comunidad" badgeColor="#f59e0b"
        />
        <Card
          title="Autores"
          subtitle={`${stats.users} Activos`}
          badge="Staff" badgeColor="#6366f1"
        />
      </div>

      {/* Row 2: Real-time Traffic (New Pixel) */}
      <div style={styles.gridMain}>
        {/* Live Chart */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelTitle}>Tráfico Real (Última Hora)</div>
              <div style={styles.panelSub}>Page Views por minuto</div>
            </div>
            <div style={styles.badgeLabel}>En Vivo 🔴</div>
          </div>
          <div style={{ height: 250, marginTop: 20 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="views" stroke="#2563EB" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                <div style={{ fontSize: 24 }}>📉</div>
                <div style={{ fontSize: 13, marginTop: 10 }}>Sin actividad reciente (1h)</div>
              </div>
            )}
          </div>
        </div>

        {/* Real-time KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={styles.panel}>
            <div style={styles.kpiTitle}>USUARIOS ACTIVOS (5m)</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#2563EB", display: 'flex', alignItems: 'center', gap: 10 }}>
              {kpis.active_users_5m}
              <div style={{ width: 12, height: 12, background: '#60A5FA', borderRadius: '50%', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '50%', background: '#60A5FA', opacity: 0.5, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
              </div>
            </div>
          </div>
          <div style={styles.panel}>
            <div style={styles.kpiTitle}>VISTAS HOY (24h)</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#1e293b" }}>
              {kpis.views_24h.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Insights Grid */}
      <div style={styles.gridThree}>
        {/* Top Articles */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>🔥 Top Contenido</div>
          </div>
          <div style={{ marginTop: 15 }}>
            {topArticles.map((a, i) => (
              <div key={i} style={{ ...styles.listItem, cursor: 'pointer' }} onClick={() => navigate(`/dashboard/article/${a.article_id}`)}>
                <div style={styles.rankNum}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.title}>
                  {a.title || 'Untitled Article'}
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#2563EB" }}>
                  {parseInt(a.views).toLocaleString()}
                </div>
              </div>
            ))}
            {topArticles.length === 0 && <div style={styles.empty}>Sin datos aún</div>}
          </div>
        </div>

        {/* Authors */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>✍️ Top Autores</div>
          </div>
          <div style={{ marginTop: 15 }}>
            {authors.map((a, i) => (
              <div key={i} style={styles.listItem}>
                <div style={{ ...styles.rankNum, background: '#f3e8ff', color: '#7e22ce' }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, color: "#475569" }}>{a.author_name}</div>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#7e22ce" }}>
                  {parseInt(a.views).toLocaleString()}
                </div>
              </div>
            ))}
            {authors.length === 0 && <div style={styles.empty}>Sin datos aún</div>}
          </div>
        </div>

        {/* Categories */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>🚀 Tendencias</div>
          </div>
          <div style={{ marginTop: 15 }}>
            {categories.map((c, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "#475569" }}>{c.category_name}</span>
                  <span style={{ fontWeight: 700, color: "#16a34a" }}>{c.views}</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: "#22c55e", width: `${(parseInt(c.views) / Math.max(...categories.map(cat => parseInt(cat.views)))) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {categories.length === 0 && <div style={styles.empty}>Sin datos aún</div>}
          </div>
        </div>

        {/* Traffic Sources (SEO & UTM) */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>🚦 Fuentes de Tráfico</div>
          </div>
          <div style={{ marginTop: 15 }}>
            {traffic.map((t, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: "#475569" }}>
                        {t.domain || 'Direct / Unknown'}
                      </span>
                      <span style={{ fontSize: 9, padding: '2px 4px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>{t.category}</span>
                    </div>
                    {t.utm_source !== 'N/A' && (
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>via {t.utm_source}</div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{t.views}</span>
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: t.category === 'Search' ? '#3b82f6' : t.category === 'Social' ? '#ec4899' : t.category === 'Direct' ? '#94a3b8' : '#22c55e',
                    width: `${(parseInt(t.views) / Math.max(...traffic.map(trk => parseInt(trk.views)))) * 100}%`
                  }}></div>
                </div>
              </div>
            ))}
            {traffic.length === 0 && <div style={styles.empty}>Sin datos aún</div>}
          </div>
        </div>
      </div>

      {/* Row 3.5: Advanced Analytics (Geo & Journey) */}
      <div style={{ ...styles.gridMain, marginTop: 20 }}>


        {/* User Journey (Simple) */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>📍 Top Landing Pages</div>
            <div style={styles.panelSub}>Puntos de entrada</div>
          </div>
          <div style={{ marginTop: 15 }}>
            {journey.map((j, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2563EB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.landing_page}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {j.sessions} Sesiones iniciadas
                </div>
              </div>
            ))}
            {journey.length === 0 && <div style={styles.empty}>Sin datos de viaje</div>}
          </div>
        </div>
      </div>

      {/* Row 4: Engagement Funnel */}
      <div style={{ ...styles.panel, marginTop: 20 }}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>⚓ Retención de Lectura (Scroll)</div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', height: 150, gap: 10 }}>
          {engagement.map((step) => {
            const maxVal = Math.max(...engagement.map(e => parseInt(e.count)));
            const height = maxVal ? (parseInt(step.count) / maxVal) * 100 : 0;
            return (
              <div key={step.depth} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ width: '100%', background: '#bfdbfe', borderRadius: '4px 4px 0 0', height: `${height}%`, position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ position: 'absolute', top: -20, fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{step.count}</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#64748b" }}>{step.depth}%</div>
              </div>
            )
          })}
          {engagement.length === 0 && <div style={styles.empty}>Esperando datos de scroll...</div>}
        </div>
      </div>

      {/* =================================================================================
          SECTION: ADVANCED ANALYTICS (SimilarWeb Style)
          Added below existing dashboard as requested.
         ================================================================================= */}

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
        <div style={{ ...styles.topRow, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Advanced Insights</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
              Tendencias & Audiencia
            </div>
          </div>
        </div>

        {/* 1. Traffic History Trend */}
        <div style={{ ...styles.panel, marginBottom: 20 }}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>📈 Tendencia de Tráfico (30 Días)</div>
            <div style={styles.panelSub}>Visitas vs Usuarios Únicos</div>
          </div>
          <div style={{ height: 300, marginTop: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyChartData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="views" name="Visitas" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
                <Area type="monotone" dataKey="visitors" name="Únicos" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Geo Map & Channel Distribution */}
        <div style={styles.gridMain}>
          {/* Map */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div style={styles.panelTitle}>🌍 Distribución Geográfica</div>
            </div>
            <div style={{ marginTop: 20, height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposableMap projectionConfig={{ scale: 140 }}>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                      geographies.map((geoItem) => {
                        const countryCode = geoItem.properties.ISO_A2;
                        const cur = geo.find(g => g.country_code === countryCode) || { views: 0 };
                        return (
                          <Geography
                            key={geoItem.rsmKey}
                            geography={geoItem}
                            fill={cur.views > 0 ? colorScale(cur.views) : "#F1F5F9"}
                            stroke="#CBD5E1"
                            strokeWidth={0.5}
                            style={{
                              default: { outline: "none" },
                              hover: { fill: "#3B82F6", outline: "none" },
                              pressed: { outline: "none" },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              </ResponsiveContainer>
            </div>
            {/* Geo Legend / List */}
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {geo.slice(0, 5).map((g, i) => (
                <div key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: colorScale(g.views), borderRadius: '50%', display: 'block' }}></span>
                  {g.country_code}: <strong>{g.views}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Channel Bars */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div style={styles.panelTitle}>🚦 Canales de Tráfico</div>
            </div>
            <div style={{ margin: '20px 0', height: 260 }}>
              {traffic.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={traffic.slice(0, 10)} margin={{ left: 0, right: 20, bottom: 0, top: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="domain" type="category" width={100} tick={{ fontSize: 11, width: 90 }} interval={0} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: 'none' }} />
                    <Bar dataKey="views" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={16}>
                      {
                        traffic.map((entry, index) => (
                          <cell key={`cell-${index}`} fill={entry.category === 'Search' ? '#3b82f6' : entry.category === 'Social' ? '#ec4899' : '#10b981'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={styles.empty}>Sin datos</div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Traffic Journey (Sankey Flow or Enhanced List) */}
        <div style={{ ...styles.panel, marginTop: 20 }}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>📍 Flujo de Tráfico (Journey)</div>
            <div style={styles.panelSub}>Source ➔ Destination</div>
          </div>
          <div style={{ height: 300, marginTop: 20 }}>
            {trafficFlow.nodes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={trafficFlow}
                  node={{ stroke: '#77c878', strokeWidth: 0 }}
                  nodePadding={50}
                  margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
                  link={{ stroke: '#77c878' }}
                >
                  <Tooltip />
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <div style={styles.empty}>Sin datos de flujo suficientes para graficar</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

const styles = {
  topRow: { display: "flex", alignItems: "center", marginBottom: 20, gap: 10 },
  gridCards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15, marginBottom: 20 },
  card: { background: "white", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", transition: "transform 0.1s" },
  badge: { color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 },
  gridMain: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 20 },
  panel: { background: "white", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  panelTitle: { fontWeight: 800, color: "#0f172a", fontSize: 16 },
  panelSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  badgeLabel: { fontSize: 10, fontWeight: 700, color: "#ef4444", background: "#fee2e2", padding: "2px 6px", borderRadius: 4 },
  gridThree: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 },
  listItem: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9" },
  rankNum: { width: 20, height: 20, background: "#f1f5f9", color: "#64748b", borderRadius: 99, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" },
  kpiTitle: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  empty: { padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 13, fontStyle: 'italic' }
};
