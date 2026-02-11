export interface User {
  id: string;
  email: string;
  name: string;
  plan: "free" | "hobby" | "pro" | "team" | "enterprise";
  tokenBalance: number;
  gpuHours: number;
  createdAt: string;
}

export interface Model {
  id: string;
  name: string;
  family: string;
  parameters: string;
  contextLength: number;
  type: "free" | "gpu" | "api";
  cost?: string;
  available: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
  updatedAt: string;
  model: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: "research" | "code" | "analysis" | "monitor" | "custom";
  status: "idle" | "running" | "paused" | "completed" | "failed";
  task: string;
  result?: string;
  createdAt: string;
}

export interface UsageStats {
  tokensUsed: number;
  tokensLimit: number;
  gpuHoursUsed: number;
  gpuHoursLimit: number;
  apiCalls: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    redis: boolean;
    ollama: boolean;
    postgres: boolean;
    chromadb: boolean;
  };
}
