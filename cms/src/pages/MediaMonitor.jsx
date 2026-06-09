import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const SOURCE_TYPE_STYLE = {
  news:       { color: '#1d4ed8', bg: '#dbeafe',  label: 'Medio' },
  blog:       { color: '#065f46', bg: '#d1fae5',  label: 'Blog'  },
  company:    { color: '#92400e', bg: '#fef3c7',  label: 'Empresa' },
  government: { color: '#be123c', bg: '#ffe4e6',  label: 'Gobierno' },
};

const ENTITY_TYPE_COLOR = {
  person:       '#7c3aed',
  company:      '#1d4ed8',
  product:      '#065f46',
  organization: '#92400e',
  location:     '#be123c',
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)   return 'hace ' + secs + 's';
  if (secs < 3600) return 'hace ' + Math.floor(secs / 60) + 'min';
  if (secs < 86400) return 'hace ' + Math.floor(secs / 3600) + 'h';
  return 'hace ' + Math.floor(secs / 86400) + 'd';
}

export default function MediaMonitor() {
  const navigate   = useNavigate();
  const [tab, setTab]       = useState('feed');
  const [stats, setStats]   = useState(null);
  const [sources, setSources]   = useState([]);
  const [articles, setArticles] = useState([]);
  const [trending, setTrending] = useState([]);
  const [addForm, setAddForm]   = useState({ name: '', type: 'news', rss_url: '', homepage: '' });
  const [addOpen, setAddOpen]   = useState(false);
  const [researchingId, setResearchingId] = useState(null);
  const refreshRef = useRef(null);

  const loadStats    = useCallback(async () => {
    try { setStats(await apiJson('/monitor/stats', { auth: true })); } catch {}
  }, []);

  const loadSources  = useCallback(async () => {
    try { const d = await apiJson('/monitor/sources', { auth: true }); setSources(d.items || []); } catch {}
  }, []);

  const loadArticles = useCallback(async () => {
    try { const d = await apiJson('/monitor/articles?hours=24&limit=80', { auth: true }); setArticles(d.items || []); } catch {}
  }, []);

  const loadTrending = useCallback(async () => {
    try { const d = await apiJson('/monitor/trending', { auth: true }); setTrending(d.items || []); } catch {}
  }, []);

  useEffect(() => {
    loadStats(); loadSources(); loadArticles(); loadTrending();
    refreshRef.current = setInterval(() => {
      loadStats(); loadArticles(); loadTrending();
    }, 30_000);
    return () => clearInterval(refreshRef.current);
  }, []);

  async function handleToggle(source) {
    try {
      const d = await apiJson(`/monitor/sources/${source.id}`, {
        method: 'PUT', auth: true,
        body: { enabled: !source.enabled },
      });
      setSources(prev => prev.map(s => s.id === source.id ? d.source : s));
      loadStats();
    } catch {}
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta fuente y sus artículos detectados?')) return;
    await apiJson(`/monitor/sources/${id}`, { method: 'DELETE', auth: true }).catch(() => {});
    setSources(prev => prev.filter(s => s.id !== id));
    loadStats();
  }

  async function handleAddSource(e) {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.rss_url.trim()) return;
    try {
      const d = await apiJson('/monitor/sources', { method: 'POST', auth: true, body: addForm });
      setSources(prev => [d.source, ...prev]);
      setAddForm({ name: '', type: 'news', rss_url: '', homepage: '' });
      setAddOpen(false);
      loadStats();
    } catch (err) { alert('Error: ' + err.message); }
  }

  async function handleResearch(item) {
    setResearchingId(item.entity_id);
    try {
      await apiJson('/monitor/research', {
        method: 'POST', auth: true,
        body: { entity_name: item.entity_name, entity_id: item.entity_id },
      });
      loadTrending();
      navigate('/research');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setResearchingId(null);
    }
  }

  const opportunities = trending.filter(t => t.source_count >= 3 && t.mention_count >= 5);

  const TABS = [
    { id: 'feed',    label: '📰 Feed',         count: articles.length },
    { id: 'trending',label: '🔥 Tendencias',   count: trending.length },
    { id: 'opps',    label: '⚡ Oportunidades', count: opportunities.length, alert: opportunities.length > 0 },
    { id: 'sources', label: '📡 Fuentes',       count: sources.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📡 News Intelligence Engine</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
              Monitoreo continuo · actualiza cada 30s
            </p>
          </div>
          {stats && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Fuentes activas',  value: `${stats.sources_active}/${stats.sources_total}`, color: '#10b981' },
                { label: 'Artículos (24h)',  value: stats.articles_today,  color: '#6366f1' },
                { label: 'Tendencias',       value: stats.trending_now,    color: '#f59e0b' },
                { label: 'Oportunidades',    value: stats.opportunities,   color: stats.opportunities > 0 ? '#ef4444' : '#9ca3af' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '8px 14px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: tab === t.id ? '#1e1b4b' : 'transparent',
                color:      tab === t.id ? 'white' : '#6b7280',
                display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
              }}
            >
              {t.label}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: tab === t.id ? 'rgba(255,255,255,.2)' : (t.alert ? '#ef4444' : '#f3f4f6'),
                color:      tab === t.id ? 'white' : (t.alert ? 'white' : '#6b7280'),
              }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

        {/* ── FEED ─────────────────────────────────────────────────────── */}
        {tab === 'feed' && (
          <div>
            {articles.length === 0 && (
              <EmptyState icon="📰" title="Sin artículos todavía" body="El worker detecta artículos nuevos cada 60s. Asegúrate de que esté corriendo: npm run worker" />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {articles.map(a => {
                const st = SOURCE_TYPE_STYLE[a.source_type] || SOURCE_TYPE_STYLE.news;
                const entities = Array.isArray(a.entities) ? a.entities : (typeof a.entities === 'string' ? JSON.parse(a.entities) : []);
                return (
                  <div key={a.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 7px', borderRadius: 10 }}>
                            {a.source_name}
                          </span>
                          {entities.map(e => e?.id && (
                            <span
                              key={e.id}
                              onClick={() => navigate(`/knowledge/entities/${e.id}`)}
                              style={{ fontSize: 11, fontWeight: 600, color: ENTITY_TYPE_COLOR[e.entity_type] || '#374151', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10, cursor: 'pointer' }}
                            >
                              {e.name}
                            </span>
                          ))}
                        </div>
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 600, fontSize: 14, color: '#111827', textDecoration: 'none', lineHeight: 1.4, display: 'block', marginBottom: 4 }}>
                          {a.title}
                        </a>
                        {a.summary && (
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {a.summary}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, textAlign: 'right' }}>
                        {timeAgo(a.detected_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TRENDING ──────────────────────────────────────────────────── */}
        {tab === 'trending' && (
          <div>
            {trending.length === 0 && (
              <EmptyState icon="🔥" title="Sin tendencias detectadas" body="Las tendencias aparecen cuando una entidad es mencionada en múltiples fuentes en los últimos 30 minutos." />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {trending.map(t => <TrendingCard key={t.id} item={t} onResearch={handleResearch} researchingId={researchingId} />)}
            </div>
          </div>
        )}

        {/* ── OPORTUNIDADES ─────────────────────────────────────────────── */}
        {tab === 'opps' && (
          <div>
            {opportunities.length === 0 && (
              <EmptyState icon="⚡" title="No hay oportunidades ahora" body="Aparece cuando una entidad supera 5 menciones en 3+ fuentes distintas en los últimos 30 minutos." />
            )}
            {opportunities.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                {opportunities.length} {opportunities.length === 1 ? 'oportunidad editorial detectada' : 'oportunidades editoriales detectadas'} — el sistema recomienda investigarlas.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {opportunities.map(t => <TrendingCard key={t.id} item={t} onResearch={handleResearch} researchingId={researchingId} highlight />)}
            </div>
          </div>
        )}

        {/* ── FUENTES ───────────────────────────────────────────────────── */}
        {tab === 'sources' && (
          <div>
            {/* Add source */}
            <div style={{ marginBottom: 16 }}>
              {!addOpen ? (
                <button
                  onClick={() => setAddOpen(true)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                >
                  + Agregar fuente
                </button>
              ) : (
                <form onSubmit={handleAddSource} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input value={addForm.name} onChange={e => setAddForm(p => ({...p, name: e.target.value}))} placeholder="Nombre *" style={inputStyle} required />
                  <select value={addForm.type} onChange={e => setAddForm(p => ({...p, type: e.target.value}))} style={inputStyle}>
                    <option value="news">Medio</option>
                    <option value="blog">Blog</option>
                    <option value="company">Empresa</option>
                    <option value="government">Gobierno</option>
                  </select>
                  <input value={addForm.rss_url} onChange={e => setAddForm(p => ({...p, rss_url: e.target.value}))} placeholder="URL del RSS *" style={{...inputStyle, gridColumn: '1 / -1'}} required />
                  <input value={addForm.homepage} onChange={e => setAddForm(p => ({...p, homepage: e.target.value}))} placeholder="Homepage (opcional)" style={inputStyle} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" style={{ flex: 1, padding: '8px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                    <button type="button" onClick={() => setAddOpen(false)} style={{ flex: 1, padding: '8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </form>
              )}
            </div>

            {/* Sources table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sources.map(s => {
                const st = SOURCE_TYPE_STYLE[s.type] || SOURCE_TYPE_STYLE.news;
                return (
                  <div key={s.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: s.enabled ? 1 : 0.5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '1px 7px', borderRadius: 10 }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12 }}>
                        <span title={s.rss_url} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.rss_url}</span>
                        {s.seconds_since_check != null && (
                          <span style={{ color: s.seconds_since_check < 120 ? '#10b981' : '#f59e0b' }}>
                            ✓ {s.seconds_since_check < 60 ? 'hace ' + s.seconds_since_check + 's' : 'hace ' + Math.floor(s.seconds_since_check / 60) + 'min'}
                          </span>
                        )}
                        {s.last_checked == null && <span style={{ color: '#9ca3af' }}>Sin verificar</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(s)}
                        title={s.enabled ? 'Desactivar' : 'Activar'}
                        style={{
                          width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: s.enabled ? '#10b981' : '#d1d5db',
                          position: 'relative', transition: 'background .2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: s.enabled ? 18 : 2,
                          width: 18, height: 18, borderRadius: '50%', background: 'white',
                          transition: 'left .2s',
                        }} />
                      </button>
                      <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 16, padding: 2 }} title="Eliminar">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendingCard({ item, onResearch, researchingId, highlight }) {
  const color = ENTITY_TYPE_COLOR[item.entity_type] || '#374151';
  const busy  = researchingId === item.entity_id;
  return (
    <div style={{
      background: 'white',
      border: `1px solid ${highlight ? '#fca5a5' : '#e5e7eb'}`,
      borderRadius: 14,
      padding: '16px 18px',
      boxShadow: highlight ? '0 0 0 3px rgba(239,68,68,.08)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>{item.entity_name}</div>
          <span style={{ fontSize: 11, fontWeight: 600, color, background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>
            {item.entity_type}
          </span>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: highlight ? '#ef4444' : '#6366f1', lineHeight: 1 }}>{item.mention_count}</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>menciones</div>
        </div>
      </div>

      {item.entity_description && (
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.entity_description}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', gap: 10 }}>
          <span>📍 {item.source_count} {item.source_count === 1 ? 'fuente' : 'fuentes'}</span>
          <span>🕐 {timeAgo(item.last_seen_at)}</span>
        </div>
        {!item.auto_researched ? (
          <button
            onClick={() => onResearch(item)}
            disabled={busy}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
              background: highlight ? '#ef4444' : '#6366f1',
              color: 'white', fontSize: 12, fontWeight: 700, opacity: busy ? .6 : 1,
            }}
          >
            {busy ? 'Creando…' : '🔬 Investigar'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>✓ Investigado</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

const inputStyle = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14,
  width: '100%', boxSizing: 'border-box', outline: 'none',
};
