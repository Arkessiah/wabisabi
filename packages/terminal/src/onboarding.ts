/**
 * Onboarding & Setup Wizard
 *
 * First-run experience:
 *   1. Banner + Welcome
 *   2. Language selection
 *   3. Account creation / login (opens browser)
 *   4. Provider strategy (local, cluster, cloud, hybrids)
 *   5. Provider configuration (Ollama nodes, Substratum URL)
 *   6. Model selection
 *   7. Connectivity test
 *   8. Summary + Quick Start
 *
 * Re-runnable via `wabisabi config --wizard`.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
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

const REGISTER_URL = "https://wabisabi.dev/register";
const LOGIN_URL = "https://wabisabi.dev/login";

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
    // BAJA-3: restrict config file permissions
    writeFileSync(CONFIG_FILE, JSON.stringify(configManager.getGlobal(), null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Open browser (cross-platform) ────────────────────────────

async function openBrowser(url: string): Promise<boolean> {
  try {
    const os = platform();
    let cmd: string[];
    if (os === "darwin") {
      cmd = ["open", url];
    } else if (os === "win32") {
      cmd = ["cmd", "/c", "start", url];
    } else {
      // Linux: try xdg-open, then sensible-browser
      cmd = ["xdg-open", url];
    }
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// ── Ollama Detection ──────────────────────────────────────────

async function isOllamaInstalled(): Promise<boolean> {
  try {
    const cmd = platform() === "win32" ? ["where", "ollama"] : ["which", "ollama"];
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// ── Account Setup ─────────────────────────────────────────────

async function setupAccount(locale: string): Promise<void> {
  console.log("");
  console.log(chalk.bold(locale === "es"
    ? "  Cuenta WabiSabi"
    : "  WabiSabi Account"));
  console.log(chalk.dim("  " + "-".repeat(45)));

  const accountAction = await askChoice(
    locale === "es"
      ? "Que quieres hacer?"
      : "What would you like to do?",
    [
      {
        value: "register",
        label: locale === "es"
          ? "Crear cuenta nueva (abre navegador)"
          : "Create new account (opens browser)",
      },
      {
        value: "login",
        label: locale === "es"
          ? "Iniciar sesion (abre navegador)"
          : "Login to existing account (opens browser)",
      },
      {
        value: "apikey",
        label: locale === "es"
          ? "Tengo una API key"
          : "I have an API key",
      },
      {
        value: "skip",
        label: locale === "es"
          ? "Saltar por ahora"
          : "Skip for now",
      },
    ],
  );

  if (accountAction === "register") {
    console.log("");
    console.log(chalk.cyan("  Opening browser..."));
    const opened = await openBrowser(REGISTER_URL);
    if (opened) {
      console.log(chalk.dim(`  ${REGISTER_URL}`));
      console.log("");
      console.log(chalk.dim(locale === "es"
        ? "  Crea tu cuenta en el navegador. Cuando termines, vuelve aqui."
        : "  Create your account in the browser. When done, come back here."));
    } else {
      console.log(chalk.yellow(locale === "es"
        ? "  No se pudo abrir el navegador. Visita:"
        : "  Could not open browser. Visit:"));
      console.log(chalk.cyan(`  ${REGISTER_URL}`));
    }
    console.log("");
    const apiKey = await askInput(
      locale === "es" ? "Pega tu API key" : "Paste your API key",
    );
    if (apiKey) {
      const providers = configManager.getProviders();
      providers.substratum.apiKey = apiKey;
      configManager.update("providers", providers, "global");
      console.log(chalk.green(locale === "es" ? "  + API key guardada" : "  + API key saved"));
    }
  } else if (accountAction === "login") {
    console.log("");
    console.log(chalk.cyan("  Opening browser..."));
    const opened = await openBrowser(LOGIN_URL);
    if (!opened) {
      console.log(chalk.yellow(locale === "es"
        ? "  No se pudo abrir el navegador. Visita:"
        : "  Could not open browser. Visit:"));
      console.log(chalk.cyan(`  ${LOGIN_URL}`));
    }
    console.log("");
    console.log(chalk.dim(locale === "es"
      ? "  Tambien puedes usar: wabisabi login"
      : "  You can also use: wabisabi login"));
  } else if (accountAction === "apikey") {
    const key = await askInput("API Key");
    if (key) {
      const providers = configManager.getProviders();
      providers.substratum.apiKey = key;
      configManager.update("providers", providers, "global");
      console.log(chalk.green(locale === "es" ? "  + API key guardada" : "  + API key saved"));
    }
  }
}

// ── Ollama Node Setup ─────────────────────────────────────────

async function setupOllamaNodes(locale: string, isCluster: boolean): Promise<{ mode: "local" | "cluster"; nodes: OllamaNode[] }> {
  const hasOllama = await isOllamaInstalled();

  if (!hasOllama) {
    console.log(chalk.yellow(locale === "es"
      ? "\n  Ollama no esta instalado."
      : "\n  Ollama is not installed."));
    const install = await askConfirm(
      locale === "es" ? "Instalar Ollama ahora?" : "Install Ollama now?",
      true,
    );
    if (install) {
      console.log(chalk.cyan(locale === "es"
        ? "  Ejecuta: wabisabi ollama --install despues del setup."
        : "  Run: wabisabi ollama --install after setup."));
    }
  } else {
    console.log(chalk.green(locale === "es" ? "  + Ollama detectado" : "  + Ollama detected"));
  }

  if (isCluster) {
    const nodes = await askMultipleNodes();
    return { mode: "cluster", nodes };
  }

  const url = await askInput(
    locale === "es" ? "URL de Ollama" : "Ollama URL",
    "http://localhost:11434",
  );
  return { mode: "local", nodes: [{ name: "local", url, priority: 5 }] };
}

// ── Provider Setup ────────────────────────────────────────────

async function setupProviders(strategy: string, locale: string): Promise<ProvidersConfig> {
  const needsOllama = ["local", "cluster", "cluster-cloud", "hybrid-local-first", "hybrid-cloud-first", "hybrid-full"].includes(strategy);
  const needsCluster = ["cluster", "cluster-cloud", "hybrid-full"].includes(strategy);
  const needsSubstratum = ["cloud", "cluster-cloud", "hybrid-local-first", "hybrid-cloud-first", "hybrid-full"].includes(strategy);

  let ollamaConfig = { mode: "local" as "local" | "cluster", nodes: [] as OllamaNode[] };
  let substratumUrl = "https://api.substratum.dev";

  if (needsOllama) {
    ollamaConfig = await setupOllamaNodes(locale, needsCluster);
  }

  if (needsSubstratum) {
    substratumUrl = await askInput(
      locale === "es" ? "URL de Substratum" : "Substratum URL",
      "https://api.substratum.dev",
    );
  }

  return {
    substratum: { enabled: needsSubstratum, url: substratumUrl },
    ollama: ollamaConfig,
  };
}

// ── Model Selection ───────────────────────────────────────────

async function selectModel(strategy: string, locale: string): Promise<string> {
  const isLocal = ["local", "cluster"].includes(strategy);
  const isCloud = strategy === "cloud";

  // Suggest models based on strategy
  const localModels = [
    { value: "llama3.2", label: "Llama 3.2 (8B) - " + (locale === "es" ? "Rapido, bueno para codigo" : "Fast, good for code") },
    { value: "codellama", label: "CodeLlama (7B) - " + (locale === "es" ? "Especializado en codigo" : "Code-specialized") },
    { value: "deepseek-coder", label: "DeepSeek Coder (6.7B) - " + (locale === "es" ? "Excelente para codigo" : "Excellent for code") },
    { value: "mistral", label: "Mistral (7B) - " + (locale === "es" ? "General, equilibrado" : "General purpose, balanced") },
  ];

  const cloudModels = [
    { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet - " + (locale === "es" ? "Potente, mejor para codigo" : "Powerful, best for code") },
    { value: "gpt-4o", label: "GPT-4o - " + (locale === "es" ? "Multimodal, muy capaz" : "Multimodal, very capable") },
    { value: "deepseek-v3", label: "DeepSeek V3 - " + (locale === "es" ? "Codigo de alto nivel" : "High-level code") },
  ];

  let choices;
  if (isLocal) {
    choices = localModels;
  } else if (isCloud) {
    choices = cloudModels;
  } else {
    // Hybrid: show both
    choices = [
      ...localModels.slice(0, 2),
      ...cloudModels.slice(0, 2),
    ];
  }

  // Add custom option
  choices.push({
    value: "custom",
    label: locale === "es" ? "Otro (escribir nombre)" : "Other (type name)",
  });

  const model = await askChoice(
    locale === "es" ? "Modelo por defecto:" : "Default model:",
    choices,
  );

  if (model === "custom") {
    return askInput(locale === "es" ? "Nombre del modelo" : "Model name", "llama3.2");
  }

  return model;
}

// ── Connectivity Test ─────────────────────────────────────────

async function testConnectivity(providers: ProvidersConfig, locale: string): Promise<void> {
  console.log(chalk.dim(locale === "es"
    ? "\n  Probando conectividad...\n"
    : "\n  Testing connectivity...\n"));

  if (providers.substratum.enabled) {
    const result = await testEndpoint(providers.substratum.url, "/v1/models");
    if (result.ok) {
      console.log(chalk.green(`  + Substratum: ${locale === "es" ? "conectado" : "connected"} (${providers.substratum.url})`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  - Substratum: ${locale === "es" ? "no accesible" : "not reachable"} (${providers.substratum.url})`));
    }
  }

  for (const node of providers.ollama.nodes) {
    const result = await testEndpoint(node.url, "/api/tags");
    if (result.ok) {
      console.log(chalk.green(`  + ${node.name}: ${locale === "es" ? "conectado" : "connected"} (${node.url})${node.gpu ? ` [${node.gpu}]` : ""}`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  - ${node.name}: ${locale === "es" ? "no accesible" : "not reachable"} (${node.url})`));
    }
  }
}

// ── Main Onboarding Flow ────────────────────────────────────

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

  // 3. Account creation / login
  const wantsAccount = await askConfirm(
    locale === "es"
      ? "Quieres crear o conectar una cuenta WabiSabi?"
      : "Would you like to create or connect a WabiSabi account?",
    true,
  );

  if (wantsAccount) {
    await setupAccount(locale);
  }

  // 4. Provider Strategy
  console.log("");
  console.log(chalk.bold(locale === "es" ? "  Estrategia de Modelos" : "  Model Strategy"));
  console.log(chalk.dim("  " + "-".repeat(45)));

  const strategy = await askChoice(
    locale === "es"
      ? "Como quieres usar los modelos de IA?"
      : "How do you want to use AI models?",
    [
      {
        value: "hybrid-local-first",
        label: locale === "es"
          ? "Local + Substratum: Ollama para lo simple, nube para lo complejo (recomendado)"
          : "Local + Substratum: Ollama for simple, cloud for complex (recommended)",
      },
      {
        value: "hybrid-full",
        label: locale === "es"
          ? "Cluster + Local + Substratum: Distribuir carga, minimizar tokens de pago"
          : "Cluster + Local + Substratum: Distribute load, minimize paid tokens",
      },
      {
        value: "cluster-cloud",
        label: locale === "es"
          ? "Cluster + Substratum: Varias maquinas + nube como respaldo"
          : "Cluster + Substratum: Multiple machines + cloud as fallback",
      },
      {
        value: "hybrid-cloud-first",
        label: locale === "es"
          ? "Substratum + Local: Nube primario, Ollama como respaldo"
          : "Substratum + Local: Cloud primary, Ollama fallback",
      },
      {
        value: "local",
        label: locale === "es"
          ? "Solo Ollama local: Privado, gratis, requiere GPU"
          : "Ollama local only: Private, free, requires GPU",
      },
      {
        value: "cluster",
        label: locale === "es"
          ? "Solo Cluster Ollama: Varias maquinas, sin nube"
          : "Ollama cluster only: Multiple machines, no cloud",
      },
      {
        value: "cloud",
        label: locale === "es"
          ? "Solo Substratum: Modelos potentes, consume tokens"
          : "Substratum only: Powerful models, costs tokens",
      },
    ],
  );
  configManager.update("providerStrategy", strategy, "global");

  // 5. Provider configuration based on strategy
  const providers = await setupProviders(strategy, locale);

  // 6. Account setup (if cloud strategy selected and no account yet)
  if (!wantsAccount && ["cloud", "cluster-cloud", "hybrid-local-first", "hybrid-cloud-first", "hybrid-full"].includes(strategy)) {
    console.log("");
    console.log(chalk.dim(locale === "es"
      ? "  Necesitas una cuenta Substratum para usar modelos en la nube."
      : "  You need a Substratum account to use cloud models."));
    await setupAccount(locale);
  }

  // 7. Model selection
  console.log("");
  console.log(chalk.bold(locale === "es" ? "  Modelo" : "  Model"));
  console.log(chalk.dim("  " + "-".repeat(45)));

  const model = await selectModel(strategy, locale);

  // 8. Save everything
  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");
  ensureConfigExample();

  // 9. Connectivity test
  await testConnectivity(providers, locale);

  // 10. Summary
  console.log(chalk.green(`\n  + ${locale === "es" ? "Configuracion guardada" : "Configuration saved"}`));
  console.log(chalk.dim(`    ${CONFIG_FILE}\n`));

  // Strategy summary
  const strategyNames: Record<string, { en: string; es: string }> = {
    "local": { en: "Ollama Local", es: "Ollama Local" },
    "cluster": { en: "Ollama Cluster", es: "Cluster Ollama" },
    "cloud": { en: "Substratum Cloud", es: "Substratum Nube" },
    "cluster-cloud": { en: "Cluster + Substratum", es: "Cluster + Substratum" },
    "hybrid-local-first": { en: "Local + Substratum (local-first)", es: "Local + Substratum (local primero)" },
    "hybrid-cloud-first": { en: "Substratum + Local (cloud-first)", es: "Substratum + Local (nube primero)" },
    "hybrid-full": { en: "Full Hybrid (local+cluster+cloud)", es: "Hibrido completo (local+cluster+nube)" },
  };

  const sName = strategyNames[strategy] || { en: strategy, es: strategy };
  console.log(chalk.dim(`  ${locale === "es" ? "Estrategia" : "Strategy"}: ${locale === "es" ? sName.es : sName.en}`));
  console.log(chalk.dim(`  ${locale === "es" ? "Modelo" : "Model"}: ${model}`));
  console.log("");

  console.log(showQuickStartGuide());
  markOnboarded();
}

/**
 * Re-run provider setup (called from `wabisabi config --wizard`).
 */
export async function runProviderSetup(): Promise<void> {
  const merged = configManager.getMerged();
  const locale = merged.locale || "en";
  const strategy = merged.providerStrategy || "hybrid-local-first";
  const providers = await setupProviders(strategy, locale);
  await testConnectivity(providers, locale);

  const model = await selectModel(strategy, locale);

  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");

  console.log(chalk.green(`\n  + ${locale === "es" ? "Configuracion actualizada" : "Configuration updated"}.\n`));
}
