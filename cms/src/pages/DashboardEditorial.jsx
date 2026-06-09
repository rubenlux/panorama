import React, { useEffect, useState } from 'react';
import { apiJson } from '../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function DashboardEditorial() {
    const [overview, setOverview] = useState(null);
    const [realtime, setRealtime] = useState([]);
    const [authors, setAuthors] = useState([]);
    const [categories, setCategories] = useState([]);
    const [engagement, setEngagement] = useState([]);
    const [articlePage, setArticlePage] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Parallel Fetch for Q1-Q6
                const [ovData, rtData, authData, catData, engData] = await Promise.all([
                    apiJson('/analytics/v2/editorial/overview', { auth: true }),
                    apiJson('/analytics/v2/editorial/realtime', { auth: true }),
                    apiJson('/analytics/v2/editorial/insights/authors', { auth: true }),
                    apiJson('/analytics/v2/editorial/insights/categories', { auth: true }),
                    apiJson('/analytics/v2/editorial/insights/engagement', { auth: true })
                ]);

                setOverview(ovData);
                setRealtime(rtData.data || []);
                setAuthors(authData.data || []);
                setCategories(catData.data || []);
                setEngagement(engData.data || []);
            } catch (e) {
                console.error("Failed to fetch Editorial Dashboard data", e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        // Refresh every 30s
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-8">Loading Editorial Data...</div>;

    const kpis = overview?.kpis || { views_24h: 0, active_users_5m: 0 };
    const topArticles = overview?.top_articles || [];

    // Format Data for Chart (HH:mm)
    const chartData = realtime.map(r => ({
        time: new Date(r.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        views: parseInt(r.views)
    }));

    return (
        <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
            <header>
                <h1 className="text-3xl font-bold text-gray-800">Editorial Dashboard 📰</h1>
                <p className="text-gray-500">Real-time audience insights & Content Performance</p>
            </header>

            {/* Level 1: SEO Gold KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Active Users (Now) 🟢</h3>
                    <div className="text-4xl font-bold text-blue-600 mt-2 flex items-center gap-2">
                        {kpis.active_users_5m}
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Avg. Real Reading Time 🕰️</h3>
                    <div className="text-4xl font-bold text-emerald-600 mt-2">
                        {Math.floor(kpis.avg_time_seconds / 60)}m {kpis.avg_time_seconds % 60}s
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Page Views (30d) 📈</h3>
                    <div className="text-4xl font-bold text-gray-800 mt-2">{kpis.views_24h.toLocaleString()}</div>
                </div>
            </div>

            {/* Level 2: Real-time Chart (Q1) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-700 mb-4">Real-time Traffic (Last Hour)</h3>
                <div className="h-64 cursor-crosshair">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="time"
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="views"
                                stroke="#2563EB"
                                strokeWidth={3}
                                dot={false}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Q2: Top Articles with Reader Time (Slider) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-700">🔥 Content Performance (30d)</h3>
                        <div className="flex gap-2">
                            <button
                                disabled={articlePage === 0}
                                onClick={() => setArticlePage(p => p - 1)}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                            >
                                ⬅
                            </button>
                            <span className="text-xs text-gray-500 font-medium self-center">
                                {articlePage * 5 + 1}-{Math.min((articlePage + 1) * 5, topArticles.length)} / {topArticles.length}
                            </span>
                            <button
                                disabled={(articlePage + 1) * 5 >= topArticles.length}
                                onClick={() => setArticlePage(p => p + 1)}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                            >
                                ➡
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto min-h-[250px]">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-3 text-xs font-semibold text-gray-500 uppercase">Article Title</th>
                                    <th className="p-3 text-xs font-semibold text-gray-500 text-right uppercase">Views</th>
                                    <th className="p-3 text-xs font-semibold text-gray-500 text-right uppercase">Read Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {topArticles.slice(articlePage * 5, (articlePage + 1) * 5).map((article, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 text-sm text-gray-700 font-medium truncate max-w-xs" title={article.title}>
                                            {article.title || 'Untitled'}
                                        </td>
                                        <td className="p-3 text-sm font-bold text-gray-900 text-right">
                                            {parseInt(article.views).toLocaleString()}
                                        </td>
                                        <td className="p-3 text-sm font-medium text-emerald-600 text-right">
                                            {Math.round(article.total_seconds / 60)} min
                                        </td>
                                    </tr>
                                ))}
                                {topArticles.length === 0 && (
                                    <tr><td colSpan="3" className="p-4 text-center text-gray-400">No articles yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Q3: Engagement Funnel + SEO Highlights */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-700 mb-4">⚓ Retention & Engagement</h3>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="text-xs text-blue-600 font-bold uppercase">Shares</div>
                            <div className="text-2xl font-black text-blue-800">{overview?.engagement?.kpis?.total_shares || 0}</div>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-lg">
                            <div className="text-xs text-emerald-600 font-bold uppercase">Comments</div>
                            <div className="text-2xl font-black text-emerald-800">{overview?.engagement?.kpis?.total_comments || 0}</div>
                        </div>
                    </div>
                    <div className="h-44">
                        <div className="flex items-end justify-between h-32 px-4 border-b border-gray-200">
                            {(overview?.engagement?.scroll_funnel || []).map((step) => {
                                const maxVal = Math.max(...(overview?.engagement?.scroll_funnel || []).map(e => parseInt(e.count)), 1);
                                const height = (parseInt(step.count) / maxVal) * 100;
                                return (
                                    <div key={step.depth} className="flex flex-col items-center w-1/5 group">
                                        <div className="relative w-full bg-blue-100 rounded-t-sm hover:bg-blue-200 transition-all" style={{ height: `${height}%` }}>
                                            <div className="absolute -top-6 w-full text-center text-xs font-bold text-blue-700 opacity-0 group-hover:opacity-100">{step.count}</div>
                                        </div>
                                        <div className="mt-2 text-xs font-semibold text-gray-500">{step.depth}%</div>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="text-xs text-center text-gray-400 mt-2">Scroll Depth (30d Trend)</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Q4: Top Authors */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-700 mb-4">✍️ Author Performance (Quality)</h3>
                    <ul className="divide-y divide-gray-100">
                        {authors.map((author, idx) => (
                            <li key={idx} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center text-xs font-bold text-purple-600">
                                        {idx + 1}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">{author.author_name}</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-900">{parseInt(author.views).toLocaleString()} views</div>
                                </div>
                            </li>
                        ))}
                        {authors.length === 0 && <div className="py-4 text-center text-gray-400 text-sm">No author data yet</div>}
                    </ul>
                </div>

                {/* Q5 & Q6: Categories Trends */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-700 mb-4">🚀 Trending Topics (Oppty)</h3>
                    <div className="space-y-4">
                        {categories.map((cat, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">{cat.category_name}</span>
                                    <span className="font-bold text-green-600">{cat.views} views</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div
                                        className="bg-green-500 h-2 rounded-full"
                                        style={{ width: `${(parseInt(cat.views) / Math.max(...categories.map(c => parseInt(c.views)))) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        {categories.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">No category data yet</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DashboardEditorial;
