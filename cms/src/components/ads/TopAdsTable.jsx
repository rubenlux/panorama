import React from 'react';
import { resolveUrl } from '../../api';
// We'll reuse the ActiveCampaigns.css for table styles

const TopAdsTable = ({ ads }) => {
    return (
        <div className="top-ads-container">
            <h3>Ranking Bancos (Top Performance)</h3>
            <div className="table-responsive">
                <table className="ads-table">
                    <thead>
                        <tr>
                            <th>Banner</th>
                            <th>Ubicación</th>
                            <th>CTR</th>
                            <th>Clicks</th>
                            <th>Impresiones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ads && ads.length > 0 ? (
                            ads.map((ad) => (
                                <tr key={ad.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {ad.image_url ? (
                                                <img
                                                    src={resolveUrl(ad.image_url)}
                                                    alt="ad"
                                                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = "https://via.placeholder.com/40x40?text=No+Img";
                                                    }}
                                                />
                                            ) : (
                                                <div style={{ width: '40px', height: '40px', background: '#eee', borderRadius: '4px' }}></div>
                                            )}
                                            <span>#{ad.id}</span>
                                        </div>
                                    </td>
                                    <td>{ad.slot_name || "N/A"}</td>
                                    <td style={{ fontWeight: 'bold', color: '#2e7d32' }}>{ad.ctr}</td>
                                    <td>{parseInt(ad.clicks).toLocaleString()}</td>
                                    <td>{parseInt(ad.impressions).toLocaleString()}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" className="no-data">Sin datos aún</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TopAdsTable;
