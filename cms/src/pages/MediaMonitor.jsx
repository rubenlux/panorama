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
  const [articles, setArticles]               = useState([]);
  const [articlesTotal, setArticlesTotal]     = useState(0);
  const [articlesHasMore, setArticlesHasMore] = useState(false);
  const [articlesLoadingMore, setArticlesLoadingMore] = useState(false);
  const [stories, setStories]               = useState([]);
  const [storiesTotal, setStoriesTotal]     = useState(0);
  const [storiesHasMore, setStoriesHasMore] = useState(false);
  const [storiesLoadingMore, setStoriesLoadingMore] = useState(false);
  const [storiesHours, setStoriesHours]     = useState(24);
  const storiesHoursRef = useRef(24);
  const [articlesSource, setArticlesSource] = useState(null);
  const articlesSourceRef = useRef(null);
  const [storiesSort,  setStoriesSort]      = useState('recent');
  const storiesSortRef = useRef('recent');
  const [storyBusy, setStoryBusy] = useState({});
  const [events, setEvents]               = useState([]);
  const [eventsTotal, setEventsTotal]     = useState(0);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false);
  const [eventsHours, setEventsHours]     = useState(24);
  const eventsHoursRef = useRef(24);
  const [eventsSort,  setEventsSort]      = useState('recent');
  const eventsSortRef = useRef('recent');
  const [eventBusy, setEventBusy] = useState({});
  const [editOpps,     setEditOpps]     = useState([]);
  const [oppsHasMore,  setOppsHasMore]  = useState(false);
  const [oppsTotal,    setOppsTotal]    = useState(0);
  const [oppsLoadingMore, setOppsLoadingMore] = useState(false);
  const [oppsHours,    setOppsHours]    = useState(null);
  const oppsHoursRef = useRef(null);
  const [oppsSort,     setOppsSort]     = useState('recent');
  const oppsSortRef = useRef('recent');
  const [oppBusy,      setOppBusy]      = useState({});
  const [addForm, setAddForm]   = useState({ name: '', type: 'news', rss_url: '', homepage: '' });
  const [addOpen, setAddOpen]   = useState(false);
  const [verifying,  setVerifying]  = useState(null);
  const [approving,  setApproving]  = useState(null);
  const [monPaused,     setMonPaused]     = useState(false);
  const [pauseBusy,     setPauseBusy]     = useState(false);
  const [pauseForm,     setPauseForm]     = useState(false);
  const [pauseReason,   setPauseReason]   = useState('');
  const [healthData,    setHealthData]    = useState(null);
  const [workerRuns,    setWorkerRuns]    = useState([]);
  const [systemEvents,  setSystemEvents]  = useState([]);
  const refreshRef = useRef(null);

  const loadStats    = useCallback(async () => {
    try { setStats(await apiJson('/monitor/stats', { auth: true })); } catch {}
  }, []);

  const loadPauseStatus = useCallback(async () => {
    try {
      const d = await apiJson('/monitor/worker-pause', { auth: true });
      setMonPaused(d.paused);
    } catch {}
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const d = await apiJson('/monitor/health', { auth: true });
      setHealthData(d);
      setMonPaused(d.news_monitor?.paused ?? false);
    } catch {}
  }, []);

  const loadWorkerRuns = useCallback(async () => {
    try {
      const d = await apiJson('/monitor/worker-runs?limit=30', { auth: true });
      setWorkerRuns(d.items || []);
    } catch {}
  }, []);

  const loadSystemEvents = useCallback(async () => {
    try {
      const d = await apiJson('/monitor/system-events?limit=30', { auth: true });
      setSystemEvents(d.items || []);
    } catch {}
  }, []);

  async function handlePauseToggle() {
    if (!monPaused && !pauseForm) {
      setPauseForm(true);
      return;
    }
    setPauseBusy(true);
    const next = !monPaused;
    try {
      const d = await apiJson('/monitor/worker-pause', {
        method: 'POST', auth: true,
        body: { paused: next, reason: next ? pauseReason : undefined },
      });
      setMonPaused(d.paused);
      setPauseForm(false);
      setPauseReason('');
      loadHealth();
    } catch (e) {
      console.error('[PauseToggle] Error:', e.message);
      alert('Error al cambiar estado del monitor: ' + e.message);
    } finally { setPauseBusy(false); }
  }

  async function confirmPause() {
    setPauseBusy(true);
    try {
      const d = await apiJson('/monitor/worker-pause', {
        method: 'POST', auth: true,
        body: { paused: true, reason: pauseReason },
      });
      setMonPaused(d.paused);
      setPauseForm(false);
      setPauseReason('');
      loadHealth();
    } catch (e) {
      alert('Error al pausar: ' + e.message);
    } finally { setPauseBusy(false); }
  }

  const loadSources  = useCallback(async () => {
    try { const d = await apiJson('/monitor/sources', { auth: true }); setSources(d.items || []); } catch {}
  }, []);

  const FEED_PER_PAGE    = 50;
  const STORIES_PER_PAGE = 50;
  const EVENTS_PER_PAGE  = 50;
  const TIME_OPTIONS = [
    { value: 1,  label: 'Última 1h' },
    { value: 2,  label: 'Últimas 2h' },
    { value: 6,  label: 'Últimas 6h' },
    { value: 12, label: 'Últimas 12h' },
    { value: 24, label: 'Últimas 24h' },
  ];

  const loadArticles = useCallback(async () => {
    try {
      const sId = articlesSourceRef.current;
      const url = `/monitor/articles?hours=24&limit=${FEED_PER_PAGE}${sId ? `&source_id=${sId}` : ''}`;
      const d = await apiJson(url, { auth: true });
      setArticles(d.items || []);
      setArticlesTotal(d.total || 0);
      setArticlesHasMore((d.items || []).length === FEED_PER_PAGE);
    } catch {}
  }, []);

  const loadMoreArticles = useCallback(async () => {
    setArticlesLoadingMore(true);
    try {
      const sId = articlesSourceRef.current;
      const url = `/monitor/articles?hours=24&limit=${FEED_PER_PAGE}&offset=${articles.length}${sId ? `&source_id=${sId}` : ''}`;
      const d = await apiJson(url, { auth: true });
      const newItems = d.items || [];
      setArticles(prev => [...prev, ...newItems]);
      setArticlesHasMore(newItems.length === FEED_PER_PAGE);
    } catch {} finally { setArticlesLoadingMore(false); }
  }, [articles.length]);

  const handleArticlesSourceChange = useCallback((sId) => {
    articlesSourceRef.current = sId || null;
    setArticlesSource(sId || null);
    setArticles([]);
    setArticlesTotal(0);
    setArticlesHasMore(false);
    loadArticles();
  }, [loadArticles]);

  const loadStories = useCallback(async () => {
    try {
      const d = await getStories({ minArticles: 2, limit: STORIES_PER_PAGE, hours: storiesHoursRef.current, sort: storiesSortRef.current });
      const items = d.items || [];
      const total = d.total || 0;
      setStories(items);
      setStoriesTotal(total);
      setStoriesHasMore(items.length < total);
    } catch {}
  }, []);

  const loadMoreStories = useCallback(async () => {
    setStoriesLoadingMore(true);
    try {
      const currentOffset = stories.length;
      const d = await getStories({ minArticles: 2, limit: STORIES_PER_PAGE, offset: currentOffset, hours: storiesHoursRef.current, sort: storiesSortRef.current });
      const newItems = d.items || [];
      const total = d.total || 0;
      setStories(prev => [...prev, ...newItems]);
      setStoriesTotal(total);
      setStoriesHasMore(currentOffset + newItems.length < total);
    } catch {} finally { setStoriesLoadingMore(false); }
  }, [stories.length]);

  const loadEvents = useCallback(async () => {
    try {
      const d = await getEvents({ limit: EVENTS_PER_PAGE, hours: eventsHoursRef.current, sort: eventsSortRef.current });
      const items = d.items || [];
      const total = d.total || 0;
      setEvents(items);
      setEventsTotal(total);
      setEventsHasMore(items.length < total);
    } catch {}
  }, []);

  const loadMoreEvents = useCallback(async () => {
    setEventsLoadingMore(true);
    try {
      const currentOffset = events.length;
      const d = await getEvents({ limit: EVENTS_PER_PAGE, offset: currentOffset, hours: eventsHoursRef.current, sort: eventsSortRef.current });
      const newItems = d.items || [];
      const total = d.total || 0;
      setEvents(prev => [...prev, ...newItems]);
      setEventsTotal(total);
      setEventsHasMore(currentOffset + newItems.length < total);
    } catch {} finally { setEventsLoadingMore(false); }
  }, [events.length]);

  const OPPS_PER_PAGE = 50;
  const loadOpps = useCallback(async () => {
    try {
      const d = await getOpportunities({ limit: OPPS_PER_PAGE, age: 'ALL', hours: oppsHoursRef.current, sort: oppsSortRef.current });
      const items = d.items || [];
      const total = d.total || 0;
      setEditOpps(items);
      setOppsTotal(total);
      setOppsHasMore(items.length < total);
    } catch {}
  }, []);

  const loadMoreOpps = useCallback(async () => {
    setOppsLoadingMore(true);
    try {
      const currentOffset = editOpps.length;
      const d = await getOpportunities({ limit: OPPS_PER_PAGE, offset: currentOffset, age: 'ALL', hours: oppsHoursRef.current, sort: oppsSortRef.current });
      const newItems = d.items || [];
      const total = d.total || 0;
      setEditOpps(prev => [...prev, ...newItems]);
      setOppsTotal(total);
      setOppsHasMore(currentOffset + newItems.length < total);
    } catch {} finally { setOppsLoadingMore(false); }
  }, [editOpps.length]);

  const handleStoriesHoursChange = useCallback((h) => {
    storiesHoursRef.current = h;
    setStoriesHours(h);
    setStories([]);
    setStoriesTotal(0);
    setStoriesHasMore(false);
    loadStories();
  }, [loadStories]);

  const handleStoriesSortChange = useCallback((s) => {
    storiesSortRef.current = s;
    setStoriesSort(s);
    setStories([]);
    setStoriesTotal(0);
    setStoriesHasMore(false);
    loadStories();
  }, [loadStories]);

  const handleEventsHoursChange = useCallback((h) => {
    eventsHoursRef.current = h;
    setEventsHours(h);
    setEvents([]);
    setEventsTotal(0);
    setEventsHasMore(false);
    loadEvents();
  }, [loadEvents]);

  const handleEventsSortChange = useCallback((s) => {
    eventsSortRef.current = s;
    setEventsSort(s);
    setEvents([]);
    setEventsTotal(0);
    setEventsHasMore(false);
    loadEvents();
  }, [loadEvents]);

  const handleOppsHoursChange = useCallback((h) => {
    oppsHoursRef.current = h;
    setOppsHours(h);
    setEditOpps([]);
    setOppsTotal(0);
    setOppsHasMore(false);
    loadOpps();
  }, [loadOpps]);

  const handleOppsSortChange = useCallback((s) => {
    oppsSortRef.current = s;
    setOppsSort(s);
    setEditOpps([]);
    setOppsTotal(0);
    setOppsHasMore(false);
    loadOpps();
  }, [loadOpps]);

  useEffect(() => {
    loadStats(); loadSources(); loadArticles(); loadStories(); loadEvents(); loadOpps();
    loadHealth(); loadWorkerRuns(); loadSystemEvents();
    refreshRef.current = setInterval(() => {
      loadStats(); loadArticles(); loadStories(); loadEvents(); loadOpps();
      loadHealth(); loadWorkerRuns();
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

  async function handleGenerateEventSummary(id) {
    setEventBusy(p => ({ ...p, [id]: 'summary' }));
    try {
      const d = await apiJson(`/events/${id}/generate-summary`, { method: 'POST', auth: true });
      if (d.event) setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...d.event } : ev));
    } catch (e) { alert('Error al analizar evento: ' + e.message); }
    finally { setEventBusy(p => ({ ...p, [id]: null })); }
  }

  // Stats for sources tab
  const srcStats = {
    pending:  sources.filter(s => (s.verification_status || 'pending') === 'pending').length,
    verified: sources.filter(s => s.verification_status === 'verified').length,
    failed:   sources.filter(s => s.verification_status === 'failed').length,
    approved: sources.filter(s => s.verification_status === 'approved').length,
  };

  const alertCount = healthData?.alerts?.length || 0;
  const TABS = [
    { id: 'events',  label: '🎯 Eventos',       count: eventsTotal || events.length },
    { id: 'feed',    label: '📰 Feed',          count: articlesTotal || articles.length },
    { id: 'trending',label: '📖 Historias',     count: storiesTotal || stories.length },
    { id: 'opps',    label: '⚡ Oportunidades', count: oppsTotal || stats?.opportunities || editOpps.length, alert: (oppsTotal || stats?.opportunities || editOpps.length) > 0 },
    { id: 'sources', label: '📡 Fuentes',       count: sources.length },
    { id: 'health',  label: '🔧 Sistema',       count: alertCount, alert: alertCount > 0 },
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
              <WorkerStatusV2 health={healthData} idleSecs={stats.worker_idle_seconds} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {monPaused ? (
                  <button
                    onClick={handlePauseToggle}
                    disabled={pauseBusy}
                    style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#dcfce7', color: '#166534', opacity: pauseBusy ? 0.6 : 1 }}
                  >
                    ▶ Reanudar
                  </button>
                ) : pauseForm ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Motivo (ej: Ahorro IA)"
                      value={pauseReason}
                      onChange={e => setPauseReason(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmPause()}
                      autoFocus
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #fca5a5', fontSize: 13, width: 200 }}
                    />
                    <button onClick={confirmPause} disabled={pauseBusy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#fee2e2', color: '#dc2626' }}>
                      Confirmar
                    </button>
                    <button onClick={() => { setPauseForm(false); setPauseReason(''); }} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 13, background: '#fff', color: '#6b7280' }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handlePauseToggle}
                    disabled={pauseBusy}
                    style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#fee2e2', color: '#dc2626', opacity: pauseBusy ? 0.6 : 1 }}
                  >
                    ⏸ Pausar
                  </button>
                )}
                {monPaused && healthData?.news_monitor?.paused_since && (
                  <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
                    {healthData.news_monitor.pause_reason && <span style={{ color: '#6b7280' }}>{healthData.news_monitor.pause_reason} · </span>}
                    {timeAgo(healthData.news_monitor.paused_since)}
                  </div>
                )}
              </div>
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {TIME_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => handleEventsHoursChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: eventsHours === value ? '2px solid #6366f1' : '1px solid #e5e7eb',
                  background: eventsHours === value ? '#eef2ff' : 'white',
                  color: eventsHours === value ? '#4338ca' : '#6b7280',
                }}>{label}</button>
              ))}
              <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />
              {[{ value: 'recent', label: '🕐 Recientes' }, { value: 'score', label: '⭐ Score' }].map(({ value, label }) => (
                <button key={value} onClick={() => handleEventsSortChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: eventsSort === value ? '2px solid #059669' : '1px solid #e5e7eb',
                  background: eventsSort === value ? '#d1fae5' : 'white',
                  color: eventsSort === value ? '#065f46' : '#6b7280',
                }}>{label}</button>
              ))}
            </div>
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
                  {events.filter(e => e.editorial_score >= 70).length} eventos prioritarios · {eventsTotal || events.length} eventos activos
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
                  onGenerateSummary={() => handleGenerateEventSummary(ev.id)}
                />
              ))}
            </div>
            {eventsHasMore && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button onClick={loadMoreEvents} disabled={eventsLoadingMore} style={{
                  padding: '10px 28px', borderRadius: 10, border: '1px solid #e5e7eb',
                  background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: eventsLoadingMore ? 'not-allowed' : 'pointer', opacity: eventsLoadingMore ? .6 : 1,
                }}>
                  {eventsLoadingMore ? 'Cargando…' : `Cargar más (${events.length} de ${eventsTotal})`}
                </button>
              </div>
            )}
            {!eventsHasMore && events.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                Todos los eventos cargados ({events.length})
              </div>
            )}
          </div>
        )}

        {/* ── FEED ─────────────────────────────────────────────────────── */}
        {tab === 'feed' && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', background: '#f9fafb', padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                🔍 Filtrar por fuente:
              </div>
              <select 
                value={articlesSource || ''} 
                onChange={(e) => handleArticlesSourceChange(e.target.value)}
                style={{ 
                  padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', 
                  fontSize: 13, fontWeight: 600, color: '#374151', background: 'white',
                  cursor: 'pointer', outline: 'none', minWidth: 200
                }}
              >
                <option value="">Todas las fuentes ({sources.length})</option>
                {[...sources].sort((a,b) => a.name.localeCompare(b.name)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {articlesSource && (
                <button onClick={() => handleArticlesSourceChange(null)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  Limpiar filtro
                </button>
              )}
            </div>
            {articles.length === 0 && (
              <EmptyState icon="📰" title={articlesSource ? "Sin artículos de esta fuente" : "Sin artículos todavía"} body={articlesSource ? "No se encontraron artículos recientes para la fuente seleccionada." : "El worker detecta artículos nuevos cada 60s. Asegúrate de que esté corriendo: npm run worker"} />
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
            {articlesHasMore && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button onClick={loadMoreArticles} disabled={articlesLoadingMore} style={{
                  padding: '10px 28px', borderRadius: 10, border: '1px solid #e5e7eb',
                  background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: articlesLoadingMore ? 'not-allowed' : 'pointer', opacity: articlesLoadingMore ? .6 : 1,
                }}>
                  {articlesLoadingMore ? 'Cargando…' : `Cargar más (${articles.length} de ${articlesTotal})`}
                </button>
              </div>
            )}
            {!articlesHasMore && articles.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                Todos los artículos cargados ({articles.length})
              </div>
            )}
          </div>
        )}

        {/* ── HISTORIAS ACTIVAS ──────────────────────────────────────────── */}
        {tab === 'trending' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {TIME_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => handleStoriesHoursChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: storiesHours === value ? '2px solid #6366f1' : '1px solid #e5e7eb',
                  background: storiesHours === value ? '#eef2ff' : 'white',
                  color: storiesHours === value ? '#4338ca' : '#6b7280',
                }}>{label}</button>
              ))}
              <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />
              {[{ value: 'recent', label: '🕐 Recientes' }, { value: 'score', label: '⭐ Score' }].map(({ value, label }) => (
                <button key={value} onClick={() => handleStoriesSortChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: storiesSort === value ? '2px solid #059669' : '1px solid #e5e7eb',
                  background: storiesSort === value ? '#d1fae5' : 'white',
                  color: storiesSort === value ? '#065f46' : '#6b7280',
                }}>{label}</button>
              ))}
            </div>
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
                  {stories.filter(s => s.source_count >= 3).length} confirmadas · {storiesTotal || stories.length} historias activas
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['breaking', 'growing', 'monitoring', 'cooling'].map(cs => {
                    const n = stories.filter(s => s.coverage_status === cs).length;
                    if (!n) return null;
                    const csStyle = COVERAGE_STYLE[cs] || COVERAGE_STYLE.monitoring;
                    return (
                      <span key={cs} style={{ background: csStyle.bg, color: csStyle.color, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
                        {cs === 'breaking' ? '🔴' : cs === 'growing' ? '📈' : cs === 'cooling' ? '📉' : '●'} {csStyle.label}: {n}
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
            {storiesHasMore && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button onClick={loadMoreStories} disabled={storiesLoadingMore} style={{
                  padding: '10px 28px', borderRadius: 10, border: '1px solid #e5e7eb',
                  background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: storiesLoadingMore ? 'not-allowed' : 'pointer', opacity: storiesLoadingMore ? .6 : 1,
                }}>
                  {storiesLoadingMore ? 'Cargando…' : `Cargar más (${stories.length} de ${storiesTotal})`}
                </button>
              </div>
            )}
            {!storiesHasMore && stories.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                Todas las historias cargadas ({stories.length})
              </div>
            )}
          </div>
        )}

        {/* ── OPORTUNIDADES EDITORIALES ─────────────────────────────────── */}
        {tab === 'opps' && (
          <div>
            {/* Hours + sort filter for opportunities */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => handleOppsHoursChange(null)} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: oppsHours === null ? '2px solid #6366f1' : '1px solid #e5e7eb',
                background: oppsHours === null ? '#eef2ff' : 'white',
                color: oppsHours === null ? '#4338ca' : '#6b7280',
              }}>Todas</button>
              {TIME_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => handleOppsHoursChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: oppsHours === value ? '2px solid #6366f1' : '1px solid #e5e7eb',
                  background: oppsHours === value ? '#eef2ff' : 'white',
                  color: oppsHours === value ? '#4338ca' : '#6b7280',
                }}>{label}</button>
              ))}
              <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />
              {[{ value: 'recent', label: '🕐 Recientes' }, { value: 'score', label: '⭐ Score' }].map(({ value, label }) => (
                <button key={value} onClick={() => handleOppsSortChange(value)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: oppsSort === value ? '2px solid #059669' : '1px solid #e5e7eb',
                  background: oppsSort === value ? '#d1fae5' : 'white',
                  color: oppsSort === value ? '#065f46' : '#6b7280',
                }}>{label}</button>
              ))}
            </div>
            {editOpps.length === 0 && (
              <EmptyState
                icon="⚡"
                title="Sin oportunidades editoriales todavía"
                body="Las oportunidades algorítmicas se generan con cada ciclo del monitor. Las oportunidades IA requieren que el worker esté corriendo con Claude activo."
              />
            )}
            {editOpps.length > 0 && (() => {
              const pending   = editOpps.filter(o => o.status === 'pending');
              const algoCount = pending.filter(o => o.trigger === 'algorithmic').length;
              const aiCount   = pending.filter(o => o.trigger !== 'algorithmic').length;
              const types     = [...new Set(pending.map(o => o.opportunity_type))];
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                      {pending.length} {pending.length === 1 ? 'oportunidad disponible' : 'oportunidades disponibles'}
                    </div>
                    {algoCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46', padding: '2px 9px', borderRadius: 20 }}>
                        ⚙️ ALGORÍTMICA: {algoCount}
                      </span>
                    )}
                    {aiCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#5b21b6', padding: '2px 9px', borderRadius: 20 }}>
                        ✨ IA: {aiCount}
                      </span>
                    )}
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
            {oppsHasMore && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button onClick={loadMoreOpps} disabled={oppsLoadingMore} style={{
                  padding: '10px 28px', borderRadius: 10, border: '1px solid #e5e7eb',
                  background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: oppsLoadingMore ? 'not-allowed' : 'pointer', opacity: oppsLoadingMore ? .6 : 1,
                }}>
                  {oppsLoadingMore ? 'Cargando…' : `Cargar más (${editOpps.length} de ${oppsTotal})`}
                </button>
              </div>
            )}
            {!oppsHasMore && editOpps.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                Todas las oportunidades cargadas ({editOpps.length})
              </div>
            )}
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
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setAddOpen(true)}
                    style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    + Agregar fuente RSS
                  </button>
                  <button onClick={() => navigate('/monitor/tracked')}
                    style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6366f1', border: '1px solid #6366f1', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    🌐 Coverage Monitor (URLs)
                  </button>
                </div>
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

        {/* ── SISTEMA ───────────────────────────────────────────────────── */}
        {tab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Alerts */}
            {healthData?.alerts?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#374151' }}>Alertas ({healthData.alerts.length})</h3>
                {healthData.alerts.map((a, i) => (
                  <div key={i} style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${a.severity === 'critical' ? '#fca5a5' : '#fde68a'}`, background: a.severity === 'critical' ? '#fff1f2' : '#fffbeb', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{a.severity === 'critical' ? '🔴' : '⚠️'}</span>
                    <span style={{ fontSize: 13, color: '#374151' }}>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Worker status grid */}
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151' }}>Estado Operativo</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {/* Worker process */}
                <MonitorCard
                  title="Worker"
                  status={healthData?.worker?.status || 'unknown'}
                  lines={[
                    healthData?.worker?.last_seen_at ? `Visto ${timeAgo(healthData.worker.last_seen_at)}` : 'Nunca visto',
                  ]}
                />
                {/* News monitor */}
                <MonitorCard
                  title="News Monitor"
                  status={healthData?.news_monitor?.status || 'unknown'}
                  lines={[
                    healthData?.news_monitor?.paused_since
                      ? `Pausado ${timeAgo(healthData.news_monitor.paused_since)}`
                      : healthData?.news_monitor?.last_run_at
                        ? `Último ciclo ${timeAgo(healthData.news_monitor.last_run_at)}`
                        : 'Sin datos',
                    healthData?.news_monitor?.paused_by && `Por: ${healthData.news_monitor.paused_by}`,
                    healthData?.news_monitor?.pause_reason && `Motivo: ${healthData.news_monitor.pause_reason}`,
                    healthData?.news_monitor?.cycles_24h != null && `${healthData.news_monitor.cycles_24h} ciclos · ${healthData.news_monitor.success_rate_pct ?? '—'}% éxito`,
                    healthData?.news_monitor?.avg_duration_ms && `Prom: ${(healthData.news_monitor.avg_duration_ms / 1000).toFixed(1)}s`,
                  ].filter(Boolean)}
                />
                {/* Social monitor */}
                <MonitorCard
                  title="Social Monitor"
                  status={healthData?.social_monitor?.status || 'unknown'}
                  lines={[
                    healthData?.social_monitor?.last_run_at
                      ? `Último ciclo ${timeAgo(healthData.social_monitor.last_run_at)}`
                      : 'Sin datos',
                    healthData?.social_monitor?.last_sources_processed != null && `${healthData.social_monitor.last_sources_processed} fuentes · ${healthData.social_monitor.last_items_saved} nuevos posts`,
                    healthData?.social_monitor?.cycles_24h != null && `${healthData.social_monitor.cycles_24h} ciclos (24h)`,
                    healthData?.social_monitor?.avg_duration_ms && `Prom: ${(healthData.social_monitor.avg_duration_ms / 1000).toFixed(0)}s`,
                  ].filter(Boolean)}
                />
                {/* Transcripts */}
                <MonitorCard
                  title="Transcript Engine"
                  status={healthData?.transcripts?.total_eligible > 0
                    ? (healthData.transcripts.coverage_pct >= 30 ? 'active' : 'warning')
                    : 'unknown'}
                  lines={[
                    `${healthData?.transcripts?.coverage_pct ?? 0}% cobertura`,
                    `Con: ${healthData?.transcripts?.total_with_transcript ?? 0} · Sin: ${healthData?.transcripts?.total_without ?? 0} · Pendientes: ${healthData?.transcripts?.total_pending ?? 0}`,
                    healthData?.transcripts?.avg_length && `Prom: ${healthData.transcripts.avg_length.toLocaleString()} chars`,
                  ].filter(Boolean)}
                />
              </div>
            </div>

            {/* Backlog */}
            {healthData?.news_monitor?.paused && healthData?.backlog?.estimated_pending > 0 && (
              <div style={{ padding: '14px 18px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 6 }}>
                  📦 Backlog estimado durante pausa
                </div>
                <div style={{ fontSize: 13, color: '#78350f' }}>
                  ~<strong>{healthData.backlog.estimated_pending.toLocaleString()}</strong> artículos sin procesar
                  · {healthData.backlog.hours_since_last_article}h de inactividad
                  · {healthData.backlog.avg_articles_per_hour} arts/h promedio
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                  Al reanudar, el monitor procesará el backlog automáticamente en ciclos de 60s.
                </div>
              </div>
            )}

            {/* Transcript coverage by source */}
            {healthData?.transcripts?.by_source?.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151' }}>Cobertura de Transcripts por Fuente</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {healthData.transcripts.by_source.map((s, i) => {
                    const pct = s.coverage_pct ?? 0;
                    const barColor = pct >= 70 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{s.content_type}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: barColor }}>{pct.toFixed(0)}%</span>
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.with_transcript}/{s.total}</span>
                          {s.pending > 0 && <span style={{ fontSize: 11, color: '#f59e0b' }}>+{s.pending} pend.</span>}
                        </div>
                        <div style={{ height: 4, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 4, transition: 'width .3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* RSS sources summary */}
            {healthData?.rss_sources && (
              <div style={{ padding: '12px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Fuentes RSS</div>
                <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#374151', flexWrap: 'wrap' }}>
                  <span>Total: <strong>{healthData.rss_sources.total}</strong></span>
                  <span style={{ color: '#10b981' }}>Activas: <strong>{healthData.rss_sources.active}</strong></span>
                  {healthData.rss_sources.inactive > 0 && <span style={{ color: '#ef4444' }}>Inactivas: <strong>{healthData.rss_sources.inactive}</strong></span>}
                  <span style={{ color: '#6b7280' }}>Revisadas último hora: <strong>{healthData.rss_sources.checked_last_hour}</strong></span>
                </div>
              </div>
            )}

            {/* Recent worker runs */}
            {workerRuns.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151' }}>Últimas Ejecuciones</h3>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['Hora', 'Worker', 'Estado', 'Fuentes', 'Encontrados', 'Guardados', 'Duración'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workerRuns.map((r, i) => {
                        const statusIcon = r.status === 'success' ? '✅' : r.status === 'error' ? '❌' : r.status === 'skipped' ? '⏭' : '⏳';
                        const dur = r.duration_ms != null ? (r.duration_ms >= 60000 ? `${(r.duration_ms/60000).toFixed(1)}min` : `${(r.duration_ms/1000).toFixed(1)}s`) : '—';
                        return (
                          <tr key={r.id} style={{ borderBottom: i < workerRuns.length - 1 ? '1px solid #f3f4f6' : 'none', background: r.status === 'error' ? '#fff1f2' : 'inherit' }}>
                            <td style={{ padding: '7px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(r.started_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                            <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.worker_name.replace('_', ' ')}</td>
                            <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{statusIcon} {r.status}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'center', color: '#374151' }}>{r.sources_processed || '—'}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'center', color: '#374151' }}>{r.items_found || '—'}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'center', color: '#374151' }}>{r.items_saved || '—'}</td>
                            <td style={{ padding: '7px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{dur}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* System events */}
            {systemEvents.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151' }}>Eventos del Sistema</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {systemEvents.map((e, i) => (
                    <div key={e.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                      <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('es-AR', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ fontWeight: 600, color: '#374151' }}>{e.event_type}</span>
                      {e.actor && e.actor !== 'system' && <span style={{ color: '#6b7280' }}>por {e.actor}</span>}
                      {e.metadata?.reason && <span style={{ color: '#9ca3af' }}>— {e.metadata.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!healthData && (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Cargando datos de sistema...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorkerStatusV2 — uses health data for accurate status ─────────────────────
function WorkerStatusV2({ health, idleSecs }) {
  // Fallback to legacy idle-seconds logic if health not loaded yet
  if (!health) {
    if (idleSecs == null) return (
      <div style={{ padding: '8px 14px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#854d0e' }}>⚠️ Sin datos</div>
        <div style={{ fontSize: 10, color: '#854d0e', marginTop: 2 }}>Worker nunca corrió</div>
      </div>
    );
    const alive = idleSecs < 180;
    const mins  = Math.floor(idleSecs / 60);
    return (
      <div style={{ padding: '8px 14px', background: alive ? '#f0fdf4' : '#fff1f2', border: `1px solid ${alive ? '#86efac' : '#fecaca'}`, borderRadius: 10, textAlign: 'center', minWidth: 120 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: alive ? '#166534' : '#dc2626', lineHeight: 1 }}>
          {alive ? '🟢 Worker activo' : '🔴 Worker detenido'}
        </div>
        <div style={{ fontSize: 10, color: alive ? '#166534' : '#dc2626', marginTop: 3 }}>
          {alive ? `último ciclo hace ${idleSecs < 60 ? idleSecs + 's' : mins + 'min'}` : `sin actividad · npm run worker`}
        </div>
      </div>
    );
  }

  const workerAlive = health.worker?.status === 'active';
  const newsStatus  = health.news_monitor?.status; // active | paused | stopped
  const socialAlive = health.social_monitor?.status === 'active';

  const workerBg    = workerAlive ? '#f0fdf4' : '#fff1f2';
  const workerBdr   = workerAlive ? '#86efac' : '#fecaca';
  const workerColor = workerAlive ? '#166534' : '#dc2626';

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ padding: '8px 12px', background: workerBg, border: `1px solid ${workerBdr}`, borderRadius: 10, textAlign: 'center', minWidth: 100 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: workerColor, lineHeight: 1 }}>
          {workerAlive ? '🟢' : '🔴'} Worker
        </div>
        <div style={{ fontSize: 10, color: workerColor, marginTop: 2 }}>
          {workerAlive ? timeAgo(health.worker?.last_seen_at) : 'detenido'}
        </div>
      </div>
      <div style={{ padding: '8px 12px', background: newsStatus === 'paused' ? '#fffbeb' : newsStatus === 'active' ? '#f0fdf4' : '#fff1f2', border: `1px solid ${newsStatus === 'paused' ? '#fde68a' : newsStatus === 'active' ? '#86efac' : '#fecaca'}`, borderRadius: 10, textAlign: 'center', minWidth: 110 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: newsStatus === 'paused' ? '#92400e' : newsStatus === 'active' ? '#166534' : '#dc2626', lineHeight: 1 }}>
          {newsStatus === 'paused' ? '🟡' : newsStatus === 'active' ? '🟢' : '🔴'} News
        </div>
        <div style={{ fontSize: 10, color: newsStatus === 'paused' ? '#92400e' : newsStatus === 'active' ? '#166534' : '#dc2626', marginTop: 2 }}>
          {newsStatus === 'paused' ? `pausado ${timeAgo(health.news_monitor?.paused_since)}` : newsStatus === 'active' ? timeAgo(health.news_monitor?.last_run_at) : 'detenido'}
        </div>
      </div>
      <div style={{ padding: '8px 12px', background: socialAlive ? '#f0fdf4' : '#fff1f2', border: `1px solid ${socialAlive ? '#86efac' : '#fecaca'}`, borderRadius: 10, textAlign: 'center', minWidth: 100 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: socialAlive ? '#166534' : '#dc2626', lineHeight: 1 }}>
          {socialAlive ? '🟢' : '🔴'} Social
        </div>
        <div style={{ fontSize: 10, color: socialAlive ? '#166534' : '#dc2626', marginTop: 2 }}>
          {socialAlive ? timeAgo(health.social_monitor?.last_run_at) : 'detenido'}
        </div>
      </div>
    </div>
  );
}

// ── MonitorCard — operational status card for health tab ──────────────────────
function MonitorCard({ title, status, lines }) {
  const cfg = {
    active:   { dot: '🟢', bg: '#f0fdf4', bdr: '#86efac', hdr: '#166534' },
    paused:   { dot: '🟡', bg: '#fffbeb', bdr: '#fde68a', hdr: '#92400e' },
    warning:  { dot: '🟡', bg: '#fffbeb', bdr: '#fde68a', hdr: '#92400e' },
    stopped:  { dot: '🔴', bg: '#fff1f2', bdr: '#fecaca', hdr: '#dc2626' },
    unknown:  { dot: '⚪', bg: '#f9fafb', bdr: '#e5e7eb', hdr: '#6b7280' },
  }[status] || { dot: '⚪', bg: '#f9fafb', bdr: '#e5e7eb', hdr: '#6b7280' };

  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.bdr}`, borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: cfg.hdr, marginBottom: 6 }}>{cfg.dot} {title}</div>
      {lines.map((line, i) => (
        <div key={i} style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>{line}</div>
      ))}
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

      {/* Type badge + trigger badge + composite score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 20 }}>
            {cfg.icon} {cfg.label}
          </span>
          {opp.trigger === 'algorithmic'
            ? <span style={{ fontSize: 10, fontWeight: 700, background: '#d1fae5', color: '#065f46', padding: '2px 7px', borderRadius: 20 }}>⚙️ ALGORÍTMICA</span>
            : <span style={{ fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#5b21b6', padding: '2px 7px', borderRadius: 20 }}>✨ IA</span>
          }
        </div>
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

function EventCard({ event: ev, busy, onDetail, onFollow, onDossier, onGenerateSummary }) {
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
        {!ev.summary && onGenerateSummary && (
          <button onClick={onGenerateSummary} disabled={!!busy}
            style={{ marginTop: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #c7d2fe',
              background: '#eef2ff', color: '#4338ca', fontSize: 11, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy === 'summary' ? '⏳ Analizando…' : '✨ Analizar evento'}
          </button>
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

const QUALITY_STYLE = {
  poor:      { emoji: '🔴', label: 'Insuficiente',   bg: '#fee2e2', color: '#b91c1c' },
  fair:      { emoji: '🟡', label: 'En desarrollo',  bg: '#fef9c3', color: '#a16207' },
  good:      { emoji: '🟢', label: 'Buena historia', bg: '#d1fae5', color: '#065f46' },
  excellent: { emoji: '⭐', label: 'Historia sólida', bg: '#ecfdf5', color: '#047857' },
};

const CONFIDENCE_STYLE = {
  low:    { label: 'Sin corroborar', bg: '#f3f4f6', color: '#6b7280' },
  medium: { label: 'Corroborada',    bg: '#eff6ff', color: '#1d4ed8' },
  high:   { label: 'Confirmada',     bg: '#dcfce7', color: '#166534' },
};

// Algorithmic corroboration — derived from source_count + coverage_status, no AI
function algoCorroboration(sourceCount, coverageStatus) {
  if (coverageStatus === 'breaking') return { label: 'Cobertura alta',     color: '#dc2626', bg: '#fee2e2' };
  if (coverageStatus === 'growing')  return { label: 'Cobertura creciendo',color: '#d97706', bg: '#fef3c7' };
  if (sourceCount >= 4) return { label: 'Confirmada',   color: '#059669', bg: '#d1fae5' };
  if (sourceCount >= 3) return { label: 'Corroborada',  color: '#1d4ed8', bg: '#dbeafe' };
  if (sourceCount >= 2) return { label: 'En desarrollo',color: '#d97706', bg: '#fef9c3' };
  return { label: 'Una fuente', color: '#6b7280', bg: '#f3f4f6' };
}

function StoryCard({ story: s, busy, onDetail, onFollow, onDossier }) {
  const isFollowed   = s.status === 'followed';
  const covStyle     = COVERAGE_STYLE[s.coverage_status] || COVERAGE_STYLE.monitoring;
  const typeIcon     = STORY_TYPE_ICON[s.story_type] || '📰';
  const sourceBadges = (Array.isArray(s.sources) ? s.sources : []).slice(0, 4);
  const corroboration = algoCorroboration(s.source_count, s.coverage_status);
  // Show AI summary if available, otherwise algorithmic summary
  const displaySummary = s.summary || s.algorithmic_summary || null;

  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '18px 20px',
      border: `1px solid ${isFollowed ? '#bbf7d0' : s.coverage_status === 'breaking' ? '#fecaca' : '#e5e7eb'}`,
      boxShadow: s.coverage_status === 'breaking' ? '0 0 0 2px rgba(220,38,38,.1)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>

      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, background: covStyle.bg, color: covStyle.color, padding: '2px 9px', borderRadius: 20 }}>
            {covStyle.label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, background: corroboration.bg, color: corroboration.color, padding: '1px 7px', borderRadius: 20 }}>
            {corroboration.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          {typeIcon} {s.article_count} arts · {s.source_count} {s.source_count === 1 ? 'fuente' : 'fuentes'} · {timeAgo(s.last_seen)}
        </div>
      </div>

      {/* Title + summary */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', lineHeight: 1.35, marginBottom: displaySummary ? 6 : 0 }}>
          {s.title || '(sin título)'}
        </div>
        {displaySummary && (
          <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {displaySummary}
          </div>
        )}
      </div>

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
