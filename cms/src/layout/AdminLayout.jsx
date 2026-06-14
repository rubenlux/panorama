import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { clearToken, getToken, apiJson } from "../api.js";
import { Menu, X, LogOut, User } from "lucide-react";
import "./AdminLayout.css";

const linkStyle = ({ isActive }) => ({
  display: "block",
  padding: "10px 12px",
  textDecoration: "none",
  color: isActive ? "white" : "#d7dde6",
  background: isActive ? "#2b5cff" : "transparent",
  borderRadius: 8,
});

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = getToken();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  let role = "reader";
  let userId = null;

  try {
    if (token) {
      const decoded = jwtDecode(token);
      role = decoded.role || "reader";
      userId = decoded.sub;
    }
  } catch (e) {
    console.error("Layout token error", e);
  }

  function logout() {
    clearToken();
    navigate("/login");
  }

  const isAdmin = role === "admin";
  const lastActivity = useRef(Date.now());

  // ACTIVITY HEARTBEAT
  useEffect(() => {
    if (!token) return;

    const handleActivity = () => { lastActivity.current = Date.now(); };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    const interval = setInterval(async () => {
      if (document.visibilityState === 'visible' && (Date.now() - lastActivity.current) < 120000) {
        try {
          await apiJson("/users/activity/heartbeat", {
            method: "POST",
            auth: true,
            body: { path: location.pathname }
          });
        } catch (e) {
          console.warn("Heartbeat failed", e);
        }
      }
    }, 60000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearInterval(interval);
    };
  }, [token, location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-container">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>CMS Noticias</div>
        <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ fontWeight: 800, padding: "10px 12px", fontSize: "1.2rem", letterSpacing: "-0.02em", marginBottom: 20 }}>
          CMS Noticias
        </div>

        <nav style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <NavLink to="/dashboard" style={linkStyle} end>Dashboard</NavLink>
          <NavLink to="/posts" style={linkStyle}>Entradas</NavLink>
          <NavLink to="/editorial-studio" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          })}>
            <span>Asistente Editorial</span>
            <span style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", color: "white", fontSize: 9, fontWeight: "bold", padding: "2px 6px", borderRadius: 4 }}>AI</span>
          </NavLink>
          <NavLink to="/research" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          })}>
            <span>Investigación AI</span>
          </NavLink>
          <NavLink to="/dossiers" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 24,
            fontSize: 13,
          })}>
            <span>📋 Dossiers</span>
          </NavLink>
          <NavLink to="/monitor" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 24,
            fontSize: 13,
          })}>
            <span>📡 Monitoreo de Medios</span>
          </NavLink>
          <NavLink to="/social" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 24,
            fontSize: 13,
          })}>
            <span>📱 Social Intelligence</span>
          </NavLink>
          <NavLink to="/editorial-intelligence" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 24,
            fontSize: 13,
          })}>
            <span>📋 Inteligencia Editorial</span>
          </NavLink>
          <NavLink to="/knowledge-graph" style={(props) => ({
            ...linkStyle(props),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 24,
            fontSize: 13,
          })}>
            <span>📌 Knowledge Graph</span>
          </NavLink>
          <NavLink to="/reels" style={linkStyle}>Reels</NavLink>
          <NavLink to="/media" style={linkStyle}>Medios</NavLink>
          <NavLink to="/categories" style={linkStyle}>Categorías</NavLink>
          <NavLink to="/comments" style={linkStyle}>Comentarios</NavLink>

          {isAdmin && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 12px" }}></div>
              <NavLink to="/ads" style={linkStyle}>Publicidad</NavLink>
              <NavLink to="/subscribers" style={linkStyle}>Suscriptores</NavLink>
              <NavLink to="/users" style={linkStyle}>Usuarios</NavLink>
              <NavLink to="/settings" style={linkStyle}>Configuración</NavLink>
            </>
          )}
        </nav>

        <div style={{ marginTop: "auto" }}>
          <div
            onClick={() => navigate(`/users/${userId}`)}
            style={{
              cursor: "pointer",
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "12px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: 12,
              marginBottom: 12
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold" }}>
              <User size={16} />
            </div>
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>Mi Perfil</div>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'capitalize' }}>{role}</div>
            </div>
          </div>

          <button
            onClick={logout}
            style={{ width: "100%", padding: "10px", borderRadius: 10, background: "#ef4444", color: "white", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </aside>

      {/* Overlay to close sidebar on click outside */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 900 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
