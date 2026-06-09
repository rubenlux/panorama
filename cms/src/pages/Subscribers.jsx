import { useEffect, useState } from "react";
import { apiJson } from "../api";

export default function Subscribers() {
    const [subscribers, setSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiJson("/marketing/subscribers", { auth: true })
            .then((res) => {
                if (res.data) setSubscribers(res.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const exportCSV = () => {
        const headers = "ID,Email,Estado,Fecha de Registro\n";
        const rows = subscribers.map(s =>
            `"${s.id}","${s.email}","${s.status}","${new Date(s.created_at).toLocaleString()}"`
        ).join("\n");
        const blob = new Blob([headers + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h1>Suscriptores ({subscribers.length})</h1>
                <button
                    onClick={exportCSV}
                    style={{ background: "#22c55e", color: "white", padding: "8px 16px", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                >
                    Descargar CSV
                </button>
            </div>

            <div style={{ background: "white", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <tr>
                            <th style={{ padding: 12, fontSize: 13, color: "#64748b" }}>EMAIL</th>
                            <th style={{ padding: 12, fontSize: 13, color: "#64748b" }}>ESTADO</th>
                            <th style={{ padding: 12, fontSize: 13, color: "#64748b" }}>FECHA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subscribers.map((s) => (
                            <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: 12, fontWeight: 500 }}>{s.email}</td>
                                <td style={{ padding: 12 }}>
                                    <span style={{
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        background: s.status === 'active' ? '#dcfce7' : '#f1f5f9',
                                        color: s.status === 'active' ? '#166534' : '#64748b'
                                    }}>
                                        {s.status.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ padding: 12, color: "#64748b", fontSize: 13 }}>
                                    {new Date(s.created_at).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                        {subscribers.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: 20, textAlign: "center", fontStyle: "italic", color: "#94a3b8" }}>
                                    No hay suscriptores aún.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
