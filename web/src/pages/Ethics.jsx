import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Ethics() {
  return (
    <>
      <Helmet>
        <title>Código ético — Panorama</title>
        <meta name="description" content="Nuestros principios editoriales y compromisos ético-periodísticos." />
      </Helmet>
      <article style={{ maxWidth: 800, margin: '60px auto', padding: '0 20px', fontFamily: 'var(--sans)', lineHeight: 1.6, color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 30, fontWeight: 700 }}>Código ético</h1>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Principios fundamentales</h2>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>1. Verdad verificable</h3>
          <p>
            Publicamos hechos que podemos verificar con múltiples fuentes. Si no estamos seguros, lo decimos explícitamente. Distinguimos claramente entre noticias verificadas, análisis y opinión.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>2. Independencia editorial</h3>
          <p>
            No aceptamos presiones de gobiernos, partidos políticos, corporaciones o anunciantes que afecten nuestro trabajo. Nuestras decisiones editoriales son independientes y se basan únicamente en el valor noticioso.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>3. Transparencia de fuentes</h3>
          <p>
            Revelamos nuestras fuentes cuando es posible. Protegemos a fuentes anónimas cuando su seguridad está en riesgo, pero siempre bajo criterios editoriales estrictos.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>4. Correcciones y aclaraciones</h3>
          <p>
            Si publicamos algo incorrecto, lo corregimos rápidamente y de forma clara. Las correcciones son visibles y documentadas.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>5. Contexto y precisión</h3>
          <p>
            No publicamos citas fuera de contexto. Proporcionamos información de fondo suficiente para que el lector entienda la importancia de la noticia.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>6. Equilibrio y pluralismo</h3>
          <p>
            Buscamos múltiples puntos de vista en temas controvertidos. El equilibrio no significa falsa equidistancia: reflejamos la realidad tal como es.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>7. Privacidad y dignidad</h3>
          <p>
            Respetamos la privacidad de las personas, especialmente las menores de edad. No publicamos información personal sensible sin justificación editorial clara.
          </p>

          <h3 style={{ fontSize: '1.1rem', marginBottom: 10, fontWeight: 600, marginTop: 20 }}>8. Conflictos de interés</h3>
          <p>
            Nuestros periodistas revelan conflictos de interés relevantes. No participan en coberturas donde tengan intereses personales o financieros directos.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Uso de inteligencia artificial</h2>
          <p>
            Utilizamos IA como herramienta de apoyo editorial: ayuda a procesar volumen de datos, detectar patrones y organizar información. Sin embargo:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 10 }}>
            <li>Toda decisión editorial es tomada por periodistas humanos</li>
            <li>Los contenidos generados por IA son siempre verificados y editados</li>
            <li>Identificamos claramente cuando usamos herramientas automáticas</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Publicidad y patrocinios</h2>
          <p>
            Separamos claramente contenido editorial de publicidad. Los contenidos patrocinados están marcados como tales. Rechazamos anuncios que entren en conflicto con nuestros principios editoriales.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 15, fontWeight: 600 }}>Denuncias de incumplimiento</h2>
          <p>
            Si crees que hemos violado este código, <a href="/contacto" style={{ color: 'var(--link)' }}>contáctanos</a>. Investigaremos toda denuncia de incumplimiento ético.
          </p>
        </section>
      </article>
    </>
  );
}
