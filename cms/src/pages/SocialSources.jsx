import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const PLATFORM_META = {
  youtube:   { label: 'YouTube',   color: '#dc2626', bg: '#fee2e2', active: true,  placeholder: 'https://www.youtube.com/@CanalNoticias' },
  instagram: { label: 'Instagram', color: '#7c3aed', bg: '#ede9fe', active: false, placeholder: 'https://www.instagram.com/medionoticia' },
  facebook:  { label: 'Facebook',  color: '#1d4ed8', bg: '#dbeafe', active: false, placeholder: 'https://www.facebook.com/medionoticia' },
  x:         { label: 'X',         color: '#111827', bg: '#f3f4f6', active: false, placeholder: 'https://twitter.com/medionoticia' },
  tiktok:    { label: 'TikTok',    color: '#be123c', bg: '#ffe4e6', active: false, placeholder: 'https://www.tiktok.com/@medionoticia' },
};

const REGION_OPTIONS = ['nacional', 'internacional', 'formosa', 'nea', 'noa', 'cuyo', 'patagonia', 'bsas'];
const CATEGORY_OPTIONS = ['medio', 'diario', 'tv', 'radio', 'agencia', 'revista', 'blog', 'gubernamental'];

function PlatformBadge({ platform, size = 'sm' }) {
  const m = PLATFORM_META[platform] || { label: platform, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      fontSize: size === 'sm' ? 10 : 12, fontWeight: 700, padding: size === 'sm' ? '2px 6px' : '3px 8px',
      background: m.bg, color: m.color, borderRadius: 4, whiteSpace: 'nowrap',
    }}>
      {m.label}
      {!m.active && <span style={{ marginLeft: 4, opacity: 0.7 }}>⏳</span>}
    </span>
  );
}

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
    name:        source?.name        || '',
    platform:    source?.platform    || 'youtube',
    profile_url: source?.profile_url || '',
    handle:      source?.handle      || '',
    priority:    source?.priority    ?? 5,
    region:      source?.region      || 'nacional',
    category:    source?.category    || 'medio',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim() || !form.profile_url.trim()) {
      setError('Nombre y URL son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiJson(`/social/sources/${source.id}`, { method: 'PUT', body: form, auth: true });
      } else {
        await apiJson('/social/sources', { method: 'POST', body: form, auth: true });
      }
      onSave();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const platformMeta = PLATFORM_META[form.platform];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>
        <h3 style={{ margin: '0 0 20px', fontWeight: 700 }}>{isEdit ? 'Editar fuente' : 'Nueva fuente social'}</h3>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nombre</span>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Infobae YouTube" style={inputStyle} />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Plataforma</span>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={inputStyle}>
              {Object.entries(PLATFORM_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}{!v.active ? ' (próximamente)' : ''}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>URL del perfil</span>
            <input value={form.profile_url} onChange={e => set('profile_url', e.target.value)}
              placeholder={platformMeta?.placeholder || 'URL del perfil'} style={inputStyle} />
            {!platformMeta?.active && (
              <span style={{ fontSize: 11, color: '#f59e0b' }}>
                ⚠️ {platformMeta?.label} no está activo aún — podés agregar la fuente para cuando se active.
              </span>
            )}
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Handle (opcional)</span>
            <input value={form.handle} onChange={e => set('handle', e.target.value)}
              placeholder="@NombreDelCanal" style={inputStyle} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Región</span>
              <select value={form.region} onChange={e => set('region', e.target.value)} style={inputStyle}>
                {REGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Categoría</span>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Prioridad</span>
              <input type="number" min={1} max={10} value={form.priority}
                onChange={e => set('priority', parseInt(e.target.value))} style={inputStyle} />
            </label>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar fuente'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SocialSources() {
  const navigate    = useNavigate();
  const [sources, setSources]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);   // null | 'new' | source object
  const [checking, setChecking] = useState(null);   // source id being checked
  const [deleting, setDeleting] = useState(null);

  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterRegion,   setFilterRegion]   = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson('/social/sources', { auth: true });
      setSources(data.items || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id) {
    try {
      const r = await apiJson(`/social/sources/${id}/toggle`, { method: 'PATCH', auth: true });
      setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: r.enabled } : s));
    } catch (e) { alert(e.message); }
  }

  async function handleCheck(source) {
    setChecking(source.id);
    try {
      const r = await apiJson(`/social/sources/${source.id}/check`, { method: 'POST', auth: true });
      alert(`✓ ${r.fetched} posts encontrados, ${r.new_posts} nuevos`);
      load();
    } catch (e) { alert(e.message); } finally { setChecking(null); }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta fuente y todos sus posts?')) return;
    setDeleting(id);
    try {
      await apiJson(`/social/sources/${id}`, { method: 'DELETE', auth: true });
      setSources(prev => prev.filter(s => s.id !== id));
    } catch (e) { alert(e.message); } finally { setDeleting(null); }
  }

  const filtered = sources.filter(s =>
    (!filterPlatform || s.platform === filterPlatform) &&
    (!filterRegion   || s.region   === filterRegion)
  );

  const enabledCount  = sources.filter(s => s.enabled).length;
  const ytCount       = sources.filter(s => s.platform === 'youtube').length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/social')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13 }}>← Social Intelligence</button>
        <div>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.6rem' }}>Fuentes Sociales</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            {enabledCount} activas · {sources.length} total · {ytCount} YouTube
          </p>
        </div>
        <button onClick={() => setModal('new')} style={{ ...btnPrimary, marginLeft: 'auto' }}>+ Agregar fuente</button>
      </div>

      {/* Active platforms legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {Object.entries(PLATFORM_META).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            padding: '4px 10px', borderRadius: 6,
            background: v.active ? v.bg : '#f9fafb',
            color: v.active ? v.color : '#9ca3af',
            border: `1px solid ${v.active ? v.color + '40' : '#e5e7eb'}`,
          }}>
            {v.label}
            <span style={{ fontSize: 10, fontWeight: 600 }}>{v.active ? '● Activo' : '⏳ Pronto'}</span>
          </span>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={{ ...inputStyle, width: 160 }}>
          <option value="">Todas las plataformas</option>
          {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ ...inputStyle, width: 140 }}>
          <option value="">Todas las regiones</option>
          {REGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center', marginLeft: 8 }}>
          {filtered.length} fuentes
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Cargando fuentes…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No hay fuentes configuradas</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Agregá cuentas de medios para empezar a monitorear.</div>
          <button onClick={() => setModal('new')} style={btnPrimary}>+ Agregar primera fuente</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Fuente</th>
                <th style={th}>Plataforma</th>
                <th style={th}>Región</th>
                <th style={th}>Posts</th>
                <th style={th}>Última publicación</th>
                <th style={th}>Chequeado</th>
                <th style={th}>Estado</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: s.enabled ? 1 : 0.55 }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <a href={s.profile_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#6b7280', fontSize: 11, textDecoration: 'none' }}>
                      {s.profile_url.replace('https://', '').slice(0, 40)}
                    </a>
                  </td>
                  <td style={td}><PlatformBadge platform={s.platform} /></td>
                  <td style={td}><span style={{ fontSize: 12, color: '#374151' }}>{s.region}</span></td>
                  <td style={{ ...td, fontWeight: 600, color: s.post_count > 0 ? '#1d4ed8' : '#9ca3af' }}>
                    {s.post_count || 0}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>{timeAgo(s.last_post_at)}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{timeAgo(s.last_checked)}</td>
                  <td style={td}>
                    <button onClick={() => handleToggle(s.id)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      border: 'none', cursor: 'pointer',
                      background: s.enabled ? '#d1fae5' : '#fee2e2',
                      color: s.enabled ? '#065f46' : '#b91c1c',
                    }}>
                      {s.enabled ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => handleCheck(s)} disabled={checking === s.id}
                      style={{ ...btnSmall, background: '#eff6ff', color: '#1d4ed8', marginRight: 4 }}>
                      {checking === s.id ? '…' : '▶ Probar'}
                    </button>
                    <button onClick={() => setModal(s)}
                      style={{ ...btnSmall, background: '#f9fafb', color: '#374151', marginRight: 4 }}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                      style={{ ...btnSmall, background: '#fee2e2', color: '#b91c1c' }}>
                      {deleting === s.id ? '…' : 'Eliminar'}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btnPrimary   = { padding: '8px 18px', borderRadius: 8, background: '#2b5cff', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnSecondary = { padding: '8px 18px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnSmall     = { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const th = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' };
const td = { padding: '12px 14px', verticalAlign: 'middle' };
