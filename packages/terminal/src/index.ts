#!/usr/bin/env bun

import { Command } from "commander";
import {
  agentSwitcher,
  AGENTS,
  AgentType,
  menuSystem,
  privacyManager,
  configManager,
  toolRegistry,
  sessionManager,
} from "./services/index.js";
import type { CLIOptions } from "./clients/api-client.js";

// Register all tools
import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { editTool } from "./tools/edit.js";
import { bashTool } from "./tools/bash.js";
import { grepTool } from "./tools/grep.js";
import { globTool } from "./tools/glob.js";
import { listTool } from "./tools/list.js";
import { updatePlanTool } from "./tools/update-plan.js";
import { updateTodoTool } from "./tools/update-todo.js";
import { gitTool } from "./tools/git.js";
import { webTool } from "./tools/web.js";

toolRegistry.register(readTool);
toolRegistry.register(writeTool);
toolRegistry.register(editTool);
toolRegistry.register(bashTool);
toolRegistry.register(grepTool);
toolRegistry.register(globTool);
toolRegistry.register(listTool);
toolRegistry.register(updatePlanTool);
toolRegistry.register(updateTodoTool);
toolRegistry.register(gitTool);
toolRegistry.register(webTool);

// Load global config
configManager.loadGlobal();

/** Merge CLI flags with config file defaults */
function resolveOptions(cliOpts: CLIOptions): CLIOptions {
  const providers = configManager.getProviders();
  const merged = configManager.getMerged();

  return {
    ...cliOpts,
    model: cliOpts.model || merged.model || "llama3.2",
    providers,
    provider: (cliOpts.provider as "substratum" | "ollama" | undefined) || undefined,
  };
}

const program = new Command();

program
  .name("wabisabi")
  .description(
    "🤖 AI Terminal IDE - Code with intelligent agents (OpenCode-compatible)",
  )
  .version("1.0.0")
  .option("--substratum <url>", "Substratum API URL (legacy)")
  .option("--ollama <url>", "Ollama URL (legacy, use config wizard for cluster)")
  .option("--model <name>", "Model to use", "llama3.2")
  .option("--provider <type>", "Force provider: substratum or ollama")
  .option("--api-key <key>", "[DEPRECATED] API key - use WABISABI_API_KEY env var instead")
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
    "🚀 Start interactive mode with the default agent",
  )
  .option("--agent <type>", "Agent to use (build, plan, search)", "build")
  .action(async (cmdOpts: { agent?: string }) => {
    const opts = resolveOptions(program.opts() as CLIOptions);
    const agentType = cmdOpts.agent || "build";

    const agentMap: Record<string, () => Promise<any>> = {
      build: () => import("./agents/build/index.js").then((m) => m.BuildAgent),
      plan: () => import("./agents/plan/index.js").then((m) => m.PlanAgent),
      search: () => import("./agents/search/index.js").then((m) => m.SearchAgent),
    };

    if (!agentMap[agentType]) {
      console.error(`Unknown agent: ${agentType}`);
      console.log(`Available: ${Object.keys(agentMap).join(", ")}`);
      process.exit(1);
    }

    agentSwitcher.set(agentType as AgentType);
    const AgentClass = await agentMap[agentType]();
    const agent = new AgentClass(opts);
    await agent.run();
  });

// ═══════════════════════════════════════════════════════════════
// BATCH MODE
// ═══════════════════════════════════════════════════════════════

program
  .command("batch <file>")
  .alias("b")
  .description("📦 Run batch mode with a task file")
  .action(async (file: string) => {
    const opts = resolveOptions(program.opts() as CLIOptions);
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
    const opts = resolveOptions(program.opts() as CLIOptions);
    await import("./modes/streaming.js").then((m) => m.streamingMode(opts));
  });

// ═══════════════════════════════════════════════════════════════
// AGENT COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("agent <type>")
  .alias("a")
  .description("🤖 Run a specific agent (build, plan, search)")
  .action(async (type: AgentType) => {
    const opts = resolveOptions(program.opts() as CLIOptions);

    const agentInfo = AGENTS.find((a) => a.type === type);
    if (!agentInfo) {
      console.error(`❌ Unknown agent: ${type}`);
      console.log(`Available agents: ${AGENTS.map((a) => a.type).join(", ")}`);
      process.exit(1);
    }

    agentSwitcher.set(type);

    // Dynamic import and run the agent with tool-calling loop
    const agentMap: Record<string, () => Promise<any>> = {
      build: () => import("./agents/build/index.js").then((m) => m.BuildAgent),
      plan: () => import("./agents/plan/index.js").then((m) => m.PlanAgent),
      search: () => import("./agents/search/index.js").then((m) => m.SearchAgent),
    };

    const AgentClass = await agentMap[type]();
    const agent = new AgentClass(opts);
    await agent.run();
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
  .description("⚙️ Configuration management (show, wizard, test)")
  .option("--wizard", "Launch interactive configuration wizard")
  .option("--add-node <url>", "Quick-add an Ollama node by URL")
  .option("--test", "Test connectivity to all configured endpoints")
  .option("--show", "Show current configuration (default)")
  .action(async (options: { wizard?: boolean; addNode?: string; test?: boolean; show?: boolean }) => {
    const { showConfig, runConfigWizard, quickAddNode, testConnectivity } = await import("./wizard/config-wizard.js");

    if (options.wizard) {
      await runConfigWizard();
      return;
    }

    if (options.addNode) {
      await quickAddNode(options.addNode);
      return;
    }

    if (options.test) {
      await testConnectivity();
      return;
    }

    // Default: show config
    showConfig();
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
// WATCH MODE
// ═══════════════════════════════════════════════════════════════

program
  .command("watch")
  .alias("w")
  .description("👁️ Watch files and run commands on change")
  .option("--command <cmd>", "Command to run on file change")
  .option("--prompt <text>", "LLM prompt on file change (use {file} placeholder)")
  .option("--ignore <dirs>", "Comma-separated directories to ignore")
  .action(async (cmdOpts: { command?: string; prompt?: string; ignore?: string }) => {
    const opts = resolveOptions(program.opts() as CLIOptions);
    await import("./modes/watch.js").then((m) =>
      m.watchMode(opts, {
        command: cmdOpts.command,
        onChangePrompt: cmdOpts.prompt,
        ignore: cmdOpts.ignore?.split(",").map((s) => s.trim()),
      }),
    );
  });

// ═══════════════════════════════════════════════════════════════
// WEB UI
// ═══════════════════════════════════════════════════════════════

program
  .command("web")
  .description("🌐 Start web-based terminal UI (xterm.js)")
  .option("--port <number>", "HTTP/WS port", "3333")
  .action(async (cmdOpts: { port?: string }) => {
    const opts = resolveOptions(program.opts() as CLIOptions);
    const port = parseInt(cmdOpts.port || "3333", 10);
    await import("./modes/web.js").then((m) => m.webMode(opts, port));
  });

// ═══════════════════════════════════════════════════════════════
// MULTI-AGENT
// ═══════════════════════════════════════════════════════════════

program
  .command("collab <request>")
  .description("🤝 Multi-agent collaboration on a complex task")
  .action(async (request: string) => {
    const opts = resolveOptions(program.opts() as CLIOptions);
    const { AgentCoordinator } = await import("./agents/coordinator.js");
    const { projectContext } = await import("./context/index.js");
    await projectContext.initialize();
    const coordinator = new AgentCoordinator(opts);
    const plan = await coordinator.createPlan(request);
    await coordinator.execute(plan);
  });

// ═══════════════════════════════════════════════════════════════
// PLUGIN COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("plugin")
  .description("🔌 Manage plugins")
  .option("--list", "List installed plugins")
  .option("--install <path>", "Install plugin from local path")
  .option("--enable <name>", "Enable a plugin")
  .option("--disable <name>", "Disable a plugin")
  .option("--remove <name>", "Remove a plugin")
  .action(async (options: { list?: boolean; install?: string; enable?: string; disable?: string; remove?: string }) => {
    const { pluginManager } = await import("./services/plugin-manager.js");
    await pluginManager.loadAll();

    if (options.install) {
      try {
        const info = await pluginManager.install({ type: "local", path: options.install });
        console.log(`🔌 Installed: ${info.manifest.name} v${info.manifest.version}`);
      } catch (err) {
        console.error(`❌ Install failed: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }

    if (options.enable) {
      pluginManager.enable(options.enable);
      console.log(`✓ Enabled: ${options.enable}`);
      return;
    }

    if (options.disable) {
      pluginManager.disable(options.disable);
      console.log(`✓ Disabled: ${options.disable}`);
      return;
    }

    if (options.remove) {
      try {
        await pluginManager.remove(options.remove);
        console.log(`🗑️ Removed: ${options.remove}`);
      } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : err}`);
      }
      return;
    }

    // Default: list
    const plugins = pluginManager.list();
    if (plugins.length === 0) {
      console.log("\n🔌 No plugins installed.");
      console.log("   Install: wabisabi plugin --install <path>");
    } else {
      console.log("\n🔌 Installed Plugins");
      console.log("═".repeat(40));
      for (const p of plugins) {
        const status = p.enabled ? "✓" : "✗";
        console.log(`  ${status} ${p.manifest.name.padEnd(20)} v${p.manifest.version} (${p.manifest.type})`);
      }
    }
  });

// ═══════════════════════════════════════════════════════════════
// SKILLS COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("tools")
  .alias("tool")
  .description("🛠️ List available tools")
  .action(() => {
    const tools = toolRegistry.list();
    console.log("\n🛠️ Available Tools");
    console.log("═".repeat(40));

    for (const tool of tools) {
      console.log(`  🔧 ${tool.id.padEnd(10)} ${tool.description.slice(0, 60)}`);
    }

    console.log(`\nTotal: ${tools.length} tools registered`);
  });

// ═══════════════════════════════════════════════════════════════
// SESSION COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .command("session")
  .description("📂 Manage sessions")
  .option("--list", "List recent sessions")
  .option("--resume <id>", "Resume a session by ID")
  .option("--delete <id>", "Delete a session by ID")
  .action(async (options: { list?: boolean; resume?: string; delete?: string }) => {
    if (options.list || (!options.resume && !options.delete)) {
      const sessions = await sessionManager.listRecent();
      console.log("\n📂 Recent Sessions");
      console.log("═".repeat(60));

      if (sessions.length === 0) {
        console.log("No sessions found.");
      } else {
        for (const s of sessions) {
          const date = new Date(s.updated).toLocaleString();
          console.log(`  ${s.id}  ${s.title.slice(0, 30).padEnd(30)}  ${s.agent}  ${date}`);
        }
      }
    }

    if (options.resume) {
      const session = await sessionManager.resume(options.resume);
      if (!session) {
        console.error(`Session not found: ${options.resume}`);
        return;
      }

      // Launch the agent that was used in this session
      const opts = resolveOptions(program.opts() as CLIOptions);
      const agentName = session.agent.replace("Agent", "").toLowerCase();
      const agentMap: Record<string, () => Promise<any>> = {
        build: () => import("./agents/build/index.js").then((m) => m.BuildAgent),
        plan: () => import("./agents/plan/index.js").then((m) => m.PlanAgent),
        search: () => import("./agents/search/index.js").then((m) => m.SearchAgent),
      };

      const loader = agentMap[agentName] || agentMap["build"];
      const AgentClass = await loader();
      const agent = new AgentClass(opts);
      await agent.run(options.resume);
    }

    if (options.delete) {
      const deleted = await sessionManager.deleteSession(options.delete);
      if (deleted) {
        console.log(`🗑️ Session deleted: ${options.delete}`);
      } else {
        console.error(`❌ Session not found: ${options.delete}`);
      }
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
    const opts = resolveOptions(program.opts() as CLIOptions);
    const providers = opts.providers || configManager.getProviders();
    const ollamaMode = providers.ollama.mode;
    const ollamaNodes = providers.ollama.nodes.length;
    const subEnabled = providers.substratum.enabled ? "enabled" : "disabled";

    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🤖 WabiSabi - AI Terminal IDE                             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Version: 1.0.0                                            ║
║                                                            ║
║  Providers:                                                ║
║    Ollama: ${(ollamaMode + " (" + ollamaNodes + " nodes)").padEnd(30)}║
║    Substratum: ${subEnabled.padEnd(27)}║
║    Model: ${opts.model.padEnd(30)}║
║    Privacy: ${privacyManager.formatDisplay().padEnd(28)}║
║                                                            ║
║  Status:                                                   ║
║    Agent: ${agentSwitcher.getInfo().label.padEnd(33)}║
║                                                            ║
║  Run 'wabisabi config --wizard' to reconfigure             ║
║  Run 'wabisabi config --test' to test connectivity         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
  });

// Default to interactive mode when no subcommand
if (process.argv.length <= 2) {
  process.argv.push("interactive");
}

program.parse();

// Security (BAJA-5): Warn about deprecated --api-key flag
const opts = program.opts() as CLIOptions;
if (opts.apiKey) {
  console.warn("\n⚠️  WARNING: --api-key flag is DEPRECATED and will be removed in a future version.");
  console.warn("   Security risk: API keys visible in process list (ps aux)");
  console.warn("   Use environment variable instead: export WABISABI_API_KEY=your-key\n");
}

export { program };
