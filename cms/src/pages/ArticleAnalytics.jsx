import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson } from '../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from 'recharts';

export default function ArticleAnalytics() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchArticleData = async () => {
            try {
                const res = await apiJson(`/analytics/v2/editorial/article/${id}`, { auth: true });
                setData(res);
            } catch (e) {
                console.error("Failed to fetch article analytics", e);
            } finally {
                setLoading(false);
            }
        };
        fetchArticleData();
    }, [id]);

    if (loading) return <div style={{ padding: 40, color: "#64748b" }}>Cargando análisis...</div>;
    if (!data) return <div style={{ padding: 40, color: "#ef4444" }}>No se encontraron datos para este artículo.</div>;

    const { meta, views_series, scroll_funnel, engagement, seo_gold } = data;
    const { reading_time_seconds, exit_intent_count } = seo_gold || { reading_time_seconds: 0, exit_intent_count: 0 };

    // --- Data Processing for Charts ---
    const chartData = views_series.map(v => ({
        time: new Date(v.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        views: parseInt(v.views)
    }));

    // Funnel Logic
    const getCount = (depth) => {
        const item = scroll_funnel.find(s => parseInt(s.depth) === depth);
        return item ? parseInt(item.count) : 0;
    };

    const steps = [25, 50, 75, 100];
    const totalViews = views_series.reduce((sum, v) => sum + parseInt(v.views), 0);

    const funnelMetrics = steps.map((depth, i) => {
        const count = getCount(depth);
        const prevCount = i === 0 ? totalViews : getCount(steps[i - 1]);
        const dropOffCount = prevCount - count;
        const dropOffRate = prevCount ? ((dropOffCount / prevCount) * 100).toFixed(1) : 0;
        return { depth, count, dropOffRate, dropOffCount };
    });

    return (
        <div style={styles.container}>
            {/* Nav & Header */}
            <div style={styles.header}>
                <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
                    ← Volver al Dashboard
                </button>
                <h1 style={styles.title}>{meta.title}</h1>
                <div style={styles.metaRow}>
                    <span style={styles.metaItem}>📅 {new Date(meta.published_at).toLocaleDateString()}</span>
                    <span style={styles.metaItem}>🔗 ID: {meta.id.substring(0, 8)}...</span>
                    <a href={`http://localhost:5174/article/${meta.slug}`} target="_blank" rel="noreferrer" style={{ ...styles.metaItem, color: '#3b82f6', textDecoration: 'none' }}>
                        ↗ Ver Artículo
                    </a>
                </div>
            </div>

            {/* KPI Cards Row - SEO GOLD INJECTED */}
            <div style={styles.kpiGrid}>
                <Card title="Vistas Totales (24h)" value={totalViews.toLocaleString()} icon="👁️" color="#3b82f6" />
                <Card
                    title="Tiempo de Lectura Real"
                    value={`${Math.floor(reading_time_seconds / 60)}m ${reading_time_seconds % 60}s`}
                    sub="Atención activa acumulada"
                    icon="⏱️"
                    color="#10b981"
                />
                <Card
                    title="Carga de Contenido"
                    value={data.seo_gold.avg_load_time > 0 ? `${(data.seo_gold.avg_load_time / 1000).toFixed(2)}s` : 'N/A'}
                    sub="Velocidad percibida (LCP)"
                    icon="⚡"
                    color="#f59e0b"
                />
                <Card
                    title="Intención de Salida"
                    value={exit_intent_count}
                    sub="Abandonos prematuros"
                    icon="🚪"
                    color="#ef4444"
                />
            </div>

            <div style={styles.mainGrid}>
                {/* Left: Funnel & Drop-off */}
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <div style={styles.panelTitle}>📉 Embudo de Lectura y Abandonos</div>
                        <div style={styles.panelSub}>¿Dónde dejan de leer?</div>
                    </div>

                    <div style={styles.funnelContainer}>
                        {/* 0% / Start (Total Views) */}
                        <FunnelStep
                            label="Inicio (Vistas)"
                            count={totalViews}
                            percent={100}
                            color="#94a3b8"
                            isFirst={true}
                        />

                        {funnelMetrics.map((step) => (
                            <FunnelStep
                                key={step.depth}
                                label={`Scroll ${step.depth}%`}
                                count={step.count}
                                percent={totalViews ? Math.round((step.count / totalViews) * 100) : 0}
                                dropOffText={`${step.dropOffCount} abandonaron aquí (-${step.dropOffRate}%)`}
                                color={getStepColor(step.depth)}
                            />
                        ))}
                    </div>
                </div>

                {/* Right: Charts & Continuity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <div style={styles.panelTitle}>⏱️ Tráfico por Hora</div>
                        </div>
                        <div style={{ height: 160, marginTop: 10 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                    <Tooltip contentStyle={styles.tooltip} />
                                    <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* CONTINUITY PANEL */}
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <div style={styles.panelTitle}>🔗 Valor de Continuidad</div>
                            <div style={styles.panelSub}>¿A dónde van después?</div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            {(data.seo_gold.internal_links || []).map((link, idx) => (
                                <div key={idx} style={styles.linkRow}>
                                    <div style={styles.linkIcon}>↗</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={styles.linkUrl}>{link.url ? link.url.split('/').pop() : 'Home'}</div>
                                    </div>
                                    <div style={styles.linkCount}>{link.count} clics</div>
                                </div>
                            ))}
                            {(!data.seo_gold.internal_links || data.seo_gold.internal_links.length === 0) && (
                                <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 10 }}>
                                    No hay datos de navegación posterior
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <div style={styles.panelTitle}>📣 Interacciones Detalladas</div>
                        </div>
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {['like_click', 'share_click', 'comment_submit'].map((type) => {
                                const count = (engagement.find(e => e.type === type)?.count) || 0;
                                const icons = { like_click: '❤️', share_click: '🔗', comment_submit: '💬' };
                                const labels = { like_click: 'Likes', share_click: 'Shares', comment_submit: 'Comments' };
                                return (
                                    <div key={type} style={styles.engagementMiniBox}>
                                        <div style={{ fontSize: 20 }}>{icons[type]}</div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{count}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{labels[type]}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}

// --- Components & Styles ---

function Card({ title, value, icon, sub, color }) {
    return (
        <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>{value}</div>
                    {sub && <div style={{ fontSize: 11, color: color, fontWeight: 500 }}>{sub}</div>}
                </div>
                <div style={{ ...styles.iconBox, color: color, background: `${color}15` }}>{icon}</div>
            </div>
        </div>
    );
}

function FunnelStep({ label, count, percent, dropOffText, color, isFirst }) {
    // We visualize the bar width based on percent (max 100%)
    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>{label}</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{count} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({percent}%)</span></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Bar */}
                <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: color, transition: 'width 0.5s', borderRadius: 6 }}></div>
                </div>
            </div>

            {/* Drop-off Info (only if not start) */}
            {!isFirst && (
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 11, color: '#ef4444', background: '#fee2e2', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                        🔻 {dropOffText}
                    </div>
                </div>
            )}
            {/* Connector Line visual cue */}
            {!isFirst && <div style={{ height: 10, borderLeft: '2px dashed #e2e8f0', marginLeft: 10, marginTop: -10, marginBottom: -4, position: 'relative', top: -25, zIndex: 0 }}></div>}
        </div>
    );
}

function getStepColor(depth) {
    if (depth === 25) return '#60a5fa'; // Blue-400
    if (depth === 50) return '#3b82f6'; // Blue-500
    if (depth === 75) return '#2563eb'; // Blue-600
    if (depth === 100) return '#16a34a'; // Green-600
    return '#94a3b8';
}

const styles = {
    container: { padding: 30, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' },
    header: { marginBottom: 30 },
    backBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 10, padding: 0, fontWeight: 500 },
    title: { fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 },
    metaRow: { display: 'flex', gap: 15, marginTop: 10, fontSize: 13, color: '#64748b' },
    metaItem: { display: 'flex', alignItems: 'center', gap: 5 },

    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 30 },
    card: { background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    iconBox: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },

    mainGrid: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 30 },
    panel: { background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    panelHeader: { marginBottom: 20 },
    panelTitle: { fontSize: 16, fontWeight: 700, color: '#0f172a' },
    panelSub: { fontSize: 12, color: '#64748b', marginTop: 2 },

    funnelContainer: { display: 'flex', flexDirection: 'column', gap: 10 },

    engagementMiniBox: { background: '#f8fafc', padding: '12px 15px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #f1f5f9' },
    linkRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' },
    linkIcon: { width: 24, height: 24, borderRadius: 6, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 },
    linkUrl: { fontSize: 13, color: '#334155', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    linkCount: { fontSize: 12, color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 },

    tooltip: { borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }
};
