import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, getStories, followStory, createDossierFromStory, getEvents, followEvent, createDossierFromEvent, getOpportunities, updateStoryOpportunityStatus, createDossierFromOpportunity } from '../api.js';

// ── Constants ─────────────────────────────────────────────────────────────────
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

const VERIFY_STATUS = {
  pending:  { label: 'Pendiente',              emoji: '⏳', color: '#6b7280', bg: '#f3f4f6' },
  verified: { label: 'Verificada',             emoji: '✓',  color: '#1d4ed8', bg: '#dbeafe' },
  failed:   { label: 'Fallida',                emoji: '✗',  color: '#dc2626', bg: '#fee2e2' },
  approved: { label: 'Aprobada editorialmente',emoji: '★',  color: '#059669', bg: '#d1fae5' },
};

const FORMAT_LABELS = {
  'rss':           { label: 'RSS Feed',              color: '#f97316' },
  'atom':          { label: 'Atom Feed',             color: '#f97316' },
  'sitemap-index': { label: 'Sitemap Index',         color: '#8b5cf6' },
  'news-sitemap':  { label: 'Google News Sitemap',   color: '#8b5cf6' },
  'urlset':        { label: 'XML Sitemap',           color: '#8b5cf6' },
  'xml-generic':   { label: 'XML',                   color: '#6b7280' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return 'hace ' + secs + 's';
  if (secs < 3600)  return 'hace ' + Math.floor(secs / 60) + 'min';
  if (secs < 86400) return 'hace ' + Math.floor(secs / 3600) + 'h';
  return 'hace ' + Math.floor(secs / 86400) + 'd';
}

function TrustBar({ score }) {
  const s = parseFloat(score || 0);
  const pct = (s / 10) * 100;
  const color = s >= 8 ? '#059669' : s >= 6 ? '#10b981' : s >= 4 ? '#f59e0b' : '#dc2626';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
      <span style={{ width: 50, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: pct + '%', background: color, borderRadius: 3 }} />
      </span>
      <span style={{ color, fontWeight: 700 }}>{s.toFixed(1)}</span>
    </span>
  );
}

// ── Source row with verification controls ─────────────────────────────────────
function SourceRow({ source: s, onToggle, onDelete, onVerify, onApprove, verifying, approving }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory]         = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const st   = SOURCE_TYPE_STYLE[s.type] || SOURCE_TYPE_STYLE.news;
  const vs   = VERIFY_STATUS[s.verification_status] || VERIFY_STATUS.pending;
  const fmt  = FORMAT_LABELS[s.last_format_detected] || null;
  const busy = verifying === s.id || approving === s.id;

  async function loadHistory() {
    if (histLoading) return;
    setHistLoading(true);
    try {
      const rows = await apiJson(`/monitor/sources/${s.id}/verifications`, { auth: true });
      setHistory(rows);
    } catch {} finally { setHistLoading(false); }
  }

  function toggleHistory() {
    if (!historyOpen) loadHistory();
    setHistoryOpen(o => !o);
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${s.verification_status === 'failed' ? '#fecaca' : s.verification_status === 'approved' ? '#a7f3d0' : '#e5e7eb'}`, borderRadius: 10, opacity: s.enabled ? 1 : 0.55, transition: 'opacity .2s' }}>
      {/* Main row */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '1px 7px', borderRadius: 10 }}>{st.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: vs.color, background: vs.bg, padding: '1px 8px', borderRadius: 10 }}>
              {vs.emoji} {vs.label}
            </span>
            {fmt && (
              <span style={{ fontSize: 11, fontWeight: 600, color: fmt.color, background: '#f9fafb', border: `1px solid ${fmt.color}40`, padding: '1px 7px', borderRadius: 10 }}>
                {fmt.label}
              </span>
            )}
            <TrustBar score={s.trust_score} />
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span title={s.rss_url} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.rss_url}
            </span>
            {s.verified_at && (
              <span style={{ color: '#9ca3af' }}>verificado {timeAgo(s.verified_at)}</span>
            )}
            {s.seconds_since_check != null && (
              <span style={{ color: s.seconds_since_check < 120 ? '#10b981' : '#f59e0b' }}>
                · feed {s.seconds_since_check < 60 ? 'hace ' + s.seconds_since_check + 's' : 'hace ' + Math.floor(s.seconds_since_check / 60) + 'min'}
              </span>
            )}
          </div>
          {/* Inline failure reason */}
          {s.verification_status === 'failed' && s.last_verification_notes && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#dc2626', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 8px', lineHeight: 1.5 }}>
              {s.last_verification_notes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onVerify(s.id)} disabled={busy}
            style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid #d1d5db', background: verifying === s.id ? '#eff6ff' : '#fff',
              cursor: busy ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
            {verifying === s.id ? '⟳ Verificando…' : '⟳ Verificar'}
          </button>

          {s.verification_status === 'approved' ? (
            <button disabled style={{ padding: '5px 11px', borderRadius: 7, border: 'none',
              background: '#d1fae5', cursor: 'default', fontSize: 12, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
              ★ Aprobada
            </button>
          ) : (
            <button onClick={() => onApprove(s.id)} disabled={busy}
              title={s.verification_status === 'failed' ? 'Aprobar manualmente aunque la verificación automática falló' : 'Aprobar editorialmente'}
              style={{ padding: '5px 11px', borderRadius: 7, border: 'none',
                background: s.verification_status === 'failed' ? '#7c3aed' : '#059669',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
              {s.verification_status === 'failed' ? '★ Aprobar igualmente' : '★ Aprobar'}
            </button>
          )}

          <button onClick={toggleHistory}
            style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', background: historyOpen ? '#f3f4f6' : '#fff',
              cursor: 'pointer', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
            {historyOpen ? '▲' : '▼'} Historial
          </button>

          {/* Toggle enabled */}
          <button onClick={() => onToggle(s)} title={s.enabled ? 'Desactivar' : 'Activar'}
            style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: s.enabled ? '#10b981' : '#d1d5db', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: s.enabled ? 18 : 2, width: 18, height: 18,
              borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </button>

          <button onClick={() => onDelete(s.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 18, padding: 2 }} title="Eliminar">×</button>
        </div>
      </div>

      {/* History panel */}
      {historyOpen && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', background: '#fafafa' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase' }}>Historial de verificaciones</div>
          {histLoading && <div style={{ fontSize: 12, color: '#9ca3af' }}>Cargando…</div>}
          {!histLoading && history.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Sin historial aún.</div>}
          {!histLoading && history.map(h => {
            const hv = VERIFY_STATUS[h.status] || VERIFY_STATUS.pending;
            return (
              <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: hv.color, background: hv.bg, padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
                  {hv.emoji} {hv.label}
                </span>
                <div style={{ flex: 1 }}>
                  {h.notes && <div style={{ fontSize: 12, color: '#374151' }}>{h.notes}</div>}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span>{timeAgo(h.created_at)}</span>
                    {h.http_status && <span>HTTP {h.http_status}</span>}
                    {h.response_ms && <span>{h.response_ms}ms</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MediaMonitor() {
  const navigate   = useNavigate();
  const [tab, setTab]       = useState('events');
  const [stats, setStats]   = useState(null);
  const [sources, setSources]   = useState([]);
  const [articles, setArticles] = useState([]);
  const [trending, setTrending] = useState([]);
  const [stories, setStories]     = useState([]);
  const [storyBusy, setStoryBusy] = useState({});
  const [events,  setEvents]      = useState([]);
  const [eventBusy, setEventBusy] = useState({});
  const [editOpps,  setEditOpps]  = useState([]);
  const [oppBusy,   setOppBusy]   = useState({});
  const [addForm, setAddForm]   = useState({ name: '', type: 'news', rss_url: '', homepage: '' });
  const [addOpen, setAddOpen]   = useState(false);
  const [researchingId, setResearchingId] = useState(null);
  const [verifying,  setVerifying]  = useState(null);
  const [approving,  setApproving]  = useState(null);
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

  const loadStories = useCallback(async () => {
    try { const d = await getStories({ minArticles: 2, limit: 30 }); setStories(d.items || []); } catch {}
  }, []);

  const loadEvents = useCallback(async () => {
    try { const d = await getEvents({ limit: 25 }); setEvents(d.items || []); } catch {}
  }, []);

  const loadOpps = useCallback(async () => {
    try { const d = await getOpportunities({ limit: 40 }); setEditOpps(d.items || []); } catch {}
  }, []);

  useEffect(() => {
    loadStats(); loadSources(); loadArticles(); loadTrending(); loadStories(); loadEvents(); loadOpps();
    refreshRef.current = setInterval(() => {
      loadStats(); loadArticles(); loadTrending(); loadStories(); loadEvents(); loadOpps();
    }, 30_000);
    return () => clearInterval(refreshRef.current);
  }, []);

  async function handleToggle(source) {
    try {
      const d = await apiJson(`/monitor/sources/${source.id}`, {
        method: 'PUT', auth: true, body: { enabled: !source.enabled },
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

  async function handleVerify(id) {
    setVerifying(id);
    try {
      const { source } = await apiJson(`/monitor/sources/${id}/verify`, { method: 'POST', auth: true });
      setSources(prev => prev.map(s => s.id === id ? source : s));
    } catch (err) { alert('Error verificando: ' + err.message); }
    finally { setVerifying(null); }
  }

  async function handleApprove(id) {
    setApproving(id);
    try {
      const { source } = await apiJson(`/monitor/sources/${id}/approve`, { method: 'POST', auth: true });
      setSources(prev => prev.map(s => s.id === id ? source : s));
    } catch (err) { alert('Error aprobando: ' + err.message); }
    finally { setApproving(null); }
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

  async function handleFollowStory(id) {
    setStoryBusy(p => ({ ...p, [id]: 'follow' }));
    try { await followStory(id); loadStories(); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setStoryBusy(p => ({ ...p, [id]: null })); }
  }

  async function handleDossierFromStory(id) {
    setStoryBusy(p => ({ ...p, [id]: 'dossier' }));
    try {
      const { dossier } = await createDossierFromStory(id);
      navigate(`/dossiers/${dossier.id}`);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setStoryBusy(p => ({ ...p, [id]: null }));
    }
  }

  async function handleFollowEvent(id) {
    setEventBusy(p => ({ ...p, [id]: 'follow' }));
    try { await followEvent(id); loadEvents(); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setEventBusy(p => ({ ...p, [id]: null })); }
  }

  async function handleDossierFromEvent(id) {
    setEventBusy(p => ({ ...p, [id]: 'dossier' }));
    try {
      const { dossier } = await createDossierFromEvent(id);
      navigate(`/dossiers/${dossier.id}`);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setEventBusy(p => ({ ...p, [id]: null }));
    }
  }

  async function handleOppStatus(id, status) {
    setOppBusy(p => ({ ...p, [id]: status }));
    try {
      await updateStoryOpportunityStatus(id, status);
      setEditOpps(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setOppBusy(p => ({ ...p, [id]: null })); }
  }

  async function handleOppDossier(id) {
    setOppBusy(p => ({ ...p, [id]: 'dossier' }));
    try {
      const { dossier } = await createDossierFromOpportunity(id);
      setEditOpps(prev => prev.map(o => o.id === id ? { ...o, status: 'in_progress' } : o));
      navigate(`/dossiers/${dossier.id}`);
    } catch (e) { alert('Error: ' + e.message); }
    finally { setOppBusy(p => ({ ...p, [id]: null })); }
  }

  // Legacy: used only for header stat chip; editorial opps replace the tab
  const opportunities = trending.filter(t => t.source_count >= 3 && t.mention_count >= 5);

  // Stats for sources tab
  const srcStats = {
    pending:  sources.filter(s => (s.verification_status || 'pending') === 'pending').length,
    verified: sources.filter(s => s.verification_status === 'verified').length,
    failed:   sources.filter(s => s.verification_status === 'failed').length,
    approved: sources.filter(s => s.verification_status === 'approved').length,
  };

  const TABS = [
    { id: 'events',  label: '🎯 Eventos',       count: events.length },
    { id: 'feed',    label: '📰 Feed',          count: articles.length },
    { id: 'trending',label: '📖 Historias',     count: stories.length },
    { id: 'opps',    label: '⚡ Oportunidades', count: editOpps.filter(o => o.status === 'pending').length, alert: editOpps.filter(o => o.status === 'pending').length > 0 },
    { id: 'sources', label: '📡 Fuentes',       count: sources.length },
  ];

  const defaultTab = 'events';

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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
              <WorkerStatus idle={stats.worker_idle_seconds} lastRun={stats.last_worker_run} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t.id ? '#1e1b4b' : 'transparent',
              color:      tab === t.id ? 'white' : '#6b7280',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
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

        {/* ── EVENTOS ──────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <div>
            {events.length === 0 && (
              <EmptyState
                icon="🎯"
                title="Sin eventos detectados aún"
                body="Los eventos se detectan cuando 2+ historias comparten entidades. El worker debe estar corriendo y haber acumulado suficiente cobertura."
              />
            )}
            {events.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {events.filter(e => e.editorial_score >= 70).length} eventos prioritarios · {events.length} eventos activos
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['breaking', 'growing', 'monitoring'].map(cs => {
                    const n = events.filter(e => e.coverage_status === cs).length;
                    if (!n) return null;
                    const style = cs === 'breaking'
                      ? { background: '#fee2e2', color: '#dc2626' }
                      : cs === 'growing'
                      ? { background: '#fef3c7', color: '#d97706' }
                      : { background: '#f3f4f6', color: '#6b7280' };
                    return (
                      <span key={cs} style={{ ...style, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
                        {cs === 'breaking' ? '🔴' : cs === 'growing' ? '📈' : '●'} {cs}: {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {events.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  busy={eventBusy[ev.id]}
                  onDetail={() => navigate(`/events/${ev.id}`)}
                  onFollow={() => handleFollowEvent(ev.id)}
                  onDossier={() => handleDossierFromEvent(ev.id)}
                />
              ))}
            </div>
          </div>
        )}

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
                            <span key={e.id} onClick={() => navigate(`/knowledge/entities/${e.id}`)}
                              style={{ fontSize: 11, fontWeight: 600, color: ENTITY_TYPE_COLOR[e.entity_type] || '#374151', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10, cursor: 'pointer' }}>
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

        {/* ── HISTORIAS ACTIVAS ──────────────────────────────────────────── */}
        {tab === 'trending' && (
          <div>
            {stories.length === 0 && (
              <EmptyState
                icon="📖"
                title="Sin historias activas"
                body="Las historias se detectan automáticamente cuando 2+ artículos comparten el mismo evento. El worker debe estar corriendo."
              />
            )}
            {stories.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {stories.filter(s => s.status === 'ready').length} con resumen IA · {stories.length} historias activas
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['breaking', 'growing', 'monitoring'].map(cs => {
                    const n = stories.filter(s => s.coverage_status === cs).length;
                    if (!n) return null;
                    const style = cs === 'breaking'
                      ? { background: '#fee2e2', color: '#dc2626' }
                      : cs === 'growing'
                      ? { background: '#fef3c7', color: '#d97706' }
                      : { background: '#f3f4f6', color: '#6b7280' };
                    return (
                      <span key={cs} style={{ ...style, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
                        {cs === 'breaking' ? '🔴' : cs === 'growing' ? '📈' : '●'} {cs}: {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {stories.map(s => (
                <StoryCard
                  key={s.id}
                  story={s}
                  busy={storyBusy[s.id]}
                  onDetail={() => navigate(`/stories/${s.id}`)}
                  onFollow={() => handleFollowStory(s.id)}
                  onDossier={() => handleDossierFromStory(s.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── OPORTUNIDADES EDITORIALES ─────────────────────────────────── */}
        {tab === 'opps' && (
          <div>
            {editOpps.length === 0 && (
              <EmptyState
                icon="⚡"
                title="Sin oportunidades editoriales todavía"
                body="Las oportunidades se generan automáticamente cuando una historia acumula suficiente cobertura y el AI la analiza. El worker debe estar corriendo."
              />
            )}
            {editOpps.length > 0 && (() => {
              const pending = editOpps.filter(o => o.status === 'pending');
              const types = [...new Set(pending.map(o => o.opportunity_type))];
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                      {pending.length} {pending.length === 1 ? 'oportunidad disponible' : 'oportunidades disponibles'}
                    </div>
                    {types.map(t => {
                      const cfg = OPP_TYPE_CONFIG[t] || OPP_TYPE_CONFIG.NEWS;
                      return (
                        <span key={t} style={{ fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '2px 9px', borderRadius: 20 }}>
                          {cfg.icon} {cfg.label}: {pending.filter(o => o.opportunity_type === t).length}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {editOpps.map(opp => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  busy={oppBusy[opp.id]}
                  onDossier={() => handleOppDossier(opp.id)}
                  onStatus={(status) => handleOppStatus(opp.id, status)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── FUENTES ───────────────────────────────────────────────────── */}
        {tab === 'sources' && (
          <div>
            {/* Summary bar */}
            {sources.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {Object.entries(srcStats).map(([k, v]) => {
                  const vs = VERIFY_STATUS[k];
                  return (
                    <div key={k} style={{ padding: '5px 12px', background: vs.bg, borderRadius: 20, fontSize: 12, fontWeight: 700, color: vs.color }}>
                      {vs.emoji} {vs.label}: {v}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add source */}
            <div style={{ marginBottom: 16 }}>
              {!addOpen ? (
                <button onClick={() => setAddOpen(true)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
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

            {/* Sources list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sources.map(s => (
                <SourceRow
                  key={s.id}
                  source={s}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onVerify={handleVerify}
                  onApprove={handleApprove}
                  verifying={verifying}
                  approving={approving}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorkerStatus ──────────────────────────────────────────────────────────────
function WorkerStatus({ idle, lastRun }) {
  if (idle == null) {
    return (
      <div style={{ padding: '8px 14px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#854d0e' }}>⚠️ Sin datos</div>
        <div style={{ fontSize: 10, color: '#854d0e', marginTop: 2 }}>Worker nunca corrió</div>
      </div>
    );
  }
  const mins = Math.floor(idle / 60);
  const alive = idle < 180; // less than 3 minutes = worker is running
  return (
    <div style={{ padding: '8px 14px', background: alive ? '#f0fdf4' : '#fff1f2',
      border: `1px solid ${alive ? '#86efac' : '#fecaca'}`, borderRadius: 10, textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: alive ? '#166534' : '#dc2626', lineHeight: 1 }}>
        {alive ? '🟢 Worker activo' : '🔴 Worker detenido'}
      </div>
      <div style={{ fontSize: 10, color: alive ? '#166534' : '#dc2626', marginTop: 3 }}>
        {alive
          ? `último ciclo hace ${idle < 60 ? idle + 's' : mins + 'min'}`
          : `sin actividad hace ${mins >= 60 ? Math.floor(mins/60) + 'h ' + (mins%60) + 'min' : mins + ' min'} · correr npm run worker`
        }
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const OPP_TYPE_CONFIG = {
  NEWS:          { label: 'Noticia',         icon: '📰', color: '#dc2626', bg: '#fee2e2' },
  SEO:           { label: 'SEO',             icon: '🔍', color: '#059669', bg: '#d1fae5' },
  ANALYSIS:      { label: 'Análisis',        icon: '🔎', color: '#1d4ed8', bg: '#dbeafe' },
  EXPLAINER:     { label: 'Explicador',      icon: '💡', color: '#d97706', bg: '#fef3c7' },
  SOCIAL:        { label: 'Redes Sociales',  icon: '📱', color: '#7c3aed', bg: '#ede9fe' },
  FACT_CHECK:    { label: 'Verificación',    icon: '✓',  color: '#0891b2', bg: '#e0f2fe' },
  LIVE_COVERAGE: { label: 'Cobertura viva',  icon: '📡', color: '#be123c', bg: '#ffe4e6' },
  OPINION:       { label: 'Opinión',         icon: '✍️', color: '#6b7280', bg: '#f3f4f6' },
};

const STATUS_OPP_CFG = {
  pending:     { label: 'Pendiente',   color: '#6b7280' },
  in_progress: { label: 'En proceso',  color: '#d97706' },
  done:        { label: '✓ Hecho',     color: '#059669' },
  dismissed:   { label: 'Descartada',  color: '#9ca3af' },
};

function ScorePill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
    </div>
  );
}

function OpportunityCard({ opp, busy, onDossier, onStatus }) {
  const cfg       = OPP_TYPE_CONFIG[opp.opportunity_type] || OPP_TYPE_CONFIG.NEWS;
  const statusCfg = STATUS_OPP_CFG[opp.status] || STATUS_OPP_CFG.pending;
  const isDone    = opp.status === 'done';
  const isInProgress = opp.status === 'in_progress';

  const cs  = parseFloat(opp.composite_score || 0);
  const csColor = cs >= 80 ? '#059669' : cs >= 60 ? '#d97706' : cs >= 40 ? '#6366f1' : '#9ca3af';

  return (
    <div style={{
      background: isDone ? '#f9fffe' : 'white',
      borderRadius: 14, padding: '16px 18px',
      border: `1px solid ${isDone ? '#a7f3d0' : isInProgress ? '#fde68a' : '#e5e7eb'}`,
      opacity: isDone ? 0.75 : 1,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>

      {/* Type badge + composite score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 20 }}>
          {cfg.icon} {cfg.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>Score</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: csColor, lineHeight: 1 }}>{Math.round(cs)}</span>
        </div>
      </div>

      {/* Title */}
      <div style={{ fontWeight: 700, fontSize: 14, color: isDone ? '#6b7280' : '#111827', lineHeight: 1.4 }}>
        {opp.title}
      </div>

      {/* Description */}
      {opp.description && (
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{opp.description}</div>
      )}

      {/* Story origin */}
      {opp.story_title && (
        <div style={{ fontSize: 11, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#d1d5db' }}>Historia:</span>
          <span style={{ fontWeight: 600, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {opp.story_title}
          </span>
          {opp.story_source_count > 0 && (
            <span style={{ flexShrink: 0, marginLeft: 'auto' }}>
              📡 {opp.story_source_count} {opp.story_source_count === 1 ? 'fuente' : 'fuentes'}
            </span>
          )}
        </div>
      )}

      {/* Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
        <ScorePill label="SEO"      value={opp.seo_score}      color="#059669" />
        <ScorePill label="Tráfico"  value={opp.traffic_score}  color="#6366f1" />
        <ScorePill label="Urgencia" value={opp.urgency_score}  color="#dc2626" />
        <ScorePill label="Editorial" value={opp.editorial_score} color="#d97706" />
      </div>

      {/* Actions */}
      {!isDone && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onDossier} disabled={!!busy} style={{
            flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy === 'dossier' ? .7 : 1,
          }}>
            {busy === 'dossier' ? 'Creando…' : '📋 Crear dossier'}
          </button>
          {opp.status === 'pending' && (
            <button onClick={() => onStatus('dismissed')} disabled={!!busy} style={{
              padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', color: '#9ca3af', fontSize: 12, cursor: 'pointer',
            }} title="Descartar">
              ✕
            </button>
          )}
          {opp.status === 'in_progress' && (
            <button onClick={() => onStatus('done')} disabled={!!busy} style={{
              padding: '7px 10px', borderRadius: 8, border: '1px solid #a7f3d0',
              background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              ✓ Hecho
            </button>
          )}
        </div>
      )}
      {isDone && (
        <div style={{ fontSize: 12, color: '#059669', fontWeight: 700, textAlign: 'center' }}>✓ Publicado / Finalizado</div>
      )}
    </div>
  );
}

const EVENT_TYPE_ICON = {
  sports_live: '⚽🔴', sports: '⚽', politics: '🏛️', economy: '📊',
  culture: '🎭', science: '🔬', international: '🌍', breaking: '🔴',
  investigation: '🕵️', analysis: '🔍', entertainment: '🎬',
  health: '🏥', technology: '💻', general: '📰',
};

const SCORE_COLOR = (s) =>
  s >= 80 ? '#059669' : s >= 60 ? '#d97706' : s >= 40 ? '#6366f1' : '#9ca3af';

function EditorialScoreBadge({ score }) {
  const s = score || 0;
  const color = SCORE_COLOR(s);
  const pct   = s;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `conic-gradient(${color} ${pct}%, #e5e7eb 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color }}>
          {s}
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.2 }}>Score<br/>editorial</div>
    </div>
  );
}

function EventCard({ event: ev, busy, onDetail, onFollow, onDossier }) {
  const isFollowed = ev.status === 'followed';
  const covStyle   = COVERAGE_STYLE[ev.coverage_status] || COVERAGE_STYLE.monitoring;
  const typeIcon   = EVENT_TYPE_ICON[ev.event_type] || '📰';
  const sources    = Array.isArray(ev.sources) ? ev.sources.filter(Boolean) : [];
  const opps       = Array.isArray(ev.opportunities) ? ev.opportunities.filter(o => o?.status !== 'dismissed') : [];
  const entities   = Array.isArray(ev.main_entities) ? ev.main_entities : [];

  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '18px 20px',
      border: `1px solid ${isFollowed ? '#bbf7d0' : ev.coverage_status === 'breaking' ? '#fecaca' : ev.editorial_score >= 70 ? '#c7d2fe' : '#e5e7eb'}`,
      boxShadow: ev.coverage_status === 'breaking' ? '0 0 0 2px rgba(220,38,38,.1)' : ev.editorial_score >= 70 ? '0 0 0 2px rgba(99,102,241,.07)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>

      {/* Status + score row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, background: covStyle.bg, color: covStyle.color, padding: '2px 9px', borderRadius: 20 }}>
          {ev.coverage_status === 'breaking' ? '🔴' : ''} {covStyle.label}
        </span>
        <EditorialScoreBadge score={ev.editorial_score} />
      </div>

      {/* Headline */}
      <div>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', lineHeight: 1.3, marginBottom: 6 }}>
          {typeIcon} {ev.headline || '(procesando…)'}
        </div>
        {ev.summary && (
          <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {ev.summary}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
        <span>📰 {ev.article_count} artículos</span>
        <span>📡 {ev.source_count} fuentes</span>
        <span>📖 {ev.story_count} ángulos</span>
        {opps.length > 0 && <span style={{ color: '#6366f1', fontWeight: 700 }}>⚡ {opps.length} oportunidades</span>}
        <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>{timeAgo(ev.last_updated_at)}</span>
      </div>

      {/* Top opportunities */}
      {opps.length > 0 && (
        <div style={{ background: '#f8f9ff', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
            Oportunidades editoriales
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {opps.slice(0, 3).map((op, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0, fontSize: 11 }}>
                  {op.type === 'seo' ? '🔍' : op.type === 'redes' ? '📱' : op.type === 'analisis' ? '🔎' : op.type === 'explicador' ? '💡' : '✓'}
                </span>
                <span style={{ color: '#374151' }}>{op.title}</span>
                {op.traffic_potential === 'alto' && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 5px', borderRadius: 8, flexShrink: 0 }}>ALTO</span>
                )}
              </div>
            ))}
            {opps.length > 3 && <div style={{ fontSize: 11, color: '#9ca3af' }}>+{opps.length - 3} más</div>}
          </div>
        </div>
      )}

      {/* Key entities */}
      {entities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {entities.slice(0, 5).map((e, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: 10 }}>
              {e}
            </span>
          ))}
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sources.slice(0, 5).map((src, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: 10 }}>
              {src}
            </span>
          ))}
          {sources.length > 5 && <span style={{ fontSize: 10, color: '#9ca3af' }}>+{sources.length - 5}</span>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button onClick={onDetail} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Ver evento
        </button>
        {!isFollowed ? (
          <button onClick={onFollow} disabled={!!busy} title="Seguir evento" style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy === 'follow' ? '…' : '🔔'}
          </button>
        ) : (
          <span style={{ padding: '7px 10px', fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Siguiendo</span>
        )}
        <button onClick={onDossier} disabled={!!busy} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
          {busy === 'dossier' ? 'Creando…' : '📋 Crear dossier'}
        </button>
      </div>
    </div>
  );
}

const COVERAGE_STYLE = {
  breaking:   { label: 'En vivo',         color: '#dc2626', bg: '#fee2e2' },
  growing:    { label: 'Cobertura creciendo', color: '#d97706', bg: '#fef3c7' },
  monitoring: { label: 'Monitoreando',    color: '#6b7280', bg: '#f3f4f6' },
  cooling:    { label: 'Enfriando',       color: '#9ca3af', bg: '#f9fafb' },
  archived:   { label: 'Archivado',       color: '#d1d5db', bg: '#f9fafb' },
};

const STORY_TYPE_ICON = {
  breaking_news: '🔴', event: '📅', live_event: '📡',
  investigation: '🕵️', analysis: '🔍', politics: '🏛️',
  sports: '⚽', technology: '💻', entertainment: '🎬',
  economy: '📊', health: '🏥', science: '🔬',
  international: '🌍', culture: '🎭', news: '📰',
};

function StoryCard({ story: s, busy, onDetail, onFollow, onDossier }) {
  const isReady    = s.status === 'ready';
  const isFollowed = s.status === 'followed';
  const isSummarizing = s.status === 'summarizing';
  const covStyle   = COVERAGE_STYLE[s.coverage_status] || COVERAGE_STYLE.monitoring;
  const typeIcon   = STORY_TYPE_ICON[s.story_type] || '📰';
  const sourceBadges = (Array.isArray(s.sources) ? s.sources : []).slice(0, 4);
  const opportunities = Array.isArray(s.editorial_opportunities) ? s.editorial_opportunities : [];

  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '18px 20px',
      border: `1px solid ${isFollowed ? '#bbf7d0' : s.coverage_status === 'breaking' ? '#fecaca' : isReady ? '#c7d2fe' : '#e5e7eb'}`,
      boxShadow: s.coverage_status === 'breaking' ? '0 0 0 2px rgba(220,38,38,.1)' : isReady ? '0 0 0 2px rgba(99,102,241,.07)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>

      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, background: covStyle.bg, color: covStyle.color, padding: '2px 9px', borderRadius: 20 }}>
          {covStyle.label}
        </span>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          {typeIcon} {s.article_count} arts · {s.source_count} {s.source_count === 1 ? 'fuente' : 'fuentes'} · {timeAgo(s.last_seen)}
        </div>
      </div>

      {/* Title / AI headline */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', lineHeight: 1.35, marginBottom: isReady ? 8 : 0 }}>
          {s.title || '(sin título)'}
        </div>
        {isReady && s.summary && (
          <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {s.summary}
          </div>
        )}
        {isSummarizing && (
          <div style={{ fontSize: 12, color: '#f59e0b', fontStyle: 'italic', marginTop: 4 }}>⏳ Generando inteligencia editorial…</div>
        )}
      </div>

      {/* Editorial opportunities */}
      {isReady && opportunities.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Oportunidades editoriales
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {opportunities.slice(0, 4).map((op, i) => (
              <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span>{op.title}</span>
              </div>
            ))}
            {opportunities.length > 4 && (
              <div style={{ fontSize: 11, color: '#9ca3af' }}>+{opportunities.length - 4} más</div>
            )}
          </div>
        </div>
      )}

      {/* Source badges */}
      {sourceBadges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sourceBadges.map((src, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: 10 }}>
              {src}
            </span>
          ))}
          {(s.sources || []).length > 4 && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>+{s.sources.length - 4}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button onClick={onDetail} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Ver historia
        </button>
        {!isFollowed ? (
          <button onClick={onFollow} disabled={!!busy} title="Seguir historia" style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy === 'follow' ? '…' : '🔔'}
          </button>
        ) : (
          <span style={{ padding: '7px 10px', fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Siguiendo</span>
        )}
        <button onClick={onDossier} disabled={!!busy} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
          {busy === 'dossier' ? 'Creando…' : '📋 Crear dossier'}
        </button>
      </div>
    </div>
  );
}

function TrendingCard({ item, onResearch, researchingId, highlight }) {
  const color = ENTITY_TYPE_COLOR[item.entity_type] || '#374151';
  const busy  = researchingId === item.entity_id;
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '16px 18px',
      border:     `1px solid ${highlight ? '#fca5a5' : '#e5e7eb'}`,
      boxShadow:  highlight ? '0 0 0 3px rgba(239,68,68,.08)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>{item.entity_name}</div>
          <span style={{ fontSize: 11, fontWeight: 600, color, background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>{item.entity_type}</span>
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
          <button onClick={() => onResearch(item)} disabled={busy} style={{
            padding: '6px 12px', borderRadius: 8, border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
            background: highlight ? '#ef4444' : '#6366f1',
            color: 'white', fontSize: 12, fontWeight: 700, opacity: busy ? .6 : 1,
          }}>
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
