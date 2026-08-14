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
  workspaceTrust,
} from "./services/index.js";
import type { CLIOptions } from "./clients/api-client.js";
import chalk from "chalk";

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
import { skillTool } from "./tools/skill.js";

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
toolRegistry.register(skillTool);

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
  .option("--allow-system-commands", "Allow bash skill", false)
  .option("--no-tui", "Disable TUI mode (use legacy readline interface)");

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
  .option("--trust", "Trust current directory without prompting")
  .action(async (cmdOpts: { agent?: string; trust?: boolean }) => {
    // First-run onboarding
    const { isFirstRun, runOnboarding } = await import("./onboarding.js");
    if (isFirstRun()) {
      await runOnboarding();
    }

    // Workspace trust check
    const cwd = process.cwd();
    if (cmdOpts.trust) {
      workspaceTrust.trust(cwd);
    } else {
      const trusted = await workspaceTrust.ensureTrusted(cwd);
      if (!trusted) process.exit(0);
    }

    const opts = resolveOptions(program.opts() as CLIOptions);
    const globalOpts = program.opts();
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

    // Determine I/O mode: TUI or Legacy
    const useTui = globalOpts.tui !== false && process.stdout.isTTY;
    let io: import("./tui/types.js").TerminalIO;

    if (useTui) {
      const { TuiTerminalIO } = await import("./tui/tui-io.js");
      const tuiIO = new TuiTerminalIO();

      // Wire agent switching via TUI
      tuiIO.getEngine().onAgentChange(async (newAgent) => {
        agentSwitcher.set(newAgent as AgentType);
      });

      io = tuiIO;
    } else {
      const { LegacyTerminalIO } = await import("./tui/legacy-io.js");
      io = new LegacyTerminalIO();
    }

    agentSwitcher.set(agentType as AgentType);
    const AgentClass = await agentMap[agentType]();
    const agent = new AgentClass(opts, io);
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
  .description("Run a specific agent (build, plan, search)")
  .action(async (type: AgentType) => {
    // Workspace trust check
    const trusted = await workspaceTrust.ensureTrusted(process.cwd());
    if (!trusted) process.exit(0);

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

    // Use TUI if available
    const globalOpts = program.opts();
    const useTui = globalOpts.tui !== false && process.stdout.isTTY;
    let io: import("./tui/types.js").TerminalIO | undefined;

    if (useTui) {
      const { TuiTerminalIO } = await import("./tui/tui-io.js");
      const tuiIO = new TuiTerminalIO();
      tuiIO.getEngine().onAgentChange(async (newAgent) => {
        agentSwitcher.set(newAgent as AgentType);
      });
      io = tuiIO;
    }

    const agent = new AgentClass(opts, io);
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
// OLLAMA MANAGEMENT
// ═══════════════════════════════════════════════════════════════

program
  .command("ollama")
  .description("🦙 Manage Ollama installation and cluster")
  .option("--install", "Install Ollama locally and pull default models")
  .option("--pull [model]", "Pull a model on configured nodes")
  .option("--cluster", "Cluster setup wizard (add nodes, generate scripts)")
  .option("--status", "Show cluster status and health")
  .option("--uninstall", "Remove Ollama from this machine")
  .action(async (options: { install?: boolean; pull?: string | boolean; cluster?: boolean; status?: boolean; uninstall?: boolean }) => {
    const { ollamaInstall, ollamaPull, ollamaCluster, ollamaStatus, ollamaUninstall } =
      await import("./wizard/ollama-wizard.js");

    if (options.install) {
      await ollamaInstall();
      return;
    }

    if (options.pull !== undefined) {
      const model = typeof options.pull === "string" ? options.pull : undefined;
      await ollamaPull(model);
      return;
    }

    if (options.cluster) {
      await ollamaCluster();
      return;
    }

    if (options.uninstall) {
      await ollamaUninstall();
      return;
    }

    // Default: show status
    await ollamaStatus();
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

// ═══════════════════════════════════════════════════════════════
// AUTH & BILLING
// ═══════════════════════════════════════════════════════════════

program
  .command("login")
  .description("🔑 Login to Substratum")
  .option("--device", "Use OAuth device-code flow instead of email/password")
  .action(async (cmdOpts: { device?: boolean }) => {
    const { authManager } = await import("./auth/index.js");

    if (cmdOpts.device) {
      console.log("Starting OAuth device-code flow...\n");
      const ok = await authManager.login("substratum");
      if (ok) {
        console.log("\n✅ Authenticated via device-code flow");
      } else {
        console.error("\n❌ Authentication failed");
        process.exit(1);
      }
      return;
    }

    // Interactive email/password login
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    try {
      const email = await ask("Email: ");
      // Hide password input
      process.stdout.write("Password: ");
      const password = await new Promise<string>((resolve) => {
        let pw = "";
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.on("data", function handler(ch: Buffer) {
          const c = ch.toString();
          if (c === "\n" || c === "\r") {
            process.stdin.setRawMode?.(false);
            process.stdin.removeListener("data", handler);
            process.stdout.write("\n");
            resolve(pw);
          } else if (c === "\x7f" || c === "\b") {
            if (pw.length > 0) pw = pw.slice(0, -1);
          } else if (c === "\x03") {
            process.exit(0);
          } else {
            pw += c;
          }
        });
      });

      const ok = await authManager.loginTerminal(email, password);
      if (ok) {
        console.log("✅ Authenticated successfully");
        const config = authManager.getConfig();
        if (config?.sessionId) console.log(`   Session: ${config.sessionId}`);
      } else {
        console.error("❌ Invalid credentials");
        process.exit(1);
      }
    } finally {
      rl.close();
    }
  });

program
  .command("logout")
  .description("🚪 Logout and clear stored credentials")
  .action(async () => {
    const { authManager } = await import("./auth/index.js");
    authManager.logout();
    console.log("✅ Logged out - credentials cleared");
  });

program
  .command("billing")
  .description("💰 Show token usage and billing info")
  .action(async () => {
    const opts = resolveOptions(program.opts() as CLIOptions);
    const { ApiClient } = await import("./clients/api-client.js");
    const client = new ApiClient(opts);

    console.log("Fetching billing info...\n");
    const billing = await client.getBillingInfo();
    client.destroy();

    if (!billing) {
      console.error("❌ Could not fetch billing info. Are you logged in?");
      console.log("   Run: wabisabi login");
      process.exit(1);
    }

    const pct = billing.dailyLimit > 0
      ? ((billing.tokensUsed / billing.dailyLimit) * 100).toFixed(1)
      : "0";

    console.log(`╔══════════════════════════════════════╗`);
    console.log(`║  💰 Billing & Usage                  ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  Tokens used:      ${String(billing.tokensUsed).padEnd(17)}║`);
    console.log(`║  Tokens remaining: ${String(billing.tokensRemaining).padEnd(17)}║`);
    console.log(`║  Daily limit:      ${String(billing.dailyLimit).padEnd(17)}║`);
    console.log(`║  Usage:            ${(pct + "%").padEnd(17)}║`);
    console.log(`╚══════════════════════════════════════╝`);
  });

program
  .command("account")
  .description("👤 Manage your WabiSabi account")
  .option("--register", "Create a new account")
  .option("--profile", "View/edit your profile")
  .option("--billing", "Billing, tokens and usage")
  .option("--subscribe", "Manage subscription")
  .action(async (cmdOpts: { register?: boolean; profile?: boolean; billing?: boolean; subscribe?: boolean }) => {
    const { accountRegister, accountProfile, accountBilling, accountSubscribe, accountMenu } =
      await import("./wizard/account-wizard.js");

    if (cmdOpts.register) return accountRegister();
    if (cmdOpts.profile) return accountProfile();
    if (cmdOpts.billing) return accountBilling();
    if (cmdOpts.subscribe) return accountSubscribe();
    // No flag → interactive menu
    return accountMenu();
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

// ═══════════════════════════════════════════════════════════════
// WORKSPACE TRUST
// ═══════════════════════════════════════════════════════════════

program
  .command("trust")
  .description("Manage trusted workspaces")
  .option("--list", "List trusted directories")
  .option("--add [dir]", "Trust a directory (default: current)")
  .option("--revoke [dir]", "Revoke trust for a directory")
  .action((options: { list?: boolean; add?: string | boolean; revoke?: string | boolean }) => {
    if (options.list || (!options.add && !options.revoke)) {
      const workspaces = workspaceTrust.list();
      if (workspaces.length === 0) {
        console.log("\n  No trusted workspaces yet.");
        console.log("  Run wabisabi in a directory to trust it.\n");
      } else {
        console.log("\n  Trusted Workspaces");
        console.log("  " + "-".repeat(50));
        for (const w of workspaces) {
          const date = new Date(w.trustedAt).toLocaleDateString();
          console.log(`  ${w.path}  ${chalk.dim(date)}`);
        }
        console.log("");
      }
      return;
    }

    if (options.add !== undefined) {
      const dir = typeof options.add === "string" ? options.add : process.cwd();
      workspaceTrust.trust(dir);
      console.log(chalk.green(`  + Trusted: ${dir}`));
      return;
    }

    if (options.revoke !== undefined) {
      const dir = typeof options.revoke === "string" ? options.revoke : process.cwd();
      const removed = workspaceTrust.revoke(dir);
      if (removed) {
        console.log(chalk.yellow(`  - Revoked: ${dir}`));
      } else {
        console.log(chalk.dim(`  Directory not in trust list: ${dir}`));
      }
    }
  });

program
  .command("skills [action] [name]")
  .description("🧩 Project skills: list, and adopt harvested proposals")
  .action(async (action: string = "list", name?: string) => {
    const { SkillsManager } = await import("./context/skills.js");
    const { adoptDraft } = await import("./goal/harvest.js");
    const { projectContext } = await import("./context/index.js");
    const path = await import("path");

    await projectContext.initialize();
    const root = projectContext.getProjectRoot();
    const skillsDir = path.join(root, ".agents", "skills");
    const mgr = new SkillsManager(root);

    if (action === "adopt") {
      if (!name) {
        console.error("❌ Falta el nombre: wabisabi skills adopt <nombre>");
        process.exitCode = 1;
        return;
      }
      if (adoptDraft(skillsDir, name)) {
        console.log(`🧩 Skill "${name}" adoptada. Ya entra en el indice y puede auto-cargarse.`);
      } else {
        console.error(`❌ No hay ninguna propuesta pendiente llamada "${name}".`);
        process.exitCode = 1;
      }
      return;
    }

    const drafts = mgr.listDrafts();
    const adopted = mgr.list();

    if (drafts.length > 0) {
      console.log("\n🧩 Propuestas pendientes (no se cargan en ningun prompt):");
      for (const d of drafts) {
        console.log(`   ${d.name}  —  ${d.description.slice(0, 60)}`);
        console.log(`      ${d.path}`);
      }
      console.log("\n   Revisalas y edita lo que quieras; luego: wabisabi skills adopt <nombre>\n");
    }

    console.log(adopted.length > 0 ? "🧩 Skills activas:" : "🧩 No hay skills activas.");
    for (const s of adopted) {
      console.log(`   ${s.name} [${s.scope}]  —  ${s.description.slice(0, 60)}`);
    }
    for (const w of mgr.getWarnings()) console.log(`   ! ${w}`);
  });

program
  .command("daemon [action]")
  .description("👻 Background process (opt-in): start, stop, status, logs, run")
  .action(async (action: string = "status") => {
    const daemon = await import("./daemon/index.js");
    const { configManager } = await import("./config/index.js");
    configManager.loadGlobal();
    const cfg = configManager.getMerged();
    const daemonCfg = daemon.DaemonConfigSchema.parse(cfg.daemon ?? {});

    switch (action) {
      // Internal: the body of the detached child. Not for interactive use.
      case "run":
        daemon.runDaemon(daemonCfg);
        return;

      case "start": {
        if (!daemonCfg.enabled) {
          console.log("👻 El daemon está desactivado.");
          console.log("   Actívalo en ~/.wabisabi/config.jsonc:  \"daemon\": { \"enabled\": true }");
          process.exitCode = 1;
          return;
        }
        const res = await daemon.start(daemonCfg);
        if (res.started) {
          console.log(`👻 Daemon arrancado (pid ${res.pid}, 127.0.0.1:${res.port})`);
          console.log("   Sobrevive al cierre de la terminal. Párala con: wabisabi daemon stop");
        } else if (res.reason === "already-running") {
          console.log(`👻 Ya estaba corriendo (pid ${res.pid}, puerto ${res.port})`);
        } else {
          console.error(`❌ No arrancó: ${res.detail ?? res.reason}`);
          process.exitCode = 1;
        }
        return;
      }

      case "stop": {
        const res = await daemon.stop();
        if (res.stopped) {
          console.log(`👻 Daemon parado (pid ${res.pid})`);
        } else if (res.reason === "not-running") {
          console.log("👻 No hay ningún daemon corriendo.");
        } else {
          console.error(`❌ No se pudo parar (pid ${res.pid}): ${res.detail}`);
          process.exitCode = 1;
        }
        return;
      }

      case "logs": {
        console.log(daemon.defaultLogPath());
        return;
      }

      case "status":
      default: {
        const st = daemon.status();
        if (!st.running) {
          console.log("👻 Daemon: parado" + (daemonCfg.enabled ? "" : " (desactivado en config)"));
          if (st.staleLock) {
            const why = st.lockState === "unreadable" ? "ilegible" : "de un proceso muerto";
            console.log(`   (hay un lock huérfano ${why}; el próximo 'start' lo reemplaza)`);
          }
          return;
        }
        const mins = Math.floor((st.uptimeMs ?? 0) / 60000);
        console.log("👻 Daemon: corriendo");
        console.log(`   pid:      ${st.pid}`);
        console.log(`   endpoint: 127.0.0.1:${st.port}`);
        console.log(`   version:  ${st.version}`);
        console.log(`   uptime:   ${mins} min`);
        const res = await daemon.request("/ping");
        console.log(`   ping:     ${res?.ok ? "ok" : "sin respuesta"}`);
        return;
      }
    }
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
