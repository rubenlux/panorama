import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import './AdsChart.css';

const AdsChart = ({ data }) => {
    return (
        <div className="ads-chart-container">
            <h3>Rendimiento (Últimos 30 días)</h3>
            <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                    <AreaChart data={data}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="impressions" stroke="#8884d8" fillOpacity={1} fill="url(#colorImp)" name="Impresiones" />
                        <Area type="monotone" dataKey="clicks" stroke="#82ca9d" fillOpacity={1} fill="url(#colorClick)" name="Clicks" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AdsChart;
