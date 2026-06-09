import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiJson, getToken } from "../api";
import { jwtDecode } from "jwt-decode";
import { User, Mail, Shield, BookOpen, Image as ImageIcon, Link as LinkIcon, Lock, ChevronLeft, Eye, EyeOff } from 'lucide-react';

const styles = {
    container: {
        maxWidth: "800px",
        margin: "20px auto",
        padding: "40px",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(10px)",
        borderRadius: "24px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.05)",
        border: "1px solid rgba(255,255,255,0.3)",
    },
    header: {
        marginBottom: "40px",
        display: "flex",
        alignItems: "center",
        gap: "15px",
    },
    card: {
        background: "#ffffff",
        borderRadius: "16px",
        padding: "30px",
        marginBottom: "25px",
        border: "1px solid #f1f5f9",
    },
    sectionTitle: {
        fontSize: "1.1rem",
        fontWeight: "700",
        color: "#1e293b",
        marginBottom: "20px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    fieldGroup: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "30px",
        marginBottom: "30px",
    },
    label: {
        display: "block",
        fontSize: "0.85rem",
        fontWeight: "600",
        color: "#64748b",
        marginBottom: "8px",
        textTransform: "uppercase",
        letterSpacing: "0.025em",
    },
    input: {
        width: "100%",
        padding: "12px 16px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        fontSize: "1rem",
        color: "#1e293b",
        transition: "all 0.2s",
        outline: "none",
        background: "#f8fafc",
    },
    textarea: {
        width: "100%",
        padding: "12px 16px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        fontSize: "1rem",
        color: "#1e293b",
        minHeight: "100px",
        background: "#f8fafc",
        outline: "none",
        fontFamily: "inherit",
    },
    socialGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "15px",
    },
    btnPrimary: {
        background: "linear-gradient(135deg, #2563eb, #3b82f6)",
        color: "white",
        padding: "14px 28px",
        border: "none",
        borderRadius: "12px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
    },
    btnSecondary: {
        background: "white",
        color: "#64748b",
        padding: "14px 28px",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        fontWeight: "600",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
    }
};

export default function UserEditor({ mode }) {
    const navigate = useNavigate();
    const { id } = useParams();

    const [email, setEmail] = useState("");
    const [role, setRole] = useState("editor");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [bio, setBio] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [socialLinks, setSocialLinks] = useState({ twitter: "", instagram: "", linkedin: "" });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const isEdit = mode === "edit";

    useEffect(() => {
        // Decode token to check role
        try {
            const token = getToken();
            if (token) setCurrentUser(jwtDecode(token));
        } catch (e) { console.error("Token error", e); }

        if (isEdit && id) {
            loadUser();
        }
    }, [isEdit, id]);

    async function loadUser() {
        setLoading(true);
        try {
            const { user } = await apiJson(`/users/${id}`, { auth: true });
            setEmail(user.email);
            setRole(user.role);
            setName(user.name || "");
            setBio(user.bio || "");
            setAvatarUrl(user.avatar_url || "");
            setSocialLinks(user.social_links || { twitter: "", instagram: "" });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const body = { email, role, name, bio, avatar_url: avatarUrl, social_links: socialLinks };
            if (password) body.password = password;

            // Non-admins cannot change role or email
            if (currentUser?.role !== 'admin') {
                delete body.role;
                delete body.email;
            }

            if (isEdit) {
                await apiJson(`/users/${id}`, { method: "PATCH", body, auth: true });
            } else {
                await apiJson("/users", { method: "POST", body, auth: true });
            }
            navigate("/users");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const isAdmin = currentUser?.role === "admin";

    if (loading && isEdit && !email) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando perfil profesional...</div>;

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ ...styles.btnSecondary, padding: "8px 12px", border: "none", background: "transparent" }}
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                    {isEdit ? "Editar Perfil" : "Crear Nuevo Usuario"}
                </h1>
            </header>

            {error && (
                <div style={{ background: "#fff1f2", color: "#e11d48", padding: "16px", borderRadius: "12px", marginBottom: "25px", border: "1px solid #ffe4e6", fontSize: "0.9rem" }}>
                    ⚠️ {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={styles.card}>
                    <div style={styles.sectionTitle}><User size={20} color="#2563eb" /> Información Personal</div>
                    <div style={styles.fieldGroup}>
                        <div>
                            <label style={styles.label}>Nombre Completo</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej. Juan Pérez"
                            />
                        </div>
                        <div>
                            <label style={styles.label}>Email {isAdmin ? "" : "(Solo Admin)"}</label>
                            <input
                                type="email"
                                required
                                disabled={!isAdmin}
                                style={{ ...styles.input, opacity: isAdmin ? 1 : 0.6 }}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={styles.label}>Rol en el Sistema</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            style={{ ...styles.input, opacity: isAdmin ? 1 : 0.6 }}
                            disabled={!isAdmin}
                        >
                            <option value="editor">Editor (Redacción)</option>
                            <option value="admin">Administrador (Control Total)</option>
                            <option value="reader">Colaborador Externo</option>
                        </select>
                    </div>

                    <div>
                        <label style={styles.label}>Biografía / Perfil</label>
                        <textarea
                            style={styles.textarea}
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Breve descripción del autor..."
                        />
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.sectionTitle}><ImageIcon size={20} color="#2563eb" /> Identidad Visual</div>
                    <div>
                        <label style={styles.label}>Avatar URL</label>
                        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                            {avatarUrl && <img src={avatarUrl} style={{ width: 50, height: 50, borderRadius: "50%", objectFit: "cover" }} alt="preview" />}
                            <input
                                type="text"
                                style={styles.input}
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                placeholder="https://..."
                            />
                        </div>
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.sectionTitle}><LinkIcon size={20} color="#2563eb" /> Enlaces Sociales</div>
                    <div style={styles.socialGrid}>
                        <div>
                            <label style={styles.label}>Twitter</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={socialLinks.twitter || ""}
                                onChange={(e) => setSocialLinks({ ...socialLinks, twitter: e.target.value })}
                            />
                        </div>
                        <div>
                            <label style={styles.label}>Instagram</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={socialLinks.instagram || ""}
                                onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                            />
                        </div>
                        <div>
                            <label style={styles.label}>LinkedIn</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={socialLinks.linkedin || ""}
                                onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.sectionTitle}><Lock size={20} color="#2563eb" /> Seguridad</div>
                    <div>
                        <label style={styles.label}>
                            {isEdit ? "Cambiar Contraseña (Opcional)" : "Establecer Contraseña"}
                        </label>
                        <div style={{ position: "relative" }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                required={!isEdit}
                                style={{ ...styles.input, paddingRight: "45px" }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: "absolute",
                                    right: 12,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 4,
                                    display: "flex",
                                    alignItems: "center",
                                    color: "#64748b"
                                }}
                                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", gap: "15px", marginTop: "30px" }}>
                    <button type="submit" style={styles.btnPrimary} disabled={loading}>
                        {loading ? "Procesando..." : (isEdit ? "Guardar Cambios" : "Crear Usuario")}
                    </button>
                    <button type="button" onClick={() => navigate(-1)} style={styles.btnSecondary}>
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
}
