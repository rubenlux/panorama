import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, resolveUrl } from '../api';
import './Home.css';

/* ── Helpers ── */
const PALETTES = ['', 'warm', 'green', 'plum', 'slate'];
const ph = (i) => PALETTES[i % PALETTES.length];

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff <= 0) return 'Hace un momento';
  if (diff < 60) return `Hace ${diff} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff / 60)} h`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function readTime(body) {
  if (!body) return '4 min';
  const words = body.replace(/<[^>]*>/g, '').split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min de lectura`;
}

function Img({ article, height, idx }) {
  if (article?.image_url) {
    return (
      <img
        src={resolveUrl(article.image_url)}
        alt={article.title}
        className="pn-article-img"
        style={{ height }}
      />
    );
  }
  return <div className={`pn-ph ${ph(idx)}`} style={{ height }} data-label={article?.category_name || ''} />;
}

const CAT_COLORS = {
  politica: '#C8102E', política: '#C8102E',
  economia: '#1F7A5A', economía: '#1F7A5A',
  mundo: '#2C5077', deportes: '#E07B00',
  cultura: '#7A4FB5', tecnologia: '#0E7C86', tecnología: '#0E7C86',
};
function Tag({ name }) {
  const key = (name || '').toLowerCase()
    .replace(/[áéíóú]/g, c => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[c] || c));
  return <span className="pn-tag" style={{ color: CAT_COLORS[key] || 'var(--red)' }}>{name}</span>;
}

const OPINIONS = [
  { initials: 'CM', name: 'Carlos Méndez', role: 'Editor político', title: 'El costo político de gobernar sin acuerdos duraderos' },
  { initials: 'VP', name: 'Valeria Paz', role: 'Analista internacional', title: 'Por qué la coyuntura global importa más de lo que parece' },
  { initials: 'JR', name: 'Julián Rivas', role: 'Columnista económico', title: 'La estabilidad no se decreta: se construye con previsibilidad' },
];

/* ═══════════════════════════════════════ */
export default function Home() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson('/articles?limit=20&status=published')
      .then(d => setArticles(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="pn-loading">Cargando…</div>;
  }

  const lead      = articles[0];
  const rail      = articles.slice(1, 5);   // right rail: articles 1-4
  const secondary = articles.slice(5, 7);   // 2-col cards: articles 5-6
  const grid4     = articles.slice(7, 11);  // 4-col grid: articles 7-10
  const mostRead  = articles.slice(0, 5);   // top 5 for ranking
  const videoArt  = articles[11] || articles[articles.length - 1];

  if (!lead) {
    return <div className="pn-loading">No hay artículos publicados aún.</div>;
  }

  return (
    <main className="pn-main">
      <div className="pn-wrap">

        {/* LEAD */}
        <section className="pn-lead-grid">
          <div className="pn-lead">
            <Link to={`/article/${lead.slug}`}>
              <Img article={lead} height={420} idx={0} />
              <span className="pn-kicker" style={{ marginTop: 16 }}>{lead.category_name || 'Destacado'}</span>
              <h1 className="pn-headline pn-lead__title">{lead.title}</h1>
              {lead.excerpt && <p className="pn-dek pn-lead__dek">{lead.excerpt}</p>}
              <div className="pn-byline" style={{ marginTop: 14 }}>
                {lead.author_email && <strong>{lead.author_email.split('@')[0]}</strong>}
                <span className="dot" />
                <span>{readTime(lead.body)}</span>
                <span className="dot" />
                <span>{timeAgo(lead.published_at)}</span>
              </div>
            </Link>
          </div>

          <aside className="pn-rail">
            {rail.map((a, i) => (
              <div key={a.id} className={`pn-rail-card${i < 2 ? ' with-img' : ''}`}>
                <Link to={`/article/${a.slug}`}>
                  <Tag name={a.category_name} />
                  <h3 className="pn-headline pn-rail-card__h">{a.title}</h3>
                  <div className="pn-byline">{a.author_email?.split('@')[0] || 'Redacción'}</div>
                </Link>
                {i < 2 && <Img article={a} height={72} idx={i + 1} />}
              </div>
            ))}
          </aside>
        </section>

        {/* SECONDARY 2-COL */}
        {secondary.length > 0 && (
          <section className="pn-zone">
            <div className="pn-two">
              {secondary.map((a, i) => (
                <article key={a.id} className="pn-card">
                  <Link to={`/article/${a.slug}`}>
                    <Img article={a} height={160} idx={i + 5} />
                    <Tag name={a.category_name} />
                    <h3 className="pn-headline pn-card__h">{a.title}</h3>
                    {a.excerpt && <p className="pn-dek pn-card__dek">{a.excerpt}</p>}
                    <div className="pn-byline" style={{ marginTop: 10 }}>
                      {a.author_email && <strong>{a.author_email.split('@')[0]}</strong>}
                      <span className="dot" />
                      <span>{timeAgo(a.published_at)}</span>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 4-COL GRID */}
        {grid4.length > 0 && (
          <section className="pn-zone">
            <div className="pn-sec-head">
              <h2>Últimas noticias</h2>
              <Link to="/">Ver todo →</Link>
            </div>
            <div className="pn-four">
              {grid4.map((a, i) => (
                <article key={a.id} className="pn-card">
                  <Link to={`/article/${a.slug}`}>
                    <Img article={a} height={130} idx={i + 7} />
                    <h3 className="pn-headline pn-card__h pn-card__h--sm">{a.title}</h3>
                    <div className="pn-byline" style={{ marginTop: 8 }}>
                      {a.author_email?.split('@')[0] || 'Redacción'}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* OPINION */}
        <section className="pn-zone pn-opinion">
          <div className="pn-sec-head pn-sec-head--light">
            <h2>Opinión</h2>
            <a href="#">Todas las columnas →</a>
          </div>
          <div className="pn-op-grid">
            {OPINIONS.map(op => (
              <a key={op.initials} className="pn-op-item" href="#">
                <div className="pn-op-avatar">{op.initials}</div>
                <div>
                  <div className="pn-op-author">{op.name}</div>
                  <div className="pn-op-role">{op.role}</div>
                  <h3 className="pn-headline pn-op-item__h">{op.title}</h3>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* MOST READ + MULTIMEDIA */}
        <section className="pn-zone pn-zone--last">
          <div className="pn-split">
            <div className="pn-mostread">
              <div className="pn-sec-head">
                <h2>Lo más leído</h2>
              </div>
              <ol className="pn-mostread__list">
                {mostRead.map(a => (
                  <li key={a.id}>
                    <Link to={`/article/${a.slug}`}>
                      <Tag name={a.category_name} />
                      <h3 className="pn-headline" style={{ fontSize: 17, marginTop: 4 }}>{a.title}</h3>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>

            {videoArt && (
              <div>
                <div className="pn-sec-head">
                  <h2>Multimedia</h2>
                </div>
                <Link className="pn-media-card" to={`/article/${videoArt.slug}`}>
                  <Img article={videoArt} height={280} idx={11} />
                  <div className="pn-media-card__play">
                    <span className="pn-media-card__circle">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                    </span>
                  </div>
                  <div className="pn-media-card__overlay">
                    <span className="pn-kicker" style={{ color: '#fff' }}>Reportaje</span>
                    <h3 className="pn-headline" style={{ color: '#fff', fontSize: 20, marginTop: 6 }}>{videoArt.title}</h3>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}

