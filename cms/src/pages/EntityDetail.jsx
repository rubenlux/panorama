import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const TYPE_STYLE = {
  person:       { color: '#7c3aed', bg: '#ede9fe', emoji: '👤' },
  company:      { color: '#1d4ed8', bg: '#dbeafe', emoji: '🏢' },
  product:      { color: '#065f46', bg: '#d1fae5', emoji: '📦' },
  organization: { color: '#92400e', bg: '#fef3c7', emoji: '🏛️' },
  location:     { color: '#be123c', bg: '#ffe4e6', emoji: '📍' },
};

const EVENT_TYPE_COLOR = {
  announcement: '#6366f1',
  launch:       '#10b981',
  controversy:  '#ef4444',
  funding:      '#f59e0b',
  political:    '#0ea5e9',
  merger:       '#8b5cf6',
  other:        '#6b7280',
  news:         '#374151',
};

export default function EntityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const d = await apiJson(`/knowledge/entities/${id}`, { auth: true });
      setData(d);
    } catch {}
    finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center', color: '#9ca3af' }}>
        Cargando…
      </div>
    );
  }

  if (!data?.entity) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <div style={{ fontWeight: 600, color: '#374151' }}>Entidad no encontrada</div>
        <button onClick={() => navigate('/knowledge')} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          Volver a Knowledge Base
        </button>
      </div>
    );
  }

  const { entity, topics, events } = data;
  const ts = TYPE_STYLE[entity.entity_type] || { color: '#374151', bg: '#f3f4f6', emoji: '🔹' };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Back */}
      <button
        onClick={() => navigate('/knowledge')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← Knowledge Base
      </button>

      {/* Entity header */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 28 }}>{ts.emoji}</span>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{entity.name}</h1>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600, color: ts.color, background: ts.bg,
              padding: '3px 10px', borderRadius: 20, marginBottom: 12,
            }}>
              {entity.entity_type}
            </span>
            {entity.description && (
              <p style={{ margin: 0, color: '#4b5563', fontSize: 15, lineHeight: 1.6 }}>{entity.description}</p>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {[
              { label: 'Investigaciones', value: topics.length,        color: '#6366f1' },
              { label: 'Eventos',         value: events.length,        color: '#10b981' },
              { label: 'Menciones',       value: entity.mention_count, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div style={{ marginTop: 16, display: 'flex', gap: 20, fontSize: 12, color: '#9ca3af' }}>
          <span>Primera aparición: {new Date(entity.first_seen_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          <span>Última aparición: {new Date(entity.last_seen_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: events.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Events timeline */}
        {events.length > 0 && (
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              🗓️ Eventos ({events.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map(ev => (
                <div key={ev.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{ev.title}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: EVENT_TYPE_COLOR[ev.event_type] || '#6b7280',
                      background: '#f3f4f6', padding: '2px 7px', borderRadius: 10, flexShrink: 0, textTransform: 'uppercase'
                    }}>
                      {ev.event_type}
                    </span>
                  </div>
                  {ev.summary && (
                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{ev.summary}</div>
                  )}
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                    {ev.event_date && <span>📅 {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    {ev.topic_title && (
                      <span
                        onClick={() => navigate('/research')}
                        style={{ cursor: 'pointer', color: '#6366f1', textDecoration: 'underline' }}
                        title={ev.topic_title}
                      >
                        {ev.topic_title.length > 30 ? ev.topic_title.slice(0, 30) + '…' : ev.topic_title}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        <div>
          <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            🔬 Investigaciones ({topics.length})
          </h2>
          {topics.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 16 }}>
              Ninguna investigación vinculada aún.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topics.map(t => (
              <div
                key={t.id}
                onClick={() => navigate('/research')}
                style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'border-color .15s' }}
                onMouseEnter={ev => ev.currentTarget.style.borderColor = '#6366f1'}
                onMouseLeave={ev => ev.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 4 }}>{t.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                  <span style={{
                    color: t.status === 'completed' ? '#10b981' : t.status === 'failed' ? '#ef4444' : '#f59e0b',
                    fontWeight: 600
                  }}>
                    {t.status}
                  </span>
                  <span>{new Date(t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
