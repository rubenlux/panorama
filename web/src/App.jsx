import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Pixel } from './utils/pixel';
import { SettingsProvider } from './context/SettingsContext';
import Header from './components/Header';
import NavBar from './components/NavBar';
import Ticker from './components/Ticker';
import Newsletter from './components/Newsletter';
import Footer from './components/Footer';
import Home from './pages/Home';
import Article from './pages/Article';
import Topic from './pages/Topic';
import Region from './pages/Region';
import About from './pages/About';
import Ethics from './pages/Ethics';
import Editorial from './pages/Editorial';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Cookies from './pages/Cookies';
import Advertising from './pages/Advertising';
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

function SubscribeModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="pn-search-overlay" onClick={onClose} style={{ background: 'rgba(11,27,48,0.96)' }}>
      <button className="pn-search-overlay__close" onClick={onClose} aria-label="Cerrar">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
      <div className="pn-search-overlay__bar" style={{ maxWidth: 500, background: 'transparent' }} onClick={e => e.stopPropagation()}>
        <Newsletter />
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const trackedLocationKey = useRef(null);

  useEffect(() => {
    Pixel.init();
    // Guard against StrictMode's dev-only double effect invocation — without
    // this, every route change fired page_view twice in local testing
    // (content_view is naturally guarded by hasViewed.current; this wasn't).
    if (trackedLocationKey.current !== location.key) {
      Pixel.track('page_view');
      trackedLocationKey.current = location.key;
    }
  }, [location]);

  useEffect(() => { 
    setSearchOpen(false); 
    setSubscribeOpen(false);
  }, [location]);

  return (
    <SettingsProvider>
      <Header 
        onSearchOpen={() => setSearchOpen(true)} 
        onSubscribeOpen={() => setSubscribeOpen(true)} 
      />
      <NavBar />
      <Ticker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/article/:slug" element={<Article />} />
        <Route path="/category/:slug" element={<Home />} />
        <Route path="/topic/:slug" element={<Topic />} />
        <Route path="/region/:slug" element={<Region />} />
        <Route path="/quienes-somos" element={<About />} />
        <Route path="/codigo-etico" element={<Ethics />} />
        <Route path="/equipo-editorial" element={<Editorial />} />
        <Route path="/contacto" element={<Contact />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/publicidad" element={<Advertising />} />
        <Route path="*" element={
          <div style={{ display: 'grid', placeItems: 'center', height: 320, fontFamily: 'var(--sans)', color: 'var(--muted)' }}>
            404 — Página no encontrada
          </div>
        } />
      </Routes>
      <Footer />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SubscribeModal open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
    </SettingsProvider>
  );
}

export default App;
