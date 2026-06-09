import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

export default function Header({ onSearchOpen }) {
  const today = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateStr = `${dias[today.getDay()]} ${today.getDate()} de ${meses[today.getMonth()]}, ${today.getFullYear()}`;

  return (
    <>
      <div className="pn-utility">
        <div className="pn-wrap pn-utility__inner">
          <div className="pn-utility__left">
            <span className="pn-utility__date">{dateStr}</span>
            <span className="pn-utility__sep" />
            <span className="pn-utility__weather">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="5" stroke="#FFD166" strokeWidth="2"/>
                <g stroke="#FFD166" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>
                </g>
              </svg>
              Buenos Aires 14°
            </span>
          </div>
          <div className="pn-utility__right">
            <a href="#">Newsletters</a>
            <a href="#">Iniciar sesión</a>
          </div>
        </div>
      </div>

      <header className="pn-masthead">
        <div className="pn-wrap pn-masthead__inner">
          <div className="pn-masthead__left">
            <button className="pn-icon-btn" aria-label="Buscar" onClick={onSearchOpen}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
              </svg>
            </button>
          </div>
          <Link to="/" className="pn-logo">
            Panorama<span className="pn-logo__dot">●</span>
          </Link>
          <div className="pn-masthead__right">
            <a href="#" className="pn-btn pn-btn--red">Suscríbete</a>
          </div>
        </div>
      </header>
    </>
  );
}
