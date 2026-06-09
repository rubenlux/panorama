import React, { useState, useEffect } from 'react';
import AdsKPIs from '../components/ads/AdsKPIs';
import AdsChart from '../components/ads/AdsChart';
import ActiveCampaigns from '../components/ads/ActiveCampaigns';
import TopAdsTable from '../components/ads/TopAdsTable';
import LowCTRAlerts from '../components/ads/LowCTRAlerts';
import { apiJson } from '../api';

const AdsDashboard = () => {
    // State for each block
    const [kpis, setKpis] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [campaigns, setCampaigns] = useState(null);
    const [topAds, setTopAds] = useState(null);
    const [alerts, setAlerts] = useState(null);
    const [errors, setErrors] = useState({});

    // 1. Fetch KPIs
    useEffect(() => {
        apiJson('/ads/admin/kpis', { auth: true })
            .then(data => setKpis(data))
            .catch(err => setErrors(prev => ({ ...prev, kpis: err.message })));
    }, []);

    // 2. Fetch Chart (delayed slightly to prioritize KPIs)
    useEffect(() => {
        const timer = setTimeout(() => {
            apiJson('/ads/admin/chart?range=30', { auth: true })
                .then(res => setChartData(res.data))
                .catch(err => setErrors(prev => ({ ...prev, chart: err.message })));
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // 3. Fetch Active Campaigns
    useEffect(() => {
        const timer = setTimeout(() => {
            apiJson('/ads/admin/campaigns/active-list', { auth: true })
                .then(res => setCampaigns(res.items))
                .catch(err => setErrors(prev => ({ ...prev, campaigns: err.message })));
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // 4. Fetch Top Ads & Alerts
    useEffect(() => {
        const timer = setTimeout(() => {
            apiJson('/ads/admin/ads/top', { auth: true })
                .then(res => setTopAds(res.items))
                .catch(err => setErrors(prev => ({ ...prev, top_ads: err.message })));

            apiJson('/ads/admin/alerts', { auth: true })
                .then(res => setAlerts(res.items))
                .catch(err => setErrors(prev => ({ ...prev, alerts: err.message })));
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="ads-dashboard p-6">


            {/* 1. KPIs */}
            <section className="mb-6">
                {!kpis && !errors.kpis && <div>Cargando métricas...</div>}
                {kpis && <AdsKPIs {...kpis} />}
                {errors.kpis && <div className="text-red-500">Error cargando KPIs: {errors.kpis}</div>}
            </section>

            {/* 2. Chart */}
            <section className="mb-6">
                {!chartData && !errors.chart && <div>Cargando gráfico...</div>}
                {chartData && <AdsChart data={chartData} />}
            </section>

            {/* 3. Active Campaigns */}
            <section className="mb-6">
                {!campaigns && !errors.campaigns && <div>Cargando campañas...</div>}
                {campaigns && <ActiveCampaigns campaigns={campaigns} />}
            </section>

            {/* 4. Top Ads & Alerts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    {!topAds && !errors.top_ads && <div>Cargando ranking...</div>}
                    {topAds && <TopAdsTable ads={topAds} />}
                </div>
                <div>
                    {!alerts && !errors.alerts && <div>Analizando alertas...</div>}
                    {alerts && <LowCTRAlerts alerts={alerts} />}
                </div>
            </div>
        </div>
    );
};

export default AdsDashboard;
