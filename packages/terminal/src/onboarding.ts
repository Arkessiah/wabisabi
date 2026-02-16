/**
 * Onboarding & Config Examples
 *
 * First-run experience: detect providers, generate config,
 * show quick tutorial.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";

const WABISABI_DIR = join(homedir(), ".wabisabi");
const CONFIG_FILE = join(WABISABI_DIR, "config.jsonc");
const ONBOARDING_MARKER = join(WABISABI_DIR, ".onboarded");

const EXAMPLE_CONFIG = `// WabiSabi Global Configuration
// Edit this file to customize your experience.
// Per-project overrides: create .wabisabi/config.jsonc in your project root.
{
  // AI Model to use (e.g. "llama3.2", "codellama", "mistral", "gpt-4o")
  "model": "llama3.2",

  // Provider URLs
  "substratum": "http://localhost:3001",
  "ollama": "http://localhost:11434",

  // API key for remote providers (or set WABISABI_API_KEY env var)
  // "apiKey": "",

  // Privacy level: "local", "hybrid", "semi", "full"
  "privacy": "hybrid",

  // Default agent: "build", "plan", "search"
  "defaultAgent": "build",

  // LLM parameters
  "temperature": 0.7,
  "maxTokens": 4096,
  "streaming": true,

  // Tool permissions
  "tools": {
    "allowFileRead": true,
    "allowFileWrite": false,
    "allowBash": false
  },

  // Active profile (Six Hats)
  "profile": {
    "hat": null,
    "profile": null,
    "style": null
  }
}
`;

/**
 * Check if this is the first run (no config file or onboarding marker).
 */
export function isFirstRun(): boolean {
  return !existsSync(ONBOARDING_MARKER);
}

/**
 * Generate example config if it doesn't exist.
 */
export function ensureConfigExample(): boolean {
  if (existsSync(CONFIG_FILE)) return false;

  try {
    mkdirSync(WABISABI_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, EXAMPLE_CONFIG, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark onboarding as complete.
 */
export function markOnboarded(): void {
  try {
    mkdirSync(WABISABI_DIR, { recursive: true });
    writeFileSync(ONBOARDING_MARKER, new Date().toISOString(), "utf-8");
  } catch {}
}

/**
 * Detect available providers.
 */
async function detectProviders(
  substratumUrl: string,
  ollamaUrl: string,
): Promise<{ substratum: boolean; ollama: boolean }> {
  const result = { substratum: false, ollama: false };

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${substratumUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(t);
    result.substratum = res.ok;
  } catch {}

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(t);
    result.ollama = res.ok;
  } catch {}

  return result;
}

/**
 * Run the onboarding flow. Shows welcome, detects providers, creates config.
 */
export async function runOnboarding(
  substratumUrl = "http://localhost:3001",
  ollamaUrl = "http://localhost:11434",
): Promise<void> {
  console.log(chalk.bold.cyan(`
  ╔══════════════════════════════════════════════╗
  ║     Welcome to WabiSabi Terminal IDE         ║
  ║     AI-powered coding assistant              ║
  ╚══════════════════════════════════════════════╝
`));

  // 1. Generate config
  const configCreated = ensureConfigExample();
  if (configCreated) {
    console.log(chalk.green(`  Config created: ${CONFIG_FILE}`));
  } else {
    console.log(chalk.dim(`  Config exists: ${CONFIG_FILE}`));
  }

  // 2. Detect providers
  console.log(chalk.dim("\n  Detecting AI providers..."));
  const providers = await detectProviders(substratumUrl, ollamaUrl);

  if (providers.substratum) {
    console.log(chalk.green(`  Substratum: available (${substratumUrl})`));
  } else {
    console.log(chalk.yellow(`  Substratum: not available (${substratumUrl})`));
  }

  if (providers.ollama) {
    console.log(chalk.green(`  Ollama: available (${ollamaUrl})`));
  } else {
    console.log(chalk.yellow(`  Ollama: not available (${ollamaUrl})`));
  }

  if (!providers.substratum && !providers.ollama) {
    console.log(chalk.red("\n  No AI providers detected."));
    console.log(chalk.dim("  Install Ollama: https://ollama.ai"));
    console.log(chalk.dim("  Or configure Substratum: --substratum <url>"));
  }

  // 3. Quick reference
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

  markOnboarded();
}
