import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../api';
import './Ticker.css';

export default function Ticker() {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    apiJson('/articles?limit=8&status=published')
      .then(d => setArticles(d.items || []))
      .catch(() => {});
  }, []);

  if (!articles.length) return null;

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const items = [...articles, ...articles];

  return (
    <div className="pn-ticker">
      <div className="pn-wrap pn-ticker__inner">
        <div className="pn-ticker__label">
          <span className="pn-live"><span className="pulse" />Último momento</span>
        </div>
        <div className="pn-ticker__mask">
          <div className="pn-ticker__track">
            {items.map((a, i) => (
              <span key={`${a.id}-${i}`} className="pn-ticker__item">
                <span className="pn-ticker__time">{fmt(a.published_at)}</span>
                <Link to={`/article/${a.slug}`}>{a.title}</Link>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
