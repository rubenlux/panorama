export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// --- Auth token helpers ---
export function getToken() {
  return localStorage.getItem("cms_token") || "";
}

export function setToken(token) {
  localStorage.setItem("cms_token", token);
}

export function clearToken() {
  localStorage.removeItem("cms_token");
}

// --- Helpers para normalizar respuestas ---
export function pickItems(data) {
  if (Array.isArray(data)) return data;
  return data?.items || data?.rows || [];
}

export function pickArticle(data) {
  return data?.article || data?.data || data;
}

// --- URL helper (para /uploads/xxx) ---
export function resolveUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}

// --- JSON API client ---
export async function apiJson(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      console.error(`🔴 AUTH FAILED - Endpoint: ${method} ${path} - Status: ${res.status} - Error:`, data?.error);
      console.error('🔴 TOKEN:', getToken()?.substring(0, 50) + '...');
      clearToken();
      window.location.href = "/login";
    }
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

// --- Upload API client (multipart/form-data) ---
export async function apiUpload(path, file, { fieldName = "file", auth = true } = {}) {
  const headers = {};

  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  const fd = new FormData();
  fd.append(fieldName, file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: fd,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearToken();
      window.location.href = "/login";
    }
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function uploadFile(formData) {
  const t = getToken();
  const headers = {};
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}/media`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearToken();
      window.location.href = "/login";
    }
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  // Standardize return: existing backend /media returns { media: ... }
  // Settings.jsx expects res.url, so we return the object containing url
  return data.media || data;
}

