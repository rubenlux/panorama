import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Privacy() {
  return (
    <>
      <Helmet>
        <title>Privacidad — Panorama</title>
        <meta name="description" content="Política de privacidad de Panorama. Cómo protegemos tus datos." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)', fontSize: '0.95rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Privacidad</h1>

        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Última actualización: Junio 2026
        </p>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>1. Información que recopilamos</h2>
          <p>
            <strong>Información voluntaria:</strong> Cuando te suscribes a nuestro newsletter o completas formularios, recopilamos tu nombre, email y preferencias de contenido.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>Información automática:</strong> Recopilamos datos técnicos como tu dirección IP, navegador, sistema operativo, y cómo interactúas con el sitio (qué artículos lees, tiempos de navegación).
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>2. Cómo usamos tu información</h2>
          <ul style={{ marginLeft: 20 }}>
            <li>Entregar el contenido que solicitaste</li>
            <li>Enviar newsletters e información de tu suscripción</li>
            <li>Mejorar nuestro sitio y entender el comportamiento de usuarios</li>
            <li>Investigar fraude y proteger seguridad</li>
            <li>Cumplir obligaciones legales</li>
          </ul>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>3. Compartir información</h2>
          <p>
            No vendemos tus datos a terceros. Podemos compartir información con:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li><strong>Proveedores de servicios:</strong> Que nos ayudan a operar el sitio (hosting, email)</li>
            <li><strong>Autoridades legales:</strong> Cuando requerido por ley</li>
            <li><strong>Transferencia de negocio:</strong> En caso de fusión, los datos se transferirían bajo esta política</li>
          </ul>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>4. Cookies y rastreo</h2>
          <p>
            Usamos cookies y tecnologías similares para mejorar tu experiencia. Ver nuestra <a href="/cookies" style={{ color: 'var(--link)' }}>Política de cookies</a> para más detalles.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>5. Seguridad</h2>
          <p>
            Implementamos medidas de seguridad técnicas y organizacionales para proteger tu información contra acceso no autorizado. Sin embargo, ningún sitio es 100% seguro.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>6. Tus derechos</h2>
          <p>
            Tienes derecho a:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li>Acceder a tus datos personales</li>
            <li>Corregir datos inexactos</li>
            <li>Solicitar eliminación de tus datos</li>
            <li>Retirar consentimiento para procesamiento</li>
            <li>Solicitar portabilidad de datos</li>
          </ul>
          <p style={{ marginTop: 15 }}>
            Para ejercer estos derechos, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a>.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>7. Retención de datos</h2>
          <p>
            Mantenemos datos de usuario activos mientras su suscripción esté activa. Los datos inactivos se conservan por período limitado necesario para propósitos legales, luego se eliminan.
          </p>
        </section>

        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>8. Cambios a esta política</h2>
          <p>
            Podemos actualizar esta política ocasionalmente. Los cambios se publican en esta página con nueva fecha de actualización.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>9. Contacto</h2>
          <p>
            Si tienes preguntas sobre privacidad, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a>.
          </p>
        </section>
      </article>
    </>
  );
}
