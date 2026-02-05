#!/usr/bin/env bun

interface AdminOptions {
  config: string;
  output: string;
}

const commands: Record<string, string> = {
  status: "Show system status",
  config: "Edit configuration",
  users: "Manage users",
  models: "List available models",
  logs: "View system logs",
  backup: "Create backup",
  restore: "Restore from backup",
};

export async function runAdmin(args: string[]): Promise<void> {
  const command = args[0] || "status";

  if (command === "help" || args.includes("--help")) {
    console.log(`
WabiSabi Admin Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: wabisabi-admin <command>

Available Commands:
  status     Show system status
  config     Edit configuration
  users      Manage users
  models     List available models
  logs       View system logs
  backup     Create backup
  restore    Restore from backup

Options:
  --help     Show this help
  --json     Output as JSON
  --verbose  Verbose output
`);
    return;
  }

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    console.log("Run 'wabisabi-admin help' for available commands");
    return;
  }

  console.log(`🔧 WabiSabi Admin: ${command}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  switch (command) {
    case "status":
      await showStatus();
      break;
    case "models":
      await listModels();
      break;
    case "config":
      console.log("Config editor coming soon...");
      break;
    case "users":
      console.log("User management coming soon...");
      break;
    case "logs":
      console.log("Log viewer coming soon...");
      break;
    case "backup":
      console.log("Backup tool coming soon...");
      break;
    case "restore":
      console.log("Restore tool coming soon...");
      break;
  }
}

async function showStatus(): Promise<void> {
  const status = {
    version: "1.0.0",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version,
  };

  console.log(JSON.stringify(status, null, 2));
}

async function listModels(): Promise<void> {
  console.log("📦 Available Models");
  console.log("━━━━━━━━━━━━━━━━━━");

  try {
    const response = await fetch("http://localhost:3001/v1/models");
    if (response.ok) {
      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log("Substratum not available. Checking Ollama...");
      const ollamaRes = await fetch("http://localhost:11434/api/tags");
      const ollamaData = await ollamaRes.json();
      console.log(JSON.stringify(ollamaData, null, 2));
    }
  } catch {
    console.log("No model providers available");
    console.log("Make sure Substratum or Ollama is running");
  }
}

// Run if executed directly
if (import.meta.path === Bun.main) {
  await runAdmin(process.argv.slice(2));
}
