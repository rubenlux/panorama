import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStory, getStoryArticles, followStory, createDossierFromStory } from '../api.js';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

const COVERAGE_STYLE = {
  breaking:   { label: 'En vivo',              color: '#dc2626', bg: '#fee2e2' },
  growing:    { label: 'Cobertura en aumento', color: '#d97706', bg: '#fef3c7' },
  monitoring: { label: 'Monitoreando',         color: '#6b7280', bg: '#f3f4f6' },
  cooling:    { label: 'Enfriando',            color: '#9ca3af', bg: '#f9fafb' },
  archived:   { label: 'Archivada',            color: '#d1d5db', bg: '#f9fafb' },
};

const STATUS_STYLE = {
  active:      { label: 'Activa',     color: '#1d4ed8', bg: '#dbeafe' },
  summarizing: { label: 'Resumiendo', color: '#92400e', bg: '#fef3c7' },
  ready:       { label: 'Lista',      color: '#065f46', bg: '#d1fae5' },
  stale:       { label: 'Archivada',  color: '#6b7280', bg: '#f3f4f6' },
  followed:    { label: 'Siguiendo',  color: '#7c3aed', bg: '#ede9fe' },
};

const STORY_TYPE_LABELS = {
  breaking_news: 'Última hora', event: 'Evento', live_event: 'Cobertura en vivo',
  investigation: 'Investigación', analysis: 'Análisis', politics: 'Política',
  sports: 'Deportes', technology: 'Tecnología', entertainment: 'Entretenimiento',
  economy: 'Economía', health: 'Salud', science: 'Ciencia',
  international: 'Internacional', culture: 'Cultura', news: 'Noticia',
};

const OP_TYPE_STYLE = {
  'noticia':        { icon: '📰', color: '#1d4ed8', bg: '#dbeafe' },
  'análisis':       { icon: '🔍', color: '#065f46', bg: '#d1fae5' },
  'fact_check':     { icon: '✅', color: '#be123c', bg: '#ffe4e6' },
  'explicador':     { icon: '💡', color: '#92400e', bg: '#fef3c7' },
  'cobertura_viva': { icon: '📡', color: '#dc2626', bg: '#fee2e2' },
  'entrevista':     { icon: '🎤', color: '#7c3aed', bg: '#ede9fe' },
  'columna':        { icon: '✍️', color: '#374151', bg: '#f3f4f6' },
};

export default function StoryDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [story,    setStory]    = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(null);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sd, ad] = await Promise.all([
          getStory(id),
          getStoryArticles(id, { limit: 40 }),
        ]);
        setStory(sd.story);
        setArticles(ad.articles || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleFollow() {
    setBusy('follow');
    try {
      await followStory(id);
      setStory(prev => ({ ...prev, status: 'followed' }));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(null); }
  }

  async function handleDossier() {
    setBusy('dossier');
    try {
      await createDossierFromStory(id);
      navigate('/editorial-workflow');
    } catch (e) {
      alert('Error: ' + e.message);
      setBusy(null);
    }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontFamily: 'system-ui' }}>
      Cargando historia…
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontFamily: 'system-ui' }}>
      Error: {error}
    </div>
  );
  if (!story) return null;

  const stSt   = STATUS_STYLE[story.status]   || STATUS_STYLE.active;
  const covSt  = COVERAGE_STYLE[story.coverage_status] || COVERAGE_STYLE.monitoring;
  const isReady = story.status === 'ready';
  const opportunities = Array.isArray(story.editorial_opportunities) ? story.editorial_opportunities : [];
  const entities = Array.isArray(story.entities) ? story.entities : [];
  const isLiveEvent = story.story_type === 'live_event';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 20, padding: 0 }}>
        ← Volver al monitor
      </button>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 16, padding: '24px 28px', border: '1px solid #e5e7eb', marginBottom: 18 }}>
        {/* Meta badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, background: covSt.bg, color: covSt.color, padding: '3px 11px', borderRadius: 20 }}>
            {covSt.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, background: stSt.bg, color: stSt.color, padding: '3px 11px', borderRadius: 20 }}>
            {stSt.label}
          </span>
          {story.story_type && (
            <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '3px 11px', borderRadius: 20 }}>
              {STORY_TYPE_LABELS[story.story_type] || story.story_type}
            </span>
          )}
          {story.importance_score > 0 && (
            <span style={{ fontSize: 12, color: '#374151', background: '#f3f4f6', padding: '3px 11px', borderRadius: 20 }}>
              Relevancia {story.importance_score}/10
            </span>
          )}
          {isLiveEvent && (
            <span style={{ fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '3px 11px', borderRadius: 20, animation: 'none' }}>
              📡 Preparada para seguimiento continuo
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>
          {story.title || '(sin título)'}
        </h1>

        {/* Coverage stats */}
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          {story.article_count} artículos · {story.source_count} {story.source_count === 1 ? 'fuente' : 'fuentes'} · {timeAgo(story.last_seen)}
        </div>

        {/* AI summary */}
        {isReady && story.summary && (
          <div style={{ background: '#eef2ff', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              🤖 Resumen IA
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#1e1b4b', lineHeight: 1.65 }}>{story.summary}</p>
          </div>
        )}
        {story.status === 'summarizing' && (
          <div style={{ fontSize: 13, color: '#f59e0b', fontStyle: 'italic', marginBottom: 16 }}>
            ⏳ Generando inteligencia editorial…
          </div>
        )}
        {story.status === 'active' && story.article_count < 3 && (
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
            El análisis IA se genera con 3+ artículos o 2+ fuentes.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {story.status !== 'followed' && (
            <button onClick={handleFollow} disabled={!!busy} style={{
              padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb',
              background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1,
            }}>
              {busy === 'follow' ? '…' : '🔔 Seguir historia'}
            </button>
          )}
          <button onClick={handleDossier} disabled={!!busy} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1,
          }}>
            {busy === 'dossier' ? 'Creando dossier…' : '📋 Crear dossier'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          {/* Editorial opportunities */}
          {opportunities.length > 0 && (
            <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Oportunidades editoriales
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {opportunities.map((op, i) => {
                  const opSt = OP_TYPE_STYLE[op.type] || OP_TYPE_STYLE['noticia'];
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{opSt.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>{op.title}</div>
                        {op.description && (
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{op.description}</div>
                        )}
                        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, background: opSt.bg, color: opSt.color, padding: '1px 7px', borderRadius: 8 }}>
                          {op.type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Article timeline */}
          <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Artículos en esta historia ({articles.length})
            </h3>
            {articles.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>No hay artículos vinculados.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {articles.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 14, paddingBottom: 14, marginBottom: i < articles.length - 1 ? 14 : 0, borderBottom: i < articles.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  {/* Timeline dot + line */}
                  <div style={{ width: 24, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                    {i < articles.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: '#e5e7eb', marginTop: 5 }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', lineHeight: 1.4, marginBottom: 4 }}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                        {a.title}
                      </a>
                    </div>
                    {a.summary && (
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {a.summary}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      <span style={{ fontWeight: 600, color: '#6b7280' }}>{a.source_name}</span>
                      {' · '}{timeAgo(a.detected_at)}
                      {a.relevance_score && a.relevance_score < 1 && (
                        <span style={{ marginLeft: 6, background: '#f3f4f6', padding: '1px 6px', borderRadius: 6, fontSize: 10 }}>
                          sim. {(a.relevance_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Entities */}
          {entities.length > 0 && (
            <div style={{ background: 'white', borderRadius: 14, padding: '16px 18px', border: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Entidades involucradas
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entities.map((e, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#374151', padding: '3px 9px', borderRadius: 10, lineHeight: 1.4 }}>
                    {e.name}
                    {e.entity_type && e.entity_type !== 'unknown' && (
                      <span style={{ color: '#9ca3af', fontWeight: 400 }}> {e.entity_type}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Story meta */}
          <div style={{ background: 'white', borderRadius: 14, padding: '16px 18px', border: '1px solid #e5e7eb' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Detalles
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#6b7280' }}>
              <div><span style={{ fontWeight: 600, color: '#374151' }}>Tipo:</span> {STORY_TYPE_LABELS[story.story_type] || story.story_type || '—'}</div>
              <div><span style={{ fontWeight: 600, color: '#374151' }}>Primera detección:</span> {timeAgo(story.first_seen)}</div>
              <div><span style={{ fontWeight: 600, color: '#374151' }}>Última actualización:</span> {timeAgo(story.last_seen)}</div>
              <div><span style={{ fontWeight: 600, color: '#374151' }}>Artículos:</span> {story.article_count}</div>
              <div><span style={{ fontWeight: 600, color: '#374151' }}>Fuentes:</span> {story.source_count}</div>
              {story.importance_score > 0 && (
                <div><span style={{ fontWeight: 600, color: '#374151' }}>Relevancia:</span> {story.importance_score}/10</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
