/**
 * Interactive Prompt Utilities
 *
 * Readline-based prompts for wizard flows. No external dependencies.
 * Uses Node/Bun native readline module.
 */

import * as readline from "readline";
import chalk from "chalk";
import type { OllamaNode } from "../config/schema.js";

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user to select one option from a list.
 */
export async function askChoice(
  question: string,
  choices: Array<{ value: string; label: string }>,
): Promise<string> {
  const rl = createRL();

  console.log(chalk.bold(`\n  ${question}\n`));
  for (let i = 0; i < choices.length; i++) {
    console.log(`    ${chalk.cyan(`${i + 1})`)} ${choices[i].label}`);
  }

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(chalk.dim(`\n  Select [1-${choices.length}]: `), (answer) => {
        const idx = parseInt(answer.trim(), 10) - 1;
        if (idx >= 0 && idx < choices.length) {
          rl.close();
          resolve(choices[idx].value);
        } else {
          console.log(chalk.red("  Invalid selection. Try again."));
          ask();
        }
      });
    };
    ask();
  });
}

/**
 * Ask user for text input with optional default.
 */
export async function askInput(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = createRL();
  const prompt = defaultValue
    ? `  ${question} ${chalk.dim(`[${defaultValue}]`)}: `
    : `  ${question}: `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Ask yes/no confirmation.
 */
export async function askConfirm(
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const rl = createRL();
  const hint = defaultYes ? "Y/n" : "y/N";

  return new Promise((resolve) => {
    rl.question(`  ${question} ${chalk.dim(`[${hint}]`)}: `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes" || a === "si" || a === "s");
    });
  });
}

/**
 * Ask user to add multiple Ollama nodes interactively.
 */
export async function askMultipleNodes(): Promise<OllamaNode[]> {
  const nodes: OllamaNode[] = [];
  let adding = true;

  while (adding) {
    console.log(chalk.dim(`\n  --- Node ${nodes.length + 1} ---`));

    const name = await askInput("Node name", `node-${nodes.length + 1}`);
    const url = await askInput("Ollama URL", "http://localhost:11434");

    const gpuType = await askChoice("GPU type:", [
      { value: "nvidia", label: "NVIDIA (CUDA)" },
      { value: "amd", label: "AMD (ROCm)" },
      { value: "metal", label: "Apple Silicon (Metal)" },
      { value: "cpu", label: "CPU only" },
    ]);

    const priorityStr = await askInput("Priority (1-10, higher = preferred)", "5");
    const priority = Math.max(1, Math.min(10, parseInt(priorityStr, 10) || 5));

    nodes.push({
      name,
      url,
      gpu: gpuType as OllamaNode["gpu"],
      priority,
    });

    console.log(chalk.green(`  ✓ Added ${name} (${url})`));

    adding = await askConfirm("Add another node?", false);
  }

  return nodes;
}

/**
 * Test connectivity to an endpoint.
 * Returns true if reachable, false otherwise.
 */
export async function testEndpoint(
  url: string,
  path: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; models?: string[] }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}${path}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return { ok: false };

    const data = (await res.json()) as Record<string, unknown>;

    // Extract models based on endpoint type
    if (path === "/api/tags" && Array.isArray(data.models)) {
      return { ok: true, models: data.models.map((m: any) => m.name) };
    }
    if (path === "/v1/models" && data.data && Array.isArray(data.data)) {
      return { ok: true, models: (data.data as any[]).map((m) => m.id) };
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
