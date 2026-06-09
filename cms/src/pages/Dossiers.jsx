import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const STATUS_STYLE = {
  generating: { label: '⏳ Generando…', color: '#92400e', bg: '#fef3c7' },
  ready:      { label: '✓ Listo',        color: '#065f46', bg: '#d1fae5' },
  failed:     { label: '✗ Error',        color: '#991b1b', bg: '#fee2e2' },
};

const ORIGIN_STYLE = {
  manual:   { label: 'Manual',      color: '#374151', bg: '#f3f4f6' },
  dossier:  { label: '📋 Dossier',  color: '#1d4ed8', bg: '#dbeafe' },
  research: { label: '🔬 Research', color: '#7c3aed', bg: '#ede9fe' },
};

function timeAgo(d) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'hace ' + s + 's';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + 'min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + 'h';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export default function Dossiers() {
  const navigate = useNavigate();
  const [dossiers, setDossiers]         = useState([]);
  const [topics, setTopics]             = useState([]);
  const [metrics, setMetrics]           = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [creating, setCreating]         = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([
        apiJson('/editorial-workflow/dossiers', { auth: true }),
        apiJson('/editorial-workflow/metrics', { auth: true }),
      ]);
      setDossiers(d.items || []);
      setMetrics(m);
    } catch {}
  }, []);

  const loadTopics = useCallback(async () => {
    try {
      const d = await apiJson('/research/topics', { auth: true });
      setTopics((d.items || []).filter(t => t.status === 'completed'));
    } catch {}
  }, []);

  useEffect(() => { load(); }, []);

  // Auto-refresh while any dossier is generating
  useEffect(() => {
    const hasGenerating = dossiers.some(d => d.status === 'generating');
    if (!hasGenerating) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [dossiers]);

  async function handleCreate() {
    if (!selectedTopic) return;
    setCreating(true);
    try {
      await apiJson('/editorial-workflow/dossiers', { method: 'POST', auth: true, body: { topic_id: selectedTopic } });
      setShowModal(false);
      setSelectedTopic('');
      load();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setCreating(false); }
  }

  return (
    <div style={{ padding: '20px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📋 Dossiers Editoriales</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Transforma investigaciones en guías editoriales con IA</p>
        </div>
        <button
          onClick={() => { setShowModal(true); loadTopics(); }}
          style={{ padding: '10px 18px', borderRadius: 10, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
        >
          + Crear desde investigación
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Dossiers totales',    value: metrics.total_dossiers,        color: '#6366f1' },
            { label: 'Listos',              value: metrics.ready_dossiers,        color: '#10b981' },
            { label: 'Arts. desde dossier', value: metrics.articles_from_dossier, color: '#1d4ed8' },
            { label: 'Investigaciones',     value: metrics.topics_completed,      color: '#7c3aed' },
          ].map(m => (
            <div key={m.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value ?? 0}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline diagram */}
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {['🔬 Research', '→', '📋 Dossier', '→', '✍️ Story Builder', '→', '📄 Borrador', '→', '✔️ Revisión', '→', '🚀 Publicado'].map((step, i) => (
          <span key={i} style={{ fontWeight: step === '→' ? 400 : 600, color: step === '→' ? '#9ca3af' : '#374151' }}>{step}</span>
        ))}
      </div>

      {/* List */}
      {dossiers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6, fontSize: 16 }}>No hay dossiers todavía</div>
          <div style={{ fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
            Crea tu primer dossier seleccionando una investigación completada.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dossiers.map(d => {
            const st = STATUS_STYLE[d.status] || STATUS_STYLE.failed;
            const angles = Array.isArray(d.suggested_angles) ? d.suggested_angles.length : 0;
            return (
              <div
                key={d.id}
                onClick={() => d.status === 'ready' && navigate(`/dossiers/${d.id}`)}
                style={{
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
                  padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                  cursor: d.status === 'ready' ? 'pointer' : 'default',
                  opacity: d.status === 'failed' ? 0.6 : 1,
                  transition: 'box-shadow .15s',
                }}
                onMouseEnter={e => d.status === 'ready' && (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.topic_title || '(sin título)'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 10 }}>
                      {st.label}
                    </span>
                    {d.status === 'ready' && (
                      <>
                        {angles > 0 && <span style={{ fontSize: 11, color: '#6b7280' }}>{angles} enfoques</span>}
                        {d.drafts_count > 0 && <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>📄 {d.drafts_count} borrador{d.drafts_count > 1 ? 'es' : ''}</span>}
                      </>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, textAlign: 'right' }}>
                  {timeAgo(d.created_at)}
                </div>
                {d.status === 'ready' && (
                  <div style={{ color: '#9ca3af', fontSize: 18, flexShrink: 0 }}>›</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Crear Dossier Editorial</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              Seleccioná una investigación completada. Claude analizará el brief y generará el dossier editorial en segundos.
            </p>

            {topics.length === 0 ? (
              <div style={{ padding: '16px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                ⚠️ No hay investigaciones completadas. Primero completá una investigación en el Centro de Investigación AI.
              </div>
            ) : (
              <select
                value={selectedTopic}
                onChange={e => setSelectedTopic(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
              >
                <option value="">— Seleccionar investigación —</option>
                {topics.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCreate}
                disabled={!selectedTopic || creating}
                style={{ flex: 1, padding: '10px', background: selectedTopic ? '#6366f1' : '#d1d5db', color: 'white', border: 'none', borderRadius: 8, cursor: selectedTopic ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14 }}
              >
                {creating ? 'Generando…' : '✨ Generar Dossier'}
              </button>
              <button
                onClick={() => { setShowModal(false); setSelectedTopic(''); }}
                style={{ padding: '10px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
