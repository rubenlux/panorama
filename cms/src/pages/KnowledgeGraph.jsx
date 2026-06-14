import { useState, useEffect, useCallback } from 'react';
import { apiJson } from '../api.js';

// ── Clasificador heurístico (mismo que EditorialDossierPage) ─────────────────

const COMMON_NOUNS_ES = new Set([
  'caso', 'proyecto', 'plan', 'ley', 'decreto', 'resolución', 'resolucion',
  'presupuesto', 'economía', 'economia', 'inflación', 'inflacion',
  'dólar', 'dolar', 'elecciones', 'crisis', 'reforma', 'acuerdo',
  'escándalo', 'escandalo', 'investigación', 'investigacion',
  'denuncia', 'causa', 'juicio', 'operativo', 'medida', 'política', 'politica',
]);
const ORG_KEYS   = ['ministerio','secretaría','secretaria','federal','nacional','provincial','municipal','gobierno','partido','policía','policia','fuerza','banco','empresa','tribunal','juzgado','cámara','camara','senado','congreso','corte','fiscalía','fiscalia','instituto','universidad','sindicato','asociación','asociacion','fundación','fundacion','s.a.',' ltda'];
const PLACE_KEYS = ['argentina','buenos aires','córdoba','cordoba','rosario','mendoza','santa fe','tucumán','tucuman','salta','jujuy','caba','ciudad','provincia','municipio','barrio','estados unidos','eeuu','brasil','chile','uruguay','paraguay','bolivia','perú','peru','colombia','venezuela','méxico','mexico','europa','rusia','china','gaza','ucrania'];

function classifyEntity(name = '', dbType = '') {
  if (dbType && dbType !== 'unknown') {
    if (['person','per','persona'].includes(dbType))         return 'person';
    if (['organization','org','company','institution'].includes(dbType)) return 'organization';
    if (['location','place','gpe','loc'].includes(dbType))  return 'place';
    if (['topic','tag','product'].includes(dbType))         return 'topic';
  }
  const n = name.toLowerCase().trim();
  if (name.startsWith('$') || name.startsWith('#'))         return 'topic';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && name === name.toUpperCase() && name.length >= 2) return 'topic';
  if (COMMON_NOUNS_ES.has(n))   return 'topic';
  if (ORG_KEYS.some(k   => n.includes(k))) return 'organization';
  if (PLACE_KEYS.some(k => n.includes(k))) return 'place';
  if (words.length >= 1 && words.length <= 3) {
    if (words.every(w => w.length > 0 && w[0] === w[0].toUpperCase() && !/^\d/.test(w))) return 'person';
  }
  return 'topic';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  person:       { label: '👤 Personas',       color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  organization: { label: '🏛 Organizaciones', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  place:        { label: '📍 Lugares',        color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
  topic:        { label: '🏷 Temas',          color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};

const TABS_TYPES = ['person', 'organization', 'place', 'topic'];

const COVERAGE_COLORS = {
  breaking:   '#b91c1c',
  growing:    '#92400e',
  monitoring: '#374151',
  cooling:    '#6b7280',
};

function scoreBar(score, maxScore) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: '#6366f1', borderRadius: 2 }} />
    </div>
  );
}

// ── Entity Profile Modal ──────────────────────────────────────────────────────

function EntityModal({ entityId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiJson(`/editorial/entities/${entityId}`, { auth: true })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [entityId]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
      }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando perfil…</div>
        ) : !data ? null : <EntityProfileContent data={data} onClose={onClose} />}
      </div>
    </div>
  );
}

function EntityProfileContent({ data, onClose }) {
  const { entity, articles_count, events_count, sources_count, related_entities, related_events } = data;
  const resolvedType = classifyEntity(entity.name, entity.entity_type);
  const meta = TYPE_META[resolvedType] || TYPE_META.topic;

  return (
    <>
      {/* Header */}
      <div style={{
        background: meta.bg, borderBottom: `2px solid ${meta.border}`,
        padding: '18px 22px', display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
          background: meta.color + '20', border: `2px solid ${meta.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>
          {meta.label.split(' ')[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase',
            letterSpacing: '.06em', marginBottom: 3 }}>{meta.label}</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>{entity.name}</h2>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
            <span>📰 {articles_count} artículos</span>
            <span>📋 {events_count} eventos</span>
            <span>📡 {sources_count} fuentes</span>
            <span>🔁 {entity.mention_count} menciones</span>
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 22, cursor: 'pointer' }}>
          &times;
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22 }}>

        {/* Related entities */}
        {related_entities.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 12 }}>
              🔗 Entidades relacionadas
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {related_entities.map((re, i) => {
                const rt = classifyEntity(re.name, re.entity_type);
                const rm = TYPE_META[rt] || TYPE_META.topic;
                return (
                  <div key={i} style={{
                    padding: '6px 11px', borderRadius: 8,
                    background: rm.bg, border: `1px solid ${rm.border}`,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{re.name}</span>
                    <span style={{ fontSize: 10, color: rm.color, fontWeight: 700,
                      background: rm.color + '20', padding: '1px 5px', borderRadius: 3 }}>
                      {re.strength_score | 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Related events */}
        {related_events.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 12 }}>
              📋 Eventos que la mencionan
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {related_events.map((ev, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #e5e7eb',
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#1d4ed8' }}>
                      {ev.editorial_score}
                    </span>
                    <span style={{ fontSize: 10, color: COVERAGE_COLORS[ev.coverage_status] || '#374151',
                      fontWeight: 700 }}>
                      {ev.coverage_status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>
                    {ev.headline}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {related_entities.length === 0 && related_events.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            Sin relaciones indexadas todavía. Ejecuta build_entity_relationships.mjs.
          </div>
        )}
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraph() {
  const [entities,  setEntities]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('topic');
  const [search,    setSearch]    = useState('');
  const [searchQ,   setSearchQ]   = useState('');
  const [modalId,   setModalId]   = useState(null);

  // Group all entities by resolved type
  const [grouped, setGrouped] = useState({ person: [], organization: [], place: [], topic: [] });
  const [maxScore, setMaxScore] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 100 });
    if (searchQ) params.set('q', searchQ);
    apiJson(`/editorial/entities/trending?${params}`, { auth: true })
      .then(rows => {
        setEntities(rows);
        // Group by resolved type
        const g = { person: [], organization: [], place: [], topic: [] };
        for (const e of rows) {
          const t = classifyEntity(e.name, e.entity_type);
          (g[t] = g[t] || []).push({ ...e, _type: t });
        }
        setGrouped(g);
        const top = Math.max(...rows.map(e => e.score), 1);
        setMaxScore(top);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [searchQ]);

  useEffect(() => { load(); }, [searchQ]);

  function handleSearch(e) {
    e.preventDefault();
    setSearchQ(search);
  }

  const currentGroup = grouped[activeTab] || [];
  const tabCounts = {
    person:       grouped.person?.length       || 0,
    organization: grouped.organization?.length || 0,
    place:        grouped.place?.length        || 0,
    topic:        grouped.topic?.length        || 0,
  };
  const totalEntities = entities.length;
  const totalRelations = '15.744'; // built in Sprint 8.6A

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: '1.8rem', letterSpacing: '-0.02em' }}>
          📌 Knowledge Graph
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          Motor de relaciones editoriales · {totalEntities} entidades activas · {totalRelations} relaciones
        </p>
      </div>

      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS_TYPES.map(t => {
          const meta = TYPE_META[t];
          return (
            <div key={t} style={{
              padding: '10px 16px', borderRadius: 12,
              background: meta.bg, border: `1px solid ${meta.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>{meta.label.split(' ')[0]}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: meta.color, lineHeight: 1 }}>
                  {tabCounts[t]}
                </div>
                <div style={{ fontSize: 10, color: meta.color, fontWeight: 600 }}>
                  {meta.label.split(' ').slice(1).join(' ')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + Tabs */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
        overflow: 'hidden', marginBottom: 0,
      }}>
        {/* Search bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, flex: 1 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar entidad…"
              style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            />
            <button type="submit"
              style={{ padding: '7px 14px', borderRadius: 8, background: '#6366f1', color: '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              Buscar
            </button>
            {searchQ && (
              <button type="button" onClick={() => { setSearch(''); setSearchQ(''); }}
                style={{ padding: '7px 10px', borderRadius: 8, background: '#f3f4f6',
                  border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 13 }}>
                ✕
              </button>
            )}
          </form>
        </div>

        {/* Type tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', padding: '0 14px', gap: 2 }}>
          {TABS_TYPES.map(t => {
            const meta = TYPE_META[t];
            return (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{
                  padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, fontWeight: activeTab === t ? 800 : 600,
                  color: activeTab === t ? meta.color : '#6b7280',
                  borderBottom: activeTab === t ? `2px solid ${meta.color}` : '2px solid transparent',
                  marginBottom: -2, whiteSpace: 'nowrap',
                }}>
                {meta.label} <span style={{ fontSize: 10, opacity: 0.7 }}>({tabCounts[t]})</span>
              </button>
            );
          })}
        </div>

        {/* Entity list */}
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando…</div>
          ) : currentGroup.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
              Sin entidades de este tipo{searchQ ? ` para "${searchQ}"` : ''}.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#', 'Entidad', 'Menciones', 'Artículos', 'Eventos', 'Score'].map((h, i) => (
                    <th key={i} style={{
                      padding: '8px 14px', textAlign: i <= 1 ? 'left' : 'center',
                      fontSize: 10, fontWeight: 700, color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '.05em',
                      borderBottom: '1px solid #e5e7eb',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentGroup.map((e, i) => {
                  const meta = TYPE_META[e._type] || TYPE_META.topic;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setModalId(e.id)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={ev => ev.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '9px 14px', fontSize: 12, color: '#9ca3af', width: 36 }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{e.name}</div>
                        {scoreBar(e.score, maxScore)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                        {e.mention_count}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
                        {e.articles_count}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
                        {e.events_count}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 800, fontSize: 13, color: meta.color,
                          background: meta.bg, padding: '2px 8px', borderRadius: 5,
                        }}>
                          {e.score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Entity profile modal */}
      {modalId && <EntityModal entityId={modalId} onClose={() => setModalId(null)} />}
    </div>
  );
}
