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

// ── Trends (Sprint 5.3) ───────────────────────────────────────────────────────

export const getTrends = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.minArticles) qs.set('min_articles', params.minArticles);
  if (params.limit)       qs.set('limit', params.limit);
  return apiJson(`/trends?${qs}`, { auth: true });
};

export const getTrend = (id) =>
  apiJson(`/trends/${id}`, { auth: true });

export const getTrendArticles = (id, params = {}) => {
  const qs = new URLSearchParams();
  if (params.limit)  qs.set('limit', params.limit);
  if (params.offset) qs.set('offset', params.offset);
  return apiJson(`/trends/${id}/articles?${qs}`, { auth: true });
};

export const followTrend = (id) =>
  apiJson(`/trends/${id}/follow`, { method: 'POST', auth: true });

export const createDossierFromTrend = (id) =>
  apiJson(`/trends/${id}/create-dossier`, { method: 'POST', auth: true });

// ── Stories (Sprint 5.5) ─────────────────────────────────────────────────────

export const getStories = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.minArticles) qs.set('min_articles', params.minArticles);
  if (params.limit)       qs.set('limit', params.limit);
  if (params.includeAll)  qs.set('include_all', 'true');
  return apiJson(`/stories?${qs}`, { auth: true });
};

export const getStory = (id) =>
  apiJson(`/stories/${id}`, { auth: true });

export const getStoryArticles = (id, params = {}) => {
  const qs = new URLSearchParams();
  if (params.limit)  qs.set('limit', params.limit);
  if (params.offset) qs.set('offset', params.offset);
  return apiJson(`/stories/${id}/articles?${qs}`, { auth: true });
};

export const followStory = (id) =>
  apiJson(`/stories/${id}/follow`, { method: 'POST', auth: true });

export const createDossierFromStory = (id) =>
  apiJson(`/stories/${id}/create-dossier`, { method: 'POST', auth: true });

// ── Events (Sprint 5.6) ──────────────────────────────────────────────────────

export const getEvents = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.minStories) qs.set('min_stories', params.minStories);
  if (params.limit)      qs.set('limit', params.limit);
  return apiJson(`/events?${qs}`, { auth: true });
};

export const getEvent = (id) =>
  apiJson(`/events/${id}`, { auth: true });

export const getEventStories = (id) =>
  apiJson(`/events/${id}/stories`, { auth: true });

export const getEventArticles = (id, params = {}) => {
  const qs = new URLSearchParams();
  if (params.limit)  qs.set('limit', params.limit);
  if (params.offset) qs.set('offset', params.offset);
  return apiJson(`/events/${id}/articles?${qs}`, { auth: true });
};

export const getEventOpportunities = (id) =>
  apiJson(`/events/${id}/opportunities`, { auth: true });

export const updateOpportunityStatus = (eventId, oppId, status) =>
  apiJson(`/events/${eventId}/opportunities/${oppId}`, { method: 'PATCH', body: { status }, auth: true });

export const followEvent = (id) =>
  apiJson(`/events/${id}/follow`, { method: 'POST', auth: true });

export const createDossierFromEvent = (id) =>
  apiJson(`/events/${id}/create-dossier`, { method: 'POST', auth: true });

// ── Editorial Opportunities (Sprint 5.6.1) ───────────────────────────────────

export const getOpportunities = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.limit)  qs.set('limit', params.limit);
  if (params.status) qs.set('status', params.status);
  if (params.type)   qs.set('type', params.type);
  return apiJson(`/opportunities?${qs}`, { auth: true });
};

export const getOpportunitiesSummary = () =>
  apiJson('/opportunities/summary', { auth: true });

export const updateStoryOpportunityStatus = (id, status) =>
  apiJson(`/opportunities/${id}`, { method: 'PATCH', body: { status }, auth: true });

export const createDossierFromOpportunity = (id) =>
  apiJson(`/opportunities/${id}/create-dossier`, { method: 'POST', auth: true });

