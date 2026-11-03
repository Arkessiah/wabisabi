import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El access token de substratum caduca a los 15 min y cada refresh token vale
// una sola vez. Por eso todas las peticiones que fallen a la vez comparten un
// único refresh en vuelo: dos refresh en paralelo quemarían el token y echarían
// al usuario.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;
  try {
    // axios "pelado" para que este 401 no vuelva a entrar en el interceptor.
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
    if (!data?.accessToken || !data?.refreshToken) return null;
    localStorage.setItem("token", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

function endSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  window.location.href = "/login";
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Un 401 de estas rutas es "credenciales malas", no "token caducado".
    const isAuthCall = /^\/auth\/(login|register|refresh|logout)\b/.test(original?.url ?? "");
    if (
      error.response?.status !== 401 ||
      typeof window === "undefined" ||
      !original ||
      original._retried ||
      isAuthCall
    ) {
      if (error.response?.status === 401 && typeof window !== "undefined" && !isAuthCall) {
        endSession();
      }
      return Promise.reject(error);
    }

    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const token = await refreshInFlight;
    if (!token) {
      endSession();
      return Promise.reject(error);
    }
    original._retried = true;
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

// ── Auth ──────────────────────────────────────────────

export async function login(email: string, password: string) {
  const response = await api.post("/auth/login", { email, password });
  const token = response.data.accessToken || response.data.token;
  if (token) localStorage.setItem("token", token);
  if (response.data.refreshToken) localStorage.setItem("refreshToken", response.data.refreshToken);
  return response.data;
}

export async function register(data: { email: string; password: string; name?: string }) {
  const response = await api.post("/auth/register", data);
  const token = response.data.accessToken || response.data.token;
  if (token) localStorage.setItem("token", token);
  if (response.data.refreshToken) localStorage.setItem("refreshToken", response.data.refreshToken);
  return response.data;
}

export async function logout() {
  try { await api.post("/auth/logout"); } catch {}
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
}

export async function getMe() {
  const response = await api.get("/me");
  return response.data;
}

// ── Billing ───────────────────────────────────────────

export async function getBillingAccount() {
  const response = await api.get("/v1/billing/account");
  return response.data;
}

export async function getBillingBalance() {
  const response = await api.get("/v1/billing/balance");
  return response.data;
}

export async function getBillingPlans() {
  const response = await api.get("/v1/billing/plans");
  return response.data;
}

export async function changePlan(planId: string) {
  const response = await api.post("/v1/billing/plan", { planId });
  return response.data;
}

export async function getBillingUsage(days = 30) {
  const response = await api.get(`/v1/billing/usage?days=${days}`);
  return response.data;
}

export async function getBillingTransactions(limit = 50) {
  const response = await api.get(`/v1/billing/transactions?limit=${limit}`);
  return response.data;
}

// ── API Keys ──────────────────────────────────────────

export async function listApiKeys() {
  const response = await api.get("/auth/api-keys");
  return response.data;
}

export async function createApiKey(name: string, expiresInDays?: number) {
  const response = await api.post("/auth/api-keys", { name, expiresInDays });
  return response.data;
}

export async function revokeApiKey(id: string) {
  const response = await api.delete(`/auth/api-keys/${id}`);
  return response.data;
}

// ── Models ────────────────────────────────────────────

export async function listModels() {
  const response = await api.get("/v1/models");
  return response.data;
}

// ── Health ────────────────────────────────────────────

export async function healthCheck() {
  const response = await api.get("/health");
  return response.data;
}

export default api;
