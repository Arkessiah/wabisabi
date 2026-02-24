/**
 * WabiSabi Core - Shared Constants
 *
 * Central source of truth for URLs, paths, and configuration defaults
 * shared across the CLI and VS Code extension.
 */

import { homedir } from "os";
import { join } from "path";

// ── Filesystem Paths ───────────────────────────────────────────

export const WABISABI_DIR = join(homedir(), ".wabisabi");
export const CONFIG_FILE = join(WABISABI_DIR, "config.jsonc");
export const ONBOARDING_MARKER = join(WABISABI_DIR, ".onboarded");

// ── External URLs ──────────────────────────────────────────────

export const WEB_URL = "https://wabisabi.dev";
export const REGISTER_URL = `${WEB_URL}/register`;
export const LOGIN_URL = `${WEB_URL}/login`;
export const SUBSTRATUM_API_URL = "https://api.substratum.dev";

// ── Model Defaults ─────────────────────────────────────────────

export const DEFAULT_MODEL = "llama3.2";

// ── Provider Strategies ────────────────────────────────────────

export interface ProviderStrategy {
  id: string;
  label: string;
  desc: string;
}

export const PROVIDER_STRATEGIES: ProviderStrategy[] = [
  { id: "local", label: "Ollama Local Only", desc: "Private, free, requires local GPU" },
  { id: "cluster", label: "Ollama Cluster Only", desc: "Multiple machines, no cloud dependency" },
  { id: "cloud", label: "Substratum Cloud Only", desc: "Powerful models, consumes tokens" },
  { id: "cluster-cloud", label: "Cluster + Substratum", desc: "Multiple machines with cloud fallback" },
  { id: "hybrid-local-first", label: "Local + Substratum (local-first)", desc: "Ollama for simple tasks, cloud for complex (recommended)" },
  { id: "hybrid-cloud-first", label: "Substratum + Local (cloud-first)", desc: "Cloud primary, Ollama as fallback" },
  { id: "hybrid-full", label: "Full Hybrid (local + cluster + cloud)", desc: "Distribute load, minimize paid tokens" },
];
