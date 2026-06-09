import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '../api.js';

const ANGLE_TYPE_CONFIG = {
  informativo:     { label: 'Informativo',    emoji: '📰', color: '#1d4ed8', bg: '#dbeafe' },
  analisis:        { label: 'Análisis',       emoji: '🔍', color: '#7c3aed', bg: '#ede9fe' },
  impacto_social:  { label: 'Impacto Social', emoji: '👥', color: '#065f46', bg: '#d1fae5' },
  economico:       { label: 'Económico',      emoji: '💼', color: '#92400e', bg: '#fef3c7' },
  tecnologico:     { label: 'Tecnológico',    emoji: '⚙️', color: '#0e7490', bg: '#cffafe' },
  politico:        { label: 'Político',       emoji: '🏛️', color: '#be123c', bg: '#ffe4e6' },
  cultural:        { label: 'Cultural',       emoji: '🎭', color: '#6d28d9', bg: '#f3e8ff' },
  default:         { label: 'Editorial',      emoji: '✍️', color: '#374151', bg: '#f3f4f6' },
};

export default function DossierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [generatingAngle, setGeneratingAngle] = useState(null); // angle_index
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiJson(`/editorial-workflow/dossiers/${id}`, { auth: true });
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll if still generating
  useEffect(() => {
    if (!data || data.dossier?.status !== 'generating') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);

  async function handleGenerateArticle(angleIndex) {
    setGeneratingAngle(angleIndex);
    try {
      const res = await apiJson(`/editorial-workflow/dossiers/${id}/draft`, {
        method: 'POST', auth: true,
        body: { angle_index: angleIndex },
      });

      const { draft, dossier_id, angle } = res;

      // Navigate to PostEditor with prefilled content
      navigate('/posts/new', {
        state: {
          prefilled: {
            volanta:     draft.volanta,
            title:       draft.title,
            excerpt:     draft.excerpt,
            body:        draft.body,
            seo: {
              meta_title:        draft.meta_title,
              meta_description:  draft.meta_description,
              og_title:          draft.og_title,
              og_description:    draft.og_description,
            },
            origin:      'dossier',
            dossier_id,
            _verification_notes: draft.verification_notes,
          },
          _angle: angle,
        },
      });
    } catch (e) {
      alert('Error al generar: ' + e.message);
    } finally {
      setGeneratingAngle(null);
    }
  }

  function copyPrompt() {
    if (data?.dossier?.hero_image_prompt) {
      navigator.clipboard.writeText(data.dossier.hero_image_prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Cargando dossier…</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Dossier no encontrado.</div>;

  const { dossier, drafts = [] } = data;

  if (dossier.status === 'generating') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Generando dossier editorial…</div>
        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Claude está analizando el brief de investigación.</div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: `pulse ${0.8 + i * 0.2}s infinite` }} />
          ))}
        </div>
      </div>
    );
  }

  if (dossier.status === 'failed') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Error al generar el dossier</div>
        <button onClick={() => navigate('/dossiers')} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer' }}>← Volver</button>
      </div>
    );
  }

  const angles = Array.isArray(dossier.suggested_angles) ? dossier.suggested_angles : [];
  const facts  = Array.isArray(dossier.verified_facts)   ? dossier.verified_facts   : [];
  const timeline = Array.isArray(dossier.timeline)       ? dossier.timeline         : [];
  const headlines = Array.isArray(dossier.suggested_headlines) ? dossier.suggested_headlines : [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/dossiers')}
          style={{ padding: '6px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
        >
          ← Dossiers
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{dossier.topic_title}</h1>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Dossier editorial · {dossier.created_at ? new Date(dossier.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
          </div>
        </div>
      </div>

      {/* Draft articles banner */}
      {drafts.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <strong>📄 {drafts.length} borrador{drafts.length > 1 ? 'es' : ''} generado{drafts.length > 1 ? 's' : ''}:</strong>{' '}
          {drafts.map(d => (
            <button
              key={d.id}
              onClick={() => navigate(`/posts/${d.slug}`)}
              style={{ marginLeft: 8, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>

        {/* Executive Summary */}
        <Card title="Resumen ejecutivo" emoji="📝">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#374151' }}>{dossier.executive_summary}</p>
        </Card>

        {/* Verified Facts + Timeline (2 col) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Hechos verificados" emoji="✅">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {facts.map((f, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4, color: '#374151' }}>{f}</li>)}
            </ul>
          </Card>
          <Card title="Timeline" emoji="🕐">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {timeline.map((t, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4, color: '#374151' }}>{t}</li>)}
            </ul>
          </Card>
        </div>

        {/* SEO & Metadata */}
        <Card title="Guía SEO" emoji="🔎">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Keywords</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(dossier.seo_keywords || []).map((k, i) => (
                  <span key={i} style={{ fontSize: 12, background: '#f3f4f6', padding: '3px 8px', borderRadius: 6, color: '#374151' }}>{k}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Categorías sugeridas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(dossier.suggested_categories || []).map((c, i) => (
                  <span key={i} style={{ fontSize: 12, background: '#ede9fe', color: '#7c3aed', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(dossier.suggested_tags || []).map((t, i) => (
                  <span key={i} style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', padding: '2px 6px', borderRadius: 6 }}>#{t}</span>
                ))}
              </div>
            </div>
          </div>
          {headlines.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Titulares sugeridos</div>
              {headlines.map((h, i) => (
                <div key={i} style={{ fontSize: 13, padding: '6px 10px', background: i === 0 ? '#eff6ff' : '#f9fafb', borderRadius: 6, marginBottom: 4, color: '#1e293b', fontWeight: i === 0 ? 600 : 400 }}>
                  {i === 0 && <span style={{ fontSize: 10, background: '#bfdbfe', color: '#1d4ed8', padding: '1px 5px', borderRadius: 4, marginRight: 6, fontWeight: 700 }}>★</span>}
                  {h}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Story Builder — CORE SECTION */}
        <div style={{ background: 'white', border: '2px solid #6366f1', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>✍️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Story Builder</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Seleccioná un enfoque y generá el artículo completo con IA</div>
            </div>
          </div>

          {angles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>Sin enfoques generados.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {angles.map((angle, idx) => {
                const cfg = ANGLE_TYPE_CONFIG[angle.angle_type] || ANGLE_TYPE_CONFIG.default;
                const busy = generatingAngle === idx;
                return (
                  <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{cfg.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 10 }}>{cfg.label}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.4 }}>{angle.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, flex: 1 }}>{angle.summary}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      👤 {angle.target_audience}
                    </div>
                    {(angle.keywords || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {angle.keywords.slice(0, 3).map((k, i) => (
                          <span key={i} style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', padding: '2px 6px', borderRadius: 4 }}>{k}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerateArticle(idx)}
                      disabled={generatingAngle !== null}
                      style={{
                        width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                        background: generatingAngle !== null ? '#e5e7eb' : '#6366f1',
                        color: generatingAngle !== null ? '#9ca3af' : 'white',
                        cursor: generatingAngle !== null ? 'not-allowed' : 'pointer',
                        fontWeight: 700, fontSize: 13,
                      }}
                    >
                      {busy ? '⏳ Generando artículo…' : '✨ Generar artículo'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hero Image Prompt */}
        {dossier.hero_image_prompt && (
          <Card title="Prompt de imagen destacada" emoji="🖼️">
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#f9fafb', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace' }}>
              {dossier.hero_image_prompt}
            </div>
            <button
              onClick={copyPrompt}
              style={{ marginTop: 8, padding: '6px 14px', background: copiedPrompt ? '#d1fae5' : 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: copiedPrompt ? '#065f46' : '#374151', fontWeight: 600 }}
            >
              {copiedPrompt ? '✓ Copiado' : 'Copiar prompt'}
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ title, emoji, children }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
