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

function StatCard({ value, label, sub, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || '#111827', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
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

  const [filterRegion, setFilterRegion] = useState('');
  const [hours,        setHours]        = useState(48);

  // Load stats always
  useEffect(() => {
    apiJson('/social/stats', { auth: true }).then(setStats).catch(() => {});
  }, []);

  // Load tab data on demand
  useEffect(() => {
    if (tab === 0) {
      setLoadingClusters(true);
      apiJson(`/social/clusters?hours=${hours}&limit=80`, { auth: true })
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
  }, [tab, hours]);

  const maxEngagement = clusters.length > 0 ? Math.max(...clusters.map(c => c.total_engagement || 0)) : 1;

  const filteredClusters = filterRegion
    ? clusters.filter(c => (c.regions || []).includes(filterRegion))
    : clusters;

  const filteredTop = filterRegion
    ? topSrcs.filter(s => s.region === filterRegion)
    : topSrcs;

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
          <StatCard value={stats.content_gaps || 0}     label="Brechas editoriales"   sub="sin historia asignada" accent={stats.content_gaps > 0 ? '#dc2626' : '#059669'} />
          <StatCard value={stats.youtube_sources || 0}  label="Fuentes YouTube"       sub={`de ${stats.sources_total || 0} configuradas`} />
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
        {/* Region filter */}
        <div style={{ marginLeft: 'auto', paddingBottom: 4 }}>
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
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                {filteredClusters.length} temas · ordenados por engagement total
              </div>
              {filteredClusters.map(c => (
                <ClusterCard key={c.id} cluster={c} maxEngagement={maxEngagement} />
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
                    <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
          ) : gap.items?.length === 0 ? (
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
              {gap.items.map(c => (
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
                    <div style={{ textAlign: 'right', minWidth: 110 }}>
                      {(() => {
                        const gs = GAP_STYLE[c.gap_status];
                        return (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: gs.bg, color: gs.color }}>
                            {gs.emoji} {gs.label}
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
