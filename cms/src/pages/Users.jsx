import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, getToken, pickItems } from "../api";
import { jwtDecode } from "jwt-decode";
import { UserPlus, ShieldAlert, BarChart2 } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [role, setRole] = useState("reader");

    useEffect(() => {
        try {
            const token = getToken();
            if (token) setRole(jwtDecode(token).role);
        } catch (e) { }
        loadUsers();
    }, []);

    async function loadUsers() {
        setLoading(true);
        try {
            const data = await apiJson("/users", { auth: true });
            setUsers(pickItems(data));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function deleteUser(id) {
        if (!window.confirm("¿Estás seguro de eliminar este usuario?")) return;
        try {
            await apiJson(`/users/${id}`, { method: "DELETE", auth: true });
            loadUsers();
        } catch (err) {
            alert(err.message);
        }
    }

    if (role !== "admin") {
        return (
            <div style={{ padding: 40, textAlign: 'center', background: 'white', borderRadius: 16 }}>
                <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: 16 }} />
                <h2 style={{ color: '#1e293b' }}>Acceso Restringido</h2>
                <p style={{ color: '#64748b' }}>Solo los administradores pueden gestionar la lista de usuarios.</p>
            </div>
        );
    }

    if (loading) return <div>Cargando usuarios...</div>;
    if (error) return <div style={{ color: "red" }}>Error: {error}</div>;

    return (
        <div style={{ padding: 20 }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 25,
                }}
            >
                <div>
                    <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>Usuarios</h1>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Gestión de equipo y permisos del sistema.</p>
                </div>
                <Link
                    to="/users/new"
                    style={{
                        background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                        color: "white",
                        padding: "10px 20px",
                        borderRadius: 12,
                        textDecoration: "none",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                    }}
                >
                    <UserPlus size={18} /> Nuevo Usuario
                </Link>
            </div>

            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
                <thead>
                    <tr style={{ textAlign: "left" }}>
                        <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.025em' }}>Nombre</th>
                        <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.025em' }}>Email</th>
                        <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.025em' }}>Rol</th>
                        <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.025em' }}>Creado</th>
                        <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.025em', textAlign: "right" }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id} style={{ background: "white", transition: "transform 0.2s" }} className="user-row">
                            <td style={{ padding: "16px", borderRadius: "12px 0 0 12px", border: "1px solid #f1f5f9", borderRight: "none" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    {u.avatar_url ? (
                                        <img src={u.avatar_url} alt="Av" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }} />
                                    ) : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #60a5fa, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>{u.email.charAt(0).toUpperCase()}</div>}
                                    <span style={{ fontWeight: "600", color: "#1e293b" }}>{u.name || "Sin nombre"}</span>
                                </div>
                            </td>
                            <td style={{ padding: "16px", border: "1px solid #f1f5f9", borderLeft: "none", borderRight: "none", color: "#64748b" }}>{u.email}</td>
                            <td style={{ padding: "16px", border: "1px solid #f1f5f9", borderLeft: "none", borderRight: "none" }}>
                                <span
                                    style={{
                                        background: u.role === "admin" ? "#fef2f2" : "#f0f9ff",
                                        color: u.role === "admin" ? "#b91c1c" : "#0369a1",
                                        padding: "4px 10px",
                                        borderRadius: 8,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {u.role}
                                </span>
                            </td>
                            <td style={{ padding: "16px", border: "1px solid #f1f5f9", borderLeft: "none", borderRight: "none", color: "#64748b" }}>
                                {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "16px", textAlign: "right", borderRadius: "0 12px 12px 0", border: "1px solid #f1f5f9", borderLeft: "none" }}>
                                <Link
                                    to={`/users/${u.id}`}
                                    style={{
                                        marginRight: 10,
                                        color: "#2563eb",
                                        textDecoration: "none",
                                        fontWeight: "600",
                                        fontSize: 14,
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        background: "#f0f7ff",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    Editar
                                </Link>
                                <Link
                                    to={`/users/${u.id}/performance`}
                                    style={{
                                        marginRight: 10,
                                        color: "#0891b2",
                                        textDecoration: "none",
                                        fontWeight: "600",
                                        fontSize: 14,
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        background: "#ecfeff",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4
                                    }}
                                    title="Rendimiento"
                                >
                                    <BarChart2 size={16} /> Rendimiento
                                </Link>
                                <button
                                    onClick={() => deleteUser(u.id)}
                                    style={{
                                        background: "#fff1f2",
                                        border: "none",
                                        color: "#e11d48",
                                        cursor: "pointer",
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        fontWeight: "600",
                                        fontSize: 14,
                                        transition: "all 0.2s"
                                    }}
                                >
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
