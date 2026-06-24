import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Cookies() {
  return (
    <>
      <Helmet>
        <title>Cookies — Panorama</title>
        <meta name="description" content="Política de cookies de Panorama. Cómo usamos cookies y tecnologías de rastreo." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)', fontSize: '0.95rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Política de cookies</h1>

        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Última actualización: Junio 2026
        </p>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>¿Qué son las cookies?</h2>
          <p>
            Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Se usan para recordar preferencias, mantener sesiones activas y analizar comportamiento.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Tipos de cookies que usamos</h2>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 15, marginBottom: 10 }}>Cookies esenciales</h3>
          <p>
            Necesarias para que el sitio funcione. Incluyen autenticación, seguridad y preferencias básicas. No pueden deshabilitarse.
          </p>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 15, marginBottom: 10 }}>Cookies de análisis</h3>
          <p>
            Nos ayudan a entender cómo los usuarios interactúan con el sitio. Recopilamos datos sobre páginas visitadas, tiempo de permanencia y conversiones. Usamos Google Analytics.
          </p>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 15, marginBottom: 10 }}>Cookies de publicidad</h3>
          <p>
            Usadas para mostrar anuncios relevantes. Permiten a anunciantes entender intereses del usuario. Pueden ser compartidas con redes publicitarias.
          </p>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 15, marginBottom: 10 }}>Cookies de terceros</h3>
          <p>
            Establecidas por sitios externos embebidos en nuestro sitio (YouTube, redes sociales, etc.). Sujetas a sus propias políticas de privacidad.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Tabla de cookies principales</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 15 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Duración</th>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Propósito</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 0' }}>session_id</td>
                <td style={{ padding: '10px 0' }}>Sesión</td>
                <td style={{ padding: '10px 0' }}>Mantener sesión de usuario</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 0' }}>preferences</td>
                <td style={{ padding: '10px 0' }}>1 año</td>
                <td style={{ padding: '10px 0' }}>Recordar preferencias de tema/idioma</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 0' }}>_ga</td>
                <td style={{ padding: '10px 0' }}>2 años</td>
                <td style={{ padding: '10px 0' }}>Google Analytics - análisis de usuarios</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 0' }}>ads_pixel</td>
                <td style={{ padding: '10px 0' }}>1 año</td>
                <td style={{ padding: '10px 0' }}>Rastreo de publicidad</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Tu consentimiento</h2>
          <p>
            La primera vez que visitas nuestro sitio, se muestra un aviso de cookies. Al aceptar, consientes el uso de todas las cookies excepto las de publicidad dirigida, que requieren consentimiento explícito adicional.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Cómo controlar cookies</h2>
          <p>
            Puedes controlar cookies en la configuración de tu navegador:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li><strong>Chrome:</strong> Ajustes → Privacidad y seguridad → Cookies</li>
            <li><strong>Firefox:</strong> Preferencias → Privacidad y seguridad → Cookies</li>
            <li><strong>Safari:</strong> Preferencias → Privacidad → Cookies y datos de sitios web</li>
            <li><strong>Edge:</strong> Configuración → Privacidad → Cookies</li>
          </ul>
          <p style={{ marginTop: 15 }}>
            Desabilitar cookies puede afectar la funcionalidad del sitio. Las cookies esenciales no pueden deshabilitarse.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Cambios a esta política</h2>
          <p>
            Actualizaremos esta política cuando cambiemos nuestro uso de cookies. Los cambios serán publicados aquí.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>Contacto</h2>
          <p>
            Si tienes preguntas sobre cookies, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a>.
          </p>
        </section>
      </article>
    </>
  );
}
