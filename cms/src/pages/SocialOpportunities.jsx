import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiJson, getToken } from '../api.js';

function getCurrentUserRole() {
  try {
    const token = getToken();
    if (!token) return 'reader';
    return jwtDecode(token).role || 'reader';
  } catch { return 'reader'; }
}

// Sprint 8.7B: Playwright UI provider confirmed working — transcripts re-enabled.
const TRANSCRIPTS_ENABLED = true;

// ── Constants ─────────────────────────────────────────────────────────────────

const OPP_STYLE = {
  MUY_ALTA: { emoji: '🔥', label: 'Muy alta',  color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  MEDIA:    { emoji: '🟡', label: 'Media',      color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  BAJA:     { emoji: '🟢', label: 'Baja',       color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
};

const GAP_LABELS = {
  high:   { label: 'Sin cobertura',  color: '#dc2626' },
  medium: { label: 'Cob. parcial',   color: '#d97706' },
  low:    { label: 'Cubierto',       color: '#059669' },
};

const PLATFORM_META = {
  youtube:   { label: 'YT', color: '#dc2626', bg: '#fee2e2' },
  instagram: { label: 'IG', color: '#7c3aed', bg: '#ede9fe' },
  facebook:  { label: 'FB', color: '#1d4ed8', bg: '#dbeafe' },
  x:         { label: 'X',  color: '#111827', bg: '#f3f4f6' },
  tiktok:    { label: 'TK', color: '#be123c', bg: '#ffe4e6' },
};

const REGION_LABELS = {
  nacional: 'Nacional', internacional: 'Internacional',
  formosa: 'Formosa', nea: 'NEA', noa: 'NOA',
  cuyo: 'Cuyo', patagonia: 'Patagonia', bsas: 'Buenos Aires',
};

// Editorial status: ⚪ sin transcript → 🔵 transcript → 🟢 analizado → 🟣 dossier
const EDITORIAL_STATUS = {
  none:      { dot: '⚪', label: 'Sin transcript',   color: '#9ca3af' },
  transcript:{ dot: '🔵', label: 'Transcript listo', color: '#3b82f6' },
  analyzed:  { dot: '🟢', label: 'Analizado',        color: '#059669' },
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

function gapLabel(gapScore) {
  if (gapScore >= 0.7) return GAP_LABELS.high;
  if (gapScore >= 0.35) return GAP_LABELS.medium;
  return GAP_LABELS.low;
}

function editorialStatus(transcripts, analysisCount) {
  if (analysisCount > 0) return EDITORIAL_STATUS.analyzed;
  if (transcripts > 0)   return EDITORIAL_STATUS.transcript;
  return EDITORIAL_STATUS.none;
}

// ── Shared UI components ──────────────────────────────────────────────────────

function PlatformBadge({ platform }) {
  const m = PLATFORM_META[platform] || { label: platform, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: accent || '#111827', lineHeight: 1.1 }}>{value}</span>
    </div>
  );
}

function ScoreRing({ score, tier }) {
  const s = OPP_STYLE[tier] || OPP_STYLE.BAJA;
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
      background: s.bg, border: `3px solid ${s.border}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{Math.round(score)}</div>
      <div style={{ fontSize: 9, color: s.color, opacity: 0.8, fontWeight: 600, marginTop: 1 }}>pts</div>
    </div>
  );
}

function Chips({ items, color }) {
  return (items || []).map((v, i) => (
    <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12,
      background: color + '20', color, fontWeight: 600, border: `1px solid ${color}40` }}>
      {v}
    </span>
  ));
}

// ── Daily Usage Bar (FASE 6) ──────────────────────────────────────────────────

function DailyUsageBar({ usage, onRefresh }) {
  if (!usage) return null;
  const tPct = Math.min((usage.transcripts.used / usage.transcripts.limit) * 100, 100);
  const aPct = Math.min((usage.ai_analyses.used / usage.ai_analyses.limit) * 100, 100);

  const barColor = (pct) => pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#059669';

  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '10px 16px', marginBottom: 14,
      display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Uso diario
      </span>

      {[
        { label: '🧠 Transcripts', u: usage.transcripts, pct: tPct },
        { label: '✨ Análisis IA', u: usage.ai_analyses, pct: aPct },
      ].map(({ label, u, pct }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#6b7280' }}>{label}</span>
          <div style={{ width: 80, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor(pct), borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontWeight: 700, color: barColor(pct) }}>
            {u.used} / {u.limit}
          </span>
        </div>
      ))}

      <button onClick={onRefresh}
        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: '2px 6px' }}
        title="Actualizar contadores">
        ↻
      </button>
    </div>
  );
}

// ── Opportunity Card (FASE 5: editorial status dot) ───────────────────────────

function OpportunityCard({ item, rank, onClick }) {
  const s  = OPP_STYLE[item.opportunity_tier] || OPP_STYLE.BAJA;
  const gl = gapLabel(parseFloat(item.gap_score));
  const platforms   = [...new Set(item.platforms   || [])].filter(Boolean);
  const sourceNames = (item.source_names || []).filter(Boolean).slice(0, 4);
  const transcripts = parseInt(item.transcripts_available || 0);
  const analyses    = parseInt(item.has_analysis_count    || 0);
  const status      = editorialStatus(transcripts, analyses);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 16, padding: '18px 20px',
        background: '#fff', borderRadius: 14,
        border: `1px solid ${item.opportunity_tier === 'MUY_ALTA' ? '#fecaca' : '#e5e7eb'}`,
        cursor: 'pointer', marginBottom: 10,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-start', paddingTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>#{rank}</span>
      </div>

      <ScoreRing score={item.opportunity_score} tier={item.opportunity_tier} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.35, flex: 1 }}>
            {item.title}
          </h3>
          <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
            {s.emoji} {s.label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
          <Metric label="Viral"      value={item.viral_score} accent="#1d4ed8" />
          <Metric label="Brecha"     value={`${Math.round((parseFloat(item.gap_score) || 0) * 100)}%`} accent={gl.color} />
          <Metric label="Engagement" value={formatEngagement(item.total_engagement)} accent="#059669" />
          <Metric label="Fuentes"    value={item.source_count} />
          <Metric label="Posts"      value={item.post_count} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Último:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{timeAgo(item.last_seen)}</span>
          </div>
        </div>

        {/* Bottom row: sources + editorial status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {platforms.map(p => <PlatformBadge key={p} platform={p} />)}
          {sourceNames.map((n, i) => (
            <span key={i} style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb',
              padding: '2px 7px', borderRadius: 4, border: '1px solid #e5e7eb' }}>
              {n}
            </span>
          ))}
          {(item.source_names || []).length > 4 && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>+{item.source_names.length - 4} más</span>
          )}
          {/* FASE 5: editorial status */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
            title={status.label}>
            <span style={{ fontSize: 16 }}>{status.dot}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: status.color }}>{status.label}</span>
          </span>
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: '#d1d5db', fontSize: 20 }}>›</div>
    </div>
  );
}

// ── Dossier Modal (FASE 4) ────────────────────────────────────────────────────

function DossierModal({ post, dossier, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 820,
        maxHeight: '93vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 28px 56px rgba(0,0,0,0.28)',
      }}>
        {/* Header */}
        <div style={{ background: '#0f172a', padding: '20px 24px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                📄 Dossier Ejecutivo
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3, color: '#f8fafc' }}>
                {dossier.titulo || post.title}
              </h2>
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                {post.source_name} · {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>Ver video ↗</a>}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 26, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
              &times;
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Resumen ejecutivo */}
          {dossier.resumen_ejecutivo && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Resumen ejecutivo</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#1e293b', background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                {dossier.resumen_ejecutivo}
              </p>
            </div>
          )}

          {/* Qué pasó */}
          {dossier.que_paso && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>¿Qué pasó?</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: '#374151', background: '#fafafa', borderRadius: 10, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                {dossier.que_paso}
              </p>
            </div>
          )}

          {/* Participantes + Cronología */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {(dossier.participantes || []).length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Participantes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {dossier.participantes.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>
                      <strong style={{ color: '#1e293b' }}>{p.nombre}</strong>
                      {p.rol && <span style={{ color: '#6b7280' }}> · {p.rol}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(dossier.cronologia || []).length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Cronología</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dossier.cronologia.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {e.momento && <span style={{ fontWeight: 700, color: '#374151' }}>{e.momento}: </span>}
                      <span style={{ color: '#4b5563' }}>{e.hecho}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Datos relevantes */}
          {(dossier.datos_relevantes || []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Datos relevantes</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {dossier.datos_relevantes.map((d, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Citas textuales */}
          {(dossier.citas_textuales || []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Citas textuales</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dossier.citas_textuales.map((c, i) => (
                  <blockquote key={i} style={{
                    margin: 0, padding: '10px 16px',
                    borderLeft: '3px solid #6366f1', background: '#fafafe',
                    borderRadius: '0 8px 8px 0', fontSize: 13, color: '#374151',
                    fontStyle: 'italic', lineHeight: 1.55,
                  }}>"{c}"</blockquote>
                ))}
              </div>
            </div>
          )}

          {/* Keywords + fuentes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {(dossier.keywords || []).length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Keywords</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {dossier.keywords.map((k, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(dossier.fuentes || []).length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Fuentes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {dossier.fuentes.map((f, i) => (
                    <span key={i} style={{ fontSize: 11, color: '#4b5563' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Analysis Modal (FASE 3 + FASE 4) ─────────────────────────────────────────

function AnalysisModal({ post, onClose, onUsageChange }) {
  const [analysis,         setAnalysis]         = useState(null);
  const [transcript,       setTranscript]       = useState(null);
  const [loadingAnalysis,  setLoadingAnalysis]  = useState(true);
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  const [dossier,          setDossier]          = useState(null);
  const [generatingDossier, setGeneratingDossier] = useState(false);
  const [showTranscript,   setShowTranscript]   = useState(false);
  const [error,            setError]            = useState('');

  useEffect(() => {
    setLoadingAnalysis(true);
    apiJson(`/social/posts/${post.id}/analysis`, { auth: true })
      .then(d => setAnalysis(d))
      .catch(() => setAnalysis(null))
      .finally(() => setLoadingAnalysis(false));

    apiJson(`/social/posts/${post.id}/transcript`, { auth: true })
      .then(d => setTranscript(d))
      .catch(() => setTranscript(null));
  }, [post.id]);

  async function handleAnalyze() {
    setError('');
    setGeneratingAnalysis(true);
    try {
      const d = await apiJson(`/social/posts/${post.id}/analyze`, { method: 'POST', auth: true });
      setAnalysis(d.analysis);
      if (d.usage) onUsageChange?.();
    } catch (e) {
      const msg = e.message || 'Error desconocido';
      setError(msg.includes('Límite') ? msg : `Error generando análisis: ${msg}`);
    } finally { setGeneratingAnalysis(false); }
  }

  async function handleDossier() {
    setError('');
    setGeneratingDossier(true);
    setDossier(null);
    try {
      const d = await apiJson(`/social/posts/${post.id}/dossier`, { method: 'POST', auth: true });
      setDossier(d.dossier);
    } catch (e) {
      setError(`Error generando dossier: ${e.message}`);
    } finally { setGeneratingDossier(false); }
  }

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  🧠 Análisis de Contenido
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3, maxWidth: 580 }}>
                  {post.title}
                </h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{post.source_name}</span>
                  {transcript && (
                    <span style={{ fontSize: 11, color: '#059669', fontWeight: 700, background: '#d1fae5', padding: '2px 7px', borderRadius: 5 }}>
                      ✓ Transcript · {transcript.word_count?.toLocaleString()} palabras · Q{transcript.quality_score}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose}
                style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>
                &times;
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {/* Analizar — disabled while transcript provider is in maintenance */}
              {TRANSCRIPTS_ENABLED ? (
                <button onClick={handleAnalyze} disabled={generatingAnalysis}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    cursor: generatingAnalysis ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: 13, background: '#6366f1', color: '#fff',
                    opacity: generatingAnalysis ? 0.7 : 1,
                  }}>
                  {generatingAnalysis ? '⏳ Analizando…' : analysis ? '↻ Re-analizar' : '🧠 Analizar contenido'}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6',
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 600 }}>
                  🔧 Transcripts temporalmente en mantenimiento
                </span>
              )}

              {/* Dossier — disabled while transcript provider is in maintenance */}
              {TRANSCRIPTS_ENABLED && (
                <button onClick={handleDossier}
                  disabled={generatingDossier || !analysis}
                  title={!analysis ? 'Primero analizá el contenido' : 'Generar dossier ejecutivo'}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: analysis ? '1px solid #6366f1' : '1px solid #d1d5db',
                    cursor: (generatingDossier || !analysis) ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: 13,
                    background: analysis ? '#eff6ff' : '#f9fafb',
                    color: analysis ? '#3730a3' : '#9ca3af',
                    opacity: generatingDossier ? 0.7 : 1,
                  }}>
                  {generatingDossier ? '⏳ Generando…' : '📄 Generar dossier'}
                </button>
              )}

              {post.url && (
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                    textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 5 }}>
                  ↗ Ver video
                </a>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                {error}
              </div>
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {loadingAnalysis ? (
              <div style={{ color: '#9ca3af', fontSize: 13, padding: '20px 0' }}>Cargando análisis…</div>
            ) : analysis ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {analysis.editorial_type && (
                  <div style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                      background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                      {analysis.editorial_type}
                    </span>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Resumen ejecutivo
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#374151',
                    background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    {analysis.summary}
                  </p>
                </div>

                {(analysis.key_points || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Puntos clave
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {analysis.key_points.map((p, i) => (
                        <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  {[
                    { label: 'Personas',       data: analysis.entities_people, color: '#7c3aed' },
                    { label: 'Organizaciones', data: analysis.entities_orgs,   color: '#1d4ed8' },
                    { label: 'Lugares',        data: analysis.entities_places, color: '#059669' },
                  ].map(({ label, data, color }) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        {label}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(data || []).length > 0
                          ? <Chips items={data} color={color} />
                          : <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Temas</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}><Chips items={analysis.main_topics} color="#d97706" /></div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Keywords</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}><Chips items={analysis.keywords} color="#0891b2" /></div>
                  </div>
                </div>

                {(analysis.quotes || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Citas</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {analysis.quotes.map((q, i) => (
                        <blockquote key={i} style={{
                          margin: 0, padding: '10px 16px',
                          borderLeft: '3px solid #6366f1', background: '#fafafe',
                          borderRadius: '0 8px 8px 0', fontSize: 13, color: '#374151',
                          fontStyle: 'italic', lineHeight: 1.55,
                        }}>"{q}"</blockquote>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  Generado: {new Date(analysis.generated_at).toLocaleString('es-AR')}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🧠</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin análisis todavía</div>
                <div style={{ fontSize: 13, maxWidth: 340, margin: '0 auto' }}>
                  Hacé click en "Analizar contenido" para extraer entidades, resumen y puntos clave del transcript.
                </div>
              </div>
            )}

            {/* Transcript viewer */}
            {transcript?.transcript_text && (
              <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <button onClick={() => setShowTranscript(v => !v)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#6b7280', padding: 0 }}>
                  {showTranscript ? '▲ Ocultar transcript' : '▼ Ver transcript completo'}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }}>
                    ({transcript.word_count?.toLocaleString()} palabras · {transcript.transcript_language?.toUpperCase()})
                  </span>
                </button>
                {showTranscript && (
                  <div style={{
                    marginTop: 12, background: '#f8fafc', borderRadius: 10, padding: '14px 16px',
                    fontSize: 12, lineHeight: 1.7, color: '#4b5563', whiteSpace: 'pre-wrap',
                    maxHeight: 400, overflowY: 'auto', border: '1px solid #e5e7eb', fontFamily: 'monospace',
                  }}>
                    {transcript.transcript_text}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FASE 4: Nested Dossier Modal */}
      {dossier && (
        <DossierModal
          post={post}
          dossier={dossier}
          onClose={() => setDossier(null)}
        />
      )}
    </>
  );
}

// ── Timeline Modal (FASE 1: transcript on-demand) ─────────────────────────────

function TimelineModal({ cluster, platform = '', onClose, onUsageChange, isAdmin = false }) {
  const [posts,    setPosts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [analysisPost, setAnalysisPost] = useState(null);

  // Per-post transcript fetch state: null | 'loading' | 'error' | 'no_captions' | 'limit'
  const [txState,   setTxState]   = useState({});
  const [txMessage, setTxMessage] = useState({});

  useEffect(() => {
    setLoading(true);
    const qs = platform ? `?platform=${encodeURIComponent(platform)}` : '';
    apiJson(`/social/clusters/${cluster.id}/posts${qs}`, { auth: true })
      .then(d => setPosts(d.items || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [cluster.id, platform]);

  async function handleFetchTranscript(post) {
    setTxState(prev  => ({ ...prev, [post.id]: 'loading' }));
    setTxMessage(prev => ({ ...prev, [post.id]: '' }));
    try {
      const res = await apiJson(`/social/posts/${post.id}/transcript`, { method: 'POST', auth: true });
      if (res.ok) {
        setPosts(prev => prev.map(p =>
          p.id === post.id
            ? { ...p, transcript_available: true, transcript_fetched_at: new Date().toISOString() }
            : p
        ));
        setTxState(prev => ({ ...prev, [post.id]: 'done' }));
        onUsageChange?.();
      }
    } catch (e) {
      const msg = e.message || '';
      // Admins see the button again after a 429 (backend bypass handles it)
      const state = (!isAdmin && msg.includes('Límite')) ? 'limit' : msg.includes('captions') ? 'no_captions' : 'error';
      setTxState(prev   => ({ ...prev, [post.id]: state }));
      setTxMessage(prev => ({ ...prev, [post.id]: msg }));
    }
  }

  const s = OPP_STYLE[cluster.opportunity_tier] || OPP_STYLE.BAJA;
  const transcriptCount = posts.filter(p => p.transcript_available).length;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: '#f9fafb', borderRadius: 16, width: '100%', maxWidth: 760,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🎯 Oportunidad editorial
                  </span>
                  <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
                    {s.emoji} {s.label} · {Math.round(cluster.opportunity_score)} pts
                  </span>
                  {transcriptCount > 0
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 5 }}>
                        🔵 {transcriptCount} transcript{transcriptCount > 1 ? 's' : ''}
                      </span>
                    : !loading && (
                      <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 5 }}>
                        ⚪ sin transcripts
                      </span>
                    )
                  }
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
                  {cluster.title}
                </h2>
                <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Viral <strong style={{ color: '#1d4ed8' }}>{cluster.viral_score}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Brecha <strong style={{ color: gapLabel(parseFloat(cluster.gap_score)).color }}>
                      {Math.round((parseFloat(cluster.gap_score) || 0) * 100)}%
                    </strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Engagement <strong style={{ color: '#059669' }}>{formatEngagement(cluster.total_engagement)}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {cluster.source_count} {cluster.source_count === 1 ? 'fuente' : 'fuentes'} · {cluster.post_count} posts
                  </span>
                </div>
              </div>
              <button onClick={onClose}
                style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>
                &times;
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Cargando timeline…</div>
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Sin contenido capturado.</div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Timeline · {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}
                </div>
                {posts.map((p, i) => {
                  const isFirst   = i === 0;
                  const firstTime = posts[0].captured_at ? new Date(posts[0].captured_at) : null;
                  const thisTime  = p.captured_at ? new Date(p.captured_at) : null;
                  const diffMin   = firstTime && thisTime ? Math.round((thisTime - firstTime) / 60000) : null;

                  const isYTVideo = p.platform === 'youtube' && ['videos', 'shorts'].includes(p.content_type);
                  const hasTranscript = p.transcript_available === true;
                  const noCaption    = p.transcript_available === false;
                  const state = txState[p.id];

                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                      {/* Spine */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: isFirst ? '#2b5cff' : '#e5e7eb',
                          color: isFirst ? '#fff' : '#6b7280',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 13,
                        }}>
                          {i + 1}
                        </div>
                        {i < posts.length - 1 && (
                          <div style={{ width: 2, flex: 1, minHeight: 24, background: '#e5e7eb', marginTop: 4 }} />
                        )}
                      </div>

                      {/* Card */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer"
                          style={{
                            display: 'flex', gap: 14, background: '#fff', padding: 14,
                            borderRadius: 12, border: `1px solid ${isFirst ? '#bfdbfe' : '#e5e7eb'}`,
                            textDecoration: 'none', color: 'inherit',
                          }}>
                          {/* Thumbnail */}
                          <div style={{
                            width: 120, height: 68, background: '#e5e7eb', borderRadius: 7,
                            flexShrink: 0, overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {p.thumbnail_url
                              ? <img src={p.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              : <span style={{ fontSize: 22 }}>📝</span>}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                              <PlatformBadge platform={p.platform} />
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{p.source_name}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(p.captured_at)}</span>
                              {isFirst && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#2b5cff', background: '#eff6ff', padding: '2px 7px', borderRadius: 5 }}>
                                  PRIMERO
                                </span>
                              )}
                              {diffMin !== null && diffMin > 0 && (
                                <span style={{ fontSize: 10, color: '#9ca3af' }}>+{diffMin}min</span>
                              )}
                              {/* Transcript status badge */}
                              {hasTranscript && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>
                                  🔵 transcript
                                </span>
                              )}
                              {p.has_analysis && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: 4 }}>
                                  🟢 analizado
                                </span>
                              )}
                              {noCaption && (
                                <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                                  ✗ sin captions
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontWeight: 600, fontSize: 13, lineHeight: 1.35, marginBottom: 6,
                              overflow: 'hidden', display: '-webkit-box',
                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            }}>
                              {p.title}
                            </div>
                            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280' }}>
                              {Number(p.views) > 0 && <span style={{ color: '#1d4ed8', fontWeight: 700 }}>👀 {formatEngagement(p.views)}</span>}
                              {Number(p.likes) > 0 && <span>❤️ {formatEngagement(p.likes)}</span>}
                              <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>↗ Ver original</span>
                            </div>
                          </div>
                        </a>

                        {/* Transcript actions — disabled while provider is in maintenance */}
                        {isYTVideo && TRANSCRIPTS_ENABLED && !hasTranscript && !noCaption && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {state === 'loading' ? (
                              <button disabled style={{
                                alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                                border: '1px solid #d1d5db', background: '#f9fafb',
                                color: '#9ca3af', fontWeight: 700, fontSize: 12, cursor: 'not-allowed',
                              }}>⏳ Obteniendo transcript…</button>
                            ) : state === 'limit' && !isAdmin ? (
                              <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600, background: '#fffbeb',
                                padding: '5px 10px', borderRadius: 8, border: '1px solid #fde68a' }}>
                                ⚠️ Límite diario alcanzado
                              </span>
                            ) : state === 'error' ? (
                              <button onClick={e => { e.stopPropagation(); handleFetchTranscript(p); }}
                                style={{
                                  alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                                  border: '1px solid #fecaca', background: '#fef2f2',
                                  color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                }}>
                                🔴 Error — Reintentar
                              </button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); handleFetchTranscript(p); }}
                                style={{
                                  alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                                  border: '1px solid #bfdbfe', background: '#eff6ff',
                                  color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                }}>
                                🧠 Obtener transcript
                              </button>
                            )}
                            {txMessage[p.id] && state !== 'limit' && (
                              <span style={{ fontSize: 11, color: '#6b7280', maxWidth: 260, lineHeight: 1.3 }}>
                                {txMessage[p.id]}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Maintenance notice when provider is disabled */}
                        {isYTVideo && !TRANSCRIPTS_ENABLED && !hasTranscript && !noCaption && (
                          <span style={{
                            fontSize: 11, color: '#6b7280', background: '#f3f4f6',
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                            alignSelf: 'flex-start',
                          }}>
                            🔧 Transcripts temporalmente en mantenimiento
                          </span>
                        )}

                        {/* Analyze button — only when TRANSCRIPTS_ENABLED and transcript available */}
                        {hasTranscript && TRANSCRIPTS_ENABLED && (
                          <button
                            onClick={e => { e.stopPropagation(); setAnalysisPost(p); }}
                            style={{
                              alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                              border: '1px solid #c4b5fd', background: '#faf5ff',
                              color: '#7c3aed', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            }}>
                            🧠 {p.has_analysis ? 'Ver análisis / Dossier' : 'Analizar contenido'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nested analysis modal */}
      {analysisPost && (
        <AnalysisModal
          post={analysisPost}
          onClose={() => setAnalysisPost(null)}
          onUsageChange={onUsageChange}
        />
      )}
    </>
  );
}

// ── Summary Pills ─────────────────────────────────────────────────────────────

function SummaryPills({ summary, activeTier, onTierChange }) {
  const pills = [
    { value: '',         label: 'Todas',       count: summary.total    || 0, color: '#374151', bg: '#f3f4f6' },
    { value: 'MUY_ALTA', label: '🔥 Muy alta', count: summary.muy_alta || 0, color: '#b91c1c', bg: '#fef2f2' },
    { value: 'MEDIA',    label: '🟡 Media',    count: summary.media    || 0, color: '#92400e', bg: '#fffbeb' },
    { value: 'BAJA',     label: '🟢 Baja',     count: summary.baja     || 0, color: '#065f46', bg: '#f0fdf4' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {pills.map(({ value, label, count, color, bg }) => (
        <button key={value} onClick={() => onTierChange(value)}
          style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontWeight: activeTier === value ? 800 : 600, fontSize: 13,
            background: activeTier === value ? color : bg,
            color: activeTier === value ? '#fff' : color,
            outline: activeTier === value ? `2px solid ${color}` : 'none',
            transition: 'all 0.15s',
          }}>
          {label} <span style={{ opacity: 0.8 }}>({count})</span>
        </button>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SocialOpportunities() {
  const navigate = useNavigate();
  const isAdmin = getCurrentUserRole() === 'admin';
  const [data,       setData]       = useState({ items: [], summary: {} });
  const [loading,    setLoading]    = useState(true);
  const [hours,      setHours]      = useState(0);
  const [tier,       setTier]       = useState('');
  const [region,     setRegion]     = useState('');
  const [platform,   setPlatform]   = useState('');
  const [modal,      setModal]      = useState(null);
  const [dailyUsage, setDailyUsage] = useState(null);

  function fetchOpportunities() {
    setLoading(true);
    const params = new URLSearchParams();
    if (hours    > 0) params.set('hours',    hours);
    if (tier)         params.set('tier',     tier);
    if (region)       params.set('region',   region);
    if (platform)     params.set('platform', platform);
    const qs = params.toString() ? `?${params}` : '';
    apiJson(`/social/opportunities${qs}`, { auth: true })
      .then(setData)
      .catch(() => setData({ items: [], summary: {} }))
      .finally(() => setLoading(false));
  }

  function fetchDailyUsage() {
    apiJson('/social/transcripts/daily-usage', { auth: true })
      .then(setDailyUsage)
      .catch(() => {});
  }

  useEffect(() => { fetchOpportunities(); }, [hours, tier, region, platform]);
  useEffect(() => { fetchDailyUsage(); }, []);

  const { items, summary } = data;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <button onClick={() => navigate('/social')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 22, padding: '0 4px 0 0', lineHeight: 1 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.75rem' }}>🎯 Oportunidades Editoriales</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            Temas virales sin cobertura en el Monitor — transcripciones bajo demanda
          </p>
        </div>
        <button onClick={() => navigate('/social/sources')}
          style={{ padding: '7px 14px', borderRadius: 8, background: '#f3f4f6', color: '#374151',
            border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          ⚙ Fuentes
        </button>
      </div>

      {/* Context callout */}
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #fef2f2 100%)',
        border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 14,
        fontSize: 13, color: '#1e40af', lineHeight: 1.5,
      }}>
        <strong>Flujo editorial:</strong>{' '}
        Elegí una oportunidad → abrí el timeline → seleccioná el video más relevante →
        hacé click en <strong>🧠 Obtener transcript</strong> → luego <strong>🧠 Analizar contenido</strong> → luego <strong>📄 Generar dossier</strong>.
        Cada paso solo cuando lo necesitás.
      </div>

      {/* FASE 6: Daily usage bar */}
      <DailyUsageBar usage={dailyUsage} onRefresh={fetchDailyUsage} />

      {/* FASE 5: Editorial status legend */}
      <div style={{
        display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap',
        fontSize: 11, color: '#6b7280', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, color: '#374151' }}>Estado editorial:</span>
        {Object.values(EDITORIAL_STATUS).map(({ dot, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>{dot}</span> {label}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryPills summary={summary} activeTier={tier} onTierChange={setTier} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={platform} onChange={e => setPlatform(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}>
            <option value="">Todas las plataformas</option>
            <option value="youtube">YouTube</option>
            <option value="facebook">Facebook</option>
          </select>
          <select value={region} onChange={e => setRegion(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}>
            <option value="">Todas las regiones</option>
            {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}>
            <option value={0}>Todo el tiempo</option>
            <option value={24}>Últimas 24h</option>
            <option value={48}>Últimas 48h</option>
            <option value={168}>Última semana</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          Calculando oportunidades…
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151', fontSize: 16 }}>
            Sin oportunidades {tier ? `de tipo "${OPP_STYLE[tier]?.label}"` : ''}
          </div>
          <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            Las oportunidades aparecen cuando hay temas virales en redes sin cobertura editorial.
            Asegurate de que el worker esté corriendo.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
            {items.length} oportunidades · haz click para ver el timeline y obtener transcripts bajo demanda
          </div>
          {items.map((item, i) => (
            <OpportunityCard
              key={item.id}
              item={item}
              rank={i + 1}
              onClick={() => setModal(item)}
            />
          ))}
        </>
      )}

      {/* Modal */}
      {modal && (
        <TimelineModal
          cluster={modal}
          platform={platform}
          onClose={() => setModal(null)}
          onUsageChange={() => { fetchDailyUsage(); }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
