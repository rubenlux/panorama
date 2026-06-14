import { useState, useEffect, useCallback } from 'react';
import { apiJson, API_BASE, getToken } from '../api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)     return 'hace ' + s + 's';
  if (s < 3600)   return 'hace ' + Math.floor(s / 60) + 'min';
  if (s < 86400)  return 'hace ' + Math.floor(s / 3600) + 'h';
  if (s < 604800) return 'hace ' + Math.floor(s / 86400) + 'd';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function scoreColor(s) {
  if (s >= 70) return { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
  if (s >= 50) return { fg: '#92400e', bg: '#fffbeb', border: '#fde68a' };
  if (s >= 35) return { fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' };
  return { fg: '#374151', bg: '#f9fafb', border: '#e5e7eb' };
}

const COVERAGE_BADGE = {
  breaking:   { label: '🔴 Breaking',     color: '#b91c1c', bg: '#fef2f2' },
  growing:    { label: '📈 Creciendo',    color: '#92400e', bg: '#fffbeb' },
  monitoring: { label: '👁 Monitoreando', color: '#374151', bg: '#f3f4f6' },
  cooling:    { label: '❄ Enfriando',    color: '#6b7280', bg: '#f3f4f6' },
};

const OPP_TYPE_STYLE = {
  noticia:       { label: '📰 Noticia',       color: '#1d4ed8' },
  ultima_hora:   { label: '🔴 Última hora',   color: '#b91c1c' },
  cronica:       { label: '📝 Crónica',       color: '#7c3aed' },
  analisis:      { label: '🔍 Análisis',      color: '#065f46' },
  investigacion: { label: '🕵️ Investigación', color: '#92400e' },
  fact_check:    { label: '✅ Fact-check',    color: '#166534' },
  explicador:    { label: '💡 Explicador',    color: '#0e7490' },
  seo:           { label: '🔎 SEO',           color: '#6d28d9' },
  redes:         { label: '📱 Redes',         color: '#be185d' },
};

const ENTITY_TYPE_META = {
  person:       { label: '👤 Personas',       color: '#7c3aed', bg: '#f5f3ff' },
  organization: { label: '🏛 Organizaciones', color: '#1d4ed8', bg: '#eff6ff' },
  place:        { label: '📍 Lugares',        color: '#059669', bg: '#f0fdf4' },
  topic:        { label: '🏷 Temas',          color: '#d97706', bg: '#fffbeb' },
};

// ── FASE 1: Clasificación heurística de entidades ─────────────────────────────

const COMMON_NOUNS_ES = new Set([
  'caso', 'proyecto', 'plan', 'ley', 'decreto', 'resolución', 'resolucion',
  'presupuesto', 'economía', 'economia', 'inflación', 'inflacion',
  'dólar', 'dolar', 'elecciones', 'elección', 'eleccion', 'crisis',
  'reforma', 'acuerdo', 'contrato', 'escándalo', 'escandalo',
  'investigación', 'investigacion', 'denuncia', 'causa', 'juicio',
  'operativo', 'allanamiento', 'situación', 'situacion', 'medida',
  'política', 'politica', 'régimen', 'regimen', 'sistema',
]);

const ORG_KEYS = [
  'ministerio', 'secretaría', 'secretaria', 'federal', 'nacional', 'provincial',
  'municipal', 'gobierno', 'partido', 'policía', 'policia', 'fuerza', 'banco',
  'empresa', 'tribunal', 'juzgado', 'cámara', 'camara', 'senado', 'congreso',
  'parlamento', 'corte', 'fiscalía', 'fiscalia', 'defensoría', 'defensoria',
  'instituto', 'universidad', 'facultad', 'sindicato', 'asociación', 'asociacion',
  'fundación', 'fundacion', ' s.a.', ' ltda', ' corp', ' inc.',
];

const PLACE_KEYS = [
  'argentina', 'buenos aires', 'córdoba', 'cordoba', 'rosario', 'mendoza',
  'santa fe', 'tucumán', 'tucuman', 'salta', 'jujuy', 'misiones', 'corrientes',
  'chaco', 'formosa', 'catamarca', 'la rioja', 'san juan', 'san luis',
  'neuquén', 'neuquen', 'río negro', 'rio negro', 'chubut', 'santa cruz',
  'tierra del fuego', 'la pampa', 'caba', 'ciudad autónoma', 'ciudad autonoma',
  'ciudad', 'provincia', 'municipio', 'barrio', 'calle', 'avenida', 'plaza',
  'estados unidos', 'brasil', 'chile', 'uruguay', 'paraguay', 'bolivia',
  'perú', 'peru', 'colombia', 'venezuela', 'méxico', 'mexico', 'europa',
];

function classifyEntityByName(name = '') {
  if (!name) return 'topic';
  const n = name.toLowerCase().trim();

  // $ o # = cripto / hashtag
  if (name.startsWith('$') || name.startsWith('#')) return 'topic';

  // Todo en mayúsculas = acrónimo / ticker
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && name === name.toUpperCase() && name.length >= 2) return 'topic';

  // Sustantivo común en español
  if (COMMON_NOUNS_ES.has(n)) return 'topic';

  // Organización
  if (ORG_KEYS.some(k => n.includes(k))) return 'organization';

  // Lugar
  if (PLACE_KEYS.some(k => n.includes(k))) return 'place';

  // 1-3 palabras con mayúscula inicial = persona
  if (words.length >= 1 && words.length <= 3) {
    const allProper = words.every(w => w.length > 0 && w[0] === w[0].toUpperCase() && !/^\d/.test(w));
    if (allProper) return 'person';
  }

  return 'topic';
}

function resolveEntityType(dbType, name) {
  if (dbType && dbType !== 'unknown') return dbType;
  return classifyEntityByName(name);
}

// ── FASE 3: Deduplicación de oportunidades ────────────────────────────────────

function normalizeTitle(t = '') {
  return t.toLowerCase().replace(/[^\wáéíóúüñ\s]/gi, '').replace(/\s+/g, ' ').trim();
}

function wordJaccard(a, b) {
  const stopWords = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'en', 'un', 'una', 'y', 'o', 'que', 'se', 'con', 'por', 'para']);
  const setA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 3 && !stopWords.has(w)));
  const setB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 3 && !stopWords.has(w)));
  if (setA.size === 0 && setB.size === 0) return 1;
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

function deduplicateOpportunities(opps) {
  const scoreOf = o => parseFloat(o.seo_value || o.composite_score || o.traffic_score || 0);
  const sorted  = [...opps].sort((a, b) => scoreOf(b) - scoreOf(a));
  const keep = [];
  const dropped = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (dropped.has(i)) continue;
    keep.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (dropped.has(j)) continue;
      if (wordJaccard(sorted[i].title, sorted[j].title) >= 0.5) dropped.add(j);
    }
  }
  return keep;
}

// ── FASE 2: Preguntas abiertas contextuales ───────────────────────────────────

function deriveOpenQuestions(event, timeline, entities, media) {
  const qs = [];
  const people = entities.filter(e => e._resolved_type === 'person');
  const places = entities.filter(e => e._resolved_type === 'place');
  const orgs   = entities.filter(e => e._resolved_type === 'organization');
  const hoursAgo = (Date.now() - new Date(event.last_updated_at || event.first_detected_at)) / 3_600_000;

  // Solo preguntar lo que realmente falta
  if (people.length === 0) {
    qs.push('No se identificaron personas. ¿Quiénes son los responsables o protagonistas directos?');
  } else if (people.length === 1) {
    qs.push(`Solo aparece ${people[0].name}. ¿Hay otros actores involucrados no mencionados?`);
  }

  if (places.length === 0 && orgs.length === 0) {
    qs.push('Sin referencias geográficas ni institucionales. ¿Qué jurisdicción tiene competencia?');
  }

  if (media.length <= 2) {
    qs.push(`Solo ${media.length || 'ningún'} medio cubrió el evento. ¿Hay acceso restringido, desinterés editorial o censura?`);
  } else if (media.length <= 5 && event.importance_score > 60) {
    qs.push('Evento de alta importancia con cobertura escasa. ¿Existen presiones institucionales sobre los medios?');
  }

  if (hoursAgo > 72 && timeline.length > 0) {
    qs.push(`Sin novedades en ${Math.round(hoursAgo / 24)} días. ¿Cuál es el estado actual del caso?`);
  }

  if (timeline.length < 3) {
    qs.push('Documentación escasa. ¿Existen comunicados oficiales, documentos judiciales o fuentes primarias sin indexar?');
  }

  if (orgs.length === 0 && (people.length > 0 || timeline.length > 0)) {
    qs.push('Sin organismos identificados. ¿Qué instituciones tienen competencia o responsabilidad en este caso?');
  }

  if (event.coverage_status === 'growing' && timeline.length > 10) {
    qs.push('Evento en expansión con múltiples versiones. ¿Cuál es la narrativa dominante y qué voces están ausentes?');
  }

  return qs.slice(0, 4);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = '#374151', sub }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 18px',
      border: '1px solid #e5e7eb', flex: '1 1 120px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event, onClick }) {
  const sc = scoreColor(event.editorial_score);
  const cb = COVERAGE_BADGE[event.coverage_status] || COVERAGE_BADGE.monitoring;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 14, padding: '14px 16px',
        background: '#fff', borderRadius: 12,
        border: '1px solid #e5e7eb', cursor: 'pointer', marginBottom: 8,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: sc.bg, border: `2px solid ${sc.border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: sc.fg, lineHeight: 1 }}>{event.editorial_score}</div>
        <div style={{ fontSize: 8, color: sc.fg, opacity: 0.7, fontWeight: 700 }}>ED</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.35, flex: 1 }}>{event.headline}</h3>
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 7px',
            borderRadius: 5, background: cb.bg, color: cb.color }}>{cb.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
          <span>📰 {event.article_count}</span>
          <span>📡 {event.source_count} fuentes</span>
          {event.entity_count > 0 && <span>👥 {event.entity_count}</span>}
          {event.opportunity_count > 0 && (
            <span style={{ color: '#1d4ed8', fontWeight: 700 }}>🎯 {event.opportunity_count}</span>
          )}
          <span style={{ marginLeft: 'auto' }}>{timeAgo(event.last_updated_at)}</span>
        </div>
      </div>
      <div style={{ color: '#d1d5db', fontSize: 18, flexShrink: 0, alignSelf: 'center' }}>›</div>
    </div>
  );
}

// ── Dossier modal ─────────────────────────────────────────────────────────────

function DossierModal({ eventId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('cronologia');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setLoading(true); setTab('cronologia');
    apiJson(`/editorial-dossiers/${eventId}`, { auth: true })
      .then(d => {
        // FASE 1: resolver tipo de entidad para cada item
        if (d.entities) {
          d.entities = d.entities.map(e => ({
            ...e,
            _resolved_type: resolveEntityType(e.entity_type, e.name),
          }));
        }
        setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handlePdf() {
    setPdfLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/editorial-dossiers/${eventId}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('PDF error ' + res.status);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `dossier-${eventId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al generar PDF: ' + e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  const TABS = [
    { key: 'cronologia',    label: '📅 Cronología' },
    { key: 'participantes', label: '👥 Participantes' },
    { key: 'cobertura',     label: '📺 Cobertura' },
    { key: 'oportunidades', label: '🎯 Oportunidades' },
    { key: 'relacionados',  label: '🔗 Relacionados' },
  ];

  // ── FASE 5: Scroll único ─────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#f8fafc', borderRadius: 18, width: '100%', maxWidth: 900,
        height: '92vh',            /* altura fija */
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',        /* el scroll está solo dentro del contenido */
        boxShadow: '0 28px 60px rgba(0,0,0,0.25)',
      }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando dossier…</div>
        ) : !data ? null : (
          <DossierContent
            data={data} tab={tab} setTab={setTab} tabs={TABS}
            onClose={onClose} onPdf={handlePdf} pdfLoading={pdfLoading}
          />
        )}
      </div>
    </div>
  );
}

// Separar el contenido para mantener DossierModal limpio
function DossierContent({ data, tab, setTab, tabs, onClose, onPdf, pdfLoading }) {
  const { event, timeline, entities, media, opportunities, story_opportunities } = data;
  const sc = scoreColor(event.editorial_score);
  const cb = COVERAGE_BADGE[event.coverage_status] || COVERAGE_BADGE.monitoring;

  // FASE 3: deduplicar oportunidades
  const rawOpps = [
    ...opportunities.map(o => ({ ...o, _src: 'event' })),
    ...story_opportunities.filter(so => !opportunities.find(o => o.title === so.title)).map(so => ({ ...so, _src: 'story' })),
  ];
  const allOpps = deduplicateOpportunities(rawOpps);

  // FASE 2: preguntas contextuales
  const openQuestions = deriveOpenQuestions(event, timeline, entities, media);

  // FASE 1: agrupar por tipo resuelto
  const byType = {};
  for (const e of entities) {
    const t = e._resolved_type || 'topic';
    (byType[t] = byType[t] || []).push(e);
  }

  // FASE 4: calcular métricas de cobertura
  const totalArticles = media.reduce((s, m) => s + (m.article_count || 0), 0) || 1;
  const firstCoverageMedia = media.reduce((best, m) =>
    (!best || new Date(m.first_article) < new Date(best.first_article)) ? m : best, null);
  const lastCoverageMedia = media.reduce((best, m) =>
    (!best || new Date(m.last_article) > new Date(best.last_article)) ? m : best, null);

  return (
    <>
      {/* ── FASE 6: Header compacto ── */}
      <div style={{ background: '#0f172a', padding: '12px 18px', color: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {/* Badges + score */}
          <span style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            📋 Dossier
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: cb.bg, color: cb.color }}>
            {cb.label}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.fg }}>
            Score {event.editorial_score}
          </span>
          {/* Acciones al mismo nivel */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={onPdf}
              disabled={pdfLoading}
              style={{
                padding: '5px 12px', borderRadius: 7, border: '1px solid #334155',
                background: pdfLoading ? '#1e293b' : '#1e293b', color: pdfLoading ? '#64748b' : '#cbd5e1',
                cursor: pdfLoading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 11,
              }}>
              {pdfLoading ? '⏳ Generando…' : '📄 PDF'}
            </button>
            <button onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>
              &times;
            </button>
          </div>
        </div>

        {/* Título */}
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.3, color: '#f8fafc', marginBottom: 7 }}>
          {event.headline}
        </h2>

        {/* Stats compactas en una línea */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
          <span>📰 {event.article_count} artículos</span>
          <span>📡 {event.source_count} fuentes</span>
          <span>📖 {event.story_count} historias</span>
          <span>🕐 {fmtShortDate(event.first_detected_at)}</span>
          <span>🔄 {timeAgo(event.last_updated_at)}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '2px solid #e5e7eb', background: '#fff',
        padding: '0 18px', gap: 2, overflowX: 'auto', flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 800 : 600,
              color: tab === t.key ? '#1d4ed8' : '#6b7280',
              borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
              marginBottom: -2, whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── FASE 5: Único scroll, sólo aquí ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px' }}>

        {/* ── Cronología ── */}
        {tab === 'cronologia' && (
          <div>
            {/* Resumen del evento en esta pestaña (sacado del header) */}
            {event.summary && (
              <div style={{
                background: '#eff6ff', borderLeft: '3px solid #3b82f6', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e3a8a', lineHeight: 1.6,
              }}>
                {event.summary}
              </div>
            )}

            {/* FASE 2: Preguntas contextuales */}
            {openQuestions.length > 0 && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                padding: '12px 16px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#92400e', textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 8 }}>
                  ❓ Huecos informativos detectados
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {openQuestions.map((q, i) => (
                    <li key={i} style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 12 }}>
              {timeline.length} publicaciones · orden cronológico
            </div>

            {timeline.map((a, i) => {
              const isFirst = i === 0;
              const isLast  = i === timeline.length - 1;
              const prevTs  = i > 0 ? new Date(timeline[i - 1].ts) : null;
              const diffMin = prevTs ? Math.round((new Date(a.ts) - prevTs) / 60_000) : null;
              return (
                <div key={a.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: isFirst ? '#1d4ed8' : isLast ? '#059669' : '#e5e7eb',
                      color: (isFirst || isLast) ? '#fff' : '#6b7280',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 11,
                    }}>{i + 1}</div>
                    {i < timeline.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 16, background: '#e5e7eb', marginTop: 3 }} />
                    )}
                  </div>
                  <div style={{
                    flex: 1, background: '#fff', borderRadius: 9,
                    border: `1px solid ${isFirst ? '#bfdbfe' : isLast ? '#a7f3d0' : '#e5e7eb'}`,
                    padding: '10px 13px',
                  }}>
                    {diffMin !== null && diffMin > 60 && (
                      <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginBottom: 3 }}>
                        +{diffMin >= 1440 ? Math.round(diffMin / 1440) + 'd' : Math.round(diffMin / 60) + 'h'} después
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff',
                        padding: '1px 5px', borderRadius: 3 }}>{a.source_name}</span>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{fmtDate(a.ts)}</span>
                      {isFirst && <span style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '1px 5px', borderRadius: 3 }}>PRIMERO</span>}
                      {isLast  && <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 5px', borderRadius: 3 }}>ÚLTIMO</span>}
                    </div>
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration: 'none', color: '#111827', fontWeight: 700, fontSize: 13,
                        lineHeight: 1.3, display: 'block', marginBottom: a.summary ? 4 : 0 }}>
                      {a.title}
                    </a>
                    {a.summary && (
                      <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {a.summary}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {timeline.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Sin artículos vinculados.</div>
            )}
          </div>
        )}

        {/* ── FASE 1: Participantes (clasificación heurística) ── */}
        {tab === 'participantes' && (
          <div>
            {entities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                No se detectaron entidades para este evento.
              </div>
            ) : (
              <>
                {['person', 'organization', 'place', 'topic'].map(type => {
                  const group = (byType[type] || []);
                  if (group.length === 0) return null;
                  const meta = ENTITY_TYPE_META[type];
                  return (
                    <div key={type} style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: meta.color,
                        textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                        {meta.label}
                        <span style={{ marginLeft: 8, fontWeight: 500, color: '#9ca3af', fontSize: 10 }}>
                          ({group.length})
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {group.map((e, i) => {
                          const mentions = e.story_mentions || e.mention_count || 0;
                          return (
                            <div key={i} style={{
                              padding: '7px 12px', borderRadius: 9,
                              background: meta.bg, border: `1px solid ${meta.color}25`,
                              display: 'flex', alignItems: 'center', gap: 7,
                            }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{e.name}</span>
                              {mentions > 0 && (
                                <span style={{ fontSize: 10, color: meta.color, fontWeight: 800,
                                  background: meta.color + '20', padding: '1px 5px', borderRadius: 4,
                                  minWidth: 18, textAlign: 'center' }}>
                                  {mentions}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Tipos no reconocidos residuales */}
                {Object.entries(byType)
                  .filter(([t]) => !ENTITY_TYPE_META[t])
                  .map(([type, group]) => (
                    <div key={type} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                        🏷 {type} ({group.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {group.map((e, i) => (
                          <span key={i} style={{ padding: '5px 10px', borderRadius: 7,
                            background: '#f3f4f6', border: '1px solid #e5e7eb',
                            fontSize: 12, fontWeight: 600 }}>{e.name}</span>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </>
            )}
          </div>
        )}

        {/* ── FASE 4: Cobertura enriquecida ── */}
        {tab === 'cobertura' && (
          <div>
            {/* Resumen de cobertura */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              {firstCoverageMedia && (
                <div style={{ flex: 1, minWidth: 140, background: '#f0fdf4', border: '1px solid #a7f3d0',
                  borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 3 }}>
                    🏁 Primer medio
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{firstCoverageMedia.source_name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtShortDate(firstCoverageMedia.first_article)}</div>
                </div>
              )}
              {lastCoverageMedia && (
                <div style={{ flex: 1, minWidth: 140, background: '#eff6ff', border: '1px solid #bfdbfe',
                  borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: 3 }}>
                    🔄 Último en cubrir
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{lastCoverageMedia.source_name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtShortDate(lastCoverageMedia.last_article)}</div>
                </div>
              )}
              {firstCoverageMedia && lastCoverageMedia && firstCoverageMedia.first_article && lastCoverageMedia.last_article && (() => {
                const span = (new Date(lastCoverageMedia.last_article) - new Date(firstCoverageMedia.first_article)) / 3_600_000;
                return (
                  <div style={{ flex: 1, minWidth: 140, background: '#fefce8', border: '1px solid #fde68a',
                    borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', marginBottom: 3 }}>
                      ⏱ Velocidad
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {span < 1 ? `${Math.round(span * 60)}min` : span < 48 ? `${Math.round(span)}h` : `${Math.round(span / 24)}d`}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>de 1.ª a última cobertura</div>
                  </div>
                );
              })()}
            </div>

            {/* Ranking de medios */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 12 }}>
              {media.length} medios · {totalArticles} artículos totales
            </div>
            {media.map((m, i) => {
              const pct = Math.round((m.article_count / totalArticles) * 100);
              const isFirst = m.source_name === firstCoverageMedia?.source_name;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                  borderBottom: i < media.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}>
                  <div style={{ width: 26, textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                    #{i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{m.source_name}</span>
                      {isFirst && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#059669',
                          background: '#d1fae5', padding: '1px 6px', borderRadius: 4 }}>
                          🏁 PRIMERO
                        </span>
                      )}
                      {m.trust_score && (
                        <span style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>
                          ★ {parseFloat(m.trust_score).toFixed(1)}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                        {pct}% del total
                      </span>
                    </div>
                    <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? '#1d4ed8' : '#93c5fd', borderRadius: 3 }} />
                    </div>
                    {(m.first_article || m.last_article) && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                        {m.first_article && `desde ${fmtShortDate(m.first_article)}`}
                        {m.last_article && m.first_article && m.last_article !== m.first_article && ` → ${fmtShortDate(m.last_article)}`}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, color: '#1d4ed8', width: 30, textAlign: 'right' }}>
                    {m.article_count}
                  </div>
                </div>
              );
            })}
            {media.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Sin datos de cobertura.</div>
            )}
          </div>
        )}

        {/* ── FASE 3: Oportunidades deduplicadas ── */}
        {tab === 'oportunidades' && (
          <div>
            {allOpps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
                Sin oportunidades editoriales detectadas.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 14 }}>
                  {allOpps.length} ángulos · {rawOpps.length - allOpps.length > 0 && (
                    <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none' }}>
                      ({rawOpps.length - allOpps.length} duplicados eliminados)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {allOpps.map((opp, i) => {
                    const ts = OPP_TYPE_STYLE[opp.type || opp.opportunity_type] || { label: opp.type || opp.opportunity_type || '📌 Editorial', color: '#374151' };
                    return (
                      <div key={i} style={{
                        background: '#fff', borderRadius: 11, padding: '14px 16px',
                        border: '1px solid #e5e7eb', borderLeft: `4px solid ${ts.color}`,
                      }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: ts.color,
                            background: ts.color + '15', padding: '2px 7px', borderRadius: 4 }}>
                            {ts.label}
                          </span>
                          {opp.traffic_potential && (
                            <span style={{ fontSize: 10, color: '#059669', fontWeight: 700,
                              background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>
                              📈 {opp.traffic_potential}
                            </span>
                          )}
                          {opp.difficulty && (
                            <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                              🎯 {opp.difficulty}
                            </span>
                          )}
                          {(opp.seo_value > 0) && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#1d4ed8' }}>
                              SEO {opp.seo_value}/10
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.35, marginBottom: 5 }}>
                          {opp.title}
                        </div>
                        {(opp.reason || opp.description) && (
                          <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                            {opp.reason || opp.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Sprint 8.6A: Eventos relacionados ── */}
        {tab === 'relacionados' && (
          <RelatedEventsTab eventId={event.id} />
        )}
      </div>
    </>
  );
}

function RelatedEventsTab({ eventId }) {
  const [related, setRelated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson(`/editorial/events/${eventId}/related`, { auth: true })
      .then(setRelated).catch(console.error).finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Buscando eventos relacionados…</div>;
  if (!related || related.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
        Sin eventos relacionados detectados.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: 14 }}>
        {related.length} eventos con entidades compartidas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {related.map((ev, i) => {
          const cb = COVERAGE_BADGE[ev.coverage_status] || COVERAGE_BADGE.monitoring;
          return (
            <div key={ev.event_id} style={{
              background: '#fff', borderRadius: 11, padding: '13px 16px',
              border: '1px solid #e5e7eb',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 15, color: '#1d4ed8' }}>
                  #{i + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                  background: '#f3f4f6', padding: '2px 7px', borderRadius: 4 }}>
                  {cb.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8',
                  background: '#eff6ff', padding: '2px 7px', borderRadius: 4 }}>
                  ED {ev.editorial_score}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                  color: '#059669' }}>
                  score {ev.score}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.4, marginBottom: 5 }}>
                {ev.title}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
                <span>👥 {ev.shared_entities} entidades compartidas</span>
                <span>📡 {ev.shared_sources} fuentes compartidas</span>
                <span>📰 {ev.article_count} artículos</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditorialDossierPage() {
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [stats,    setStats]    = useState(null);
  const [offset,   setOffset]   = useState(0);
  const [status,   setStatus]   = useState('active');
  const [minScore, setMinScore] = useState(0);
  const [q,        setQ]        = useState('');
  const [search,   setSearch]   = useState('');
  const [modalId,  setModalId]  = useState(null);
  const LIMIT = 20;

  const load = useCallback((reset = false, currentOffset = 0) => {
    const off = reset ? 0 : currentOffset;
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, offset: off });
    if (status)      params.set('status',    status);
    if (minScore > 0) params.set('min_score', minScore);
    if (q)           params.set('q',         q);
    apiJson(`/editorial-dossiers?${params}`, { auth: true })
      .then(d => {
        setItems(reset ? d.items : prev => [...prev, ...d.items]);
        setTotal(d.total);
        setOffset(off + LIMIT);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, minScore, q]);

  useEffect(() => { load(true, 0); }, [status, minScore, q]);

  useEffect(() => {
    apiJson('/editorial-dossiers/stats', { auth: true }).then(setStats).catch(() => {});
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    setQ(search);
    setOffset(0);
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: '1.8rem', letterSpacing: '-0.02em' }}>
          📋 Inteligencia Editorial
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          Dossiers automáticos por evento · sin IA · basados en datos del monitor
        </p>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard label="Eventos totales"   value={stats.total_events}  />
          <StatCard label="Activos"           value={stats.active_events} color="#1d4ed8" />
          <StatCard label="Breaking"          value={stats.breaking}      color="#b91c1c" />
          <StatCard label="Creciendo"         value={stats.growing}       color="#92400e" />
          <StatCard label="Score ø"           value={stats.avg_score}     sub={`máx ${stats.max_score}`} />
          <StatCard label="Oportunidades"     value={stats.pending_opps}  color="#059669" sub="pendientes" />
        </div>
      )}

      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16, background: '#fff', borderRadius: 12,
        padding: '10px 14px', border: '1px solid #e5e7eb',
      }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="stale">Archivados</option>
        </select>

        <select value={minScore} onChange={e => { setMinScore(Number(e.target.value)); setOffset(0); }}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}>
          <option value={0}>Todo editorial score</option>
          <option value={50}>Score ≥ 50</option>
          <option value={60}>Score ≥ 60</option>
          <option value={70}>Score ≥ 70 (Alta prioridad)</option>
        </select>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento…"
            style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
          />
          <button type="submit"
            style={{ padding: '7px 14px', borderRadius: 8, background: '#1d4ed8', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            Buscar
          </button>
          {q && (
            <button type="button" onClick={() => { setQ(''); setSearch(''); setOffset(0); }}
              style={{ padding: '7px 10px', borderRadius: 8, background: '#f3f4f6',
                border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 13 }}>
              ✕
            </button>
          )}
        </form>

        <span style={{ fontSize: 12, color: '#9ca3af' }}>{total.toLocaleString('es-AR')} eventos</span>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>Cargando…
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>Sin eventos para los filtros seleccionados.
        </div>
      ) : (
        <>
          {items.map(ev => (
            <EventCard key={ev.id} event={ev} onClick={() => setModalId(ev.id)} />
          ))}
          {items.length < total && (
            <div style={{ textAlign: 'center', paddingTop: 16 }}>
              <button
                onClick={() => load(false, offset)}
                disabled={loading}
                style={{
                  padding: '10px 28px', borderRadius: 10,
                  background: loading ? '#f3f4f6' : '#1d4ed8',
                  color: loading ? '#9ca3af' : '#fff',
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 14,
                }}>
                {loading ? 'Cargando…' : `Ver más (${total - items.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}

      {modalId && <DossierModal eventId={modalId} onClose={() => setModalId(null)} />}
    </div>
  );
}
