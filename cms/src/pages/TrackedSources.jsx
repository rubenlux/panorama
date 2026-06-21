import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const SOURCE_TYPES = [
  { value: 'topic_hub', label: 'Topic Hub', description: 'Página centrada en un tema específico (ej: Boca Juniors)' },
  { value: 'section_page', label: 'Sección', description: 'Sección de un diario (ej: Política, Economía)' },
  { value: 'live_event', label: 'Evento en Vivo', description: 'Monitoreo intensivo de un evento temporal' },
  { value: 'custom', label: 'Personalizado', description: 'Cualquier otra URL de interés' },
];

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
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
    if (!form.name.trim() || !form.url.trim()) {
      setError('Nombre y URL son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiJson(`/coverage/sources/${source.id}`, { method: 'PATCH', body: form, auth: true });
      } else {
        await apiJson('/coverage/sources', { method: 'POST', body: form, auth: true });
      }
      onSave();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 20px', fontWeight: 700, fontSize: '1.25rem' }}>
          {isEdit ? 'Editar fuente de seguimiento' : 'Nueva fuente de seguimiento'}
        </h3>

        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Nombre descriptivo</span>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ej: Boca Juniors TyC" style={inputStyle} />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>URL a monitorear</span>
            <input value={form.url} onChange={e => set('url', e.target.value)}
              placeholder="https://www.tycsports.com/boca-juniors.html" style={inputStyle} />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Tipo de contenido</span>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
              {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {SOURCE_TYPES.find(t => t.value === form.type)?.description}
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Intervalo de actualización</span>
              <select value={form.refresh_interval_seconds} onChange={e => set('refresh_interval_seconds', parseInt(e.target.value))} style={inputStyle}>
                <option value={60}>Cada 1 minuto</option>
                <option value={300}>Cada 5 minutos</option>
                <option value={600}>Cada 10 minutos</option>
                <option value={1800}>Cada 30 minutos</option>
                <option value={3600}>Cada 1 hora</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Estado</span>
              <select value={form.active ? 'true' : 'false'} onChange={e => set('active', e.target.value === 'true')} style={inputStyle}>
                <option value="true">Activo</option>
                <option value="false">Pausado</option>
              </select>
            </label>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Comenzar seguimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrackedSources() {
  const navigate = useNavigate();
  const [sources, setSources]   = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [srcRes, statRes] = await Promise.all([
        apiJson('/coverage/sources', { auth: true }),
        apiJson('/coverage/stats', { auth: true }),
      ]);
      setSources(srcRes.items || []);
      setStats(statRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta fuente? Los artículos ya descubiertos se mantendrán.')) return;
    setDeleting(id);
    try {
      await apiJson(`/coverage/sources/${id}`, { method: 'DELETE', auth: true });
      load();
    } catch (e) { alert(e.message); } finally { setDeleting(null); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button onClick={() => navigate('/monitor')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13 }}>← Monitor</button>
        <div>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.8rem', color: '#111827' }}>Tracked Sources</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Monitoreo manual de URLs temáticas y hubs de noticias.
          </p>
        </div>
        <button onClick={() => setModal('new')} style={{ ...btnPrimary, marginLeft: 'auto', padding: '10px 20px' }}>
          + Agregar URL
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>
          <div style={cardStyle}>
            <div style={cardLabel}>Fuentes Monitoreadas</div>
            <div style={cardValue}>{stats.total_sources}</div>
            <div style={cardSub}>{stats.active_sources} activas</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabel}>Chequeos (24h)</div>
            <div style={cardValue}>{stats.snapshots_24h}</div>
            <div style={cardSub}>Detección de cambios</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabel}>Última Actividad</div>
            <div style={cardValue}>{timeAgo(stats.last_snapshot_at)}</div>
            <div style={cardSub}>Global</div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 100, color: '#9ca3af' }}>Cargando fuentes...</div>
      ) : sources.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, background: '#f9fafb', borderRadius: 16, border: '2px dashed #e5e7eb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>No hay URLs en seguimiento</h3>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>Agregá una URL para detectar nuevos artículos automáticamente.</p>
          <button onClick={() => setModal('new')} style={btnPrimary}>Agregar primera fuente</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Fuente / URL</th>
                <th style={th}>Tipo</th>
                <th style={th}>Intervalo</th>
                <th style={th}>Último Chequeo</th>
                <th style={th}>Snapshots</th>
                <th style={th}>Estado</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.url}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#f3f4f6', color: '#4b5563', textTransform: 'uppercase' }}>
                      {s.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={td}>
                    {s.refresh_interval_seconds / 60}m
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>
                    {timeAgo(s.last_checked)}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {s.snapshot_count}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.active ? '#10b981' : '#d1d5db' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: s.active ? '#065f46' : '#6b7280' }}>
                        {s.active ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setModal(s)} style={{ ...btnSmall, background: '#f3f4f6', color: '#111827', marginRight: 8 }}>Editar</button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} style={{ ...btnSmall, background: '#fee2e2', color: '#dc2626' }}>
                      {deleting === s.id ? '...' : 'Eliminar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <SourceModal
          source={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const inputStyle = { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none' };
const btnPrimary   = { padding: '10px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'background 0.2s' };
const btnSecondary = { padding: '10px 20px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSmall     = { padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const th = { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.025em' };
const td = { padding: '16px 16px', verticalAlign: 'middle' };
const cardStyle = { background: '#fff', padding: '20px', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };
const cardLabel = { fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' };
const cardValue = { fontSize: '1.75rem', fontWeight: 800, color: '#111827', marginBottom: 4 };
const cardSub   = { fontSize: 12, color: '#10b981', fontWeight: 600 };
