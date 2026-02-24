/**
 * WabiSabi Core - Shared Types & Interfaces
 *
 * Canonical type definitions used across the CLI terminal package
 * and future consumers (VS Code extension, web dashboard, etc.).
 */

// ── Tool Types ─────────────────────────────────────────────────

export interface ToolResult {
  title: string;
  output: string;
  metadata: Record<string, unknown>;
}

export interface ToolContext {
  projectRoot: string;
  sessionId?: string;
  abort?: AbortSignal;
}

// ── Agent Types ────────────────────────────────────────────────

export type AgentType = "build" | "plan" | "search";

export interface AgentInfo {
  type: AgentType;
  label: string;
  description: string;
  shortcut?: string;
}

// ── Provider / Config Types ────────────────────────────────────

export interface OllamaNode {
  name: string;
  url: string;
  gpu?: "nvidia" | "amd" | "metal" | "cpu";
  priority: number;
}

export interface OllamaProviderConfig {
  mode: "local" | "cluster";
  nodes: OllamaNode[];
}

export interface SubstratumProviderConfig {
  enabled: boolean;
  url: string;
  apiKey?: string;
}

export interface ProvidersConfig {
  substratum: SubstratumProviderConfig;
  ollama: OllamaProviderConfig;
}

// ── Auth Types ─────────────────────────────────────────────────

export type AuthProvider = "substratum" | "github" | "apikey";

export interface AuthConfig {
  provider: AuthProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  email?: string;
  sessionId?: string;
}

// ── Command Palette Types ──────────────────────────────────────

export type PaletteSection =
  | "agents"
  | "models"
  | "tokens"
  | "providers"
  | "sessions"
  | "profiles"
  | "strategies"
  | "settings";

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  active?: boolean;
  section: PaletteSection;
}

export interface PaletteResult {
  section: PaletteSection;
  itemId: string;
}
