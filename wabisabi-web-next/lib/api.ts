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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export async function healthCheck() {
  const response = await api.get("/health");
  return response.data;
}

export async function listModels() {
  const response = await api.get("/v1/models");
  return response.data;
}

export async function chatCompletion(
  messages: { role: string; content: string }[],
  model: string,
  stream = false,
) {
  const response = await api.post("/v1/chat/completions", {
    messages,
    model,
    stream,
  });
  return response.data;
}

export async function getUserProfile() {
  const response = await api.get("/auth/profile");
  return response.data;
}

export async function login(email: string, password: string) {
  const response = await api.post("/auth/login", { email, password });
  if (response.data.token) {
    localStorage.setItem("token", response.data.token);
  }
  return response.data;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
}) {
  const response = await api.post("/auth/register", data);
  if (response.data.token) {
    localStorage.setItem("token", response.data.token);
  }
  return response.data;
}

export async function getProjects() {
  const response = await api.get("/projects");
  return response.data;
}

export async function createProject(name: string, description: string) {
  const response = await api.post("/projects", { name, description });
  return response.data;
}

export async function getUsageStats() {
  const response = await api.get("/usage/stats");
  return response.data;
}

export async function getModels() {
  const response = await api.get("/models");
  return response.data;
}

export async function getAgents() {
  const response = await api.get("/agents");
  return response.data;
}

export async function createAgent(config: any, task: any) {
  const response = await api.post("/agents", { config, task });
  return response.data;
}

export default api;
