import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_META = {
  youtube:   { label: 'YT',  color: '#dc2626', bg: '#fee2e2' },
  instagram: { label: 'IG',  color: '#7c3aed', bg: '#ede9fe' },
  facebook:  { label: 'FB',  color: '#1d4ed8', bg: '#dbeafe' },
  x:         { label: 'X',   color: '#111827', bg: '#f3f4f6' },
  tiktok:    { label: 'TK',  color: '#be123c', bg: '#ffe4e6' },
};

const ACTIVE_PLATFORMS = [
  { value: 'youtube',   label: 'YouTube' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'x',        label: 'X (Twitter)' },
  { value: 'instagram', label: 'Instagram' },
];

const REGION_LABELS = {
  nacional:      'Nacional',
  internacional: 'Internacional',
  formosa:       'Formosa',
  nea:           'NEA',
  noa:           'NOA',
  cuyo:          'Cuyo',
  patagonia:     'Patagonia',
  bsas:          'Buenos Aires',
};

const QUALITY_STYLE = {
  poor:      { label: 'Insuficiente',   color: '#b91c1c', bg: '#fee2e2' },
  fair:      { label: 'En desarrollo',  color: '#a16207', bg: '#fef9c3' },
  good:      { label: 'Buena historia', color: '#065f46', bg: '#d1fae5' },
  excellent: { label: 'Historia sólida',color: '#047857', bg: '#ecfdf5' },
};

const GAP_STYLE = {
  gap:     { emoji: '🕳️', label: 'Sin cobertura', color: '#dc2626', bg: '#fee2e2' },
  partial: { emoji: '⚠️', label: 'Cobertura parcial', color: '#d97706', bg: '#fef3c7' },
  covered: { emoji: '✓',  label: 'Cubierto', color: '#059669', bg: '#d1fae5' },
};

const OPP_STYLE = {
  MUY_ALTA: { emoji: '🔥', label: 'Oportunidad alta',  color: '#b91c1c', bg: '#fef2f2' },
  MEDIA:    { emoji: '🟡', label: 'Oportunidad media', color: '#92400e', bg: '#fffbeb' },
  BAJA:     { emoji: '🟢', label: 'Oportunidad baja',  color: '#065f46', bg: '#f0fdf4' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEngagement(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function PlatformBadge({ platform }) {
  const m = PLATFORM_META[platform] || { label: platform, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function StatCard({ value, label, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      border: `1px solid ${onClick ? '#bfdbfe' : '#e5e7eb'}`,
      flex: 1, minWidth: 120,
      cursor: onClick ? 'pointer' : 'default',
      transition: onClick ? 'box-shadow 0.15s' : undefined,
    }}
    onMouseEnter={onClick ? e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' : undefined}
    onMouseLeave={onClick ? e => e.currentTarget.style.boxShadow = 'none' : undefined}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || '#111827', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, fontWeight: 600 }}>Ver todas →</div>}
    </div>
  );
}

// ── Viral Topic Card ──────────────────────────────────────────────────────────

function ClusterCard({ cluster, maxEngagement, showGapStatus = false }) {
  const pct = maxEngagement > 0 ? (cluster.total_engagement / maxEngagement) * 100 : 0;
  const platforms = [...new Set(cluster.platforms || [])];

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 18px',
      border: `1px solid ${cluster.gap_status === 'gap' ? '#fecaca' : '#e5e7eb'}`,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, lineHeight: 1.3 }}>
            {cluster.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {platforms.map(p => <PlatformBadge key={p} platform={p} />)}
            <span style={{ fontSize: 12, color: '#6b7280' }}>{cluster.post_count} posts</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{cluster.source_count} medios</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{timeAgo(cluster.last_seen)}</span>
          </div>
          {/* Engagement bar */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: '#3b82f6', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
              {formatEngagement(cluster.total_engagement)}
            </span>
            {cluster.opportunity_tier && cluster.opportunity_tier !== 'BAJA' && (() => {
              const os = OPP_STYLE[cluster.opportunity_tier];
              return (
                <span title={`Oportunidad editorial: ${Math.round(cluster.opportunity_score || 0)}`}
                  style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: os.bg, color: os.color, whiteSpace: 'nowrap' }}>
                  {os.emoji} {os.label}
                </span>
              );
            })()}
          </div>
          {cluster.sources?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
              {cluster.sources.slice(0, 5).join(' · ')}
              {cluster.sources.length > 5 && ` +${cluster.sources.length - 5} más`}
            </div>
          )}
        </div>
        {showGapStatus && cluster.gap_status && (() => {
          const gs = GAP_STYLE[cluster.gap_status];
          return (
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 18 }}>{gs.emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: gs.color, background: gs.bg, padding: '3px 8px', borderRadius: 6, marginTop: 4 }}>
                {gs.label}
              </div>
              {cluster.story_match && (
                <div style={{ marginTop: 6, fontSize: 10, color: '#6b7280' }}>
                  {QUALITY_STYLE[cluster.story_match.story_quality]?.label || cluster.story_match.story_quality}
                  <br />
                  <span style={{ color: '#9ca3af' }}>match {Math.round((cluster.story_match.match_score || 0) * 100)}%</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Dossier Modal ─────────────────────────────────────────────────────────────

function DossierModal({ post, dossier, onClose }) {
  const d = dossier;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 24px', background: '#1e3a5f', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              📄 DOSSIER EJECUTIVO
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.3 }}>{d.titulo || post.title}</div>
            <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
              ⚠️ Basado exclusivamente en transcript · Requiere verificación editorial
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#93c5fd', flexShrink: 0, marginLeft: 12 }}>&times;</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Resumen ejecutivo */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: 8 }}>Resumen Ejecutivo</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#1e3a5f' }}>{d.resumen_ejecutivo}</p>
          </div>

          {/* Qué pasó */}
          {d.que_paso && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>Qué Pasó</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#374151' }}>{d.que_paso}</p>
            </div>
          )}

          {/* Participantes + Cronología lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {d.participantes?.length > 0 && (
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 10 }}>Quiénes Participan</div>
                {d.participantes.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', minWidth: 120 }}>{p.nombre}</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{p.rol}</span>
                  </div>
                ))}
              </div>
            )}
            {d.cronologia?.length > 0 && (
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 10 }}>Cronología</div>
                {d.cronologia.map((c, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid #3b82f6' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{c.momento}</div>
                    <div style={{ fontSize: 13, color: '#374151' }}>{c.hecho}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Datos relevantes */}
          {d.datos_relevantes?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>Datos Relevantes</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {d.datos_relevantes.map((dato, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>{dato}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Citas textuales */}
          {d.citas_textuales?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>Citas Textuales</div>
              {d.citas_textuales.map((cita, i) => (
                <blockquote key={i} style={{ margin: '0 0 10px 0', padding: '10px 16px', borderLeft: '3px solid #6b7280', background: '#f9fafb', borderRadius: '0 8px 8px 0', fontStyle: 'italic', fontSize: 14, color: '#374151' }}>
                  "{cita}"
                </blockquote>
              ))}
            </div>
          )}

          {/* Keywords + Fuente */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {d.keywords?.length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 8 }}>Keywords</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {d.keywords.map((kw, i) => (
                    <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
            {d.fuentes?.length > 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                <strong>Fuente:</strong> {d.fuentes.join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DrillDown Modal ─────────────────────────────────────────────────────────────

function DrillDownModal({ type, item, platform = '', onClose }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dossierLoading, setDossierLoading] = useState({});
  const [activeDossier,  setActiveDossier]  = useState(null); // { post, data }

  useEffect(() => {
    setLoading(true);
    const qs = type === 'cluster' && platform ? `?platform=${encodeURIComponent(platform)}` : '';
    const endpoint = type === 'cluster'
      ? `/social/clusters/${item.id}/posts${qs}`
      : `/social/sources/${item.id}/posts`;

    apiJson(endpoint, { auth: true })
      .then(d => setPosts(d.items || []))
      .catch(e => alert(e.message))
      .finally(() => setLoading(false));
  }, [type, item.id]);

  async function handleDossier(post) {
    setDossierLoading(prev => ({ ...prev, [post.id]: true }));
    try {
      const result = await apiJson(`/social/posts/${post.id}/dossier`, { method: 'POST', auth: true });
      setActiveDossier({ post, data: result.dossier });
    } catch (e) {
      alert('Error generando dossier: ' + e.message);
    } finally {
      setDossierLoading(prev => ({ ...prev, [post.id]: false }));
    }
  }

  return (
    <>
    {activeDossier && (
      <DossierModal
        post={activeDossier.post}
        dossier={activeDossier.data}
        onClose={() => setActiveDossier(null)}
      />
    )}
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#f9fafb', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
              {type === 'cluster' ? '🔍 Detalle de Tema Viral' : '📰 Últimos Posts del Medio'}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{item.title || item.name}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
        </div>

        {/* List of Posts */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Cargando contenido...</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>No hay contenido capturado para mostrar.</div>
          ) : type === 'cluster' ? (
            /* ── Timeline view for clusters ─────────────────────────── */
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, fontWeight: 600 }}>
                TIMELINE · {posts.length} {posts.length === 1 ? 'fuente' : 'fuentes'} monitorearon este tema
              </div>
              {posts.map((p, i) => {
                const isFirst = i === 0;
                const firstTime = posts[0].captured_at ? new Date(posts[0].captured_at) : null;
                const thisTime  = p.captured_at ? new Date(p.captured_at) : null;
                const diffMin   = firstTime && thisTime ? Math.round((thisTime - firstTime) / 60000) : null;
                return (
                  <div key={p.id} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                    {/* Timeline spine */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: isFirst ? '#2b5cff' : '#e5e7eb',
                        color: isFirst ? '#fff' : '#6b7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 13
                      }}>
                        {i + 1}
                      </div>
                      {i < posts.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 24, background: '#e5e7eb', marginTop: 4 }} />
                      )}
                    </div>

                    {/* Card */}
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      style={{ flex: 1, display: 'flex', gap: 14, background: '#fff', padding: 14,
                               borderRadius: 12, border: `1px solid ${isFirst ? '#bfdbfe' : '#e5e7eb'}`,
                               textDecoration: 'none', color: 'inherit' }}>

                      {/* Thumbnail */}
                      <div style={{ width: 120, height: 68, background: '#e5e7eb', borderRadius: 7,
                                    flexShrink: 0, overflow: 'hidden', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center' }}>
                        {p.thumbnail_url
                          ? <img src={p.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <span style={{ fontSize: 22 }}>▶️</span>}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                          <PlatformBadge platform={p.platform} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{p.source_name}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(p.captured_at)}</span>
                          {isFirst && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#2b5cff',
                                           background: '#eff6ff', padding: '2px 7px', borderRadius: 5 }}>
                              PRIMERO
                            </span>
                          )}
                          {diffMin !== null && diffMin > 0 && (
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>+{diffMin}min</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, marginBottom: 6,
                                      overflow: 'hidden', display: '-webkit-box',
                                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {p.title}
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', alignItems: 'center' }}>
                          {Number(p.views) > 0 && <span style={{ color: '#1d4ed8', fontWeight: 700 }}>👀 {formatEngagement(p.views)}</span>}
                          {Number(p.likes) > 0 && <span>❤️ {formatEngagement(p.likes)}</span>}
                          <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>
                            ↗ Ver en {{ youtube: 'YouTube', facebook: 'Facebook', x: 'X', instagram: 'Instagram' }[p.platform] || p.platform}
                          </span>
                          {p.transcript_available && p.has_analysis && (
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); handleDossier(p); }}
                              disabled={dossierLoading[p.id]}
                              style={{
                                padding: '3px 10px', borderRadius: 6, border: '1px solid #6366f1',
                                background: '#eef2ff', color: '#4f46e5', fontSize: 11, fontWeight: 700,
                                cursor: dossierLoading[p.id] ? 'wait' : 'pointer',
                              }}>
                              {dossierLoading[p.id] ? '⏳' : '📄 Dossier'}
                            </button>
                          )}
                        </div>
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Grid view for sources ───────────────────────────────── */
            <div style={{ display: 'grid', gap: 16 }}>
              {posts.map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', gap: 16, background: '#fff', padding: 16, borderRadius: 12,
                           border: '1px solid #e5e7eb', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ width: 140, height: 80, background: '#e5e7eb', borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, overflow: 'hidden' }}>
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <span style={{ fontSize: 24 }}>{p.platform === 'youtube' ? '▶️' : '📝'}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <PlatformBadge platform={p.platform} />
                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{p.source_name || timeAgo(p.captured_at)}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, lineHeight: 1.3 }}>{p.title}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#4b5563' }}>
                      <span style={{ fontWeight: 600, color: '#1d4ed8' }}>👀 {formatEngagement(p.views)}</span>
                      {Number(p.likes) > 0 && <span>❤️ {formatEngagement(p.likes)}</span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = ['🔥 Virales', '📰 Top Medios', '🕳️ Brechas', '📍 Regiones'];


export default function SocialIntelligence() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const [stats,    setStats]    = useState(null);
  const [clusters, setClusters] = useState([]);
  const [topSrcs,  setTopSrcs]  = useState([]);
  const [gap,      setGap]      = useState({ summary: {}, items: [] });

  const [loadingClusters, setLoadingClusters] = useState(false);
  const [loadingTop,      setLoadingTop]      = useState(false);
  const [loadingGap,      setLoadingGap]      = useState(false);

  const [drillDown,       setDrillDown]       = useState(null); // { type: 'cluster' | 'source', item: {} }
  const [transcriptAudit, setTranscriptAudit] = useState(null);

  const [filterRegion,   setFilterRegion]   = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [hours,          setHours]          = useState(48);
  const [sortBy,         setSortBy]         = useState('trend');

  // Load stats always
  useEffect(() => {
    apiJson('/social/stats', { auth: true }).then(setStats).catch(() => {});
    apiJson('/social/transcripts/audit', { auth: true }).then(setTranscriptAudit).catch(() => {});
  }, []);

  // Load tab data on demand
  useEffect(() => {
    if (tab === 0) {
      setLoadingClusters(true);
      apiJson(`/social/clusters?hours=${hours}&limit=300&sort=${sortBy}`, { auth: true })
        .then(d => setClusters(d.items || []))
        .catch(() => {})
        .finally(() => setLoadingClusters(false));
    } else if (tab === 1) {
      setLoadingTop(true);
      apiJson(`/social/top-sources?hours=${hours}`, { auth: true })
        .then(d => setTopSrcs(d.items || []))
        .catch(() => {})
        .finally(() => setLoadingTop(false));
    } else if (tab === 2) {
      setLoadingGap(true);
      apiJson(`/social/content-gap?hours=${hours}&limit=60`, { auth: true })
        .then(setGap)
        .catch(() => {})
        .finally(() => setLoadingGap(false));
    }
  }, [tab, hours, sortBy]);

  const maxEngagement = clusters.length > 0 ? Math.max(...clusters.map(c => c.total_engagement || 0)) : 1;

  const filteredClusters = clusters
    .filter(c => !filterRegion   || (c.regions   || []).includes(filterRegion))
    .filter(c => !filterPlatform || (c.platforms || []).includes(filterPlatform));

  const filteredTop = topSrcs
    .filter(s => !filterRegion   || s.region   === filterRegion)
    .filter(s => !filterPlatform || s.platform === filterPlatform);

  const filteredGapItems = (gap.items || [])
    .filter(c => !filterPlatform || (c.platforms || []).includes(filterPlatform));

  const maxTopPosts = topSrcs.length > 0 ? Math.max(...topSrcs.map(s => s.recent_posts || 0)) : 1;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.8rem' }}>Social Intelligence</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            Monitoreo de cuentas seleccionadas · {stats?.sources_active || 0} fuentes activas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}>
            <option value={1}>Última hora</option>
            <option value={24}>Últimas 24h</option>
            <option value={48}>Últimas 48h</option>
            <option value={72}>Últimas 72h</option>
            <option value={168}>Última semana</option>
          </select>
          <button onClick={() => navigate('/social/sources')}
            style={{ padding: '6px 14px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            ⚙ Fuentes
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard value={stats.posts_today || 0}      label="Posts hoy"            sub="de cuentas monitoreadas" />
          <StatCard value={stats.clusters_active || 0}  label="Temas activos"         sub="en las últimas 48h" />
          <StatCard value={formatEngagement(stats.total_engagement_active || 0)} label="Engagement acumulado" sub="temas activos" accent="#1d4ed8" />
          <StatCard value={stats.opportunities_muy_alta || 0} label="🔥 Oportunidades"
            sub={`${stats.opportunities_media || 0} medias · ${stats.content_gaps || 0} sin cobertura`}
            accent={(stats.opportunities_muy_alta || 0) > 0 ? '#b91c1c' : '#6b7280'}
            onClick={() => navigate('/social/opportunities')} />
          <StatCard value={stats.sources_active || 0} label="Fuentes activas"
            sub={`YT: ${stats.youtube_sources || 0} · FB: ${stats.facebook_sources || 0} · X: ${stats.x_sources || 0} · de ${stats.sources_total || 0}`} />
          {transcriptAudit && (
            <StatCard
              value={`${transcriptAudit.cobertura_pct ?? 0}%`}
              label="🧠 Transcripts"
              sub={`${transcriptAudit.videos_con_transcript} procesados · ${transcriptAudit.pendientes} pendientes${transcriptAudit.avg_quality_score > 0 ? ` · calidad ${transcriptAudit.avg_quality_score}/100` : ''}`}
              accent={
                (transcriptAudit.cobertura_pct ?? 0) >= 60 ? '#059669' :
                (transcriptAudit.cobertura_pct ?? 0) >= 30 ? '#d97706' : '#6b7280'
              }
            />
          )}
        </div>
      )}

      {/* Session alerts — cookies/credenciales vencidas detectadas en el último intento de scraping */}
      {stats?.session_alerts?.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.session_alerts.map(a => (
            <div key={a.platform} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderRadius: 8,
              background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ flex: 1 }}>
                <strong style={{ textTransform: 'capitalize' }}>{a.platform}</strong>: sesión vencida — no se están descargando posts nuevos desde {new Date(a.since).toLocaleString('es-AR')}. Renovar cookies.
              </span>
              <button onClick={() => navigate('/social/sources')}
                style={{ padding: '4px 12px', borderRadius: 6, background: '#991b1b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                Ver fuentes
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: tab === i ? 700 : 500, fontSize: 14,
              background: 'transparent', color: tab === i ? '#2b5cff' : '#6b7280',
              borderBottom: tab === i ? '2px solid #2b5cff' : '2px solid transparent',
              marginBottom: -1 }}>
            {t}
          </button>
        ))}
        {/* Filters */}
        <div style={{ marginLeft: 'auto', paddingBottom: 4, display: 'flex', gap: 6 }}>
          <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}>
            <option value="">Todas las redes</option>
            {ACTIVE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}>
            <option value="">Todas las regiones</option>
            {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* ── Tab 0: Virales ──────────────────────────────────────────────────── */}
      {tab === 0 && (
        <div>
          {loadingClusters ? (
            <Loading label="Cargando temas virales…" />
          ) : filteredClusters.length === 0 ? (
            <Empty
              icon="🔥"
              title="No hay temas activos"
              sub={stats?.sources_active === 0
                ? "Agregá fuentes en ⚙ Fuentes para empezar a monitorear."
                : "Cuando el worker procese los primeros posts, los temas aparecerán aquí."
              }
              action={{ label: '⚙ Administrar fuentes', onClick: () => navigate('/social/sources') }}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {filteredClusters.length} temas (Haz click en un cluster para ver el contenido)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { value: 'trend',      label: '🔥 Tendencia' },
                    { value: 'recent',     label: '🕐 Reciente' },
                    { value: 'engagement', label: '⭐ Engagement' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        border: sortBy === opt.value ? '2px solid #2b5cff' : '1px solid #d1d5db',
                        background: sortBy === opt.value ? '#eff6ff' : '#f9fafb',
                        color: sortBy === opt.value ? '#2b5cff' : '#6b7280',
                        fontWeight: sortBy === opt.value ? 700 : 500,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredClusters.map(c => (
                <div key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDrillDown({ type: 'cluster', item: c })}>
                  <ClusterCard cluster={c} maxEngagement={maxEngagement} />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Tab 1: Top Medios ───────────────────────────────────────────────── */}
      {tab === 1 && (
        <div>
          {loadingTop ? (
            <Loading label="Cargando ranking de medios…" />
          ) : filteredTop.length === 0 ? (
            <Empty icon="📰" title="Sin datos de medios" sub="Los medios aparecerán aquí una vez que el worker capture posts." />
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={th}>#</th>
                    <th style={th}>Medio</th>
                    <th style={th}>Plataforma</th>
                    <th style={th}>Región</th>
                    <th style={th}>Posts recientes</th>
                    <th style={th}>Engagement total</th>
                    <th style={th}>Último post</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTop.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setDrillDown({ type: 'source', item: s })}>
                      <td style={{ ...td, color: '#9ca3af', fontWeight: 700, width: 40 }}>{i + 1}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.category}</div>
                      </td>
                      <td style={td}>
                        <PlatformBadge platform={s.platform} />
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>{REGION_LABELS[s.region] || s.region}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: ((s.recent_posts / maxTopPosts) * 100) + '%', background: '#3b82f6', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: s.recent_posts > 0 ? '#1d4ed8' : '#9ca3af' }}>
                            {s.recent_posts}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: '#059669' }}>
                        {formatEngagement(s.total_engagement)}
                      </td>
                      <td style={{ ...td, color: '#6b7280' }}>{timeAgo(s.last_post_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Brechas (Content Gap) ────────────────────────────────────── */}
      {tab === 2 && (
        <div>
          {loadingGap ? (
            <Loading label="Analizando brechas editoriales…" />
          ) : filteredGapItems.length === 0 ? (
            <Empty icon="🕳️" title="Sin datos de brecha" sub="Cuando haya temas sociales activos, se comparará automáticamente contra las historias del Monitor." />
          ) : (
            <>
              {/* Summary pills */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { key: 'gap',     label: '🕳️ Sin cobertura', color: '#dc2626', bg: '#fee2e2' },
                  { key: 'partial', label: '⚠️ Cobertura parcial', color: '#d97706', bg: '#fef3c7' },
                  { key: 'covered', label: '✓ Cubierto', color: '#059669', bg: '#d1fae5' },
                ].map(({ key, label, color, bg }) => (
                  <div key={key} style={{ padding: '6px 14px', borderRadius: 8, background: bg, color, fontWeight: 700, fontSize: 13 }}>
                    {label}: {gap.summary?.[key] || 0}
                  </div>
                ))}
              </div>

              {/* Gap/Partial items first */}
              {filteredGapItems.map(c => (
                <div key={c.id} style={{
                  background: '#fff', borderRadius: 12, padding: '14px 18px',
                  border: `1px solid ${c.gap_status === 'gap' ? '#fecaca' : c.gap_status === 'partial' ? '#fde68a' : '#d1fae5'}`,
                  marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{c.title}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {(c.platforms || []).map(p => <PlatformBadge key={p} platform={p} />)}
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{c.post_count} posts</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{c.source_count} medios</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{formatEngagement(c.total_engagement)}</span>
                      </div>
                      {c.sources?.length > 0 && (
                        <div style={{ marginTop: 5, fontSize: 11, color: '#6b7280' }}>
                          {c.sources.slice(0, 6).join(' · ')}
                        </div>
                      )}
                      {c.story_match && c.gap_status !== 'gap' && (
                        <div style={{ marginTop: 6, padding: '5px 10px', background: '#f9fafb', borderRadius: 6, fontSize: 12 }}>
                          Historia: <strong>{c.story_match.title}</strong>
                          {' · '}
                          <span style={{
                            fontWeight: 700,
                            color: QUALITY_STYLE[c.story_match.story_quality]?.color || '#6b7280',
                          }}>
                            {QUALITY_STYLE[c.story_match.story_quality]?.label || c.story_match.story_quality}
                          </span>
                          {' · '}
                          {c.story_match.article_count} artículos
                          {' · '}
                          <span style={{ color: '#9ca3af' }}>match {Math.round((c.story_match.match_score || 0) * 100)}%</span>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 120, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {(() => {
                        const gs = GAP_STYLE[c.gap_status];
                        return (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: gs.bg, color: gs.color }}>
                            {gs.emoji} {gs.label}
                          </span>
                        );
                      })()}
                      {c.opportunity_tier && (() => {
                        const os = OPP_STYLE[c.opportunity_tier];
                        return (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: os.bg, color: os.color }}>
                            {os.emoji} {Math.round(c.opportunity_score || 0)} pts
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Tab 3: Regiones ─────────────────────────────────────────────────── */}
      {tab === 3 && (
        <div>
          {topSrcs.length === 0 ? (
            <RegionTabLoader onLoad={data => setTopSrcs(data)} />
          ) : (
            <div>
              {Object.entries(REGION_LABELS).map(([regionKey, regionLabel]) => {
                const regionSrcs = topSrcs.filter(s => s.region === regionKey && s.recent_posts > 0);
                if (!regionSrcs.length) return null;
                const totalPosts = regionSrcs.reduce((a, b) => a + (b.recent_posts || 0), 0);
                const totalEng   = regionSrcs.reduce((a, b) => a + Number(b.total_engagement || 0), 0);
                return (
                  <div key={regionKey} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <h3 style={{ margin: 0, fontWeight: 700 }}>📍 {regionLabel}</h3>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>{regionSrcs.length} medios · {totalPosts} posts · {formatEngagement(totalEng)}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {regionSrcs.map(s => (
                        <div key={s.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                            <PlatformBadge platform={s.platform} />
                            <span style={{ fontSize: 12, color: '#6b7280' }}>{s.recent_posts} posts</span>
                          </div>
                          {s.total_engagement > 0 && (
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>
                              {formatEngagement(s.total_engagement)} eng.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Overlay para Drill Downs */}
      {drillDown && (
        <DrillDownModal
          type={drillDown.type}
          item={drillDown.item}
          platform={filterPlatform}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}


// ── Helper sub-components ─────────────────────────────────────────────────────

function Loading({ label }) {
  return <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>{label}</div>;
}

function Empty({ icon, title, sub, action }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto 20px' }}>{sub}</div>
      {action && (
        <button onClick={action.onClick}
          style={{ padding: '8px 18px', borderRadius: 8, background: '#2b5cff', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function RegionTabLoader({ onLoad }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiJson('/social/top-sources?hours=168', { auth: true })
      .then(d => { onLoad(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return loading
    ? <Loading label="Cargando datos por región…" />
    : <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Sin datos regionales disponibles.</div>;
}

const th = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' };
const td = { padding: '12px 14px', verticalAlign: 'middle' };
