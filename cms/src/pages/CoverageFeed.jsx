import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const SOURCE_TYPES = [
  { value: 'topic_hub',    label: 'Topic Hub' },
  { value: 'section_page', label: 'Sección' },
  { value: 'live_event',   label: 'Evento en Vivo' },
  { value: 'custom',       label: 'Personalizado' },
];

const CHANGE_FILTERS = [
  { value: '',             label: 'Todos' },
  { value: 'link_added',   label: '+ Nuevas' },
  { value: 'title_changed',label: '~ Títulos' },
  { value: 'link_removed', label: '– Removidas' },
];

const CHANGE_META = {
  link_added:    { label: 'NUEVA URL',             bg: '#d1fae5', color: '#065f46', symbol: '+' },
  link_removed:  { label: 'REMOVIDA DEL LISTADO',  bg: '#f3f4f6', color: '#374151', symbol: '–' },
  title_changed: { label: 'TÍTULO MODIFICADO',     bg: '#dbeafe', color: '#1e40af', symbol: '~' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateGroup(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'HOY';
  if (d.toDateString() === yesterday.toDateString()) return 'AYER';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}

function ChangeCard({ change, onArticleClick }) {
  const meta = CHANGE_META[change.change_type] || CHANGE_META.link_added;
  const displayTitle = change.new_value || change.old_value || change.article_title || '—';
  const url = change.article_url;

  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Time */}
        <div style={{ minWidth: 48, color: '#9ca3af', fontSize: 13, fontWeight: 600, paddingTop: 2 }}>
          {formatTime(change.detected_at)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Source + Badge row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
              {change.source_name}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
              background: meta.bg, color: meta.color, letterSpacing: '0.04em',
            }}>
              {meta.symbol} {meta.label}
            </span>
          </div>

          {/* Title */}
          {change.change_type === 'title_changed' ? (
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <div style={{ color: '#9ca3af', marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>Antes: </span>{change.old_value}
              </div>
              <div style={{ color: '#111827', fontWeight: 600 }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Ahora: </span>{change.new_value}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
              {displayTitle}
            </div>
          )}

          {/* URL */}
          {url && (
            <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
              {url}
            </div>
          )}

          {/* Published date (for link_added changes) */}
          {change.change_type === 'link_added' && change.published_at && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Publicado: {formatDate(change.published_at)}
            </div>
          )}
        </div>

        {/* Action */}
        {change.article_id && change.change_type !== 'link_removed' && (
          <button
            onClick={() => onArticleClick(change.article_id)}
            style={{ ...btnSmall, flexShrink: 0 }}
          >
            Ver →
          </button>
        )}
      </div>
    </div>
  );
}

function SourceModal({ source, onSave, onClose }) {
  const isEdit = !!source?.id;
  const [form, setForm] = useState({
    name: source?.name || '',
    url: source?.url || '',
    type: source?.type || 'topic_hub',
    refresh_interval_seconds: source?.refresh_interval_seconds || 300,
    active: source?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim() || !form.url.trim()) { setError('Nombre y URL son obligatorios'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await apiJson(`/coverage/sources/${source.id}`, { method: 'PATCH', body: form, auth: true });
      } else {
        await apiJson('/coverage/sources', { method: 'POST', body: form, auth: true });
      }
      onSave();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>
        <h3 style={{ margin: '0 0 20px', fontWeight: 700, fontSize: '1.2rem' }}>
          {isEdit ? 'Editar seguimiento' : 'Nuevo seguimiento'}
        </h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={labelStyle}>Nombre descriptivo</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Boca Juniors TyC" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={labelStyle}>URL a monitorear</span>
            <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.tycsports.com/boca-juniors.html" style={inputStyle} />
            <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
              Requiere HTML renderizado en servidor (TyC, Infobae, Olé, La Nación). Las páginas con renderizado 100% JavaScript (Instagram, TikTok, X) no son compatibles.
            </span>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={labelStyle}>Tipo</span>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
              {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Frecuencia</span>
              <select value={form.refresh_interval_seconds} onChange={e => set('refresh_interval_seconds', parseInt(e.target.value))} style={inputStyle}>
                <option value={60}>Cada 1 min</option>
                <option value={300}>Cada 5 min</option>
                <option value={600}>Cada 10 min</option>
                <option value={1800}>Cada 30 min</option>
                <option value={3600}>Cada 1 hora</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Estado</span>
              <select value={form.active ? 'true' : 'false'} onChange={e => set('active', e.target.value === 'true')} style={inputStyle}>
                <option value="true">Activo</option>
                <option value="false">Pausado</option>
              </select>
            </label>
          </div>
        </div>
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear seguimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoverageFeed() {
  const navigate = useNavigate();

  // Stats
  const [stats, setStats] = useState(null);

  // Sources
  const [sources, setSources] = useState([]);

  // Feed
  const [feed, setFeed]           = useState([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedLoading, setFeedLoading] = useState(false);
  const [hasMore, setHasMore]     = useState(false);

  // Filters
  const [changeFilter, setChangeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const searchTimer = useRef(null);

  // Modal
  const [modal, setModal] = useState(null);

  const LIMIT = 50;

  async function loadStats() {
    try {
      const s = await apiJson('/coverage/stats', { auth: true });
      setStats(s);
    } catch {}
  }

  async function loadSources() {
    try {
      const data = await apiJson('/coverage/sources', { auth: true });
      setSources(data.items || []);
    } catch {}
  }

  const loadFeed = useCallback(async (reset = false) => {
    setFeedLoading(true);
    const offset = reset ? 0 : feedOffset;
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset });
      if (changeFilter) params.set('change_type', changeFilter);
      if (sourceFilter) params.set('source_id', sourceFilter);
      if (search)       params.set('q', search);

      const data = await apiJson(`/coverage/feed?${params}`, { auth: true });
      const items = data.items || [];
      if (reset) {
        setFeed(items);
        setFeedOffset(LIMIT);
      } else {
        setFeed(prev => [...prev, ...items]);
        setFeedOffset(offset + LIMIT);
      }
      setFeedTotal(data.total || 0);
      setHasMore(items.length === LIMIT);
    } catch {}
    finally { setFeedLoading(false); }
  }, [changeFilter, sourceFilter, search, feedOffset]);

  useEffect(() => {
    loadStats();
    loadSources();
  }, []);

  useEffect(() => {
    loadFeed(true);
  }, [changeFilter, sourceFilter, search]);

  function handleSearchInput(val) {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 400);
  }

  // Group feed by date
  const grouped = [];
  let lastDate = null;
  for (const item of feed) {
    const dateKey = new Date(item.detected_at).toDateString();
    if (dateKey !== lastDate) {
      grouped.push({ type: 'date', label: formatDateGroup(item.detected_at) });
      lastDate = dateKey;
    }
    grouped.push({ type: 'change', data: item });
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.8rem', color: '#111827' }}>Coverage</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Seguimiento cronológico de páginas temáticas</p>
        </div>
        <button onClick={() => setModal('new')} style={{ ...btnPrimary, padding: '10px 20px' }}>
          + Agregar URL
        </button>
      </div>

      {/* Global stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Fuentes activas', value: stats.active_sources, sub: `de ${stats.total_sources} total` },
            { label: 'Cambios hoy', value: stats.changes_24h, sub: `${stats.added_24h} nuevas · ${stats.title_changed_24h} títulos · ${stats.removed_24h} removidas` },
            { label: 'Total ítems', value: stats.total_items, sub: `${stats.active_items} activos` },
            { label: 'Total cambios', value: stats.total_changes, sub: timeAgo(stats.last_change_at) + ' último' },
          ].map(c => (
            <div key={c.label} style={cardStyle}>
              <div style={cardLabel}>{c.label}</div>
              <div style={cardValue}>{c.value ?? '—'}</div>
              <div style={cardSub}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sources compact list */}
      {sources.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Fuentes en seguimiento
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sources.map(s => (
              <button
                key={s.id}
                onClick={() => navigate(`/coverage/${s.id}`)}
                style={{
                  padding: '6px 14px', borderRadius: 99, border: '1px solid #e5e7eb',
                  background: sourceFilter === s.id ? '#111827' : '#fff',
                  color: sourceFilter === s.id ? '#fff' : '#374151',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.active ? '#10b981' : '#d1d5db', display: 'inline-block' }} />
                {s.name}
                {s.last_change_at && (
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
                    {timeAgo(s.last_change_at)}
                  </span>
                )}
                {s.changes_24h > 0 && (
                  <span style={{ background: '#4f46e5', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '1px 6px' }}>
                    {s.changes_24h}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feed filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <input
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          placeholder="Buscar en el feed..."
          style={{ ...inputStyle, width: 240, padding: '8px 12px', fontSize: 13 }}
        />

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={e => { setSourceFilter(e.target.value); setFeedOffset(0); }}
          style={{ ...inputStyle, width: 200, padding: '8px 12px', fontSize: 13 }}
        >
          <option value="">Todas las fuentes</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Change type pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {CHANGE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setChangeFilter(f.value); setFeedOffset(0); }}
              style={{
                padding: '7px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: changeFilter === f.value ? '#111827' : '#f3f4f6',
                color: changeFilter === f.value ? '#fff' : '#374151',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '0 20px' }}>
        {feed.length === 0 && !feedLoading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>
            {sources.length === 0
              ? 'Agregá una URL para empezar el seguimiento.'
              : 'Sin cambios detectados con los filtros actuales.'}
          </div>
        ) : (
          grouped.map((row, i) =>
            row.type === 'date'
              ? <div key={`d-${i}`} style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', letterSpacing: '0.08em', padding: '20px 0 8px' }}>{row.label}</div>
              : <ChangeCard key={row.data.id} change={row.data} onArticleClick={id => navigate(`/coverage/article/${id}`)} />
          )
        )}

        {feedLoading && (
          <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 14 }}>Cargando…</div>
        )}

        {hasMore && !feedLoading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <button onClick={() => loadFeed(false)} style={{ ...btnSecondary, fontSize: 13 }}>
              Cargar más ({feedTotal - feed.length} restantes)
            </button>
          </div>
        )}
      </div>

      {modal && (
        <SourceModal
          source={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); loadStats(); loadSources(); loadFeed(true); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const inputStyle   = { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const labelStyle   = { fontSize: 12, fontWeight: 600, color: '#4b5563' };
const btnPrimary   = { padding: '10px 20px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSecondary = { padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSmall     = { padding: '5px 12px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const cardStyle    = { background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' };
const cardLabel    = { fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
const cardValue    = { fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 3 };
const cardSub      = { fontSize: 11, color: '#6b7280' };
