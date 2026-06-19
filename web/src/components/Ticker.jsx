import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../api';
import './Ticker.css';

export default function Ticker() {
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    apiJson('/markets')
      .then(d => setMarkets(Array.isArray(d) ? d : []))
      .catch(() => {});
    
    const timer = setInterval(() => {
      apiJson('/markets')
        .then(d => setMarkets(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  if (!markets.length) return null;

  const items = [...markets, ...markets, ...markets]; // Triple to ensure smooth loop

  return (
    <div className="pn-ticker">
      <div className="pn-wrap pn-ticker__inner">
        <div className="pn-ticker__label">
          <span className="pn-live"><span className="pulse" />Mercados</span>
        </div>
        <div className="pn-ticker__mask">
          <div className="pn-ticker__track">
            {items.map((m, i) => (
              <span key={`${m.symbol}-${i}`} className="pn-ticker__item">
                <span className="pn-ticker__market-label">{m.label}</span>
                <span className="pn-ticker__price">{Number(m.price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                <span className={`pn-ticker__change ${m.up ? 'is-up' : 'is-down'}`}>
                  {m.up ? '▲' : '▼'}{Math.abs(m.changePct)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
