import React from 'react';
import './AdsKPIs.css'; // We'll create this simple CSS

const KPICard = ({ title, value, subtitle }) => (
    <div className="ads-kpi-card">
        <div className="ads-kpi-title">{title}</div>
        <div className="ads-kpi-value">{value}</div>
        {subtitle && <div className="ads-kpi-subtitle">{subtitle}</div>}
    </div>
);

const AdsKPIs = ({ impressionsToday, clicksToday, ctr, activeCampaigns }) => {
    return (
        <div className="ads-kpis-container">
            <KPICard
                title="Impresiones Hoy"
                value={impressionsToday?.toLocaleString() || 0}
                subtitle="Vistas totales"
            />
            <KPICard
                title="Clicks Hoy"
                value={clicksToday?.toLocaleString() || 0}
                subtitle="Interacciones"
            />
            <KPICard
                title="CTR Global"
                value={ctr || "0.00%"}
                subtitle="Rendimiento promedio"
            />
            <KPICard
                title="Campañas Activas"
                value={activeCampaigns || 0}
                subtitle="En circulación"
            />
        </div>
    );
};

export default AdsKPIs;
