/**
 * Onboarding & Setup Wizard
 *
 * First-run experience: interactive provider setup, connectivity test,
 * config generation. Also provides re-run via `wabisabi config --wizard`.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { configManager } from "./config/index.js";
import type { ProvidersConfig, OllamaNode } from "./config/schema.js";
import {
  askChoice,
  askInput,
  askConfirm,
  askMultipleNodes,
  testEndpoint,
} from "./wizard/prompts.js";

const WABISABI_DIR = join(homedir(), ".wabisabi");
const CONFIG_FILE = join(WABISABI_DIR, "config.jsonc");
const ONBOARDING_MARKER = join(WABISABI_DIR, ".onboarded");

// ── Helpers ────────────────────────────────────────────────────

export function isFirstRun(): boolean {
  return !existsSync(ONBOARDING_MARKER);
}

export function markOnboarded(): void {
  try {
    mkdirSync(WABISABI_DIR, { recursive: true });
    writeFileSync(ONBOARDING_MARKER, new Date().toISOString(), "utf-8");
  } catch {}
}

export function ensureConfigExample(): boolean {
  if (existsSync(CONFIG_FILE)) return false;
  try {
    mkdirSync(WABISABI_DIR, { recursive: true });
    // BAJA-3: Restrict config file permissions
    writeFileSync(CONFIG_FILE, JSON.stringify(configManager.getGlobal(), null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Banner ─────────────────────────────────────────────────────

function showBanner(): void {
  console.log(chalk.bold.cyan(`
  ╔══════════════════════════════════════════════╗
  ║     Welcome to WabiSabi Terminal IDE         ║
  ║     AI-powered coding assistant              ║
  ╚══════════════════════════════════════════════╝
`));
}

function showQuickStart(): void {
  console.log(chalk.bold("\n  Quick Start"));
  console.log(chalk.dim("  ──────────────────────────────────"));
  console.log("  Type your request and press Enter");
  console.log("  Use /help for all commands");
  console.log("  Use /tools to see available tools");
  console.log("  Use /approve to auto-approve tool calls");
  console.log("  Type exit to quit");
  console.log(chalk.dim("  ──────────────────────────────────"));

  console.log(chalk.bold("\n  Agents"));
  console.log("  build   - Write and modify code (default)");
  console.log("  plan    - Analyze and plan architecture");
  console.log("  search  - Explore and find code");
  console.log(chalk.dim("  Switch with: wabisabi agent <name>\n"));
}

// ── Provider Setup ─────────────────────────────────────────────

async function setupProviders(): Promise<ProvidersConfig> {
  const mode = await askChoice("How do you want to use WabiSabi?", [
    { value: "local", label: "Ollama local (single machine)" },
    { value: "cluster", label: "Ollama cluster (multiple machines)" },
    { value: "substratum", label: "Substratum only (cloud)" },
    { value: "both", label: "Substratum + Ollama (recommended)" },
  ]);

  let providers: ProvidersConfig;

  if (mode === "local") {
    const url = await askInput("Ollama URL", "http://localhost:11434");
    providers = {
      substratum: { enabled: false, url: "https://api.substratum.dev" },
      ollama: {
        mode: "local",
        nodes: [{ name: "local", url, priority: 5 }],
      },
    };
  } else if (mode === "cluster") {
    console.log(chalk.dim("\n  Add your Ollama nodes (different machines):"));
    const nodes = await askMultipleNodes();
    providers = {
      substratum: { enabled: false, url: "https://api.substratum.dev" },
      ollama: { mode: "cluster", nodes },
    };
  } else if (mode === "substratum") {
    const url = await askInput("Substratum URL", "https://api.substratum.dev");
    const apiKey = await askInput("API Key (or press Enter to skip)");
    providers = {
      substratum: {
        enabled: true,
        url,
        apiKey: apiKey || undefined,
      },
      ollama: { mode: "local", nodes: [] },
    };
  } else {
    // both
    const substratumUrl = await askInput("Substratum URL", "https://api.substratum.dev");
    const apiKey = await askInput("Substratum API Key (or press Enter to skip)");

    const ollamaMode = await askChoice("Ollama setup:", [
      { value: "local", label: "Single local instance" },
      { value: "cluster", label: "Multiple machines (cluster)" },
    ]);

    let nodes: OllamaNode[];
    if (ollamaMode === "cluster") {
      console.log(chalk.dim("\n  Add your Ollama nodes:"));
      nodes = await askMultipleNodes();
    } else {
      const url = await askInput("Ollama URL", "http://localhost:11434");
      nodes = [{ name: "local", url, priority: 5 }];
    }

    providers = {
      substratum: {
        enabled: true,
        url: substratumUrl,
        apiKey: apiKey || undefined,
      },
      ollama: {
        mode: ollamaMode === "cluster" ? "cluster" : "local",
        nodes,
      },
    };
  }

  return providers;
}

// ── Connectivity Test ──────────────────────────────────────────

async function testConnectivity(providers: ProvidersConfig): Promise<void> {
  console.log(chalk.dim("\n  Testing connectivity...\n"));

  // Test Substratum
  if (providers.substratum.enabled) {
    const result = await testEndpoint(providers.substratum.url, "/v1/models");
    if (result.ok) {
      console.log(chalk.green(`  ✓ Substratum: connected (${providers.substratum.url})`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  ✗ Substratum: not reachable (${providers.substratum.url})`));
    }
  }

  // Test Ollama nodes
  for (const node of providers.ollama.nodes) {
    const result = await testEndpoint(node.url, "/api/tags");
    if (result.ok) {
      console.log(chalk.green(`  ✓ ${node.name}: connected (${node.url})${node.gpu ? ` [${node.gpu}]` : ""}`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  ✗ ${node.name}: not reachable (${node.url})`));
    }
  }
}

// ── Main Onboarding Flow ───────────────────────────────────────

export async function runOnboarding(): Promise<void> {
  showBanner();

  // Skip interactive setup if env indicates non-interactive
  if (process.env.WABISABI_SKIP_ONBOARDING) {
    ensureConfigExample();
    markOnboarded();
    return;
  }

  // Interactive provider setup
  const providers = await setupProviders();

  // Test connectivity
  await testConnectivity(providers);

  // Select model
  const model = await askInput("Default model", "llama3.2");

  // Save config
  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");
  ensureConfigExample();

  console.log(chalk.green(`\n  ✓ Configuration saved to ${CONFIG_FILE}`));
  console.log(chalk.dim(`  Run 'wabisabi config --wizard' anytime to change settings.\n`));

  showQuickStart();
  markOnboarded();
}

/**
 * Re-run provider setup (called from `wabisabi config --wizard`).
 * Does not show banner or quick-start.
 */
export async function runProviderSetup(): Promise<void> {
  const providers = await setupProviders();
  await testConnectivity(providers);

  const model = await askInput("Default model", configManager.getGlobal().model);

  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");

  console.log(chalk.green(`\n  ✓ Configuration updated.\n`));
}
