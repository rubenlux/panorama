import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiJson, resolveUrl } from '../api';
import './CampaignDetails.css'; // Import the new standard CSS

const CampaignDetails = () => {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [ads, setAds] = useState([]);
    const [range, setRange] = useState("30");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, [id, range]);

    async function loadData() {
        setLoading(true);
        try {
            const stats = await apiJson(`/ads/admin/campaigns/${id}/stats?range=${range}`, { auth: true });
            const adsList = await apiJson(`/ads/admin/campaigns/${id}/ads`, { auth: true });

            setData(stats);
            setAds(adsList.items || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div style={{ padding: 20 }}>Cargando...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
    if (!data) return null;

    const { campaign, kpis, chart } = data;

    return (
        <div className="campaign-details-container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Link to="/ads/dashboard" className="back-link">← Volver al Dashboard</Link>
                <button
                    onClick={async () => {
                        const token = localStorage.getItem('token'); // Assuming token is stored here
                        const response = await fetch(`http://localhost:5000/ads/admin/campaigns/${id}/export`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Reporte_Campaña_${id}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }}
                    style={{ padding: "8px 16px", background: "#28a745", color: "white", borderRadius: "5px", border: "none", cursor: "pointer" }}
                >
                    📥 Exportar Reporte
                </button>
            </div>

            <h2 className="section-title">Resumen de Campaña: {campaign.name}</h2>

            {/* MAIN INFO TABLE (The User Requested: "Todo en tablas") */}
            <table className="info-table">
                <thead>
                    <tr>
                        <th>Campaña</th>
                        <th>Estado</th>
                        <th>Impresiones</th>
                        <th>Clicks</th>
                        <th>CTR Global</th>
                        <th>Ingresos Est.</th>
                        <th>Modelo (CPM)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <strong>{campaign.name}</strong><br />
                            <small>{campaign.advertiser_name}</small><br />
                            <small>{new Date(campaign.start_date).toLocaleDateString()} - {new Date(campaign.end_date).toLocaleDateString()}</small>
                        </td>
                        <td>
                            <span className={`status-badge ${campaign.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                                {campaign.status}
                            </span>
                        </td>
                        <td className="stat-value">{parseInt(kpis.impressions).toLocaleString()}</td>
                        <td className="stat-value">{parseInt(kpis.clicks).toLocaleString()}</td>
                        <td className="stat-value" style={{ color: '#007bff' }}>{kpis.ctr}</td>
                        <td className="stat-value" style={{ color: 'green' }}>{campaign.revenue || '$0.00'}</td>
                        <td>{campaign.pricing_model || 'CPM'} - {campaign.price_formatted || '$?'}</td>
                    </tr>
                </tbody>
            </table>

            {/* CHARTS SECTION */}
            <h2 className="section-title">Rendimiento (Diario)</h2>
            <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorImp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorClick" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" />
                        <YAxis />
                        <CartesianGrid strokeDasharray="3 3" />
                        <Tooltip />
                        <Area type="monotone" dataKey="impressions" stroke="#8884d8" fillOpacity={1} fill="url(#colorImp)" name="Impresiones" />
                        <Area type="monotone" dataKey="clicks" stroke="#82ca9d" fillOpacity={1} fill="url(#colorClick)" name="Clicks" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* ADS BREAKDOWN TABLE */}
            <h2 className="section-title">Desglose de Creatividades (Ads)</h2>
            <table className="ads-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Banner Info (Imagen/Link)</th>
                        <th>Ubicación</th>
                        <th>Impresiones</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {ads.map(ad => (
                        <tr key={ad.id}>
                            <td>#{ad.id}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {ad.image_url ? (
                                        <img src={resolveUrl(ad.image_url)} className="ad-image" alt="ad"
                                            onError={(e) => { e.target.onerror = null; e.target.src = "https://via.placeholder.com/60x40?text=Err"; }} />
                                    ) : (
                                        <div style={{ width: 60, height: 40, background: '#ccc', marginRight: 10, display: 'inline-block' }}></div>
                                    )}
                                    <div>
                                        <strong>{ad.sponsor_name}</strong><br />
                                        <a href={ad.link_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'blue' }}>Link Destino</a>
                                    </div>
                                </div>
                            </td>
                            <td>{ad.slot_name || "General"}</td>
                            <td>{parseInt(ad.impressions).toLocaleString()}</td>
                            <td>{parseInt(ad.clicks).toLocaleString()}</td>
                            <td className={parseFloat(ad.ctr) > 1 ? 'ctr-good' : ''}>{ad.ctr}</td>
                            <td>
                                <span className={`status-badge ${ad.active ? 'status-active' : 'status-inactive'}`}>
                                    {ad.active ? 'Activo' : 'Inactivo'}
                                </span>
                            </td>
                        </tr>
                    ))}
                    {ads.length === 0 && (
                        <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: 20 }}>No hay anuncios en esta campaña.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default CampaignDetails;
