import React from 'react';
import './LowCTRAlerts.css'; // specific styles for alerts

const LowCTRAlerts = ({ alerts }) => {
    if (!alerts || alerts.length === 0) return null;

    return (
        <div className="ads-alerts-container">
            <h3>Alertas de Sistema</h3>
            <div className="alerts-list">
                {alerts.map((alert, idx) => (
                    <div key={idx} className={`alert-item alert-${alert.type}`}>
                        <span className="alert-message">{alert.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LowCTRAlerts;
