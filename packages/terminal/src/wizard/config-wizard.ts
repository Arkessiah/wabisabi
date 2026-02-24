/**
 * Configuration Wizard
 *
 * Interactive configuration management accessible via `wabisabi config --wizard`.
 * Allows adding/removing Ollama nodes, configuring Substratum, and testing connectivity.
 */

import chalk from "chalk";
import { configManager } from "../config/index.js";
import type { OllamaNode } from "../config/schema.js";
import { runProviderSetup } from "../onboarding.js";
import {
  askChoice,
  askInput,
  askConfirm,
  askMultipleNodes,
  testEndpoint,
} from "./prompts.js";

/**
 * Show current configuration summary.
 */
export function showConfig(): void {
  const config = configManager.getGlobal();
  const providers = configManager.getProviders();

  console.log(chalk.bold("\n  WabiSabi Configuration\n"));
  console.log(chalk.dim("  ──────────────────────────────────"));

  // Model
  console.log(`  ${chalk.cyan("Model:")}    ${config.model}`);
  console.log(`  ${chalk.cyan("Privacy:")}  ${config.privacy}`);
  console.log(`  ${chalk.cyan("Agent:")}    ${config.defaultAgent}`);

  // Substratum
  console.log(chalk.bold("\n  Substratum"));
  console.log(`    Enabled: ${providers.substratum.enabled ? chalk.green("yes") : chalk.dim("no")}`);
  console.log(`    URL:     ${providers.substratum.url}`);
  console.log(`    API Key: ${providers.substratum.apiKey ? chalk.dim("set") : chalk.dim("not set")}`);

  // Ollama
  console.log(chalk.bold("\n  Ollama"));
  console.log(`    Mode: ${providers.ollama.mode}`);
  if (providers.ollama.nodes.length === 0) {
    console.log(chalk.dim("    No nodes configured"));
  } else {
    for (const node of providers.ollama.nodes) {
      const gpu = node.gpu ? ` [${node.gpu}]` : "";
      console.log(`    ${chalk.cyan(node.name)}: ${node.url}${gpu} (priority: ${node.priority})`);
    }
  }

  console.log(chalk.dim("\n  ──────────────────────────────────\n"));
}

/**
 * Manage Ollama nodes (add, remove, list).
 */
async function manageNodes(): Promise<void> {
  const providers = configManager.getProviders();
  const nodes = [...providers.ollama.nodes];

  const action = await askChoice("Node management:", [
    { value: "list", label: "List current nodes" },
    { value: "add", label: "Add a new node" },
    { value: "remove", label: "Remove a node" },
    { value: "priority", label: "Change node priority" },
  ]);

  if (action === "list") {
    if (nodes.length === 0) {
      console.log(chalk.dim("\n  No nodes configured.\n"));
      return;
    }
    console.log(chalk.bold("\n  Ollama Nodes:\n"));
    for (const node of nodes) {
      const gpu = node.gpu ? ` [${node.gpu}]` : "";
      console.log(`    ${chalk.cyan(node.name)}: ${node.url}${gpu} (priority: ${node.priority})`);
    }
    console.log();
    return;
  }

  if (action === "add") {
    const newNodes = await askMultipleNodes();
    nodes.push(...newNodes);
  }

  if (action === "remove") {
    if (nodes.length === 0) {
      console.log(chalk.dim("\n  No nodes to remove.\n"));
      return;
    }
    const choices = nodes.map((n) => ({ value: n.name, label: `${n.name} (${n.url})` }));
    const toRemove = await askChoice("Which node to remove?", choices);
    const idx = nodes.findIndex((n) => n.name === toRemove);
    if (idx >= 0) {
      nodes.splice(idx, 1);
      console.log(chalk.green(`  ✓ Removed ${toRemove}`));
    }
  }

  if (action === "priority") {
    if (nodes.length === 0) {
      console.log(chalk.dim("\n  No nodes configured.\n"));
      return;
    }
    const choices = nodes.map((n) => ({
      value: n.name,
      label: `${n.name} (current: ${n.priority})`,
    }));
    const nodeName = await askChoice("Which node?", choices);
    const newPriority = await askInput("New priority (1-10)", "5");
    const node = nodes.find((n) => n.name === nodeName);
    if (node) {
      node.priority = Math.max(1, Math.min(10, parseInt(newPriority, 10) || 5));
      console.log(chalk.green(`  ✓ ${nodeName} priority set to ${node.priority}`));
    }
  }

  // Save updated nodes
  const updatedProviders = {
    ...providers,
    ollama: {
      ...providers.ollama,
      mode: nodes.length > 1 ? ("cluster" as const) : ("local" as const),
      nodes,
    },
  };
  configManager.update("providers", updatedProviders, "global");
}

/**
 * Configure Substratum settings.
 */
async function configureSubstratum(): Promise<void> {
  const providers = configManager.getProviders();

  const enabled = await askConfirm("Enable Substratum?", providers.substratum.enabled);
  let url = providers.substratum.url;
  let apiKey = providers.substratum.apiKey;

  if (enabled) {
    url = await askInput("Substratum URL", url);
    apiKey = await askInput("API Key (or press Enter to keep current)", apiKey || "");
    if (!apiKey) apiKey = undefined;
  }

  configManager.update(
    "providers",
    {
      ...providers,
      substratum: { enabled, url, apiKey },
    },
    "global",
  );

  console.log(chalk.green(`\n  ✓ Substratum ${enabled ? "enabled" : "disabled"}.\n`));
}

/**
 * Test connectivity to all configured endpoints.
 */
async function testConnectivity(): Promise<void> {
  const providers = configManager.getProviders();

  console.log(chalk.dim("\n  Testing connectivity...\n"));

  if (providers.substratum.enabled) {
    const result = await testEndpoint(providers.substratum.url, "/v1/models");
    if (result.ok) {
      console.log(chalk.green(`  ✓ Substratum: connected (${providers.substratum.url})`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.red(`  ✗ Substratum: not reachable (${providers.substratum.url})`));
    }
  } else {
    console.log(chalk.dim("  ○ Substratum: disabled"));
  }

  for (const node of providers.ollama.nodes) {
    const result = await testEndpoint(node.url, "/api/tags");
    if (result.ok) {
      console.log(chalk.green(`  ✓ ${node.name}: connected (${node.url})${node.gpu ? ` [${node.gpu}]` : ""}`));
      if (result.models?.length) {
        console.log(chalk.dim(`    Models: ${result.models.slice(0, 5).join(", ")}`));
      }
    } else {
      console.log(chalk.red(`  ✗ ${node.name}: not reachable (${node.url})`));
    }
  }

  console.log();
}

/**
 * Quick-add a node without the full wizard.
 */
export async function quickAddNode(url: string): Promise<void> {
  const providers = configManager.getProviders();
  const name = await askInput("Node name", `node-${providers.ollama.nodes.length + 1}`);
  const gpuType = await askChoice("GPU type:", [
    { value: "nvidia", label: "NVIDIA (CUDA)" },
    { value: "amd", label: "AMD (ROCm)" },
    { value: "metal", label: "Apple Silicon (Metal)" },
    { value: "cpu", label: "CPU only" },
  ]);

  const node: OllamaNode = {
    name,
    url,
    gpu: gpuType as OllamaNode["gpu"],
    priority: 5,
  };

  const nodes = [...providers.ollama.nodes, node];
  configManager.update(
    "providers",
    {
      ...providers,
      ollama: {
        mode: nodes.length > 1 ? "cluster" : "local",
        nodes,
      },
    },
    "global",
  );

  // Test connectivity
  const result = await testEndpoint(url, "/api/tags");
  if (result.ok) {
    console.log(chalk.green(`\n  ✓ Added ${name} (${url}) - connected`));
    if (result.models?.length) {
      console.log(chalk.dim(`    Models: ${result.models.join(", ")}`));
    }
  } else {
    console.log(chalk.yellow(`\n  ✓ Added ${name} (${url}) - not reachable yet`));
  }
  console.log();
}

/**
 * Main config wizard entry point.
 */
export async function runConfigWizard(): Promise<void> {
  const action = await askChoice("What do you want to configure?", [
    { value: "mode", label: "Change provider mode (local/cluster/cloud)" },
    { value: "nodes", label: "Manage Ollama nodes" },
    { value: "substratum", label: "Configure Substratum" },
    { value: "test", label: "Test connectivity" },
  ]);

  switch (action) {
    case "mode":
      await runProviderSetup();
      break;
    case "nodes":
      await manageNodes();
      break;
    case "substratum":
      await configureSubstratum();
      break;
    case "test":
      await testConnectivity();
      break;
  }
}
