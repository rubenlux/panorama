import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contacto — Panorama</title>
        <meta name="description" content="Ponte en contacto con el equipo de Panorama. Noticias, comentarios, reclamos o sugerencias." />
      </Helmet>
      <div style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Contacto</h1>

        <section style={{ marginBottom: 40, lineHeight: 1.6, color: 'var(--text)' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600 }}>¿Cómo podemos ayudarte?</h2>
          <p>
            Si tienes una noticia, comentario, corrección o sugerencia sobre nuestro trabajo, nos gustaría escucharte. Completa el formulario a continuación.
          </p>
        </section>

        {submitted && (
          <div style={{
            background: '#e8f5e9',
            border: '1px solid #4caf50',
            color: '#2e7d32',
            padding: 15,
            borderRadius: 4,
            marginBottom: 20,
            fontSize: '0.95rem',
          }}>
            ✓ Mensaje enviado. Nos contactaremos pronto.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>
              Nombre
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>
              Asunto
            </label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Noticia, corrección, sugerencia..."
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>
              Mensaje
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              rows={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                resize: 'vertical',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '12px 24px',
              background: 'var(--link)',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            Enviar mensaje
          </button>
        </form>

        <section style={{ marginTop: 50, paddingTop: 30, borderTop: '1px solid #eee', lineHeight: 1.6, color: 'var(--muted)', fontSize: '0.95rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 15, fontWeight: 600, color: 'var(--text)' }}>Otras formas de contacto</h2>
          <p>
            Email: <a href="mailto:info@panorama.ar" style={{ color: 'var(--link)' }}>info@panorama.ar</a>
          </p>
          <p>
            Redes sociales:
            <a href="https://x.com/panorama" style={{ color: 'var(--link)', marginLeft: 8 }}>X</a> ·
            <a href="https://instagram.com/panorama" style={{ color: 'var(--link)', marginLeft: 8 }}>Instagram</a>
          </p>
        </section>
      </div>
    </>
  );
}
