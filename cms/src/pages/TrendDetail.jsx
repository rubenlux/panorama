import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrend, getTrendArticles, followTrend, createDossierFromTrend } from '../api.js';
import { apiJson } from '../api.js';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)   return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

const STATUS_STYLE = {
  active:      { label: 'Activo',      color: '#1d4ed8', bg: '#dbeafe' },
  summarizing: { label: 'Resumiendo',  color: '#92400e', bg: '#fef3c7' },
  ready:       { label: 'Listo',       color: '#065f46', bg: '#d1fae5' },
  stale:       { label: 'Archivado',   color: '#6b7280', bg: '#f3f4f6' },
  followed:    { label: 'Siguiendo',   color: '#7c3aed', bg: '#ede9fe' },
};

const ANGLE_ICONS = {
  noticia:       '📰',
  análisis:      '🔍',
  investigación: '🕵️',
  fact_check:    '✅',
  explicador:    '💡',
};

export default function TrendDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [cluster, setCluster]   = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cd, ad] = await Promise.all([
          getTrend(id),
          getTrendArticles(id, { limit: 30 }),
        ]);
        setCluster(cd.cluster);
        setArticles(ad.articles || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleFollow() {
    setBusy('follow');
    try {
      await followTrend(id);
      setCluster(prev => ({ ...prev, status: 'followed' }));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(null); }
  }

  async function handleDossier() {
    setBusy('dossier');
    try {
      await createDossierFromTrend(id);
      navigate('/editorial-workflow');
    } catch (e) {
      alert('Error: ' + e.message);
      setBusy(null);
    }
  }

  async function handleGenerateSummary(force = false) {
    setBusy('summary');
    try {
      const url = `/trends/${id}/generate-summary${force ? '?force=true' : ''}`;
      const d   = await apiJson(url, { method: 'POST', auth: true });
      if (d.cluster) setCluster(prev => ({ ...prev, ...d.cluster }));
    } catch (e) { alert('Error al generar resumen: ' + e.message); }
    finally { setBusy(null); }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando cluster…</div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Error: {error}</div>
  );
  if (!cluster) return null;

  const st = STATUS_STYLE[cluster.status] || STATUS_STYLE.active;
  const angles = Array.isArray(cluster.editorial_angles) ? cluster.editorial_angles : [];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 20, padding: 0 }}>
        ← Volver al monitor
      </button>

      {/* Header card */}
      <div style={{ background: 'white', borderRadius: 16, padding: '24px 28px', border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>
              {cluster.entity_name}
            </h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20 }}>
                {st.label}
              </span>
              {cluster.entity_type && (
                <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                  {cluster.entity_type}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                {cluster.article_count} artículos · {cluster.source_count} {cluster.source_count === 1 ? 'fuente' : 'fuentes'} · {timeAgo(cluster.last_seen)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {cluster.status !== 'followed' && (
              <button onClick={handleFollow} disabled={!!busy} style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {busy === 'follow' ? '…' : '🔔 Seguir historia'}
              </button>
            )}
            <button onClick={handleDossier} disabled={!!busy} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: busy ? .6 : 1,
            }}>
              {busy === 'dossier' ? 'Creando dossier…' : '📋 Crear dossier'}
            </button>
          </div>
        </div>

        {/* AI summary */}
        {cluster.status === 'ready' && cluster.headline && (
          <div style={{ background: '#eef2ff', borderRadius: 10, padding: '14px 16px', marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', marginBottom: 6 }}>🤖 INTELIGENCIA EDITORIAL</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#1e1b4b', lineHeight: 1.35 }}>{cluster.headline}</h2>
            {cluster.summary && (
              <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{cluster.summary}</p>
            )}
          </div>
        )}
        {cluster.status === 'summarizing' && (
          <div style={{ fontSize: 13, color: '#f59e0b', fontStyle: 'italic', marginTop: 8 }}>⏳ Generando resumen con IA…</div>
        )}
        {(cluster.status === 'active' || cluster.status === 'ready') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {!cluster.headline && (
              <button onClick={() => handleGenerateSummary(false)} disabled={!!busy}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #c7d2fe',
                  background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 700,
                  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
                {busy === 'summary' ? '⏳ Analizando tendencia…' : '✨ Analizar tendencia'}
              </button>
            )}
            {cluster.headline && (
              <button onClick={() => handleGenerateSummary(true)} disabled={!!busy}
                style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb',
                  background: 'white', color: '#6b7280', fontSize: 11, fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
                {busy === 'summary' ? '⏳' : '🔄 Regenerar análisis'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Editorial angles */}
      {angles.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Ángulos editoriales
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {angles.map((a, i) => (
              <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', marginBottom: 4 }}>
                  {ANGLE_ICONS[a.type] || '📌'} {a.title}
                </div>
                {a.description && (
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{a.description}</div>
                )}
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 7px', borderRadius: 8 }}>
                  {a.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Articles timeline */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Artículos en este cluster ({articles.length})
        </h3>
        {articles.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>No hay artículos vinculados.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {articles.map((a, i) => (
            <div key={a.id} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '12px 0',
              borderBottom: i < articles.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              {/* Timeline dot */}
              <div style={{ width: 28, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                {i < articles.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: '#e5e7eb', marginTop: 4 }} />
                )}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', lineHeight: 1.4, marginBottom: 4 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                    {a.title}
                  </a>
                </div>
                {a.summary && (
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {a.summary}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  <span style={{ fontWeight: 600, color: '#6b7280' }}>{a.source_name}</span>
                  {' · '}{timeAgo(a.detected_at)}
                  {a.published_at && ` · publicado ${timeAgo(a.published_at)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
