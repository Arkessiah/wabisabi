/**
 * Onboarding & Setup Wizard
 *
 * First-run experience: language, provider strategy, Ollama setup,
 * Substratum account, connectivity test. Rich 8-bit banner.
 * Also re-runnable via `wabisabi config --wizard`.
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
import { showBanner, showQuickStartGuide } from "./tui/banner.js";

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
    // BAJA-3: Restrict config permissions (user-only read/write)
    writeFileSync(CONFIG_FILE, JSON.stringify(configManager.getGlobal(), null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Ollama Detection ──────────────────────────────────────────

async function isOllamaInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "ollama"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// ── Provider Setup ─────────────────────────────────────────────

async function setupProviders(strategy: string): Promise<ProvidersConfig> {
  let providers: ProvidersConfig;

  if (strategy === "local") {
    // Ollama only
    const hasOllama = await isOllamaInstalled();
    if (!hasOllama) {
      console.log(chalk.yellow("\n  Ollama is not installed."));
      const install = await askConfirm("Install Ollama now?", true);
      if (install) {
        console.log(chalk.cyan("  Run: ") + chalk.bold("wabi ollama --install") + chalk.cyan(" after setup."));
      }
    }

    const ollamaMode = await askChoice("Ollama mode:", [
      { value: "local", label: "Single local instance" },
      { value: "cluster", label: "Multiple machines (cluster)" },
    ]);

    let nodes: OllamaNode[];
    if (ollamaMode === "cluster") {
      nodes = await askMultipleNodes();
    } else {
      const url = await askInput("Ollama URL", "http://localhost:11434");
      nodes = [{ name: "local", url, priority: 5 }];
    }

    providers = {
      substratum: { enabled: false, url: "https://api.substratum.dev" },
      ollama: { mode: ollamaMode === "cluster" ? "cluster" : "local", nodes },
    };
  } else if (strategy === "cloud") {
    // Substratum only
    const url = await askInput("Substratum URL", "https://api.substratum.dev");
    providers = {
      substratum: { enabled: true, url },
      ollama: { mode: "local", nodes: [] },
    };
  } else {
    // Hybrid (local-first or cloud-first)
    const substratumUrl = await askInput("Substratum URL", "https://api.substratum.dev");

    const hasOllama = await isOllamaInstalled();
    let nodes: OllamaNode[];
    let ollamaMode: "local" | "cluster" = "local";

    if (hasOllama) {
      console.log(chalk.green("  ✓ Ollama detected"));
      const mode = await askChoice("Ollama setup:", [
        { value: "local", label: "Single local instance" },
        { value: "cluster", label: "Multiple machines (cluster)" },
      ]);
      ollamaMode = mode === "cluster" ? "cluster" : "local";

      if (ollamaMode === "cluster") {
        nodes = await askMultipleNodes();
      } else {
        const url = await askInput("Ollama URL", "http://localhost:11434");
        nodes = [{ name: "local", url, priority: 5 }];
      }
    } else {
      console.log(chalk.yellow("  Ollama not installed. Run 'wabi ollama --install' later."));
      const url = await askInput("Ollama URL (or skip)", "http://localhost:11434");
      nodes = [{ name: "local", url, priority: 5 }];
    }

    providers = {
      substratum: { enabled: true, url: substratumUrl },
      ollama: { mode: ollamaMode, nodes },
    };
  }

  return providers;
}

// ── Account Setup ──────────────────────────────────────────────

async function setupAccount(): Promise<void> {
  const accountAction = await askChoice("Substratum account:", [
    { value: "login", label: "Login with existing account" },
    { value: "register", label: "Create new account (opens browser)" },
    { value: "apikey", label: "Use API key" },
    { value: "skip", label: "Skip for now" },
  ]);

  if (accountAction === "login") {
    console.log(chalk.cyan("\n  Run: ") + chalk.bold("wabi login") + chalk.cyan(" to authenticate.\n"));
  } else if (accountAction === "register") {
    console.log(chalk.cyan("\n  Run: ") + chalk.bold("wabi account --register") + chalk.cyan(" to create your account.\n"));
  } else if (accountAction === "apikey") {
    const key = await askInput("API Key");
    if (key) {
      const providers = configManager.getProviders();
      providers.substratum.apiKey = key;
      configManager.update("providers", providers, "global");
      console.log(chalk.green("  ✓ API key saved"));
    }
  }
}

// ── Connectivity Test ──────────────────────────────────────────

async function testConnectivity(providers: ProvidersConfig): Promise<void> {
  console.log(chalk.dim("\n  Testing connectivity...\n"));

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
  // 1. Banner
  console.log(showBanner());

  // Skip interactive if env set
  if (process.env.WABISABI_SKIP_ONBOARDING) {
    ensureConfigExample();
    markOnboarded();
    return;
  }

  // 2. Language
  const locale = await askChoice("Select language / Selecciona idioma:", [
    { value: "en", label: "English" },
    { value: "es", label: "Espanol" },
    { value: "auto", label: "Auto-detect (system locale)" },
  ]);
  configManager.update("locale", locale, "global");

  // 3. Provider Strategy
  const strategy = await askChoice(
    locale === "es"
      ? "Como quieres usar los modelos de IA?"
      : "How do you want to use AI models?",
    [
      {
        value: "hybrid-local-first",
        label: locale === "es"
          ? "Hibrido: Ollama para lo simple, Substratum para lo complejo (recomendado)"
          : "Hybrid: Ollama for simple tasks, Substratum for complex (recommended)",
      },
      {
        value: "hybrid-cloud-first",
        label: locale === "es"
          ? "Hibrido: Substratum primario, Ollama como respaldo"
          : "Hybrid: Substratum primary, Ollama fallback",
      },
      {
        value: "local",
        label: locale === "es"
          ? "Solo local (Ollama) - Privado, gratis, requiere GPU"
          : "Local only (Ollama) - Private, free, requires GPU",
      },
      {
        value: "cloud",
        label: locale === "es"
          ? "Solo nube (Substratum) - Modelos potentes, consume tokens"
          : "Cloud only (Substratum) - Powerful models, costs tokens",
      },
    ],
  );
  configManager.update("providerStrategy", strategy, "global");

  // 4. Provider setup based on strategy
  const providers = await setupProviders(strategy);

  // 5. Account setup (if using Substratum)
  if (strategy !== "local") {
    await setupAccount();
  }

  // 6. Default model
  const modelSuggestion = strategy === "cloud" ? "gpt-4o" : "llama3.2";
  const model = await askInput(
    locale === "es" ? "Modelo por defecto" : "Default model",
    modelSuggestion,
  );

  // 7. Save config
  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");
  ensureConfigExample();

  // 8. Test connectivity
  await testConnectivity(providers);

  // 9. Summary
  console.log(chalk.green(`\n  ✓ ${locale === "es" ? "Configuracion guardada" : "Configuration saved"}`));
  console.log(chalk.dim(`    ${CONFIG_FILE}\n`));

  console.log(showQuickStartGuide());
  markOnboarded();
}

/**
 * Re-run provider setup (called from `wabisabi config --wizard`).
 */
export async function runProviderSetup(): Promise<void> {
  const strategy = configManager.getMerged().providerStrategy || "hybrid-local-first";
  const providers = await setupProviders(strategy);
  await testConnectivity(providers);

  const model = await askInput("Default model", configManager.getGlobal().model);

  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");

  console.log(chalk.green(`\n  ✓ Configuration updated.\n`));
}
