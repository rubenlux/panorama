export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export function resolveUrl(u) {
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) return `${API_BASE}${u}`;
    return `${API_BASE}/${u}`;
}

export async function apiJson(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}
