
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiJson } from '../api';
import { ArrowLeft, MousePointer, Eye, Users, Percent, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AdCampaignDetail() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiJson(`/analytics/v2/ads/campaign/${id}`)
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div style={{ padding: 50, textAlign: 'center' }}>Cargando analítica...</div>;
    if (!data) return <div style={{ padding: 50, textAlign: 'center' }}>Campaña no encontrada</div>;

    const { campaign, kpi, chart } = data;

    // Formatting Chart Data
    const chartData = chart.map(c => ({
        ...c,
        formattedTime: format(new Date(c.time), 'dd MMM HH:mm', { locale: es })
    }));

    return (
        <div style={{ padding: 30, background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ marginBottom: 20 }}>
                <Link to="/ads" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#64748b', textDecoration: 'none', fontWeight: 600 }}>
                    <ArrowLeft size={16} /> Volver al Gestor
                </Link>
            </div>

            {/* Header */}
            <div style={{ background: 'white', padding: 30, borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 30, display: 'flex', gap: 30, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <h1 style={{ fontSize: 28, margin: 0, color: '#0f172a' }}>{campaign.name}</h1>
                        <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            background: campaign.status === 'active' ? '#dcfce7' : '#f1f5f9',
                            color: campaign.status === 'active' ? '#16a34a' : '#64748b'
                        }}>
                            {campaign.status.toUpperCase()}
                        </span>
                    </div>
                    <div style={{ color: '#64748b', display: 'flex', gap: 20 }}>
                        <div>📍 {campaign.position}</div>
                        <div>📅 {format(new Date(campaign.start_date), 'dd MMM yyyy')} - {campaign.end_date ? format(new Date(campaign.end_date), 'dd MMM yyyy') : 'Siempre'}</div>
                    </div>
                    {campaign.tags && campaign.tags.length > 0 && (
                        <div style={{ marginTop: 15, display: 'flex', gap: 5 }}>
                            {campaign.tags.map(t => (
                                <span key={t} style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4 }}>#{t}</span>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ maxWidth: 300 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>BANNER ACTUAL</div>
                    <img src={campaign.banner_url} style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 4, border: '1px solid #e2e8f0' }} alt="" />
                </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 30 }}>
                <KpiCard icon={<Eye size={24} color="#3b82f6" />} title="Impresiones Totales" value={kpi.impressions} trend="Vistas reales" />
                <KpiCard icon={<MousePointer size={24} color="#8b5cf6" />} title="Clics Totales" value={kpi.clicks} trend="Interacciones" />
                <KpiCard icon={<Percent size={24} color="#10b981" />} title="CTR (Click-Through)" value={`${kpi.ctr}%`} trend="Efectividad" />
                <KpiCard icon={<Users size={24} color="#f59e0b" />} title="Alcance Único" value={kpi.unique_reach} trend="Personas" />
            </div>

            {/* Chart */}
            <div style={{ background: 'white', padding: 25, borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', height: 400 }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#334155' }}>Rendimiento en el Tiempo (Últimos 7 días)</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="formattedTime" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0' }} />
                        <Legend />
                        <Line type="monotone" dataKey="impressions" name="Impresiones" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="clicks" name="Clics" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function KpiCard({ icon, title, value, trend }) {
    return (
        <div style={{ background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>{icon}</div>
                {/* <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>+12%</span> */}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 5 }}>{value}</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{title}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{trend}</div>
        </div>
    );
}
