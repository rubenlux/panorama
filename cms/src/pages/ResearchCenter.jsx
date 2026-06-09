import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const ENTITY_TYPE_LABEL = {
  person:       { label: 'Persona',        color: '#7c3aed', bg: '#ede9fe' },
  company:      { label: 'Empresa',        color: '#1d4ed8', bg: '#dbeafe' },
  product:      { label: 'Producto',       color: '#065f46', bg: '#d1fae5' },
  organization: { label: 'Organización',   color: '#92400e', bg: '#fef3c7' },
  location:     { label: 'Lugar',          color: '#be123c', bg: '#ffe4e6' },
};

const STATUS_LABEL = {
  pending:     { text: 'Pendiente',    color: '#6b7280' },
  researching: { text: 'Investigando…', color: '#f59e0b' },
  completed:   { text: 'Completado',   color: '#10b981' },
  no_brief:    { text: 'Sin brief',    color: '#3b82f6' },
  no_sources:  { text: 'Sin fuentes',  color: '#ef4444' },
  failed:      { text: 'Error',        color: '#ef4444' },
};

export default function ResearchCenter() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [topics, setTopics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    loadTopics();
    return () => clearInterval(pollRef.current);
  }, []);

  async function loadTopics() {
    try {
      const d = await apiJson('/research/topics', { auth: true });
      setTopics(d.items || []);
    } catch {}
  }

  async function loadTopic(id) {
    try {
      const d = await apiJson(`/research/topics/${id}`, { auth: true });
      setSelected(d);
    } catch {}
  }

  async function handleInvestigate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const d = await apiJson('/research/investigate', {
        method: 'POST',
        auth: true,
        body: { title: title.trim() },
      });
      setTitle('');
      await loadTopics();
      setSelected({ topic: d.topic, sources: [], brief: null });
      startPolling(d.topic.id);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function startPolling(id) {
    clearInterval(pollRef.current);
    setPolling(id);
    let attempts = 0;
    const MAX_POLLS = 40; // 40 × 2.5s = 100s max — prevents infinite polling on zombie topics
    pollRef.current = setInterval(async () => {
      attempts++;
      const d = await apiJson(`/research/topics/${id}`, { auth: true }).catch(() => null);
      if (d) {
        setSelected(d);
        setTopics(prev => prev.map(t => t.id === id
          ? { ...t, status: d.topic.status, executive_summary: d.brief?.executive_summary }
          : t
        ));
        if (!['pending', 'researching'].includes(d.topic.status)) {
          clearInterval(pollRef.current);
          setPolling(null);
          return;
        }
      }
      if (attempts >= MAX_POLLS) {
        clearInterval(pollRef.current);
        setPolling(null);
        // Mark topic as timed out in local state
        setTopics(prev => prev.map(t => t.id === id ? { ...t, status: 'failed' } : t));
        setSelected(prev => prev?.topic?.id === id
          ? { ...prev, topic: { ...prev.topic, status: 'failed' } }
          : prev
        );
      }
    }, 2500);
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta investigación?')) return;
    await apiJson(`/research/topics/${id}`, { method: 'DELETE', auth: true }).catch(() => {});
    setTopics(prev => prev.filter(t => t.id !== id));
    if (selected?.topic?.id === id) setSelected(null);
  }

  async function handleRetry() {
    if (!selected?.topic) return;
    const id = selected.topic.id;
    try {
      const d = await apiJson(`/research/topics/${id}/retry`, { method: 'POST', auth: true });
      setSelected({ topic: d.topic, sources: [], brief: null });
      setTopics(prev => prev.map(t => t.id === id ? { ...t, status: 'researching' } : t));
      startPolling(id);
    } catch (err) {
      alert('Error al reintentar: ' + err.message);
    }
  }

  function handleCreateArticle() {
    if (!selected?.brief) return;
    const b = selected.brief;
    const topicTitle = selected.topic.title;
    const context = [
      b.executive_summary,
      ...(b.key_facts || []).slice(0, 5),
    ].join('\n');
    navigate('/posts/new', {
      state: {
        prefill: {
          topic: topicTitle,
          additionalContext: context,
        }
      }
    });
  }

  const brief = selected?.brief;
  const isResearching = selected?.topic?.status === 'researching' || polling === selected?.topic?.id;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* LEFT: topic list */}
      <div style={{ borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700 }}>
            🔬 Centro de Investigación
          </h2>
          <form onSubmit={handleInvestigate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: acuerdo Mercosur-UE 2025"
              style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !title.trim()}
              style={{
                padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                background: loading ? '#9ca3af' : 'linear-gradient(135deg,#6366f1,#a855f7)',
                color: 'white',
              }}
            >
              {loading ? 'Iniciando…' : '🔍 Investigar'}
            </button>
          </form>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {topics.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Ninguna investigación aún.<br />Ingresa un tema y presiona Investigar.
            </div>
          )}
          {topics.map(t => {
            const st = STATUS_LABEL[t.status] || STATUS_LABEL.pending;
            const isActive = selected?.topic?.id === t.id;
            return (
              <div
                key={t.id}
                onClick={() => { loadTopic(t.id); if (t.status === 'researching') startPolling(t.id); }}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                  background: isActive ? '#f0f4ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                  position: 'relative',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, paddingRight: 24 }}>{t.title}</div>
                {t.executive_summary && (
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.executive_summary}
                  </div>
                )}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: st.color, fontWeight: 600 }}>
                    {t.status === 'researching' ? '⏳ ' : t.status === 'completed' ? '✅ ' : ''}{st.text}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {t.sources_count || 0} fuentes
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(t.id, e)}
                  style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 16, padding: 2 }}
                  title="Eliminar"
                >×</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div style={{ overflowY: 'auto', padding: '28px 32px' }}>
        {!selected && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#9ca3af', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔬</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Centro de Investigación AI</div>
              <div style={{ fontSize: 14 }}>Ingresa un tema en el panel izquierdo<br />para iniciar una investigación.</div>
            </div>
          </div>
        )}

        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{selected.topic.title}</h1>
                <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
                  {(selected.sources || []).length} fuentes encontradas
                  {isResearching && <span style={{ marginLeft: 10, color: '#f59e0b' }}>⏳ Investigando…</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {['failed', 'no_sources', 'no_brief'].includes(selected.topic.status) && (
                  <button
                    onClick={handleRetry}
                    style={{
                      padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', cursor: 'pointer',
                      background: 'white', color: '#374151', fontWeight: 600, fontSize: 14,
                    }}
                  >
                    🔄 Reintentar
                  </button>
                )}
                {brief && (
                  <button
                    onClick={handleCreateArticle}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: 'white',
                      fontWeight: 700, fontSize: 14,
                    }}
                  >
                    ✍️ Crear artículo
                  </button>
                )}
              </div>
            </div>

            {isResearching && !brief && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 12, padding: 20, marginBottom: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                <div style={{ fontWeight: 600, color: '#92400e' }}>Buscando fuentes y generando brief…</div>
                <div style={{ fontSize: 13, color: '#b45309', marginTop: 4 }}>Esto puede tardar 15-30 segundos</div>
              </div>
            )}

            {/* BRIEF */}
            {brief && (
              <div style={{ marginBottom: 28 }}>
                <Section title="📋 Resumen Ejecutivo">
                  <p style={{ margin: 0, lineHeight: 1.7, color: '#374151' }}>{brief.executive_summary}</p>
                </Section>

                {(brief.key_facts?.length > 0) && (
                  <Section title="✅ Hechos Principales">
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {(typeof brief.key_facts === 'string' ? JSON.parse(brief.key_facts) : brief.key_facts).map((f, i) => (
                        <li key={i} style={{ marginBottom: 6, lineHeight: 1.5, color: '#374151', fontSize: 14 }}>{f}</li>
                      ))}
                    </ul>
                  </Section>
                )}

                {(brief.timeline?.length > 0) && (
                  <Section title="🗓️ Cronología">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(typeof brief.timeline === 'string' ? JSON.parse(brief.timeline) : brief.timeline).map((ev, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', marginTop: 6, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{ev}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {(brief.controversies?.length > 0) && (
                  <Section title="⚠️ Controversias y Debates">
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {(typeof brief.controversies === 'string' ? JSON.parse(brief.controversies) : brief.controversies).map((c, i) => (
                        <li key={i} style={{ marginBottom: 6, lineHeight: 1.5, color: '#374151', fontSize: 14 }}>{c}</li>
                      ))}
                    </ul>
                  </Section>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {brief.opportunities && (
                    <Section title="💡 Ángulos Periodísticos">
                      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{brief.opportunities}</p>
                    </Section>
                  )}
                  {brief.risks && (
                    <Section title="🔴 Vacíos y Riesgos">
                      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{brief.risks}</p>
                    </Section>
                  )}
                </div>
              </div>
            )}

            {/* ENTITIES */}
            {(selected.entities || []).length > 0 && (
              <Section title={`🧠 Entidades Detectadas (${selected.entities.length})`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selected.entities.map(e => {
                    const typeInfo = ENTITY_TYPE_LABEL[e.entity_type] || { label: e.entity_type, color: '#374151', bg: '#f3f4f6' };
                    return (
                      <button
                        key={e.id}
                        onClick={() => navigate(`/knowledge/entities/${e.id}`)}
                        title={e.description || e.name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                          background: typeInfo.bg, color: typeInfo.color,
                          fontSize: 13, fontWeight: 600,
                          transition: 'opacity .15s',
                        }}
                        onMouseEnter={ev => ev.currentTarget.style.opacity = '.75'}
                        onMouseLeave={ev => ev.currentTarget.style.opacity = '1'}
                      >
                        <span>{e.name}</span>
                        <span style={{ fontSize: 10, opacity: .7, fontWeight: 400 }}>{typeInfo.label}</span>
                        {e.mention_count > 1 && (
                          <span style={{ fontSize: 10, background: 'rgba(0,0,0,.1)', borderRadius: 10, padding: '1px 5px' }}>{e.mention_count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* SOURCES */}
            {(selected.sources || []).length > 0 && (
              <Section title={`📰 Fuentes (${selected.sources.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selected.sources.map(s => (
                    <div key={s.id} style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, color: '#111827' }}>{s.title || 'Sin título'}</div>
                          {s.content && (
                            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {s.content}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1' }}>{s.source_name}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {(s.relevance_score * 100).toFixed(0)}% relevancia
                          </div>
                        </div>
                      </div>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6366f1', marginTop: 6, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Fix 4: check DB status, not just local array length */}
            {!isResearching && !brief && ['no_sources', 'failed'].includes(selected.topic.status) && (
              <div style={{ textAlign: 'center', padding: 40, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  {selected.topic.status === 'no_sources' ? '😕' : '❌'}
                </div>
                <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                  {selected.topic.status === 'no_sources' ? 'Sin resultados' : 'La investigación falló'}
                </div>
                <div style={{ fontSize: 13, color: '#b91c1c' }}>
                  {selected.topic.status === 'no_sources'
                    ? 'No se encontraron fuentes. Prueba con términos más generales o en inglés.'
                    : 'Hubo un error durante la investigación. Puedes reintentar con el botón de arriba.'
                  }
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {title}
      </h3>
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
        {children}
      </div>
    </div>
  );
}
