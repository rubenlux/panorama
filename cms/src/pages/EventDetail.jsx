import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getEvent, getEventStories, getEventArticles,
  getEventOpportunities, updateOpportunityStatus,
  followEvent, createDossierFromEvent,
} from '../api.js';

function timeAgo(d) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'hace ' + s + 's';
  if (s < 3600)  return 'hace ' + Math.floor(s / 60) + 'min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + 'h';
  return 'hace ' + Math.floor(s / 86400) + 'd';
}

const COVERAGE_STYLE = {
  breaking:   { label: '🔴 En vivo',              color: '#dc2626', bg: '#fee2e2' },
  growing:    { label: '📈 Cobertura creciendo',   color: '#d97706', bg: '#fef3c7' },
  monitoring: { label: '● Monitoreando',           color: '#6b7280', bg: '#f3f4f6' },
  cooling:    { label: '↘ Enfriando',              color: '#9ca3af', bg: '#f9fafb' },
  archived:   { label: '📁 Archivado',             color: '#d1d5db', bg: '#f9fafb' },
};

const EVENT_TYPE_LABELS = {
  sports_live: '⚽ Deporte en vivo', sports: '⚽ Deporte',
  politics: '🏛️ Política', economy: '📊 Economía',
  culture: '🎭 Cultura', science: '🔬 Ciencia',
  international: '🌍 Internacional', breaking: '🔴 Urgente',
  investigation: '🕵️ Investigación', analysis: '🔍 Análisis',
  entertainment: '🎬 Entretenimiento', health: '🏥 Salud',
  technology: '💻 Tecnología', general: '📰 General',
};

const OPP_TYPE_ICON = {
  noticia: '📰', analisis: '🔎', seo: '🔍', redes: '📱',
  explicador: '💡', entrevista: '🎙️', opinion: '✍️',
  multimedia: '🎥', cobertura_viva: '📡',
};

const OPP_TYPE_LABEL = {
  noticia: 'Noticia', analisis: 'Análisis', seo: 'SEO',
  redes: 'Redes', explicador: 'Explicador', entrevista: 'Entrevista',
  opinion: 'Opinión', multimedia: 'Multimedia', cobertura_viva: 'Cobertura viva',
};

const STATUS_OPP = {
  pending:     { label: 'Pendiente',   color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En proceso',  color: '#d97706', bg: '#fef3c7' },
  done:        { label: '✓ Hecho',     color: '#059669', bg: '#d1fae5' },
  dismissed:   { label: 'Descartada',  color: '#9ca3af', bg: '#f9fafb' },
};

const TRAFFIC_BADGE = {
  alto:  { label: 'Tráfico alto',  color: '#059669', bg: '#d1fae5' },
  medio: { label: 'Tráfico medio', color: '#d97706', bg: '#fef3c7' },
  bajo:  { label: 'Tráfico bajo',  color: '#6b7280', bg: '#f3f4f6' },
};

const DIFF_BADGE = {
  facil:  { label: 'Fácil',   color: '#059669', bg: '#d1fae5' },
  medio:  { label: 'Medio',   color: '#d97706', bg: '#fef3c7' },
  dificil:{ label: 'Difícil', color: '#dc2626', bg: '#fee2e2' },
};

function ScoreRing({ score }) {
  const s = score || 0;
  const color = s >= 80 ? '#059669' : s >= 60 ? '#d97706' : s >= 40 ? '#6366f1' : '#9ca3af';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: `conic-gradient(${color} ${s}%, #e5e7eb 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{s}</span>
          <span style={{ fontSize: 8, color: '#9ca3af' }}>/100</span>
        </div>
      </div>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Score editorial</span>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event,  setEvent]  = useState(null);
  const [stories, setStories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [opps, setOpps]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState('');
  const [artSection, setArtSection] = useState('all'); // 'all' or by story

  useEffect(() => {
    (async () => {
      try {
        const [evRes, stRes, arRes, opRes] = await Promise.all([
          getEvent(id),
          getEventStories(id),
          getEventArticles(id, { limit: 50 }),
          getEventOpportunities(id),
        ]);
        setEvent(evRes.event);
        setStories(stRes.stories || []);
        setArticles(arRes.articles || []);
        setOpps(opRes.opportunities || []);
      } catch (e) {
        if (e.message?.includes('404')) navigate('/monitor');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleFollow() {
    setBusy('follow');
    try { await followEvent(id); const r = await getEvent(id); setEvent(r.event); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(''); }
  }

  async function handleDossier() {
    setBusy('dossier');
    try { await createDossierFromEvent(id); navigate('/dossiers'); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setBusy(''); }
  }

  async function handleOppStatus(oppId, status) {
    try {
      await updateOpportunityStatus(id, oppId, status);
      setOpps(prev => prev.map(o => o.id === oppId ? { ...o, status } : o));
    } catch (e) { alert('Error: ' + e.message); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando evento…</div>;
  if (!event)  return null;

  const covStyle  = COVERAGE_STYLE[event.coverage_status] || COVERAGE_STYLE.monitoring;
  const typeLabel = EVENT_TYPE_LABELS[event.event_type] || '📰 General';
  const isFollowed = event.status === 'followed';
  const mainEntities = Array.isArray(event.main_entities) ? event.main_entities : [];
  const timeline = Array.isArray(event.timeline) ? event.timeline : [];
  const activeOpps = opps.filter(o => o.status !== 'dismissed');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

      {/* Back */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/monitor" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Volver al Monitor
        </Link>
      </div>

      {/* Event header */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
        {/* Meta badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, background: covStyle.bg, color: covStyle.color, padding: '3px 10px', borderRadius: 20 }}>
            {covStyle.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#374151', padding: '3px 10px', borderRadius: 20 }}>
            {typeLabel}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, background: '#ede9fe', color: '#7c3aed', padding: '3px 10px', borderRadius: 20 }}>
            ★ Importancia: {event.importance_score}/10
          </span>
          {isFollowed && (
            <span style={{ fontSize: 12, fontWeight: 700, background: '#d1fae5', color: '#059669', padding: '3px 10px', borderRadius: 20 }}>
              🔔 Siguiendo
            </span>
          )}
        </div>

        {/* Headline + score */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1.25 }}>
              {event.headline}
            </h1>
            {event.summary && (
              <p style={{ margin: 0, fontSize: 15, color: '#4b5563', lineHeight: 1.7 }}>{event.summary}</p>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <ScoreRing score={event.editorial_score} />
          </div>
        </div>

        {/* Stats + actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#6b7280', flexWrap: 'wrap' }}>
            <span>📰 <strong style={{ color: '#111827' }}>{event.article_count}</strong> artículos</span>
            <span>📡 <strong style={{ color: '#111827' }}>{event.source_count}</strong> fuentes</span>
            <span>📖 <strong style={{ color: '#111827' }}>{event.story_count}</strong> ángulos</span>
            <span>⚡ <strong style={{ color: '#6366f1' }}>{activeOpps.length}</strong> oportunidades</span>
            <span>🕐 {timeAgo(event.last_updated_at)}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!isFollowed && (
              <button onClick={handleFollow} disabled={busy === 'follow'} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                {busy === 'follow' ? '…' : '🔔 Seguir evento'}
              </button>
            )}
            <button onClick={handleDossier} disabled={!!busy} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy === 'dossier' ? .7 : 1 }}>
              {busy === 'dossier' ? 'Creando…' : '📋 Crear dossier'}
            </button>
          </div>
        </div>
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

        {/* Left: opportunities + article timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Editorial opportunities */}
          {activeOpps.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 22px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#111827' }}>
                ⚡ Oportunidades editoriales
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeOpps.map(op => {
                  const st   = STATUS_OPP[op.status] || STATUS_OPP.pending;
                  const tr   = TRAFFIC_BADGE[op.traffic_potential];
                  const diff = DIFF_BADGE[op.difficulty];
                  return (
                    <div key={op.id} style={{ border: '1px solid #f3f4f6', borderRadius: 10, padding: '14px 16px', background: op.status === 'done' ? '#f9fffe' : 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: '#f0f0ff', color: '#6366f1', padding: '2px 8px', borderRadius: 10 }}>
                              {OPP_TYPE_ICON[op.type]} {OPP_TYPE_LABEL[op.type] || op.type}
                            </span>
                            {tr && <span style={{ fontSize: 10, fontWeight: 700, background: tr.bg, color: tr.color, padding: '2px 7px', borderRadius: 10 }}>{tr.label}</span>}
                            {diff && <span style={{ fontSize: 10, fontWeight: 700, background: diff.bg, color: diff.color, padding: '2px 7px', borderRadius: 10 }}>{diff.label}</span>}
                            {op.seo_value && <span style={{ fontSize: 10, color: '#9ca3af' }}>SEO {op.seo_value}/10</span>}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: op.reason ? 4 : 0 }}>{op.title}</div>
                          {op.reason && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{op.reason}</div>}
                        </div>
                        {/* Status control */}
                        <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 10 }}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                      {op.status !== 'done' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          {op.status === 'pending' && (
                            <button onClick={() => handleOppStatus(op.id, 'in_progress')} style={smallBtnStyle('#374151', '#f3f4f6')}>Iniciar</button>
                          )}
                          {op.status === 'in_progress' && (
                            <button onClick={() => handleOppStatus(op.id, 'done')} style={smallBtnStyle('white', '#059669')}>Marcar hecho</button>
                          )}
                          <button onClick={() => handleOppStatus(op.id, 'dismissed')} style={smallBtnStyle('#9ca3af', '#f9fafb')}>Descartar</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stories in event */}
          {stories.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 22px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#111827' }}>
                📖 Ángulos de cobertura ({stories.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stories.map(s => (
                  <div key={s.id} style={{ border: '1px solid #f3f4f6', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 4 }}>{s.title}</div>
                      {s.summary && (
                        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {s.summary}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11, color: '#9ca3af' }}>
                      <div>{s.article_count} arts</div>
                      <div>{timeAgo(s.last_seen)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Article timeline */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 22px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#111827' }}>
              📰 Artículos detectados ({articles.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {articles.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 36 }}>
                    {a.relevance_score != null && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: a.relevance_score >= 0.5 ? '#6366f1' : '#9ca3af', background: '#f3f4f6', padding: '2px 5px', borderRadius: 6 }}>
                        {(a.relevance_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#4b5563', padding: '1px 7px', borderRadius: 10 }}>
                        {a.source_name}
                      </span>
                      {a.story_title && (
                        <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>vía: {a.story_title}</span>
                      )}
                      <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>{timeAgo(a.detected_at)}</span>
                    </div>
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontWeight: 600, fontSize: 13, color: '#111827', textDecoration: 'none', lineHeight: 1.4, display: 'block' }}>
                      {a.title}
                    </a>
                    {a.summary && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {a.summary}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#111827' }}>🕐 Cronología</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', border: '2px solid white', boxShadow: '0 0 0 2px #6366f1', flexShrink: 0, marginTop: 3 }} />
                      {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: '#e5e7eb', minHeight: 16, marginTop: 2 }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{t.label}</div>
                      {t.detail && <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4, marginTop: 2 }}>{t.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key entities */}
          {mainEntities.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#111827' }}>🏷️ Entidades clave</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {mainEntities.map((e, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, background: '#ede9fe', color: '#7c3aed', padding: '4px 10px', borderRadius: 20 }}>
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {event.sources && event.sources.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#111827' }}>📡 Medios que cubren el evento</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {event.sources.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                    {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 14, padding: '16px 18px', fontSize: 12, color: '#6b7280' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><strong style={{ color: '#374151' }}>Primera detección:</strong> {timeAgo(event.first_detected_at)}</div>
              <div><strong style={{ color: '#374151' }}>Última actualización:</strong> {timeAgo(event.last_updated_at)}</div>
              <div><strong style={{ color: '#374151' }}>Estado:</strong> {event.status}</div>
              <div><strong style={{ color: '#374151' }}>Importancia:</strong> {event.importance_score}/10</div>
              <div><strong style={{ color: '#374151' }}>Score editorial:</strong> {event.editorial_score}/100</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function smallBtnStyle(color, bg) {
  return {
    padding: '4px 10px', borderRadius: 6, border: 'none', background: bg,
    color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  };
}
