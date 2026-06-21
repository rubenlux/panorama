import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson } from '../api.js';

const CHANGE_META = {
  link_added:    { label: 'NUEVA URL',            bg: '#d1fae5', color: '#065f46', symbol: '+' },
  link_removed:  { label: 'REMOVIDA DEL LISTADO', bg: '#f3f4f6', color: '#374151', symbol: '–' },
  title_changed: { label: 'TÍTULO MODIFICADO',    bg: '#dbeafe', color: '#1e40af', symbol: '~' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)    return `hace ${secs}s`;
  if (secs < 3600)  return `hace ${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
  return `hace ${Math.floor(secs / 86400)}d`;
}

export default function CoverageArticleDetail() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson(`/coverage/articles/${articleId}`, { auth: true })
      .then(setArticle)
      .catch(() => navigate('/coverage'))
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Cargando…</div>;
  if (!article) return null;

  const changes = article.changes || [];
  const wordCount = article.content_text
    ? article.content_text.trim().split(/\s+/).length
    : 0;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
        <button onClick={() => navigate('/coverage')} style={{ ...btnFlat }}>Coverage</button>
        <span style={{ color: '#d1d5db' }}>›</span>
        <button onClick={() => navigate(`/coverage/${article.source_id}`)} style={{ ...btnFlat }}>
          {article.source_name}
        </button>
        <span style={{ color: '#d1d5db' }}>›</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Artículo</span>
      </div>

      {/* Title */}
      <h1 style={{ margin: '0 0 8px', fontWeight: 800, fontSize: '1.5rem', color: '#111827', lineHeight: 1.3 }}>
        {article.title || '(sin título)'}
      </h1>

      {/* URL + status */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#4f46e5', wordBreak: 'break-all', flex: 1 }}>
          {article.url} ↗
        </a>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
          background: article.is_active ? '#d1fae5' : '#f3f4f6',
          color: article.is_active ? '#065f46' : '#6b7280',
        }}>
          {article.is_active ? 'Activo en el listado' : 'Removido del listado'}
        </span>
      </div>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Primera detección', value: formatDate(article.first_detected_at) },
          { label: 'Última vez visto', value: formatDate(article.last_seen_at) },
          { label: 'Posición actual', value: article.current_position ? `#${article.current_position}` : '—' },
          { label: 'Fuente', value: article.source_name },
        ].map(m => (
          <div key={m.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Historical content */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
            Contenido Histórico
          </h2>
          {article.content_text && (
            <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 99 }}>
              {wordCount} palabras · capturado {timeAgo(article.first_detected_at)}
            </span>
          )}
        </div>

        {article.content_text ? (
          <div style={{
            background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: 20, fontSize: 14, lineHeight: 1.75, color: '#374151',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 500, overflowY: 'auto',
          }}>
            {article.content_text}
          </div>
        ) : (
          <div style={{
            background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12,
            padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14,
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Sin contenido capturado</div>
            <div style={{ fontSize: 13 }}>
              El contenido histórico se captura automáticamente cuando aparece una nueva URL.<br />
              Puede que esta URL haya sido detectada antes de activar la captura de contenido.
            </div>
          </div>
        )}
      </div>

      {/* Change history */}
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
          Historial de Cambios
        </h2>

        {changes.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 14, padding: '12px 0' }}>Sin cambios registrados.</div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {changes.map((ch, i) => {
              const meta = CHANGE_META[ch.change_type] || CHANGE_META.link_added;
              return (
                <div key={ch.id} style={{ padding: '14px 20px', borderBottom: i < changes.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 80, fontSize: 13, color: '#9ca3af', fontWeight: 600, paddingTop: 2 }}>
                    {formatTime(ch.detected_at)}
                    <div style={{ fontSize: 11, fontWeight: 400 }}>
                      {new Date(ch.detected_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '2px 8px',
                      borderRadius: 4, background: meta.bg, color: meta.color, marginBottom: 6, letterSpacing: '0.04em',
                    }}>
                      {meta.symbol} {meta.label}
                    </span>
                    {ch.change_type === 'title_changed' && (
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ color: '#9ca3af' }}><b>Antes: </b>{ch.old_value}</div>
                        <div style={{ color: '#111827' }}><b>Ahora: </b>{ch.new_value}</div>
                      </div>
                    )}
                    {ch.change_type === 'link_added' && ch.new_value && (
                      <div style={{ fontSize: 13, color: '#374151' }}>{ch.new_value}</div>
                    )}
                    {ch.change_type === 'link_removed' && ch.old_value && (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{ch.old_value}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const btnFlat = { padding: '4px 8px', borderRadius: 6, background: 'none', color: '#4f46e5', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
