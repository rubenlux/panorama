import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Editorial() {
  return (
    <>
      <Helmet>
        <title>Equipo editorial — Panorama</title>
        <meta name="description" content="Conoce el equipo de periodistas y editores de Panorama." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Equipo editorial</h1>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Dirección</h2>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Director</h3>
            <p>Responsable de la línea editorial, decisiones estratégicas y relaciones institucionales.</p>
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Áreas de cobertura</h2>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Política</h3>
            <p>Cobertura de instituciones, decisiones políticas, tendencias electorales y análisis de poder.</p>
          </div>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Economía</h3>
            <p>Mercados financieros, política económica, empleo, inflación y análisis macroeconómico.</p>
          </div>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Mundo</h3>
            <p>Relaciones internacionales, conflictos globales y noticias de impacto mundial.</p>
          </div>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Deportes</h3>
            <p>Fútbol, deportes de equipo, eventos internacionales y cobertura de desempeño atlético.</p>
          </div>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Tecnología</h3>
            <p>Innovación, startups, transformación digital y noticias del sector tech.</p>
          </div>

          <div style={{ marginBottom: 25 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 5 }}>Cultura</h3>
            <p>Artes, medios, entretenimiento y tendencias culturales.</p>
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Proceso editorial</h2>
          <ol style={{ marginLeft: 20, marginTop: 10 }}>
            <li style={{ marginBottom: 10 }}>
              <strong>Detección:</strong> Monitoreo continuo de fuentes, redes sociales y alertas editoriales
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Verificación:</strong> Validación de hechos, fuentes y contexto
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Análisis:</strong> Periodista investigador analiza el tema en profundidad
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Redacción:</strong> Escritura del contenido con claridad y exactitud
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Edición:</strong> Revisión de estructura, claridad y precisión
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Publicación:</strong> Lanzamiento en plataforma digital
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>Seguimiento:</strong> Actualización continua según nuevos hechos
            </li>
          </ol>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Estándares de calidad</h2>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li>Verificación de múltiples fuentes para cada afirmación de hecho</li>
            <li>Atribución clara de información</li>
            <li>Contexto histórico y explicativo</li>
            <li>Reconocimiento de incertidumbre cuando existe</li>
            <li>Corrección rápida de errores</li>
            <li>Actualización continua de historias en desarrollo</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Contacto editorial</h2>
          <p>
            ¿Tienes un dato, comentario o reclamo sobre nuestro trabajo? <a href="/contacto" style={{ color: 'var(--link)' }}>Contáctanos aquí</a>.
          </p>
        </section>
      </article>
    </>
  );
}
