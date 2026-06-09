import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const ENTITY_TYPES = [
  { value: '',             label: 'Todos' },
  { value: 'person',       label: 'Personas' },
  { value: 'company',      label: 'Empresas' },
  { value: 'product',      label: 'Productos' },
  { value: 'organization', label: 'Organizaciones' },
  { value: 'location',     label: 'Lugares' },
];

const TYPE_STYLE = {
  person:       { color: '#7c3aed', bg: '#ede9fe', emoji: '👤' },
  company:      { color: '#1d4ed8', bg: '#dbeafe', emoji: '🏢' },
  product:      { color: '#065f46', bg: '#d1fae5', emoji: '📦' },
  organization: { color: '#92400e', bg: '#fef3c7', emoji: '🏛️' },
  location:     { color: '#be123c', bg: '#ffe4e6', emoji: '📍' },
};

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadEntities();
  }, [type, search]);

  async function loadStats() {
    try {
      const s = await apiJson('/knowledge/stats', { auth: true });
      setStats(s);
    } catch {}
  }

  async function loadEntities() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 60 });
      if (type) params.set('type', type);
      if (search) params.set('search', search);
      const d = await apiJson(`/knowledge/entities?${params}`, { auth: true });
      setEntities(d.items || []);
      setTotal(d.total || 0);
    } catch {}
    finally { setLoading(false); }
  }

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>🧠 Knowledge Base</h1>
            <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
              Entidades extraídas automáticamente de las investigaciones.
            </p>
          </div>
          {stats && (
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Entidades', value: stats.entities, color: '#6366f1' },
                { label: 'Eventos',   value: stats.events,   color: '#10b981' },
                { label: 'Menciones', value: stats.mentions, color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '10px 18px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Type filter tabs */}
        <div style={{ display: 'flex', gap: 6, background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
          {ENTITY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: type === t.value ? 'white' : 'transparent',
                color: type === t.value ? '#111827' : '#6b7280',
                boxShadow: type === t.value ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar entidad…"
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 200 }}
          />
          <button
            type="submit"
            style={{ padding: '7px 14px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
          >
            Buscar
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              style={{ padding: '7px 10px', borderRadius: 8, background: 'white', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 13, color: '#6b7280' }}
            >
              ✕
            </button>
          )}
        </form>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 14 }}>
        {loading ? 'Cargando…' : `${total} ${total === 1 ? 'entidad' : 'entidades'}${type ? ` de tipo "${ENTITY_TYPES.find(t => t.value === type)?.label}"` : ''}${search ? ` que contienen "${search}"` : ''}`}
      </div>

      {/* Entity grid */}
      {!loading && entities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No hay entidades todavía</div>
          <div style={{ fontSize: 14 }}>Realiza una investigación para que el sistema empiece a construir conocimiento.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {entities.map(e => {
          const ts = TYPE_STYLE[e.entity_type] || { color: '#374151', bg: '#f3f4f6', emoji: '🔹' };
          return (
            <div
              key={e.id}
              onClick={() => navigate(`/knowledge/entities/${e.id}`)}
              style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 18px',
                cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s',
              }}
              onMouseEnter={ev => { ev.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; ev.currentTarget.style.borderColor = '#d1d5db'; }}
              onMouseLeave={ev => { ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = '#e5e7eb'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 3 }}>{e.name}</div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, color: ts.color, background: ts.bg,
                    padding: '2px 8px', borderRadius: 20,
                  }}>
                    {ts.emoji} {e.entity_type}
                  </span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>{e.mention_count}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>menciones</div>
                </div>
              </div>
              {e.description && (
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {e.description}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
                <span>Última aparición: {new Date(e.last_seen_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
