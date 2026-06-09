import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiJson } from "../api";
import {
    Clock,
    FileText,
    Edit3,
    Download,
    ArrowLeft,
    Activity,
    MapPin,
    BarChart,
    ChevronRight,
    Search,
    PenTool
} from "lucide-react";

export default function UserPerformance() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);
    const [exporting, setExporting] = useState(false);

    useEffect(() => { loadData(); }, [id, days]);

    async function loadData() {
        setLoading(true);
        try {
            const [uData, sData] = await Promise.all([
                apiJson(`/users/${id}`, { auth: true }),
                apiJson(`/users/performance/stats?userId=${id}&days=${days}`, { auth: true })
            ]);
            setUser(uData.user);
            setStats(sData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleExport() {
        setExporting(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_BASE}/users/performance/export?userId=${id}&days=${days}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte_actividad_${user?.email || 'usuario'}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            alert("Error al exportar: " + e.message);
        } finally {
            setExporting(false);
        }
    }

    if (loading) return <div style={styles.loading}>Analizando rendimiento...</div>;
    if (!user) return <div style={styles.error}>Usuario no encontrado</div>;

    const hoursTotal = Math.floor(stats.activeMinutes / 60);
    const minsTotal = stats.activeMinutes % 60;
    const wordsPerHour = hoursTotal > 0 ? Math.round(stats.totalWords / (stats.activeMinutes / 60)) : stats.totalWords;

    // Heatmap formatting
    const heatmapMax = stats.heatmap?.length > 0 ? Math.max(...stats.heatmap.map(h => h.count)) : 0;
    const hourRange = Array.from({ length: 24 }, (_, i) => i);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button onClick={() => navigate(-1)} style={styles.backBtn}>
                    <ArrowLeft size={20} />
                </button>
                <div style={styles.headerInfo}>
                    <h1 style={styles.title}>Rendimiento Editorial</h1>
                    <p style={styles.subtitle}>Métrica avanzada para {user.name || user.email}</p>
                </div>
                <div style={styles.actions}>
                    <select value={days} onChange={(e) => setDays(e.target.value)} style={styles.select}>
                        <option value={7}>Últimos 7 días</option>
                        <option value={15}>Últimos 15 días</option>
                        <option value={30}>Último mes</option>
                    </select>
                    <button onClick={handleExport} disabled={exporting} style={styles.exportBtn}>
                        <Download size={18} /> {exporting ? 'Generando...' : 'Exportar CSV'}
                    </button>
                </div>
            </div>

            <div style={styles.grid}>
                <StatCard
                    icon={<Clock size={24} />}
                    label="Tiempo Activo"
                    value={`${hoursTotal}h ${minsTotal}m`}
                    info="Actividad real detectada"
                    bg="#f0f9ff" color="#0369a1"
                />
                <StatCard
                    icon={<PenTool size={24} />}
                    label="Total Palabras"
                    value={stats.totalWords.toLocaleString()}
                    info={`${wordsPerHour} palabras/hora`}
                    bg="#fdf2f8" color="#9d174d"
                />
                <StatCard
                    icon={<FileText size={24} />}
                    label="Publicaciones"
                    value={stats.published}
                    info="Artículos lanzados"
                    bg="#f0fdf4" color="#15803d"
                />
            </div>

            {/* Heatmap Section */}
            <div style={styles.sectionCard}>
                <h3 style={styles.sectionTitle}><BarChart size={18} /> Mapa de Calor de Actividad (24h)</h3>
                <div style={styles.heatmapChart}>
                    {hourRange.map(h => {
                        const hData = stats.heatmap.find(d => d.hour === h);
                        const intensity = heatmapMax > 0 ? (hData?.count || 0) / heatmapMax : 0;
                        return (
                            <div key={h} style={styles.heatmapBarWrapper}>
                                <div style={{
                                    ...styles.heatmapBar,
                                    height: `${intensity * 100}%`,
                                    background: intensity > 0.5 ? '#2b5cff' : '#cbd5e1'
                                }} />
                                <span style={styles.heatmapLabel}>{h}h</span>
                            </div>
                        );
                    })}
                </div>
                <p style={styles.sectionDesc}>Muestra la distribución de actividad del usuario a lo largo de las 24 horas del día.</p>
            </div>

            <div style={styles.mainLayout}>
                <div style={styles.historySection}>
                    <h2 style={styles.sectionTitle}><Activity size={18} /> Historial de Actividad Reciente</h2>
                    <div style={styles.logList}>
                        {stats.recentActivity.map((log, i) => (
                            <div key={i} style={styles.logItem}>
                                <div style={styles.logTime}>
                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    <span style={styles.logDate}>{new Date(log.created_at).toLocaleDateString()}</span>
                                </div>
                                <div style={styles.logContent}>
                                    <div style={styles.logHeader}>
                                        <span style={{ ...styles.logBadge, ...getBadgeStyle(log.event) }}>
                                            {formatEvent(log.event)}
                                        </span>
                                        <span style={styles.logAction}>
                                            {log.payload?.title || (log.event === 'profile_update' ? 'Perfil Actualizado' : 'Ingreso al Sistema')}
                                        </span>
                                    </div>
                                    <div style={styles.logMeta}>
                                        {log.payload?.word_count && (
                                            <span style={styles.logMetaItem}><PenTool size={12} /> {log.payload.word_count} palabras</span>
                                        )}
                                        {log.event === 'login' && log.payload?.city && (
                                            <span style={styles.logMetaItem}><MapPin size={12} /> {log.payload.city}, {log.payload.country} ({log.payload.ip})</span>
                                        )}
                                        {log.payload?.slug && (
                                            <span style={styles.logMetaItem}>Slug: {log.payload.slug}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <aside style={styles.userSidebar}>
                    <div style={styles.profileCard}>
                        {user.avatar_url ? (
                            <img src={user.avatar_url} style={styles.sideAvatar} />
                        ) : (
                            <div style={styles.sideAvatarPlaceholder}>{user.email.charAt(0).toUpperCase()}</div>
                        )}
                        <h4 style={styles.sideName}>{user.name || 'Sin nombre'}</h4>
                        <p style={styles.sideEmail}>{user.email}</p>
                        <div style={styles.sideBadge}>{user.role}</div>

                        <div style={styles.sideStats}>
                            <div style={styles.sideStatItem}>
                                <span>Registrado</span>
                                <span>{new Date(user.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, info, bg, color }) {
    return (
        <div style={styles.card}>
            <div style={{ ...styles.iconCircle, background: bg, color }}>{icon}</div>
            <div style={styles.cardContent}>
                <span style={styles.cardLabel}>{label}</span>
                <h3 style={styles.cardValue}>{value}</h3>
                <p style={styles.cardInfo}>{info}</p>
            </div>
        </div>
    );
}

function formatEvent(ev) {
    const map = {
        article_publish: 'Publicado',
        article_edit: 'Editado',
        article_create: 'Creado',
        login: 'Sesión',
        profile_update: 'Perfil'
    };
    return map[ev] || ev;
}

function getBadgeStyle(ev) {
    if (ev === 'article_publish') return { background: '#dcfce7', color: '#166534' };
    if (ev === 'article_edit') return { background: '#fef3c7', color: '#92400e' };
    if (ev === 'login') return { background: '#e0f2fe', color: '#075985' };
    return { background: '#f3f4f6', color: '#4b5563' };
}

const styles = {
    container: { maxWidth: 1200, margin: '0 auto', padding: '20px 40px' },
    header: { display: 'flex', alignItems: 'center', marginBottom: 30, gap: 16 },
    backBtn: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' },
    headerInfo: { flex: 1 },
    title: { fontSize: '1.8rem', fontWeight: 800, margin: 0, color: '#0f172a' },
    subtitle: { margin: '4px 0 0', color: '#64748b', fontSize: 14 },
    actions: { display: 'flex', gap: 12 },
    select: { padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 14, outline: 'none', cursor: 'pointer' },
    exportBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 32 },
    card: { background: 'white', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
    iconCircle: { width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    cardContent: { flex: 1 },
    cardLabel: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' },
    cardValue: { fontSize: '1.5rem', fontWeight: 800, margin: '4px 0', color: '#1e293b' },
    cardInfo: { fontSize: 11, color: '#64748b', margin: 0 },
    sectionCard: { background: 'white', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9', marginBottom: 32, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
    sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', fontWeight: 700, marginBottom: 20, color: '#1e293b', margin: 0 },
    sectionDesc: { fontSize: 12, color: '#64748b', marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 },
    heatmapChart: { display: 'flex', alignItems: 'flex-end', height: 80, gap: 4, padding: '10px 0' },
    heatmapBarWrapper: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%' },
    heatmapBar: { width: '100%', borderRadius: 3, transition: 'all 0.3s ease' },
    heatmapLabel: { fontSize: 9, color: '#94a3b8', fontWeight: 600 },
    mainLayout: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32 },
    historySection: { background: 'white', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9' },
    logList: { display: 'flex', flexDirection: 'column', gap: 0, marginTop: 20 },
    logItem: { display: 'flex', gap: 20, padding: '16px 0', borderBottom: '1px solid #f1f5f9' },
    logTime: { width: 80, display: 'flex', flexDirection: 'column', fontSize: 13, fontWeight: 600, color: '#1e293b' },
    logDate: { fontSize: 10, color: '#94a3b8', fontWeight: 400 },
    logContent: { flex: 1 },
    logHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
    logBadge: { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 },
    logAction: { fontSize: 14, fontWeight: 600, color: '#1e293b' },
    logMeta: { display: 'flex', flexDirection: 'column', gap: 4 },
    logMetaItem: { fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 },
    userSidebar: { display: 'flex', flexDirection: 'column', gap: 20 },
    profileCard: { background: 'white', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9', textAlign: 'center' },
    sideAvatar: { width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 12, border: '3px solid #f8fafc' },
    sideAvatarPlaceholder: { width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', color: 'white', fontSize: 32, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
    sideName: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' },
    sideEmail: { fontSize: 13, color: '#64748b', margin: '4px 0 12px' },
    sideBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: 10, background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' },
    sideStats: { marginTop: 24, paddingTop: 20, borderTop: '1px solid #f1f5f9' },
    sideStatItem: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 8 },
    loading: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 600 },
    error: { padding: 40, textAlign: 'center', color: '#ef4444', fontWeight: 600 }
};
