import React, { useState } from "react";
import { apiJson, setToken } from "../api.js";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("editor@local.com");
  const [password, setPassword] = useState("Password123!");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await apiJson("/auth/login", { method: "POST", body: { email, password } });
      if (!data?.token) throw new Error("Login OK pero sin token en respuesta");
      setToken(data.token);
      navigate("/posts");
    } catch (e2) {
      setErr(e2.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui" }}>
      <h2>Ingresar al CMS</h2>
      <form onSubmit={submit} style={{ background: "white", padding: 16, borderRadius: 12 }}>
        <label style={{ display: "block", marginTop: 10 }}>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label style={{ display: "block", marginTop: 10 }}>
          Password
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 8,
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
        </label>

        <button disabled={loading} style={{ marginTop: 12, padding: "10px 14px" }}>
          {loading ? "Entrando..." : "Login"}
        </button>

        {err ? <div style={{ marginTop: 10, color: "crimson" }}>{err}</div> : null}
      </form>
    </div>
  );
}
