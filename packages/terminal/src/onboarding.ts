/**
 * Onboarding & Setup Wizard
 *
 * First-run experience (account is MANDATORY):
 *   1. Banner + Welcome
 *   2. Language selection
 *   3. Account creation / login via Substratum API (required)
 *   4. Token generation + validation
 *   5. Provider strategy (local, cluster, cloud, hybrids)
 *   6. Ollama setup instructions (step-by-step for local/cluster)
 *   7. Model selection
 *   8. Connectivity test
 *   9. Summary + Quick Start
 *
 * Re-runnable via Ctrl+P > Settings or `wabisabi config --wizard`.
 * The web panel (wabi-sabi-next) uses Substratum under the hood.
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

const SUBSTRATUM_URL = "https://api.substratum.dev";
const WEB_URL = "https://wabisabi.dev";
const REGISTER_URL = `${WEB_URL}/register`;
const LOGIN_URL = `${WEB_URL}/login`;

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
      cmd = ["xdg-open", url];
    }
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// ── i18n helper ──────────────────────────────────────────────

function t(locale: string, es: string, en: string): string {
  return locale === "es" ? es : en;
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

// ── Account Setup (MANDATORY) ────────────────────────────────

async function setupAccount(locale: string): Promise<boolean> {
  console.log("");
  console.log(chalk.bold(t(locale, "  Cuenta WabiSabi (obligatorio)", "  WabiSabi Account (required)")));
  console.log(chalk.dim("  " + "-".repeat(50)));
  console.log(chalk.dim(t(locale,
    "  WabiSabi usa Substratum como backend de modelos.",
    "  WabiSabi uses Substratum as the model backend.")));
  console.log(chalk.dim(t(locale,
    "  Necesitas una cuenta para generar tu token de acceso.",
    "  You need an account to generate your access token.")));
  console.log("");

  const accountAction = await askChoice(
    t(locale, "Como quieres conectarte?", "How do you want to connect?"),
    [
      {
        value: "password",
        label: t(locale,
          "Iniciar sesion con email + contrasena (sin navegador)",
          "Sign in with email + password (no browser)"),
      },
      {
        value: "register",
        label: t(locale,
          "Crear cuenta nueva (abre navegador)",
          "Create new account (opens browser)"),
      },
      {
        value: "login",
        label: t(locale,
          "Ya tengo cuenta (abre navegador para login)",
          "I have an account (opens browser to login)"),
      },
      {
        value: "apikey",
        label: t(locale,
          "Ya tengo un API key / token",
          "I already have an API key / token"),
      },
    ],
  );

  if (accountAction === "password") {
    return await loginWithPassword(locale);
  }

  if (accountAction === "register") {
    console.log("");
    console.log(chalk.cyan(t(locale, "  Abriendo navegador...", "  Opening browser...")));
    const opened = await openBrowser(REGISTER_URL);
    if (!opened) {
      console.log(chalk.yellow(t(locale,
        "  No se pudo abrir el navegador. Visita:",
        "  Could not open browser. Visit:")));
      console.log(chalk.cyan(`  ${REGISTER_URL}`));
    } else {
      console.log(chalk.dim(`  ${REGISTER_URL}`));
    }

    console.log("");
    console.log(chalk.bold(t(locale, "  Pasos:", "  Steps:")));
    console.log(t(locale,
      "  1. Crea tu cuenta en el navegador",
      "  1. Create your account in the browser"));
    console.log(t(locale,
      "  2. Ve a Configuracion > API Keys",
      "  2. Go to Settings > API Keys"));
    console.log(t(locale,
      "  3. Genera un nuevo token",
      "  3. Generate a new token"));
    console.log(t(locale,
      "  4. Copia el token y pegalo aqui abajo",
      "  4. Copy the token and paste it below"));
    console.log("");

    return await requestAndSaveToken(locale);

  } else if (accountAction === "login") {
    console.log("");
    console.log(chalk.cyan(t(locale, "  Abriendo navegador...", "  Opening browser...")));
    const opened = await openBrowser(LOGIN_URL);
    if (!opened) {
      console.log(chalk.yellow(t(locale,
        "  No se pudo abrir el navegador. Visita:",
        "  Could not open browser. Visit:")));
      console.log(chalk.cyan(`  ${LOGIN_URL}`));
    }

    console.log("");
    console.log(chalk.dim(t(locale,
      "  Inicia sesion y ve a Configuracion > API Keys para copiar tu token.",
      "  Login and go to Settings > API Keys to copy your token.")));
    console.log("");

    return await requestAndSaveToken(locale);

  } else if (accountAction === "apikey") {
    return await requestAndSaveToken(locale);
  }

  return false;
}

/**
 * Direct email+password login against the Substratum terminal endpoint.
 * No browser, no copy-pasting tokens — issues a JWT and writes it to
 * ~/.wabisabi/auth.json via the AuthManager. The provider is set to
 * substratum so the rest of the stack picks up the bearer token.
 */
async function loginWithPassword(locale: string): Promise<boolean> {
  const { authManager } = await import("./auth/index.js");

  // Allow override via env so the user can target their local stack without
  // editing config first. Falls back to the public Substratum API.
  const substratumUrl =
    process.env.SUBSTRATUM_URL ||
    configManager.getProviders().substratum.url ||
    SUBSTRATUM_URL;

  console.log("");
  console.log(chalk.dim(t(locale,
    `  Conectando a: ${substratumUrl}`,
    `  Connecting to: ${substratumUrl}`)));
  console.log("");

  // Make sure the AuthManager points at the same URL.
  const providers = configManager.getProviders();
  providers.substratum.url = substratumUrl;
  providers.substratum.enabled = true;
  configManager.update("providers", providers, "global");

  for (let attempt = 0; attempt < 3; attempt++) {
    const email = await askInput(t(locale, "Email", "Email"));
    if (!email || !email.includes("@")) {
      console.log(chalk.yellow(t(locale,
        "  Email no valido.",
        "  Invalid email.")));
      continue;
    }

    const password = await askPassword(t(locale, "Contrasena", "Password"));
    if (!password) {
      console.log(chalk.yellow(t(locale,
        "  Contrasena vacia.",
        "  Empty password.")));
      continue;
    }

    console.log(chalk.dim(t(locale, "  Autenticando...", "  Authenticating...")));
    const ok = await authManager.loginTerminal(email.trim(), password);

    if (ok) {
      console.log(chalk.green(t(locale,
        "  + Sesion iniciada",
        "  + Logged in")));
      return true;
    }

    console.log(chalk.red(t(locale,
      "  Credenciales no validas. Reintenta o crea cuenta en el navegador.",
      "  Invalid credentials. Try again or create an account in the browser.")));

    const retry = await askConfirm(
      t(locale, "Reintentar?", "Retry?"),
      attempt < 2,
    );
    if (!retry) return false;
  }
  return false;
}

/**
 * Hidden-input password prompt — the standard readline implementation echoes
 * characters. We toggle raw mode and consume keystrokes manually.
 */
async function askPassword(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(`${label}: `);
    let pw = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      const c = ch.toString();
      if (c === "\n" || c === "\r") {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(pw);
      } else if (c === "\x7f" || c === "\b") {
        if (pw.length > 0) pw = pw.slice(0, -1);
      } else if (c === "\x03") {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        process.exit(0);
      } else {
        pw += c;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function requestAndSaveToken(locale: string): Promise<boolean> {
  const token = await askInput(
    t(locale, "Pega tu API key / token", "Paste your API key / token"),
  );

  if (!token || token.trim().length < 10) {
    console.log(chalk.red(t(locale,
      "  Token no valido. No puedes usar WabiSabi sin autenticarte.",
      "  Invalid token. You cannot use WabiSabi without authentication.")));
    return false;
  }

  // Validate token against Substratum API
  console.log(chalk.dim(t(locale, "  Verificando token...", "  Verifying token...")));

  try {
    const res = await fetch(`${SUBSTRATUM_URL}/v1/models`, {
      headers: { "Authorization": `Bearer ${token.trim()}` },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      console.log(chalk.green(t(locale, "  + Token valido", "  + Token valid")));
      const data = await res.json() as { data?: Array<{ id: string }> };
      if (data.data?.length) {
        console.log(chalk.dim(`    ${t(locale, "Modelos disponibles", "Available models")}: ${data.data.slice(0, 5).map(m => m.id).join(", ")}`));
      }
    } else if (res.status === 401 || res.status === 403) {
      console.log(chalk.yellow(t(locale,
        "  Token rechazado. Verifica que es correcto.",
        "  Token rejected. Verify it is correct.")));
      const retry = await askConfirm(t(locale, "Reintentar?", "Retry?"), true);
      if (retry) return requestAndSaveToken(locale);
      return false;
    } else {
      console.log(chalk.yellow(t(locale,
        "  No se pudo verificar (servidor no responde). Se guarda igualmente.",
        "  Could not verify (server not responding). Saving anyway.")));
    }
  } catch {
    console.log(chalk.yellow(t(locale,
      "  No se pudo conectar al servidor. Se guarda el token igualmente.",
      "  Could not connect to server. Saving token anyway.")));
  }

  // Save token
  const providers = configManager.getProviders();
  providers.substratum.apiKey = token.trim();
  providers.substratum.enabled = true;
  providers.substratum.url = SUBSTRATUM_URL;
  configManager.update("providers", providers, "global");
  console.log(chalk.green(t(locale, "  + Token guardado", "  + Token saved")));

  return true;
}

// ── Ollama Setup Instructions ────────────────────────────────

function showOllamaInstructions(locale: string): void {
  console.log("");
  console.log(chalk.bold(t(locale, "  Como instalar Ollama", "  How to install Ollama")));
  console.log(chalk.dim("  " + "-".repeat(50)));

  const os = platform();
  if (os === "darwin") {
    console.log(t(locale, "  macOS:", "  macOS:"));
    console.log(chalk.cyan("    brew install ollama"));
    console.log(chalk.dim(t(locale, "    o descarga desde:", "    or download from:")));
    console.log(chalk.cyan("    https://ollama.com/download/mac"));
  } else if (os === "linux") {
    console.log(t(locale, "  Linux:", "  Linux:"));
    console.log(chalk.cyan("    curl -fsSL https://ollama.com/install.sh | sh"));
  } else {
    console.log(t(locale, "  Windows:", "  Windows:"));
    console.log(chalk.cyan("    https://ollama.com/download/windows"));
  }

  console.log("");
  console.log(chalk.bold(t(locale, "  Despues de instalar:", "  After installing:")));
  console.log(chalk.cyan("    ollama serve"));
  console.log(chalk.dim(t(locale,
    "    (deja corriendo en otra terminal)",
    "    (leave running in another terminal)")));
  console.log("");
  console.log(chalk.bold(t(locale, "  Descargar un modelo:", "  Pull a model:")));
  console.log(chalk.cyan("    ollama pull llama3.2"));
  console.log(chalk.cyan("    ollama pull codellama"));
  console.log(chalk.cyan("    ollama pull deepseek-coder"));
  console.log("");
}

function showClusterInstructions(locale: string): void {
  console.log("");
  console.log(chalk.bold(t(locale, "  Cluster Ollama", "  Ollama Cluster")));
  console.log(chalk.dim("  " + "-".repeat(50)));
  console.log(t(locale,
    "  Un cluster distribuye las peticiones entre varias maquinas.",
    "  A cluster distributes requests across multiple machines."));
  console.log(t(locale,
    "  Cada nodo necesita Ollama instalado y corriendo.",
    "  Each node needs Ollama installed and running."));
  console.log("");
  console.log(chalk.bold(t(locale, "  En cada maquina del cluster:", "  On each cluster machine:")));
  console.log(chalk.cyan("    ollama serve"));
  console.log(chalk.dim(t(locale,
    "    Por defecto escucha en http://localhost:11434",
    "    By default listens on http://localhost:11434")));
  console.log(chalk.dim(t(locale,
    "    Para acceso remoto: OLLAMA_HOST=0.0.0.0:11434 ollama serve",
    "    For remote access: OLLAMA_HOST=0.0.0.0:11434 ollama serve")));
  console.log("");
}

// ── Ollama Node Setup ─────────────────────────────────────────

async function setupOllamaNodes(locale: string, isCluster: boolean): Promise<{ mode: "local" | "cluster"; nodes: OllamaNode[] }> {
  const hasOllama = await isOllamaInstalled();

  if (!hasOllama) {
    console.log(chalk.yellow(t(locale, "\n  Ollama no detectado.", "\n  Ollama not detected.")));
    showOllamaInstructions(locale);
    const continueAnyway = await askConfirm(
      t(locale, "Continuar configuracion igualmente?", "Continue setup anyway?"),
      true,
    );
    if (!continueAnyway) {
      return { mode: "local", nodes: [{ name: "local", url: "http://localhost:11434", priority: 5 }] };
    }
  } else {
    console.log(chalk.green(t(locale, "  + Ollama detectado", "  + Ollama detected")));
  }

  if (isCluster) {
    showClusterInstructions(locale);
    const nodes = await askMultipleNodes();
    return { mode: "cluster", nodes };
  }

  const url = await askInput(
    t(locale, "URL de Ollama", "Ollama URL"),
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

  if (needsOllama) {
    ollamaConfig = await setupOllamaNodes(locale, needsCluster);
  }

  // Substratum is always configured (account already set up)
  const existingProviders = configManager.getProviders();

  return {
    substratum: {
      enabled: needsSubstratum,
      url: existingProviders.substratum.url || SUBSTRATUM_URL,
      apiKey: existingProviders.substratum.apiKey,
    },
    ollama: ollamaConfig,
  };
}

// ── Model Selection ───────────────────────────────────────────

async function selectModel(strategy: string, locale: string): Promise<string> {
  const isLocal = ["local", "cluster"].includes(strategy);
  const isCloud = strategy === "cloud";

  const localModels = [
    { value: "llama3.2", label: "Llama 3.2 (8B) - " + t(locale, "Rapido, bueno para codigo", "Fast, good for code") },
    { value: "codellama", label: "CodeLlama (7B) - " + t(locale, "Especializado en codigo", "Code-specialized") },
    { value: "deepseek-coder", label: "DeepSeek Coder (6.7B) - " + t(locale, "Excelente para codigo", "Excellent for code") },
    { value: "mistral", label: "Mistral (7B) - " + t(locale, "General, equilibrado", "General purpose, balanced") },
  ];

  const cloudModels = [
    { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet - " + t(locale, "Potente, mejor para codigo", "Powerful, best for code") },
    { value: "gpt-4o", label: "GPT-4o - " + t(locale, "Multimodal, muy capaz", "Multimodal, very capable") },
    { value: "deepseek-v3", label: "DeepSeek V3 - " + t(locale, "Codigo de alto nivel", "High-level code") },
  ];

  let choices;
  if (isLocal) {
    choices = localModels;
  } else if (isCloud) {
    choices = cloudModels;
  } else {
    choices = [...localModels.slice(0, 2), ...cloudModels.slice(0, 2)];
  }

  choices.push({
    value: "custom",
    label: t(locale, "Otro (escribir nombre)", "Other (type name)"),
  });

  const model = await askChoice(
    t(locale, "Modelo por defecto:", "Default model:"),
    choices,
  );

  if (model === "custom") {
    return askInput(t(locale, "Nombre del modelo", "Model name"), "llama3.2");
  }

  return model;
}

// ── Connectivity Test ─────────────────────────────────────────

async function testConnectivity(providers: ProvidersConfig, locale: string): Promise<void> {
  console.log(chalk.dim(t(locale, "\n  Probando conectividad...\n", "\n  Testing connectivity...\n")));

  if (providers.substratum.enabled) {
    const headers: Record<string, string> = {};
    if (providers.substratum.apiKey) {
      headers["Authorization"] = `Bearer ${providers.substratum.apiKey}`;
    }
    const result = await testEndpoint(providers.substratum.url, "/v1/models");
    if (result.ok) {
      console.log(chalk.green(`  + Substratum: ${t(locale, "conectado", "connected")} (${providers.substratum.url})`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  - Substratum: ${t(locale, "no accesible", "not reachable")} (${providers.substratum.url})`));
    }
  }

  for (const node of providers.ollama.nodes) {
    const result = await testEndpoint(node.url, "/api/tags");
    if (result.ok) {
      console.log(chalk.green(`  + ${node.name}: ${t(locale, "conectado", "connected")} (${node.url})${node.gpu ? ` [${node.gpu}]` : ""}`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.yellow(`  - ${node.name}: ${t(locale, "no accesible", "not reachable")} (${node.url})`));
    }
  }
}

// ── Strategy Names ────────────────────────────────────────────

const STRATEGY_NAMES: Record<string, { en: string; es: string }> = {
  "local": { en: "Ollama Local", es: "Ollama Local" },
  "cluster": { en: "Ollama Cluster", es: "Cluster Ollama" },
  "cloud": { en: "Substratum Cloud", es: "Substratum Nube" },
  "cluster-cloud": { en: "Cluster + Substratum", es: "Cluster + Substratum" },
  "hybrid-local-first": { en: "Local + Substratum (local-first)", es: "Local + Substratum (local primero)" },
  "hybrid-cloud-first": { en: "Substratum + Local (cloud-first)", es: "Substratum + Local (nube primero)" },
  "hybrid-full": { en: "Full Hybrid (local+cluster+cloud)", es: "Hibrido completo (local+cluster+nube)" },
};

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

  console.log(chalk.bold("  Welcome to WabiSabi / Bienvenido a WabiSabi"));
  console.log(chalk.dim("  " + "=".repeat(50)));
  console.log("");

  // 2. Language
  const locale = await askChoice("Select language / Selecciona idioma:", [
    { value: "es", label: "Espanol" },
    { value: "en", label: "English" },
  ]);
  configManager.update("locale", locale, "global");

  // 3. Account creation / login (MANDATORY)
  console.log("");
  console.log(chalk.bold(t(locale,
    "  PASO 1: Cuenta WabiSabi",
    "  STEP 1: WabiSabi Account")));

  let authenticated = false;
  while (!authenticated) {
    authenticated = await setupAccount(locale);
    if (!authenticated) {
      console.log("");
      console.log(chalk.red.bold(t(locale,
        "  Es necesario tener una cuenta para usar WabiSabi.",
        "  An account is required to use WabiSabi.")));
      console.log(chalk.dim(t(locale,
        "  WabiSabi funciona con Substratum como backend de modelos de IA.",
        "  WabiSabi uses Substratum as the AI model backend.")));
      console.log("");
      const retry = await askConfirm(t(locale, "Reintentar?", "Retry?"), true);
      if (!retry) {
        console.log(chalk.yellow(t(locale,
          "\n  Sin cuenta no podras usar WabiSabi. Ejecuta 'wabisabi' de nuevo cuando tengas tu token.\n",
          "\n  Without an account you cannot use WabiSabi. Run 'wabisabi' again when you have your token.\n")));
        process.exit(0);
      }
    }
  }

  // 4. Provider Strategy
  console.log("");
  console.log(chalk.bold(t(locale, "  PASO 2: Estrategia de Modelos", "  STEP 2: Model Strategy")));
  console.log(chalk.dim("  " + "-".repeat(50)));

  const strategy = await askChoice(
    t(locale,
      "Como quieres usar los modelos de IA?",
      "How do you want to use AI models?"),
    [
      {
        value: "hybrid-local-first",
        label: t(locale,
          "Local + Nube: Ollama para lo simple, Substratum para lo complejo (recomendado)",
          "Local + Cloud: Ollama for simple, Substratum for complex (recommended)"),
      },
      {
        value: "hybrid-full",
        label: t(locale,
          "Hibrido completo: Cluster + Local + Nube (minimiza tokens de pago)",
          "Full hybrid: Cluster + Local + Cloud (minimize paid tokens)"),
      },
      {
        value: "cloud",
        label: t(locale,
          "Solo Substratum: Sin Ollama, modelos potentes en la nube",
          "Substratum only: No Ollama, powerful cloud models"),
      },
      {
        value: "local",
        label: t(locale,
          "Solo Ollama local: Privado, gratis, necesitas GPU",
          "Ollama local only: Private, free, needs GPU"),
      },
      {
        value: "cluster",
        label: t(locale,
          "Solo Cluster Ollama: Varias maquinas, sin nube",
          "Ollama cluster only: Multiple machines, no cloud"),
      },
      {
        value: "cluster-cloud",
        label: t(locale,
          "Cluster + Nube: Cluster como principal, nube como respaldo",
          "Cluster + Cloud: Cluster primary, cloud fallback"),
      },
      {
        value: "hybrid-cloud-first",
        label: t(locale,
          "Nube + Local: Substratum primero, Ollama como respaldo",
          "Cloud + Local: Substratum first, Ollama fallback"),
      },
    ],
  );
  configManager.update("providerStrategy", strategy, "global");

  // 5. Provider configuration (Ollama setup with instructions)
  console.log("");
  console.log(chalk.bold(t(locale, "  PASO 3: Configuracion de Providers", "  STEP 3: Provider Configuration")));
  const providers = await setupProviders(strategy, locale);

  // 6. Model selection
  console.log("");
  console.log(chalk.bold(t(locale, "  PASO 4: Modelo", "  STEP 4: Model")));
  console.log(chalk.dim("  " + "-".repeat(50)));

  const model = await selectModel(strategy, locale);

  // 7. Save everything
  configManager.update("providers", providers, "global");
  configManager.update("model", model, "global");
  ensureConfigExample();

  // 8. Connectivity test
  await testConnectivity(providers, locale);

  // 9. Summary
  console.log("");
  console.log(chalk.green.bold(t(locale, "  Configuracion completada!", "  Setup complete!")));
  console.log(chalk.dim("  " + "=".repeat(50)));

  const sName = STRATEGY_NAMES[strategy] || { en: strategy, es: strategy };
  console.log(`  ${chalk.bold(t(locale, "Estrategia", "Strategy"))}: ${t(locale, sName.es, sName.en)}`);
  console.log(`  ${chalk.bold(t(locale, "Modelo", "Model"))}: ${model}`);
  console.log(`  ${chalk.bold("Config")}: ${chalk.dim(CONFIG_FILE)}`);
  console.log("");

  console.log(showQuickStartGuide());
  markOnboarded();
}

/**
 * Re-run setup from Ctrl+P > Settings or `wabisabi config --wizard`.
 * Allows changing any setting without going through full onboarding.
 */
export async function runSettings(): Promise<void> {
  const merged = configManager.getMerged();
  const locale = merged.locale || "es";

  console.log("");
  console.log(chalk.bold(t(locale, "  Configuracion WabiSabi", "  WabiSabi Settings")));
  console.log(chalk.dim("  " + "=".repeat(50)));

  const section = await askChoice(
    t(locale, "Que quieres configurar?", "What do you want to configure?"),
    [
      { value: "account", label: t(locale, "Cuenta y Token", "Account & Token") },
      { value: "strategy", label: t(locale, "Estrategia de providers", "Provider strategy") },
      { value: "model", label: t(locale, "Modelo por defecto", "Default model") },
      { value: "ollama", label: t(locale, "Configuracion de Ollama", "Ollama configuration") },
      { value: "all", label: t(locale, "Reconfigurar todo (wizard completo)", "Reconfigure everything (full wizard)") },
    ],
  );

  if (section === "all") {
    await runOnboarding();
    return;
  }

  if (section === "account") {
    await setupAccount(locale);
  }

  if (section === "strategy") {
    const strategy = await askChoice(
      t(locale, "Estrategia:", "Strategy:"),
      Object.entries(STRATEGY_NAMES).map(([id, names]) => ({
        value: id,
        label: `${t(locale, names.es, names.en)}${id === merged.providerStrategy ? " *" : ""}`,
      })),
    );
    configManager.update("providerStrategy", strategy, "global");
    const providers = await setupProviders(strategy, locale);
    configManager.update("providers", providers, "global");
  }

  if (section === "model") {
    const strategy = merged.providerStrategy || "hybrid-local-first";
    const model = await selectModel(strategy, locale);
    configManager.update("model", model, "global");
  }

  if (section === "ollama") {
    const needsCluster = ["cluster", "cluster-cloud", "hybrid-full"].includes(merged.providerStrategy || "");
    const ollamaConfig = await setupOllamaNodes(locale, needsCluster);
    const providers = configManager.getProviders();
    providers.ollama = ollamaConfig;
    configManager.update("providers", providers, "global");
  }

  // Test and save
  const providers = configManager.getProviders();
  await testConnectivity(providers, locale);
  ensureConfigExample();

  console.log(chalk.green(t(locale,
    "\n  + Configuracion actualizada.\n",
    "\n  + Configuration updated.\n")));
}

/**
 * Re-run provider setup (called from `wabisabi config --wizard`).
 */
export async function runProviderSetup(): Promise<void> {
  await runSettings();
}
