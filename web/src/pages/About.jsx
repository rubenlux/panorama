import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function About() {
  return (
    <>
      <Helmet>
        <title>Quiénes somos — Panorama</title>
        <meta name="description" content="Conoce el equipo y la misión de Panorama, periodismo independiente con análisis y verificación de hechos en tiempo real." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Quiénes somos</h1>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Nuestra misión</h2>
          <p>
            Panorama es un medio de periodismo independiente dedicado a la cobertura en tiempo real, análisis profundo y verificación de los hechos que definen la agenda en Argentina y el mundo.
          </p>
          <p>
            Operamos sin patrocinio político, corporativo ni editorial externo. Nuestro único compromiso es con la verdad verificable y el interés público.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Cómo funcionamos</h2>
          <p>
            Combinamos inteligencia artificial, análisis editorial humano y verificación de fuentes para detectar tendencias emergentes y proporcionar contexto en tiempo real.
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li><strong>Cobertura 24/7:</strong> Monitoreo continuo de eventos, redes sociales y declaraciones públicas</li>
            <li><strong>Análisis temático:</strong> Agrupación inteligente de noticias relacionadas para detectar patrones y tendencias</li>
            <li><strong>Verificación editorial:</strong> Equipo de periodistas que valida, contextualiza y profundiza en cada historia</li>
            <li><strong>Múltiples perspectivas:</strong> Cobertura balanceada que considera distintas fuentes y puntos de vista</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Nuestros valores</h2>
          <p>
            <strong>Independencia:</strong> No aceptamos presiones políticas ni comerciales que comprometan nuestro trabajo.
          </p>
          <p>
            <strong>Precisión:</strong> Verificamos cada hecho antes de publicar. Si cometemos un error, lo corregimos rápidamente.
          </p>
          <p>
            <strong>Transparencia:</strong> Explicamos nuestras fuentes, métodos y criterios editoriales.
          </p>
          <p>
            <strong>Contexto:</strong> No solo reportamos qué pasó, sino por qué importa y qué significa.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Tecnología y datos</h2>
          <p>
            Utilizamos herramientas de análisis de datos y machine learning para identificar patrones en la información pública. Sin embargo, la decisión editorial siempre es humana. La IA nos ayuda a procesar volumen, pero los periodistas deciden qué importa.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Contacto</h2>
          <p>
            ¿Preguntas sobre nuestro trabajo? <a href="/contacto" style={{ color: 'var(--link)' }}>Escríbenos aquí</a>.
          </p>
        </section>
      </article>
    </>
  );
}
