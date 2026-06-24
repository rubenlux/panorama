import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Terms() {
  return (
    <>
      <Helmet>
        <title>Términos de uso — Panorama</title>
        <meta name="description" content="Términos y condiciones de uso del sitio web de Panorama." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)', fontSize: '0.95rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Términos de uso</h1>

        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Última actualización: Junio 2026
        </p>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>1. Aceptación de términos</h2>
          <p>
            Al acceder y usar panorama.ar ("Sitio"), aceptas estar vinculado por estos Términos de Uso. Si no aceptas estos términos, no uses el Sitio.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>2. Licencia de contenido</h2>
          <p>
            Todo contenido en el Sitio (artículos, imágenes, gráficos, videos) está protegido por derechos de autor. Puedes usar el contenido para consumo personal, pero no puedes reproducirlo, distribuirlo o modificarlo sin autorización explícita.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>3. Uso del Sitio</h2>
          <p>Te comprometes a usar el Sitio de manera legal y ética. No puedes:</p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li>Usar automatización para descargar masivamente contenido</li>
            <li>Intentar acceder a sistemas o datos no autorizados</li>
            <li>Interferir con el funcionamiento normal del Sitio</li>
            <li>Publicar contenido ilegal, abusivo o que viole derechos de terceros</li>
          </ul>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>4. Comentarios y contribuciones</h2>
          <p>
            Si publicas comentarios en el Sitio, aceptas que pueden ser moderados o eliminados. No somos responsables de comentarios de usuarios. Al comentar, otorgas a Panorama licencia para usar tu comentario.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>5. Exención de responsabilidad</h2>
          <p>
            El Sitio se proporciona "tal como está". Panorama no garantiza que el contenido sea exacto, completo o sin errores. El acceso al Sitio está bajo tu propio riesgo.
          </p>
          <p>
            No somos responsables de daños indirectos, incidentales o consecuentes derivados de tu uso del Sitio.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>6. Enlaces externos</h2>
          <p>
            El Sitio puede contener enlaces a sitios de terceros. No somos responsables del contenido de esos sitios. Verifica su política de privacidad y términos independientemente.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>7. Cambios a estos términos</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios se publican en esta página. El uso continuado del Sitio constituye aceptación de los términos modificados.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>8. Contacto</h2>
          <p>
            Si tienes preguntas sobre estos términos, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a>.
          </p>
        </section>
      </article>
    </>
  );
}
