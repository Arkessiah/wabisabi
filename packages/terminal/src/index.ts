#!/usr/bin/env bun

import { Command } from "commander";
import {
  agentSwitcher,
  AGENTS,
  AgentType,
  menuSystem,
  privacyManager,
  pluginManager,
  type PluginSource,
} from "./services/index.js";

interface CLIOptions {
  substratum: string;
  ollama: string;
  model: string;
  privacy: string;
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowSystemCommands: boolean;
}

const program = new Command();

program
  .name("wabisabi")
  .description(
    "🤖 AI Terminal IDE - Code with intelligent agents (OpenCode-compatible)",
  )
  .version("1.0.0")
  .option("--substratum <url>", "Substratum API URL", "http://localhost:3001")
  .option("--ollama <url>", "Ollama local URL", "http://localhost:11434")
  .option("--model <name>", "Model to use", "llama3.2")
  .option(
    "--privacy <level>",
    "Privacy level (local, hybrid, semi, full)",
    "hybrid",
  )
  .option("--allow-file-read", "Allow file read skill", false)
  .option("--allow-file-write", "Allow file write skill", false)
  .option("--allow-system-commands", "Allow bash skill", false);

// ═══════════════════════════════════════════════════════════════
// INTERACTIVE MODE
// ═══════════════════════════════════════════════════════════════

program
  .command("interactive")
  .alias("i")
  .description(
    "🚀 Start interactive mode (Tab to switch agents, Ctrl+P for menu)",
  )
  .action(async () => {
    const opts = program.opts() as CLIOptions;
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🤖 WabiSabi CLI v1.0                                       ║
║  ─────────────────────────────────────────────────────────── ║
║  🎯 Tips:                                                   ║
║     Tab → Switch agents (BUILD → PLAN → SEARCH)            ║
║     Ctrl+P → Configuration menu                            ║
║     Ctrl+C → Exit                                           ║
║     Ctrl+L → Clear screen                                  ║
╚════════════════════════════════════════════════════════════╝
`);

    const currentAgent = agentSwitcher.getInfo();
    console.log(
      `👤 Current Agent: ${currentAgent.icon} [${currentAgent.label}] - ${currentAgent.description}`,
    );
    console.log(`🔒 Privacy: ${privacyManager.formatDisplay()}`);
    console.log(`🎛️  Model: ${opts.model}`);
    console.log(`🔗 Connected to: ${opts.substratum}`);
    console.log("\n⏳ Interactive mode implementation pending...\n");

    // Simulate agent change on Tab
    console.log("💡 Try: agentSwitcher.cycle() to switch agents\n");
  });

// ═══════════════════════════════════════════════════════════════
// BATCH MODE
// ═══════════════════════════════════════════════════════════════

program
  .command("batch <file>")
  .alias("b")
  .description("📦 Run batch mode with a task file")
  .action(async (file: string) => {
    const opts = program.opts() as CLIOptions;
    console.log(`📦 Batch mode: ${file}`);
    await import("./modes/batch.js").then((m) => m.batchMode(file, opts));
  });

// ═══════════════════════════════════════════════════════════════
// STREAMING MODE
// ═══════════════════════════════════════════════════════════════

program
  .command("stream")
  .alias("s")
  .description("🌊 Start streaming mode")
  .action(async () => {
    const opts = program.opts() as CLIOptions;
    await import("./modes/streaming.js").then((m) => m.streamingMode(opts));
  });

// ═══════════════════════════════════════════════════════════════
// AGENT COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("agent <type>")
  .alias("a")
  .description("🤖 Run a specific agent (build, plan, search)")
  .option("--task <task>", "Task description")
  .action(async (type: AgentType, options: { task?: string }) => {
    const opts = program.opts() as CLIOptions;

    const agentInfo = AGENTS.find((a) => a.type === type);
    if (!agentInfo) {
      console.error(`❌ Unknown agent: ${type}`);
      console.log(`Available agents: ${AGENTS.map((a) => a.type).join(", ")}`);
      process.exit(1);
    }

    agentSwitcher.set(type);

    console.log(`🧠 WabiSabi Agent: ${agentInfo.icon} ${agentInfo.label}`);
    console.log(`📋 Description: ${agentInfo.description}`);
    console.log(`📝 Task: ${options.task || "default task"}`);
    console.log(`🔗 Target: ${opts.substratum}`);
    console.log(`🎛️  Privacy: ${privacyManager.formatDisplay()}`);
  });

// ═══════════════════════════════════════════════════════════════
// MENU COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("menu")
  .alias("m")
  .description("🎛️ Open configuration menu (Ctrl+P style)")
  .action(() => {
    menuSystem.open();
    console.log("\n" + menuSystem.renderToText() + "\n");
    console.log("💡 Use arrow keys to navigate, Enter to select, Esc to close");
  });

program
  .command("config")
  .alias("c")
  .description("⚙️ Show current configuration")
  .action(() => {
    const opts = program.opts() as CLIOptions;
    console.log("\n⚙️ WabiSabi Configuration");
    console.log("═".repeat(40));
    console.log(`Model: ${opts.model}`);
    console.log(`Substratum: ${opts.substratum}`);
    console.log(`Ollama: ${opts.ollama}`);
    console.log(`Privacy: ${privacyManager.formatDisplay()}`);
    console.log(`Current Agent: ${agentSwitcher.getInfo().label}`);
    console.log("\nPermissions:");
    console.log(`  File Read: ${opts.allowFileRead ? "✓" : "✗"}`);
    console.log(`  File Write: ${opts.allowFileWrite ? "✓" : "✗"}`);
    console.log(`  System Commands: ${opts.allowSystemCommands ? "✓" : "✗"}`);
  });

// ═══════════════════════════════════════════════════════════════
// PRIVACY COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("privacy")
  .alias("p")
  .description("🔒 Manage privacy settings")
  .option("--show", "Show current privacy level")
  .option("--set <level>", "Set privacy level (local/hybrid/semi/full)")
  .option("--audit", "Run privacy audit")
  .option("--report", "Generate privacy report")
  .action(
    async (options: {
      show?: boolean;
      set?: string;
      audit?: boolean;
      report?: boolean;
    }) => {
      if (options.show) {
        console.log(`\n🔒 Privacy Level: ${privacyManager.formatDisplay()}`);
        const config = privacyManager.getConfig();
        console.log("\nConfig:");
        console.log(`  Network: ${config.allowNetwork ? "✓" : "✗"}`);
        console.log(`  Remote Models: ${config.allowRemoteModels ? "✓" : "✗"}`);
        console.log(
          `  External Skills: ${config.allowExternalSkills ? "✓" : "✗"}`,
        );
        console.log(`  Telemetry: ${config.allowTelemetry ? "✓" : "✗"}`);
      }

      if (options.set) {
        const { PrivacyLevel } = await import("./services/privacy-manager.js");
        const levelMap: Record<string, any> = {
          local: PrivacyLevel.LEVEL_1_LOCAL_ONLY,
          hybrid: PrivacyLevel.LEVEL_2_HYBRID,
          semi: PrivacyLevel.LEVEL_3_SEMI_REMOTE,
          full: PrivacyLevel.LEVEL_4_FULL_REMOTE,
        };
        const level = levelMap[options.set];
        if (level) {
          privacyManager.setLevel(level);
        } else {
          console.error(`❌ Unknown privacy level: ${options.set}`);
          console.log("Options: local, hybrid, semi, full");
        }
      }

      if (options.audit) {
        const result = privacyManager.audit();
        privacyManager.printAudit(result);
      }

      if (options.report) {
        console.log("\n📊 Privacy Report");
        console.log("═".repeat(40));
        const auditLog = privacyManager.getAuditLog();
        if (auditLog.length > 0) {
          console.log(`Total audits: ${auditLog.length}`);
          console.log(
            `Latest audit: ${auditLog[auditLog.length - 1].timestamp.toISOString()}`,
          );
        } else {
          console.log(
            "No audits recorded yet. Run 'wabi privacy --audit' first.",
          );
        }
      }

      if (!options.show && !options.set && !options.audit && !options.report) {
        console.log(`\n🔒 Privacy Level: ${privacyManager.formatDisplay()}`);
        console.log("💡 Use --show, --set, --audit, or --report");
      }
    },
  );

// ═══════════════════════════════════════════════════════════════
// PLUGIN COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("plugin")
  .description("🔌 Manage plugins")
  .command("add <source>")
  .description("Install a plugin (GitHub repo, npm package, or local path)")
  .action(async (source: string) => {
    console.log(`📦 Installing plugin: ${source}`);

    // Detectar tipo de fuente
    let pluginSource: PluginSource;

    if (source.includes("github.com") || source.includes("/")) {
      pluginSource = { type: "github", repo: source };
    } else if (source.startsWith("@")) {
      pluginSource = { type: "npm", package: source };
    } else {
      pluginSource = { type: "local", path: source };
    }

    try {
      await pluginManager.install(pluginSource);
    } catch (error) {
      console.error(`❌ Installation failed: ${error}`);
    }
  });

program
  .command("plugin list")
  .alias("plugin ls")
  .description("📋 List installed plugins")
  .action(() => {
    const plugins = pluginManager.list();
    console.log("\n📦 Installed Plugins");
    console.log("═".repeat(40));

    if (plugins.length === 0) {
      console.log("No plugins installed.");
      console.log("💡 Install with: wabi plugin add <source>");
    } else {
      plugins.forEach((p) => {
        const status = p.enabled ? "✓" : "✗";
        console.log(`${status} ${p.manifest.name} v${p.manifest.version}`);
        console.log(`   Type: ${p.manifest.type}`);
        console.log(`   Description: ${p.manifest.description}`);
      });
    }
  });

program
  .command("plugin show <name>")
  .description("ℹ️ Show plugin details")
  .action((name: string) => {
    const plugin = pluginManager.show(name);
    if (plugin) {
      console.log(`\n📦 Plugin: ${plugin.manifest.name}`);
      console.log("═".repeat(40));
      console.log(`Version: ${plugin.manifest.version}`);
      console.log(`Type: ${plugin.manifest.type}`);
      console.log(`Description: ${plugin.manifest.description}`);
      console.log(`Author: ${plugin.manifest.author}`);
      console.log(`License: ${plugin.manifest.license}`);
      console.log(`Enabled: ${plugin.enabled ? "Yes" : "No"}`);
      console.log(`Loaded: ${plugin.loaded ? "Yes" : "No"}`);
      console.log(`Installed: ${plugin.installedAt.toISOString()}`);
      if (plugin.manifest.skills) {
        console.log(`Skills: ${plugin.manifest.skills.length}`);
      }
    } else {
      console.error(`❌ Plugin not found: ${name}`);
    }
  });

program
  .command("plugin enable <name>")
  .description("✅ Enable a plugin")
  .action((name: string) => pluginManager.enable(name));

program
  .command("plugin disable <name>")
  .description("❌ Disable a plugin")
  .action((name: string) => pluginManager.disable(name));

program
  .command("plugin remove <name>")
  .alias("plugin rm")
  .description("🗑️ Remove a plugin")
  .action(async (name: string) => {
    try {
      await pluginManager.remove(name);
    } catch (error) {
      console.error(`❌ Remove failed: ${error}`);
    }
  });

program
  .command("plugin search <query>")
  .description("🔍 Search for plugins")
  .action(async (query: string) => {
    const results = await pluginManager.search(query);
    console.log(`\n🔍 Search results for "${query}":`);
    if (results.length === 0) {
      console.log("No results found.");
    } else {
      results.forEach((p) => {
        console.log(`  - ${p.manifest.name} v${p.manifest.version}`);
      });
    }
  });

// ═══════════════════════════════════════════════════════════════
// SKILLS COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("skills")
  .alias("skill")
  .description("🛠️ Manage skills")
  .command("list")
  .alias("ls")
  .description("📋 List available skills")
  .action(() => {
    const skills = pluginManager.listSkills();
    console.log("\n🛠️ Available Skills");
    console.log("═".repeat(40));

    const defaultSkills = ["Read", "Write", "Bash", "Grep"];
    console.log("Built-in Skills:");
    defaultSkills.forEach((s) => console.log(`  📄 ${s}`));

    if (skills.length > 0) {
      console.log("\nPlugin Skills:");
      skills.forEach((s: any) =>
        console.log(`  🔌 ${s.name}: ${s.description}`),
      );
    }
  });

// ═══════════════════════════════════════════════════════════════
// HELP & INFO
// ═══════════════════════════════════════════════════════════════

program
  .command("shortcuts")
  .description("⌨️ Show keyboard shortcuts")
  .action(() => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  ⌨️ WabiSabi Keyboard Shortcuts                           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  General:                                                  ║
║    Ctrl+C   Exit / Cancel                                  ║
║    Ctrl+L   Clear screen                                  ║
║                                                            ║
║  Agent Switching:                                          ║
║    Tab      Cycle agents (BUILD → PLAN → SEARCH)          ║
║    Ctrl+1   Switch to BUILD agent                         ║
║    Ctrl+2   Switch to PLAN agent                          ║
║    Ctrl+3   Switch to SEARCH agent                        ║
║                                                            ║
║  Menu:                                                     ║
║    Ctrl+P   Open configuration menu                       ║
║    ↑/↓      Navigate menu items                            ║
║    Enter    Select item                                    ║
║    Space    Toggle checkbox                                ║
║    Esc      Close menu                                     ║
║                                                            ║
║  Session:                                                  ║
║    Ctrl+S   Save session                                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
  });

program
  .command("info")
  .alias("about")
  .description("ℹ️ Show system information")
  .action(() => {
    const opts = program.opts() as CLIOptions;
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🤖 WabiSabi - AI Terminal IDE                             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Version: 1.0.0                                            ║
║                                                            ║
║  Current Configuration:                                    ║
║    Model: ${opts.model.padEnd(30)}║
║    Substratum: ${opts.substratum.padEnd(27)}║
║    Ollama: ${opts.ollama.padEnd(31)}║
║    Privacy: ${privacyManager.formatDisplay().padEnd(28)}║
║                                                            ║
║  Status:                                                   ║
║    Agent: ${agentSwitcher.getInfo().label.padEnd(33)}║
║    Plugins: ${pluginManager.list().length} installed                              ║
║                                                            ║
║  Compatible with:                                          ║
║    ✅ Claude Code Skills                                  ║
║    ✅ OpenCode Plugins                                    ║
║    ✅ Substratum Backend                                  ║
║    ✅ Ollama Local Models                                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
  });

// Parse arguments
program.parse();

export { program };
