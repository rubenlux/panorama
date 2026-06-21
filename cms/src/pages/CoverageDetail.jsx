import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const CHANGE_META = {
  link_added:    { label: 'NUEVA URL',             bg: '#d1fae5', color: '#065f46', symbol: '+' },
  link_removed:  { label: 'REMOVIDA DEL LISTADO',  bg: '#f3f4f6', color: '#374151', symbol: '–' },
  title_changed: { label: 'TÍTULO MODIFICADO',     bg: '#dbeafe', color: '#1e40af', symbol: '~' },
};

const CHANGE_FILTERS = [
  { value: '',              label: 'Todos' },
  { value: 'link_added',   label: '+ Nuevas' },
  { value: 'title_changed',label: '~ Títulos' },
  { value: 'link_removed', label: '– Removidas' },
];

const TABS = ['Timeline', 'Artículos'];

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return `hace ${secs}s`;
  if (secs < 3600)  return `hace ${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
  return `hace ${Math.floor(secs / 86400)}d`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CoverageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [source, setSource]         = useState(null);
  const [loading, setLoading]       = useState(true);

  // Timeline state
  const [changes, setChanges]       = useState([]);
  const [changesTotal, setChangesTotal] = useState(0);
  const [changesOffset, setChangesOffset] = useState(0);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesHasMore, setChangesHasMore] = useState(false);
  const [changeFilter, setChangeFilter]     = useState('');

  // Articles state
  const [articles, setArticles]     = useState([]);
  const [articlesTotal, setArticlesTotal] = useState(0);
  const [articlesOffset, setArticlesOffset] = useState(0);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesHasMore, setArticlesHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');

  // Edit modal
  const [editModal, setEditModal]   = useState(false);
  const [editForm, setEditForm]     = useState({});
  const [saving, setSaving]         = useState(false);

  // Check now
  const [checking, setChecking]     = useState(false);
  const [checkMsg, setCheckMsg]     = useState('');

  const [tab, setTab] = useState('Timeline');

  const LIMIT = 50;

  async function loadSource() {
    try {
      const data = await apiJson(`/coverage/sources/${id}`, { auth: true });
      setSource(data);
      setEditForm({
        name: data.name, url: data.url, type: data.type,
        refresh_interval_seconds: data.refresh_interval_seconds,
        active: data.active,
      });
    } catch { navigate('/coverage'); }
    finally { setLoading(false); }
  }

  const loadChanges = useCallback(async (reset = false) => {
    setChangesLoading(true);
    const offset = reset ? 0 : changesOffset;
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset });
      if (changeFilter) params.set('change_type', changeFilter);
      const data = await apiJson(`/coverage/sources/${id}/timeline?${params}`, { auth: true });
      const items = data.items || [];
      if (reset) { setChanges(items); setChangesOffset(LIMIT); }
      else { setChanges(prev => [...prev, ...items]); setChangesOffset(offset + LIMIT); }
      setChangesTotal(data.total || 0);
      setChangesHasMore(items.length === LIMIT);
    } catch {}
    finally { setChangesLoading(false); }
  }, [id, changeFilter, changesOffset]);

  const loadArticles = useCallback(async (reset = false) => {
    setArticlesLoading(true);
    const offset = reset ? 0 : articlesOffset;
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset });
      if (activeFilter) params.set('active', activeFilter);
      const data = await apiJson(`/coverage/sources/${id}/articles?${params}`, { auth: true });
      const items = data.items || [];
      if (reset) { setArticles(items); setArticlesOffset(LIMIT); }
      else { setArticles(prev => [...prev, ...items]); setArticlesOffset(offset + LIMIT); }
      setArticlesTotal(data.total || 0);
      setArticlesHasMore(items.length === LIMIT);
    } catch {}
    finally { setArticlesLoading(false); }
  }, [id, activeFilter, articlesOffset]);

  useEffect(() => { loadSource(); }, [id]);
  useEffect(() => { if (tab === 'Timeline') loadChanges(true); }, [changeFilter, tab]);
  useEffect(() => { if (tab === 'Artículos') loadArticles(true); }, [activeFilter, tab]);

  async function handleCheckNow() {
    setChecking(true); setCheckMsg('');
    try {
      await apiJson(`/coverage/sources/${id}/check`, { method: 'POST', auth: true });
      setCheckMsg('Chequeo iniciado — los cambios aparecerán en unos segundos.');
      setTimeout(() => { loadSource(); loadChanges(true); setCheckMsg(''); }, 5000);
    } catch (e) { setCheckMsg(e.message); }
    finally { setChecking(false); }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await apiJson(`/coverage/sources/${id}`, { method: 'PATCH', body: editForm, auth: true });
      setEditModal(false);
      loadSource();
    } catch {}
    finally { setSaving(false); }
  }

  async function handleTogglePause() {
    if (!source) return;
    await apiJson(`/coverage/sources/${id}`, { method: 'PATCH', body: { active: !source.active }, auth: true });
    loadSource();
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${source?.name}"? Se eliminará el historial completo.`)) return;
    await apiJson(`/coverage/sources/${id}`, { method: 'DELETE', auth: true });
    navigate('/coverage');
  }

  // Group timeline by date
  const groupedChanges = [];
  let lastDate = null;
  for (const item of changes) {
    const dateKey = new Date(item.detected_at).toDateString();
    if (dateKey !== lastDate) {
      groupedChanges.push({ type: 'date', label: formatDateGroup(item.detected_at) });
      lastDate = dateKey;
    }
    groupedChanges.push({ type: 'change', data: item });
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Cargando…</div>;
  }
  if (!source) return null;

  const intervalLabel = source.refresh_interval_seconds >= 3600
    ? `${source.refresh_interval_seconds / 3600}h`
    : `${source.refresh_interval_seconds / 60}min`;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <button onClick={() => navigate('/coverage')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13, marginBottom: 20 }}>
        ← Coverage
      </button>

      {/* Source header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 4px', fontWeight: 800, fontSize: '1.6rem', color: '#111827' }}>
              {source.name}
            </h1>
            <a href={source.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: '#6b7280', wordBreak: 'break-all' }}>
              {source.url} ↗
            </a>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: source.active ? '#065f46' : '#9ca3af' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: source.active ? '#10b981' : '#d1d5db', display: 'inline-block' }} />
                {source.active ? 'Activo' : 'Pausado'}
              </span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {source.type.replace('_', ' ')}
              </span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>cada {intervalLabel}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>último chequeo: {timeAgo(source.last_checked)}</span>
              {source.last_change_at && (
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                  último cambio: {timeAgo(source.last_change_at)}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setEditModal(true)} style={btnSecondary}>Editar</button>
            <button onClick={handleTogglePause} style={btnSecondary}>
              {source.active ? 'Pausar' : 'Reanudar'}
            </button>
            <button onClick={handleCheckNow} disabled={checking || !source.active} style={btnIndigo}>
              {checking ? 'Chequeando…' : 'Chequear ahora'}
            </button>
          </div>
        </div>

        {checkMsg && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d' }}>
            {checkMsg}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Ítems detectados', value: source.item_count ?? 0, sub: `${source.active_item_count ?? 0} activos` },
          { label: 'Total cambios', value: source.change_count ?? 0, sub: `${source.changes_24h ?? 0} hoy` },
          { label: 'Nuevas URLs', value: source.total_added ?? 0, sub: `${source.added_24h ?? 0} hoy` },
          { label: 'Títulos', value: source.total_title_changed ?? 0, sub: `${source.title_changed_24h ?? 0} hoy` },
          { label: 'Removidas', value: source.total_removed ?? 0, sub: `${source.removed_24h ?? 0} hoy` },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700,
            color: tab === t ? '#4f46e5' : '#6b7280',
            borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Timeline tab */}
      {tab === 'Timeline' && (
        <>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {CHANGE_FILTERS.map(f => (
              <button key={f.value} onClick={() => setChangeFilter(f.value)} style={{
                padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: changeFilter === f.value ? '#111827' : '#f3f4f6',
                color: changeFilter === f.value ? '#fff' : '#374151',
              }}>
                {f.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af', alignSelf: 'center' }}>
              {changesTotal} cambios
            </span>
          </div>

          {/* Timeline */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '0 20px' }}>
            {changes.length === 0 && !changesLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                Sin cambios detectados. Hacé clic en "Chequear ahora" para iniciar.
              </div>
            ) : (
              groupedChanges.map((row, i) => {
                if (row.type === 'date') {
                  return <div key={`d-${i}`} style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', letterSpacing: '0.08em', padding: '20px 0 8px' }}>{row.label}</div>;
                }
                const ch = row.data;
                const meta = CHANGE_META[ch.change_type] || CHANGE_META.link_added;
                const displayTitle = ch.new_value || ch.old_value || ch.article_title || '—';

                return (
                  <div key={ch.id} style={{ padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 44, color: '#9ca3af', fontSize: 13, fontWeight: 600, paddingTop: 2 }}>
                        {formatTime(ch.detected_at)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                          background: meta.bg, color: meta.color, marginBottom: 6, letterSpacing: '0.04em',
                        }}>
                          {meta.symbol} {meta.label}
                        </span>

                        {ch.change_type === 'title_changed' ? (
                          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                            <div style={{ color: '#9ca3af' }}><b>Antes: </b>{ch.old_value}</div>
                            <div style={{ color: '#111827', fontWeight: 600 }}><b style={{ color: '#374151' }}>Ahora: </b>{ch.new_value}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 3 }}>
                            {displayTitle}
                          </div>
                        )}

                        {ch.article_url && (
                          <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.article_url}
                          </div>
                        )}
                      </div>

                      {ch.article_id && ch.change_type !== 'link_removed' && (
                        <button
                          onClick={() => navigate(`/coverage/article/${ch.article_id}`)}
                          style={{ ...btnSmall, flexShrink: 0 }}
                        >
                          Ver →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {changesLoading && <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Cargando…</div>}

            {changesHasMore && !changesLoading && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <button onClick={() => loadChanges(false)} style={{ ...btnSecondary, fontSize: 13 }}>
                  Cargar más ({changesTotal - changes.length} restantes)
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Articles tab */}
      {tab === 'Artículos' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
            {[['', 'Todos'], ['true', 'Activos'], ['false', 'Removidos']].map(([val, label]) => (
              <button key={val} onClick={() => setActiveFilter(val)} style={{
                padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: activeFilter === val ? '#111827' : '#f3f4f6',
                color: activeFilter === val ? '#fff' : '#374151',
              }}>
                {label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af' }}>{articlesTotal} ítems</span>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {articles.length === 0 && !articlesLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Sin ítems detectados aún.</div>
            ) : (
              articles.map(a => (
                <div key={a.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 3 }}>
                      {a.title || '(sin título)'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.url}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                    <div>{formatDate(a.first_detected_at)}</div>
                    <div style={{ marginTop: 2 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: a.is_active ? '#d1fae5' : '#f3f4f6',
                        color: a.is_active ? '#065f46' : '#6b7280',
                      }}>
                        {a.is_active ? 'activo' : 'removido'}
                      </span>
                      {a.has_content && (
                        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#ede9fe', color: '#5b21b6' }}>
                          contenido
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => navigate(`/coverage/article/${a.id}`)} style={btnSmall}>
                    Ver →
                  </button>
                </div>
              ))
            )}

            {articlesLoading && <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Cargando…</div>}
            {articlesHasMore && !articlesLoading && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <button onClick={() => loadArticles(false)} style={{ ...btnSecondary, fontSize: 13 }}>
                  Cargar más
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 700 }}>Editar seguimiento</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              {[['Nombre', 'name', 'text'], ['URL', 'url', 'url']].map(([label, key, type]) => (
                <label key={key} style={{ display: 'grid', gap: 4 }}>
                  <span style={labelSt}>{label}</span>
                  <input type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inputSt} />
                </label>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={labelSt}>Frecuencia</span>
                  <select value={editForm.refresh_interval_seconds || 300} onChange={e => setEditForm(f => ({ ...f, refresh_interval_seconds: parseInt(e.target.value) }))} style={inputSt}>
                    <option value={60}>1 min</option>
                    <option value={300}>5 min</option>
                    <option value={600}>10 min</option>
                    <option value={1800}>30 min</option>
                    <option value={3600}>1 hora</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={labelSt}>Estado</span>
                  <select value={editForm.active ? 'true' : 'false'} onChange={e => setEditForm(f => ({ ...f, active: e.target.value === 'true' }))} style={inputSt}>
                    <option value="true">Activo</option>
                    <option value="false">Pausado</option>
                  </select>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'space-between' }}>
              <button onClick={handleDelete} style={{ padding: '8px 16px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Eliminar
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditModal(false)} style={btnSecondary} disabled={saving}>Cancelar</button>
                <button onClick={handleSaveEdit} style={btnIndigo} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputSt    = { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const labelSt    = { fontSize: 12, fontWeight: 600, color: '#4b5563' };
const btnSecondary = { padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnIndigo    = { padding: '8px 16px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSmall     = { padding: '5px 12px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
