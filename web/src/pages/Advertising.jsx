import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Advertising() {
  return (
    <>
      <Helmet>
        <title>Publicidad — Panorama</title>
        <meta name="description" content="Información sobre publicidad en Panorama. Oportunidades y políticas publicitarias." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Publicidad en Panorama</h1>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Política de publicidad</h2>
          <p>
            Panorama financia su operación a través de publicidad y suscripciones. Mantenemos una clara separación entre contenido editorial y publicidad para proteger la confianza de nuestros lectores.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Independencia editorial</h2>
          <p>
            <strong>Los anunciantes no influyen en nuestras decisiones editoriales.</strong> Aceptamos publicidad de cualquier empresa legal, pero rechazamos anuncios que:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li>Contienen información falsa o engañosa</li>
            <li>Incitan odio, discriminación o violencia</li>
            <li>Violan leyes o regulaciones</li>
            <li>Intentan interferir con nuestro trabajo editorial</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Tipos de publicidad</h2>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>Display (Banner)</h3>
          <p>
            Anuncios visuales en diferentes posiciones del sitio. Disponible en tamaños estándar (300x250, 728x90, 970x250).
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>Video</h3>
          <p>
            Anuncios en video intra-página e inter-página. Formato: MP4, máximo 30 segundos.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>Native/Contenido patrocinado</h3>
          <p>
            Contenido que se integra con el diseño del sitio. <strong>Claramente marcado como "PATROCINADO"</strong> para distinguirlo del contenido editorial.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>Clasificados</h3>
          <p>
            Anuncios de empleo, inmuebles, servicios. Revisados para evitar estafas.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Transparencia publicitaria</h2>
          <ul style={{ marginLeft: 20 }}>
            <li>Todo contenido patrocinado está marcado claramente</li>
            <li>Los patrocinadores no editan nuestras historias</li>
            <li>Los anuncios no modifican nuestra cobertura noticiosa</li>
            <li>Publicamos historias críticas sobre anunciantes cuando es noticioso</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Privacidad en publicidad</h2>
          <p>
            Usamos publicidad dirigida basada en intereses para mejorar relevancia. Los datos recopilados están protegidos conforme a nuestra <a href="/privacidad" style={{ color: 'var(--link)' }}>Política de Privacidad</a> y <a href="/cookies" style={{ color: 'var(--link)' }}>Política de Cookies</a>.
          </p>
          <p style={{ marginTop: 10 }}>
            Puedes controlar publicidad dirigida en la configuración de tu navegador u optar por no recibir publicidad personalizada.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Tarifas y formatos</h2>
          <p>
            Para consultas sobre publicidad, tarifas disponibles y formatos especiales, contacta a nuestro equipo comercial.
          </p>
          <p style={{ marginTop: 10 }}>
            Email: <a href="mailto:publicidad@panorama.ar" style={{ color: 'var(--link)' }}>publicidad@panorama.ar</a>
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Reportar anuncios problemáticos</h2>
          <p>
            Si ves un anuncio que consideras violador de esta política, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a> e incluye una descripción del anuncio y dónde lo viste.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Cambios a esta política</h2>
          <p>
            Actualizamos esta política conforme nuestros métodos publicitarios evolucionan. Los cambios se publican en esta página.
          </p>
        </section>
      </article>
    </>
  );
}
