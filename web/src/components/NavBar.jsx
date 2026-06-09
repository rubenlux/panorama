import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiJson } from '../api';
import './NavBar.css';

export default function NavBar() {
  const [categories, setCategories] = useState([]);
  const [openMega, setOpenMega] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    apiJson('/categories')
      .then(d => setCategories(
        (d.items || []).filter(c => c.show_in_menu).slice(0, 8)
      ))
      .catch(() => {});
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location]);

  const handleMouseLeave = () => setOpenMega(null);

  return (
    <nav className="pn-nav" ref={navRef} onMouseLeave={handleMouseLeave}>
      <div className="pn-wrap pn-nav__inner">
        <ul className={`pn-nav__list ${mobileOpen ? 'open' : ''}`}>
          <li>
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Portada</Link>
          </li>
          {categories.map(cat => (
            <li key={cat.id}>
              <Link
                to={`/category/${cat.slug}`}
                className={location.pathname.includes(cat.slug) ? 'active' : ''}
              >
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>

        <div className="pn-nav__right">
          <span className="pn-live">
            <span className="pulse" />
            En vivo
          </span>
          <button
            className="pn-nav__burger"
            aria-label="Menú"
            onClick={() => setMobileOpen(o => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen
                ? <><path d="M6 6l12 12M18 6L6 18"/></>
                : <path d="M3 6h18M3 12h18M3 18h18"/>
              }
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
