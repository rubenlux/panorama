import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const SECTIONS = ['Política', 'Economía', 'Mundo', 'Deportes', 'Cultura', 'Tecnología'];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="pn-footer">
      <div className="pn-wrap">
        <div className="pn-footer__grid">

          {/* Brand */}
          <div>
            <Link to="/" className="pn-footer__logo">
              Panorama<span style={{ color: 'var(--red)' }}>●</span>
            </Link>
            <p className="pn-footer__tagline">
              Periodismo independiente. Cobertura en tiempo real, análisis y verificación de los hechos que definen la agenda.
            </p>
            <div className="pn-footer__social">
              <a href="#" aria-label="X">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.258 5.626L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="#" aria-label="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.2 2.8 12 2.8 12 2.8s-4.2 0-6.8.1c-.6.1-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.2.7 11.4v2.1c0 2.2.3 4.4.3 4.4s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.5 22 12 22 12 22s4.2 0 6.8-.2c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.4v-2.1C23.3 9.2 23 7 23 7zm-13.4 8.7V8.3l8.1 4.2-8.1 3.2z"/>
                </svg>
              </a>
              <a href="#" aria-label="WhatsApp">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Secciones */}
          <div>
            <h4 className="pn-footer__col-title">Secciones</h4>
            {SECTIONS.map(s => (
              <Link key={s} to={`/category/${s.toLowerCase().replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[c]||c))}`}>
                {s}
              </Link>
            ))}
          </div>

          {/* Panorama */}
          <div>
            <h4 className="pn-footer__col-title">Panorama</h4>
            <Link to="/quienes-somos">Quiénes somos</Link>
            <Link to="/codigo-etico">Código ético</Link>
            <Link to="/equipo-editorial">Equipo editorial</Link>
            <Link to="/contacto">Contacto</Link>
          </div>

          {/* Servicios */}
          <div>
            <h4 className="pn-footer__col-title">Servicios</h4>
            <a href="#">Newsletters</a>
            <a href="#">Podcasts</a>
            <a href="#">App móvil</a>
            <a href="#">RSS</a>
          </div>

          {/* Legal */}
          <div>
            <h4 className="pn-footer__col-title">Legal</h4>
            <Link to="/terminos">Términos de uso</Link>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/cookies">Cookies</Link>
            <Link to="/publicidad">Publicidad</Link>
          </div>
        </div>

        <div className="pn-footer__bottom">
          <span>© {year} Panorama. Todos los derechos reservados.</span>
          <span>Periodismo independiente · Edición Argentina</span>
        </div>
      </div>
    </footer>
  );
}
