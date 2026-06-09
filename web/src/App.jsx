import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Pixel } from './utils/pixel';
import { SettingsProvider } from './context/SettingsContext';
import Header from './components/Header';
import NavBar from './components/NavBar';
import Ticker from './components/Ticker';
import Footer from './components/Footer';
import Home from './pages/Home';
import Article from './pages/Article';
import Topic from './pages/Topic';
import Region from './pages/Region';
import './panorama.css';
import './App.css';

function SearchOverlay({ open, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="pn-search-overlay" onClick={onClose}>
      <button className="pn-search-overlay__close" onClick={onClose} aria-label="Cerrar">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
      <div className="pn-search-overlay__bar" onClick={e => e.stopPropagation()}>
        <input type="text" placeholder="Buscar en Panorama…" autoFocus autoComplete="off" />
      </div>
      <div className="pn-search-overlay__sugg" onClick={e => e.stopPropagation()}>
        <span className="pn-search-overlay__lbl">Búsquedas frecuentes</span>
        <div className="pn-search-overlay__chips">
          {['Economía', 'Política', 'Deportes', 'Tecnología', 'Cultura', 'Mundo'].map(q => (
            <a key={q} href="#">{q}</a>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    Pixel.init();
    Pixel.track('page_view');
  }, [location]);

  useEffect(() => { setSearchOpen(false); }, [location]);

  return (
    <SettingsProvider>
      <Header onSearchOpen={() => setSearchOpen(true)} />
      <NavBar />
      <Ticker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/article/:slug" element={<Article />} />
        <Route path="/category/:slug" element={<Home />} />
        <Route path="/topic/:slug" element={<Topic />} />
        <Route path="/region/:slug" element={<Region />} />
        <Route path="*" element={
          <div style={{ display: 'grid', placeItems: 'center', height: 320, fontFamily: 'var(--sans)', color: 'var(--muted)' }}>
            404 — Página no encontrada
          </div>
        } />
      </Routes>
      <Footer />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </SettingsProvider>
  );
}

export default App;
