import React from 'react';
import { Link } from 'react-router-dom';
import './ActiveCampaigns.css'; // We'll create this

const ActiveCampaigns = ({ campaigns }) => {
    return (
        <div className="active-campaigns-container">
            <h3>Campañas Activas</h3>
            <div className="table-responsive">
                <table className="ads-table">
                    <thead>
                        <tr>
                            <th>Campaña</th>
                            <th>Patrocinador</th>
                            <th>Activos</th>
                            <th>Impresiones</th>
                            <th>Clicks</th>
                            <th>CTR</th>
                            <th>Fin</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns && campaigns.length > 0 ? (
                            campaigns.map((camp) => (
                                <tr key={camp.id}>
                                    <td>
                                        <Link to={`/ads/campaigns/${camp.id}`} className="font-bold text-blue-600 hover:text-blue-800 no-underline">
                                            {camp.name}
                                        </Link>
                                    </td>
                                    <td>{camp.sponsor}</td>
                                    <td>{camp.ad_count}</td>
                                    <td>{parseInt(camp.total_impressions).toLocaleString()}</td>
                                    <td>{parseInt(camp.total_clicks).toLocaleString()}</td>
                                    <td>{camp.ctr}</td>
                                    <td>{new Date(camp.end_date).toLocaleDateString()}</td>
                                    <td>
                                        <span className={`status-badge status-${camp.status}`}>
                                            {camp.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="8" className="no-data">No hay campañas activas</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ActiveCampaigns;
