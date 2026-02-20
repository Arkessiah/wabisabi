/**
 * Ollama Installation & Cluster Setup Wizard
 *
 * Provides CLI commands to install Ollama, pull models,
 * set up multi-node clusters, and check node status.
 * Uses Bun.spawn for subprocess management.
 */

import chalk from "chalk";
import { configManager } from "../services/index.js";
import type { OllamaNode } from "../config/schema.js";
import { askChoice, askInput, askConfirm, askMultipleNodes, testEndpoint } from "./prompts.js";

// Default models to pull on install
const DEFAULT_MODELS = ["llama3.2", "qwen2.5:0.5b"];

// ── Helpers ─────────────────────────────────────────────────

async function which(cmd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return proc.exitCode === 0 ? out.trim() : null;
  } catch {
    return null;
  }
}

async function runCommand(cmd: string[], options?: {
  label?: string;
  stream?: boolean;
}): Promise<{ ok: boolean; output: string }> {
  const label = options?.label || cmd.join(" ");
  console.log(chalk.dim(`  $ ${label}`));

  try {
    const proc = Bun.spawn(cmd, {
      stdout: options?.stream ? "inherit" : "pipe",
      stderr: options?.stream ? "inherit" : "pipe",
    });

    let output = "";
    if (!options?.stream) {
      output = await new Response(proc.stdout).text();
    }

    await proc.exited;

    if (proc.exitCode !== 0) {
      if (!options?.stream) {
        const stderr = await new Response(proc.stderr).text();
        output += stderr;
      }
      return { ok: false, output };
    }

    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

function detectGpu(): OllamaNode["gpu"] {
  const platform = process.platform;
  if (platform === "darwin") return "metal";

  // On Linux, check for NVIDIA
  try {
    const proc = Bun.spawnSync(["which", "nvidia-smi"]);
    if (proc.exitCode === 0) return "nvidia";
  } catch { /* ignore */ }

  // Check for AMD ROCm
  try {
    const proc = Bun.spawnSync(["which", "rocm-smi"]);
    if (proc.exitCode === 0) return "amd";
  } catch { /* ignore */ }

  return "cpu";
}

async function isOllamaRunning(url = "http://localhost:11434"): Promise<boolean> {
  const result = await testEndpoint(url, "/api/tags", 3000);
  return result.ok;
}

async function pullModelLocal(model: string): Promise<boolean> {
  console.log(chalk.cyan(`\n  Pulling ${model}...`));
  const result = await runCommand(["ollama", "pull", model], { stream: true });
  if (result.ok) {
    console.log(chalk.green(`  ✓ ${model} ready`));
  } else {
    console.log(chalk.red(`  ✗ Failed to pull ${model}`));
  }
  return result.ok;
}

async function pullModelRemote(nodeUrl: string, model: string): Promise<boolean> {
  console.log(chalk.cyan(`  Pulling ${model} on ${nodeUrl}...`));
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000); // 5min for pull
    const res = await fetch(`${nodeUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      console.log(chalk.green(`  ✓ ${model} pulled on ${nodeUrl}`));
      return true;
    }
    console.log(chalk.red(`  ✗ Failed (HTTP ${res.status})`));
    return false;
  } catch {
    console.log(chalk.red(`  ✗ Connection failed to ${nodeUrl}`));
    return false;
  }
}

// ── Install ─────────────────────────────────────────────────

export async function ollamaInstall(): Promise<void> {
  console.log(chalk.bold("\n  Ollama Installation\n"));

  // 1. Check if already installed
  const ollamaPath = await which("ollama");
  if (ollamaPath) {
    console.log(chalk.green(`  ✓ Ollama already installed at ${ollamaPath}`));
    const version = await runCommand(["ollama", "--version"]);
    if (version.ok) console.log(chalk.dim(`    ${version.output}`));
  } else {
    // 2. Detect OS
    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux") {
      console.log(chalk.red(`  ✗ Unsupported platform: ${platform}`));
      console.log(chalk.dim("    Ollama supports macOS and Linux. Visit https://ollama.com for Windows."));
      return;
    }

    console.log(chalk.cyan(`  Installing Ollama on ${platform === "darwin" ? "macOS" : "Linux"}...`));

    const result = await runCommand(["bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
      label: "curl -fsSL https://ollama.com/install.sh | sh",
      stream: true,
    });

    if (!result.ok) {
      console.log(chalk.red("\n  ✗ Installation failed. Try manually: https://ollama.com/download"));
      return;
    }

    // Verify
    const verifyPath = await which("ollama");
    if (!verifyPath) {
      console.log(chalk.red("  ✗ ollama not found in PATH after installation"));
      return;
    }
    console.log(chalk.green(`\n  ✓ Ollama installed at ${verifyPath}`));
  }

  // 3. Check if service is running
  const running = await isOllamaRunning();
  if (!running) {
    console.log(chalk.cyan("\n  Starting Ollama service..."));
    // Start in background - detached
    const proc = Bun.spawn(["ollama", "serve"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();

    // Wait for it to be ready
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      ready = await isOllamaRunning();
      if (ready) break;
    }

    if (ready) {
      console.log(chalk.green("  ✓ Ollama service running"));
    } else {
      console.log(chalk.yellow("  ⚠ Service started but not responding yet. It may need a moment."));
    }
  } else {
    console.log(chalk.green("  ✓ Ollama service already running"));
  }

  // 4. Pull default models
  const pullModels = await askConfirm(`Pull default models? (${DEFAULT_MODELS.join(", ")})`, true);
  if (pullModels) {
    for (const model of DEFAULT_MODELS) {
      await pullModelLocal(model);
    }
  }

  // 5. Update config
  const gpu = detectGpu();
  const providers = configManager.getProviders();
  const localExists = providers.ollama.nodes.some(
    (n) => n.url === "http://localhost:11434" || n.url.includes("localhost:11434"),
  );

  if (!localExists) {
    providers.ollama.nodes.push({
      name: "local",
      url: "http://localhost:11434",
      gpu,
      priority: 5,
    });
  }

  configManager.update("providers", providers, "global");
  console.log(chalk.green("\n  ✓ Configuration updated"));

  // 6. Final test
  const test = await testEndpoint("http://localhost:11434", "/api/tags");
  if (test.ok) {
    console.log(chalk.green(`  ✓ Connected. Models available: ${test.models?.join(", ") || "checking..."}`));
  }

  console.log(chalk.bold.green("\n  Ollama is ready! Use 'wabi ollama --status' to check anytime.\n"));
}

// ── Pull ────────────────────────────────────────────────────

export async function ollamaPull(modelArg?: string): Promise<void> {
  console.log(chalk.bold("\n  Pull Model\n"));

  let model: string;

  if (modelArg && modelArg !== "true") {
    model = modelArg;
  } else {
    const choice = await askChoice("Which model to pull?", [
      { value: "llama3.2", label: "llama3.2 (default, 3B params)" },
      { value: "qwen2.5:0.5b", label: "qwen2.5:0.5b (Cortex engine)" },
      { value: "llama3.2:1b", label: "llama3.2:1b (lightweight)" },
      { value: "custom", label: "Custom model name" },
    ]);

    if (choice === "custom") {
      model = await askInput("Model name (e.g., codellama:7b)");
      if (!model) {
        console.log(chalk.red("  No model specified."));
        return;
      }
    } else {
      model = choice;
    }
  }

  const providers = configManager.getProviders();
  const nodes = providers.ollama.nodes;

  if (nodes.length === 0) {
    console.log(chalk.yellow("  No Ollama nodes configured. Run 'wabi ollama --install' first."));
    return;
  }

  // Check if local node exists for local pull
  const localNode = nodes.find((n) => n.url.includes("localhost") || n.url.includes("127.0.0.1"));
  const remoteNodes = nodes.filter((n) => !n.url.includes("localhost") && !n.url.includes("127.0.0.1"));

  // Pull on local
  if (localNode) {
    await pullModelLocal(model);
  }

  // Pull on remotes
  if (remoteNodes.length > 0) {
    const pullRemote = await askConfirm(`Also pull on ${remoteNodes.length} remote node(s)?`, true);
    if (pullRemote) {
      for (const node of remoteNodes) {
        await pullModelRemote(node.url, model);
      }
    }
  }

  console.log(chalk.green("\n  Done.\n"));
}

// ── Cluster ─────────────────────────────────────────────────

function generateSetupScript(node: OllamaNode, models: string[]): string {
  const modelsCmd = models.map((m) => `ollama pull ${m}`).join("\n");
  const isLocal = node.url.includes("localhost") || node.url.includes("127.0.0.1");

  if (isLocal) {
    return `#!/bin/bash
# WabiSabi Ollama Local Setup
# Generated by 'wabi ollama --cluster'

set -e

echo "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

echo "Pulling models..."
${modelsCmd}

echo ""
echo "✓ Local node ready!"
`;
  }

  // Extract host from URL for the script
  const urlObj = new URL(node.url);
  const port = urlObj.port || "11434";

  return `#!/bin/bash
# WabiSabi Ollama Node Setup
# Generated by 'wabi ollama --cluster'
# Node: ${node.name}
# Target: ${node.url}
#
# Run this script on the remote machine:
#   ssh user@host 'bash -s' < ${node.name}-setup.sh

set -e

echo "=== WabiSabi Ollama Node Setup: ${node.name} ==="

# 1. Install Ollama
echo "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

# 2. Configure to accept remote connections
echo "Configuring remote access on port ${port}..."

if command -v systemctl &> /dev/null; then
  # systemd (Linux servers)
  sudo mkdir -p /etc/systemd/system/ollama.service.d
  sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'CONF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:${port}"
CONF
  sudo systemctl daemon-reload
  sudo systemctl enable ollama
  sudo systemctl restart ollama
elif [ "$(uname)" = "Darwin" ]; then
  # macOS - set env for launchd
  launchctl setenv OLLAMA_HOST "0.0.0.0:${port}"
  # Restart Ollama app if running
  pkill -f "Ollama" 2>/dev/null || true
  sleep 2
  open -a Ollama 2>/dev/null || ollama serve &
fi

# 3. Wait for service to start
echo "Waiting for Ollama to start..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:${port}/api/tags > /dev/null 2>&1; then
    echo "Ollama is running!"
    break
  fi
  sleep 1
done

# 4. Pull required models
echo "Pulling models..."
${modelsCmd}

# 5. Verify
echo ""
echo "============================================"
echo "  ✓ Node '${node.name}' is ready!"
echo ""
echo "  Add to WabiSabi on your main machine:"
echo "  wabi config --add-node http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<this-ip>'):${port}"
echo "============================================"
`;
}

export async function ollamaCluster(): Promise<void> {
  console.log(chalk.bold("\n  Ollama Cluster Manager\n"));

  const providers = configManager.getProviders();
  const nodes = providers.ollama.nodes;

  // Show current nodes
  if (nodes.length > 0) {
    console.log(chalk.dim("  Current nodes:"));
    for (const node of nodes) {
      const gpu = node.gpu ? chalk.dim(`[${node.gpu}]`) : "";
      console.log(`    ${chalk.cyan(node.name.padEnd(15))} ${node.url.padEnd(30)} ${gpu} priority:${node.priority}`);
    }
    console.log();
  } else {
    console.log(chalk.dim("  No nodes configured yet.\n"));
  }

  let running = true;
  while (running) {
    const action = await askChoice("What would you like to do?", [
      { value: "add", label: "Add nodes" },
      { value: "remove", label: "Remove a node" },
      { value: "script", label: "Generate setup script for a node" },
      { value: "test", label: "Test all nodes" },
      { value: "done", label: "Done" },
    ]);

    switch (action) {
      case "add": {
        const newNodes = await askMultipleNodes();
        providers.ollama.nodes.push(...newNodes);
        if (providers.ollama.nodes.length > 1) {
          providers.ollama.mode = "cluster";
        }
        configManager.update("providers", providers, "global");
        console.log(chalk.green(`  ✓ Added ${newNodes.length} node(s). Mode: ${providers.ollama.mode}`));
        break;
      }

      case "remove": {
        if (nodes.length === 0) {
          console.log(chalk.yellow("  No nodes to remove."));
          break;
        }
        const removeChoice = await askChoice(
          "Which node to remove?",
          nodes.map((n) => ({ value: n.name, label: `${n.name} (${n.url})` })),
        );
        const idx = providers.ollama.nodes.findIndex((n) => n.name === removeChoice);
        if (idx >= 0) {
          providers.ollama.nodes.splice(idx, 1);
          if (providers.ollama.nodes.length <= 1) {
            providers.ollama.mode = "local";
          }
          configManager.update("providers", providers, "global");
          console.log(chalk.green(`  ✓ Removed ${removeChoice}`));
        }
        break;
      }

      case "script": {
        let targetNode: OllamaNode;

        if (nodes.length > 0) {
          const useExisting = await askConfirm("Generate script for an existing node?", true);
          if (useExisting) {
            const nodeName = await askChoice(
              "Which node?",
              nodes.map((n) => ({ value: n.name, label: `${n.name} (${n.url})` })),
            );
            targetNode = nodes.find((n) => n.name === nodeName)!;
          } else {
            const name = await askInput("Node name", "remote-1");
            const url = await askInput("Node URL", "http://192.168.1.100:11434");
            const gpuType = await askChoice("GPU type:", [
              { value: "nvidia", label: "NVIDIA (CUDA)" },
              { value: "amd", label: "AMD (ROCm)" },
              { value: "metal", label: "Apple Silicon (Metal)" },
              { value: "cpu", label: "CPU only" },
            ]);
            targetNode = { name, url, gpu: gpuType as OllamaNode["gpu"], priority: 5 };
          }
        } else {
          const name = await askInput("Node name", "remote-1");
          const url = await askInput("Node URL", "http://192.168.1.100:11434");
          const gpuType = await askChoice("GPU type:", [
            { value: "nvidia", label: "NVIDIA (CUDA)" },
            { value: "amd", label: "AMD (ROCm)" },
            { value: "metal", label: "Apple Silicon (Metal)" },
            { value: "cpu", label: "CPU only" },
          ]);
          targetNode = { name, url, gpu: gpuType as OllamaNode["gpu"], priority: 5 };
        }

        const script = generateSetupScript(targetNode, DEFAULT_MODELS);
        const scriptFile = `${targetNode.name}-setup.sh`;
        const fullPath = `${process.cwd()}/${scriptFile}`;

        await Bun.write(fullPath, script);
        // Make executable
        await runCommand(["chmod", "+x", fullPath]);

        console.log(chalk.green(`\n  ✓ Setup script generated: ${chalk.bold(scriptFile)}`));
        console.log(chalk.dim(`    Full path: ${fullPath}`));
        console.log(chalk.dim(`\n    To use on the remote machine:`));
        console.log(chalk.cyan(`    scp ${scriptFile} user@host:~/ && ssh user@host 'bash ~/${scriptFile}'`));
        console.log();
        break;
      }

      case "test": {
        await printClusterStatus(nodes);
        break;
      }

      case "done":
        running = false;
        break;
    }
  }

  console.log();
}

// ── Status ──────────────────────────────────────────────────

async function printClusterStatus(nodes: OllamaNode[]): Promise<void> {
  if (nodes.length === 0) {
    console.log(chalk.yellow("\n  No nodes configured. Run 'wabi ollama --install' or 'wabi ollama --cluster'."));
    return;
  }

  console.log(chalk.bold("\n  Checking nodes...\n"));

  // Test all nodes in parallel
  const results = await Promise.all(
    nodes.map(async (node) => {
      const result = await testEndpoint(node.url, "/api/tags", 5000);
      return { node, ...result };
    }),
  );

  // Table header
  const nameW = 14;
  const urlW = 28;
  const gpuW = 8;
  const statusW = 8;
  const modelsW = 6;
  const totalW = nameW + urlW + gpuW + statusW + modelsW + 10;

  console.log(chalk.dim("  " + "─".repeat(totalW)));
  console.log(
    "  " +
    chalk.bold("Node".padEnd(nameW)) +
    chalk.bold("URL".padEnd(urlW)) +
    chalk.bold("GPU".padEnd(gpuW)) +
    chalk.bold("Status".padEnd(statusW)) +
    chalk.bold("Models".padEnd(modelsW)),
  );
  console.log(chalk.dim("  " + "─".repeat(totalW)));

  let totalModels = 0;
  let nodesUp = 0;

  for (const { node, ok, models } of results) {
    const status = ok ? chalk.green("UP") : chalk.red("DOWN");
    const modelCount = ok ? String(models?.length || 0) : "-";
    const gpu = node.gpu || "?";

    if (ok) {
      nodesUp++;
      totalModels += models?.length || 0;
    }

    console.log(
      "  " +
      chalk.cyan(node.name.padEnd(nameW)) +
      node.url.padEnd(urlW) +
      chalk.dim(gpu.padEnd(gpuW)) +
      (ok ? chalk.green("✓ UP".padEnd(statusW)) : chalk.red("✗ DOWN".padEnd(statusW))) +
      modelCount.padEnd(modelsW),
    );

    // Show models if UP
    if (ok && models && models.length > 0) {
      console.log(chalk.dim(`  ${"".padEnd(nameW)}Models: ${models.join(", ")}`));
    }
  }

  console.log(chalk.dim("  " + "─".repeat(totalW)));
  console.log(
    `  ${chalk.bold("Summary:")} ${nodesUp}/${results.length} nodes UP, ` +
    `${totalModels} total models across cluster`,
  );
  console.log();
}

export async function ollamaStatus(): Promise<void> {
  console.log(chalk.bold("\n  Ollama Cluster Status\n"));

  const providers = configManager.getProviders();
  const nodes = providers.ollama.nodes;

  console.log(chalk.dim(`  Mode: ${providers.ollama.mode}`));
  await printClusterStatus(nodes);
}

// ── Uninstall ───────────────────────────────────────────────

export async function ollamaUninstall(): Promise<void> {
  console.log(chalk.bold("\n  Ollama Uninstall\n"));

  const ollamaPath = await which("ollama");
  if (!ollamaPath) {
    console.log(chalk.yellow("  Ollama is not installed."));
    return;
  }

  console.log(chalk.yellow(`  Ollama found at: ${ollamaPath}`));
  const confirm = await askConfirm("Remove Ollama and all downloaded models?", false);
  if (!confirm) {
    console.log(chalk.dim("  Cancelled."));
    return;
  }

  const platform = process.platform;

  // Stop service
  console.log(chalk.cyan("  Stopping Ollama..."));
  if (platform === "linux") {
    await runCommand(["sudo", "systemctl", "stop", "ollama"]);
    await runCommand(["sudo", "systemctl", "disable", "ollama"]);
  } else if (platform === "darwin") {
    await runCommand(["pkill", "-f", "Ollama"]);
  }

  // Remove binary
  console.log(chalk.cyan("  Removing binary..."));
  if (platform === "linux") {
    await runCommand(["sudo", "rm", "-f", "/usr/local/bin/ollama"]);
    await runCommand(["sudo", "rm", "-rf", "/etc/systemd/system/ollama.service"]);
    await runCommand(["sudo", "rm", "-rf", "/etc/systemd/system/ollama.service.d"]);
  } else if (platform === "darwin") {
    // macOS: Ollama app is in /Applications
    await runCommand(["rm", "-rf", "/Applications/Ollama.app"]);
  }

  // Remove models data
  const removeData = await askConfirm("Also remove downloaded models and data? (~/.ollama)", false);
  if (removeData) {
    const home = process.env.HOME || "~";
    await runCommand(["rm", "-rf", `${home}/.ollama`]);
    console.log(chalk.green("  ✓ Models and data removed"));
  }

  // Clean config
  const providers = configManager.getProviders();
  providers.ollama.nodes = providers.ollama.nodes.filter(
    (n) => !n.url.includes("localhost") && !n.url.includes("127.0.0.1"),
  );
  if (providers.ollama.nodes.length <= 1) {
    providers.ollama.mode = "local";
  }
  configManager.update("providers", providers, "global");

  console.log(chalk.green("\n  ✓ Ollama uninstalled. Remote nodes preserved in config."));
  console.log(chalk.dim("    Run 'wabi ollama --install' to reinstall anytime.\n"));
}
