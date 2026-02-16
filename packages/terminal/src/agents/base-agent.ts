/**
 * Base Agent
 *
 * Abstract base class with streaming tool-calling loop. All agents extend this.
 * Handles: project context, session management, tool execution, slash commands,
 * and the iterative LLM → tool → LLM streaming loop.
 */

import {
  ApiClient,
  type CLIOptions,
  type ChatMessage,
  type ToolCall,
  type StreamResult,
  type TokenUsage,
} from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";
import { sessionManager } from "../session/index.js";
import { PlanMdManager } from "../context/plan-md.js";
import { configManager } from "../config/index.js";
import { menuSystem } from "../services/menu-system.js";
import {
  shouldCompact,
  compactMessages,
  buildCompactionPrompt,
  estimateConversationTokens,
  getModelContextLimit,
} from "../context/compactor.js";
import {
  THINKING_HATS,
  TECHNICAL_PROFILES,
  COMMUNICATION_STYLES,
  setHat,
  setProfile,
  setStyle,
  resetProfile,
  loadProfile,
  buildProfilePrompt,
  getProfileSummary,
  getActiveProfile,
} from "../profiles/index.js";
import { soulManager } from "../soul/index.js";
import {
  ramManager,
  classifyComplexity,
} from "../ram/index.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";

// Tools that modify files - auto-log to PLAN.md
const MUTATING_TOOLS = new Set(["write", "edit", "bash"]);
const MAX_TOOL_ITERATIONS = 25; // Safety limit for tool-calling loop

// ── Input History ──────────────────────────────────────────────

const HISTORY_FILE = join(homedir(), ".wabisabi", "history");
const MAX_HISTORY = 500;

function loadHistory(): string[] {
  try {
    if (existsSync(HISTORY_FILE)) {
      return readFileSync(HISTORY_FILE, "utf-8")
        .split("\n")
        .filter((l) => l.trim());
    }
  } catch {}
  return [];
}

function saveHistory(lines: string[]): void {
  try {
    mkdirSync(join(homedir(), ".wabisabi"), { recursive: true });
    writeFileSync(HISTORY_FILE, lines.slice(-MAX_HISTORY).join("\n") + "\n");
  } catch {}
}

// ── Spinner ─────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function createSpinner(text: string) {
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(
      `\r${chalk.cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${chalk.dim(text)}`,
    );
  }, 80);
  return {
    stop(finalText?: string) {
      clearInterval(timer);
      process.stdout.write(`\r${" ".repeat(text.length + 4)}\r`);
      if (finalText) process.stdout.write(finalText + "\n");
    },
  };
}

// ── Base Agent ──────────────────────────────────────────────────

export abstract class BaseAgent {
  protected client: ApiClient;
  protected opts: CLIOptions;
  protected conversationHistory: ChatMessage[] = [];
  protected toolSpecs: ToolSpec[] = [];
  protected autoApprove = false;
  private rl: import("readline").Interface | null = null;
  private totalTokens = { prompt: 0, completion: 0, total: 0 };
  private lastPromptTokens = 0; // Last known prompt_tokens from API

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  abstract getSystemPrompt(): string;
  abstract getAvailableToolIds(): string[];
  abstract getHeader(): string;

  /**
   * Rebuild the system message when profile changes.
   * Updates the first message in conversationHistory in-place.
   */
  private rebuildSystemMessage(complexity: "simple" | "moderate" | "complex" = "moderate"): void {
    if (this.conversationHistory.length === 0) return;
    const contextPrompt = projectContext.getProjectRoot()
      ? projectContext.getSystemPrompt()
      : "";
    const profilePrompt = buildProfilePrompt();
    const soulContext = soulManager.buildSoulContext();
    const ramContext = ramManager.buildRamContext(complexity);
    this.conversationHistory[0] = {
      role: "system",
      content: `${this.getSystemPrompt()}${profilePrompt}${soulContext}${ramContext}\n\n${contextPrompt}`,
    };
  }

  /**
   * Handle slash commands. Returns true if the input was a command.
   */
  protected async handleSlashCommand(input: string): Promise<boolean> {
    const parts = input.slice(1).split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case "help":
      case "h":
        console.log(
          chalk.bold("\n  Slash Commands\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            "  /help             Show this help\n" +
            "  /clear            Clear screen\n" +
            "  /model <name>     Change model\n" +
            "  /status           Show current status\n" +
            "  /tools            List available tools\n" +
            "  /approve          Toggle auto-approve for tools\n" +
            "  /compact          Smart compact conversation history\n" +
            "  /export [file]    Export conversation to markdown\n" +
            "  /menu [cat]       Show config menu\n" +
            "  /session          Show session info\n" +
            "  /sessions         List recent sessions\n" +
            "  /soul             Show/edit personal memory (SOUL)\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            chalk.bold("  Memory (RAM)\n") +
            "  /ram              Show working memory status\n" +
            "  /pin <text>       Pin important fact/decision\n" +
            "  /pins             List pinned items\n" +
            "  /unpin <id>       Remove a pin\n" +
            "  /device <type>    Set device profile (mobile/laptop/desktop/server)\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            chalk.bold("  Profiles (Six Hats)\n") +
            "  /hat [name]       Set thinking hat (white/red/black/yellow/green/blue)\n" +
            "  /profile [name]   Set technical profile (security/devops/frontend/backend/...)\n" +
            "  /style [name]     Set communication style (formal/technical/colloquial/mentor)\n" +
            "  /reset            Reset all profiles to default\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            "  exit              Exit the agent\n",
        );
        return true;

      case "clear":
      case "cls":
        console.clear();
        return true;

      case "model":
        if (parts[1]) {
          this.client.model = parts[1];
          configManager.update("model", parts[1]);
          console.log(chalk.green(`  Model changed to: ${parts[1]} (saved)`));
        } else {
          console.log(`  Current model: ${chalk.bold(this.client.model)}`);
        }
        return true;

      case "status": {
        const sessionId = sessionManager.getCurrent()?.id || "none";
        const tokenInfo = this.totalTokens.total > 0
          ? `${this.totalTokens.total} (${this.totalTokens.prompt} in, ${this.totalTokens.completion} out)`
          : "0";
        const ctxLimit = ramManager.getEffectiveContextLimit(getModelContextLimit(this.client.model));
        const ctxUsed = this.lastPromptTokens || estimateConversationTokens(this.conversationHistory);
        const ctxPct = Math.round((ctxUsed / ctxLimit) * 100);
        const ctxColor = ctxPct > 75 ? chalk.red : ctxPct > 50 ? chalk.yellow : chalk.green;
        const dp = ramManager.getDeviceProfile();
        const profileInfo = getProfileSummary();
        const provider = this.client.getActiveProvider();
        console.log(
          chalk.bold("\n  Status\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            `  Agent:    ${this.constructor.name}\n` +
            `  Model:    ${this.client.model}\n` +
            `  Provider: ${provider}\n` +
            `  Profile:  ${profileInfo}\n` +
            `  Session:  ${sessionId}\n` +
            `  Messages: ${this.conversationHistory.length}\n` +
            `  Tokens:   ${tokenInfo}\n` +
            `  Context:  ${ctxColor(`${ctxUsed}/${ctxLimit} (${ctxPct}%)`)}\n` +
            `  Soul:     ${soulManager.getSoul().preferences.language}/${soulManager.getSoul().preferences.technicalLevel}/${soulManager.getSoul().preferences.responseTone}\n` +
            `  RAM:      ${ramManager.getPins().length} pins, ${ramManager.getActiveFiles().length} files, device=${dp.type}\n` +
            `  Tools:    ${this.getAvailableToolIds().join(", ")}\n` +
            `  Project:  ${projectContext.getProjectRoot()}\n`,
        );
        return true;
      }

      case "tools":
        console.log(chalk.bold("\n  Available Tools\n"));
        for (const id of this.getAvailableToolIds()) {
          const tool = toolRegistry.get(id);
          if (tool) {
            console.log(
              `  ${chalk.cyan(id.padEnd(10))} ${chalk.dim(tool.description.slice(0, 60))}`,
            );
          }
        }
        console.log();
        return true;

      case "compact": {
        const keep = 10;
        const system = this.conversationHistory[0];
        const total = this.conversationHistory.length;

        if (total <= keep + 1) {
          console.log(chalk.dim("  Nothing to compact."));
          return true;
        }

        // Summarize old messages (skip system, keep last N)
        const oldMessages = this.conversationHistory.slice(1, -keep);
        const summaryParts: string[] = [];
        for (const msg of oldMessages) {
          if (msg.role === "user" && msg.content) {
            summaryParts.push(`User asked: ${String(msg.content).slice(0, 100)}`);
          } else if (msg.role === "assistant" && msg.content) {
            summaryParts.push(`Assistant: ${String(msg.content).slice(0, 100)}`);
          } else if (msg.role === "tool" && msg.content) {
            summaryParts.push(`Tool result: ${String(msg.content).slice(0, 60)}`);
          }
        }

        const summaryMsg: ChatMessage = {
          role: "user",
          content: `[Context summary of ${oldMessages.length} earlier messages]\n${summaryParts.join("\n")}`,
        };

        const recent = this.conversationHistory.slice(-keep);
        this.conversationHistory = [system, summaryMsg, ...recent];
        console.log(
          chalk.green(`  Compacted: ${oldMessages.length} messages -> summary + last ${keep}`),
        );
        return true;
      }

      case "export": {
        const session = sessionManager.getCurrent();
        if (!session) {
          console.log(chalk.dim("  No active session."));
          return true;
        }
        const filename = parts[1] || `${session.id}.md`;
        const exportPath = join(projectContext.getProjectRoot(), filename);

        const lines: string[] = [
          `# ${session.title}`,
          "",
          `- **Agent**: ${session.agent}`,
          `- **Model**: ${session.model}`,
          `- **Date**: ${new Date(session.created).toLocaleString()}`,
          `- **Messages**: ${session.messages.length}`,
          "",
          "---",
          "",
        ];

        for (const msg of this.conversationHistory) {
          if (msg.role === "system") continue;
          const label =
            msg.role === "user" ? "**User**" :
            msg.role === "assistant" ? "**Assistant**" :
            msg.role === "tool" ? "_Tool_" : msg.role;
          const content = String(msg.content || "").trim();
          if (!content) continue;
          lines.push(`### ${label}\n`);
          lines.push(content);
          lines.push("");
        }

        writeFileSync(exportPath, lines.join("\n"), "utf-8");
        console.log(chalk.green(`  Exported to: ${exportPath}`));
        return true;
      }

      case "approve":
      case "auto":
        this.autoApprove = !this.autoApprove;
        console.log(
          this.autoApprove
            ? chalk.yellow("  Auto-approve ON - tools will run without confirmation")
            : chalk.green("  Auto-approve OFF - destructive tools will ask for confirmation"),
        );
        return true;

      case "session": {
        const session = sessionManager.getCurrent();
        if (session) {
          console.log(
            chalk.bold("\n  Session\n") +
              chalk.dim("  ──────────────────────────────────\n") +
              `  ID:       ${session.id}\n` +
              `  Title:    ${session.title}\n` +
              `  Messages: ${session.messages.length}\n` +
              `  Created:  ${new Date(session.created).toLocaleString()}\n`,
          );
        }
        return true;
      }

      case "sessions": {
        const sessions = await sessionManager.listRecent(10);
        if (sessions.length === 0) {
          console.log(chalk.dim("  No sessions found."));
        } else {
          console.log(chalk.bold("\n  Recent Sessions\n"));
          for (const s of sessions) {
            const date = new Date(s.updated).toLocaleString();
            const current = sessionManager.getCurrent()?.id === s.id ? chalk.green(" (current)") : "";
            console.log(
              `  ${chalk.cyan(s.id)}  ${s.title.slice(0, 25).padEnd(25)}  ${chalk.dim(date)}${current}`,
            );
          }
          console.log(chalk.dim("\n  Resume with: wabisabi session --resume <id>"));
        }
        console.log();
        return true;
      }

      case "menu": {
        const category = parts[1] as import("../services/menu-system.js").MenuCategory | undefined;
        if (category) {
          menuSystem.setCategory(category);
        }
        menuSystem.open();
        console.log("\n" + menuSystem.renderToText() + "\n");
        menuSystem.close();
        return true;
      }

      case "hat": {
        const hatId = parts[1];
        if (!hatId) {
          // List all hats
          console.log(chalk.bold("\n  Thinking Hats\n"));
          const active = getActiveProfile().hat;
          for (const hat of Object.values(THINKING_HATS)) {
            const marker = active === hat.id ? chalk.green(" (active)") : "";
            console.log(`  ${hat.emoji} ${chalk.bold(hat.id.padEnd(8))} ${chalk.dim(hat.description)}${marker}`);
          }
          console.log(chalk.dim("\n  Usage: /hat <name> or /hat off"));
          console.log();
          return true;
        }
        if (hatId === "off" || hatId === "none") {
          setHat(null);
          this.rebuildSystemMessage();
          console.log(chalk.green("  Thinking hat removed."));
        } else if (setHat(hatId)) {
          const hat = THINKING_HATS[hatId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          console.log(chalk.green(`  ${hat.emoji} ${hat.name} activated: ${hat.description}`));
        } else {
          console.log(chalk.yellow(`  Unknown hat: ${hatId}. Use /hat to see options.`));
        }
        return true;
      }

      case "profile":
      case "prof": {
        const profId = parts[1];
        if (!profId) {
          console.log(chalk.bold("\n  Technical Profiles\n"));
          const active = getActiveProfile().profile;
          for (const prof of Object.values(TECHNICAL_PROFILES)) {
            const marker = active === prof.id ? chalk.green(" (active)") : "";
            console.log(`  ${prof.emoji} ${chalk.bold(prof.id.padEnd(12))} ${chalk.dim(prof.description)}${marker}`);
          }
          console.log(chalk.dim("\n  Usage: /profile <name> or /profile off"));
          console.log();
          return true;
        }
        if (profId === "off" || profId === "none") {
          setProfile(null);
          this.rebuildSystemMessage();
          console.log(chalk.green("  Technical profile removed."));
        } else if (setProfile(profId)) {
          const prof = TECHNICAL_PROFILES[profId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          console.log(chalk.green(`  ${prof.emoji} ${prof.name} activated: ${prof.description}`));
        } else {
          console.log(chalk.yellow(`  Unknown profile: ${profId}. Use /profile to see options.`));
        }
        return true;
      }

      case "style": {
        const styleId = parts[1];
        if (!styleId) {
          console.log(chalk.bold("\n  Communication Styles\n"));
          const active = getActiveProfile().style;
          for (const s of Object.values(COMMUNICATION_STYLES)) {
            const marker = active === s.id ? chalk.green(" (active)") : "";
            console.log(`  ${chalk.bold(s.id.padEnd(12))} ${chalk.dim(s.description)}${marker}`);
          }
          console.log(chalk.dim("\n  Usage: /style <name> or /style off"));
          console.log();
          return true;
        }
        if (styleId === "off" || styleId === "none") {
          setStyle(null);
          this.rebuildSystemMessage();
          console.log(chalk.green("  Communication style removed."));
        } else if (setStyle(styleId)) {
          const s = COMMUNICATION_STYLES[styleId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          console.log(chalk.green(`  Style set to ${s.name}: ${s.description}`));
        } else {
          console.log(chalk.yellow(`  Unknown style: ${styleId}. Use /style to see options.`));
        }
        return true;
      }

      case "reset": {
        resetProfile();
        this.rebuildSystemMessage();
        configManager.update("profile", getActiveProfile());
        console.log(chalk.green("  All profiles reset to default."));
        return true;
      }

      case "soul": {
        const subCmd = parts[1];
        const subArg = parts[2];
        const subValue = parts.slice(3).join(" ") || parts[2];

        if (!subCmd) {
          // Show soul summary
          console.log(chalk.bold("\n  SOUL (Personal Memory)\n"));
          console.log(chalk.dim("  ──────────────────────────────────"));
          console.log(soulManager.getSummary());
          console.log(chalk.dim("  ──────────────────────────────────"));
          console.log(chalk.dim("\n  /soul set <key> <value>  Set preference"));
          console.log(chalk.dim("  /soul reset              Reset soul to defaults"));
          console.log();
          return true;
        }

        if (subCmd === "set" && subArg) {
          const key = subArg;
          const value = parts[3] || "";
          const validKeys: Record<string, string[]> = {
            language: ["espanol", "ingles", "bilingue"],
            level: ["junior", "intermedio", "senior", "experto"],
            tone: ["formal", "casual", "tecnico"],
            length: ["breve", "medio", "detallado"],
            format: ["markdown", "texto-plano", "codigo-formateado"],
          };

          const keyMap: Record<string, string> = {
            language: "language",
            lang: "language",
            level: "technicalLevel",
            tone: "responseTone",
            length: "responseLength",
            format: "preferredFormat",
          };

          const mappedKey = keyMap[key];
          if (!mappedKey) {
            console.log(chalk.yellow(`  Unknown preference: ${key}`));
            console.log(chalk.dim(`  Valid keys: ${Object.keys(validKeys).join(", ")}`));
            return true;
          }

          const allowed = validKeys[key] || validKeys[Object.keys(keyMap).find((k) => keyMap[k] === mappedKey) || ""];
          if (!value || !allowed?.includes(value)) {
            console.log(chalk.yellow(`  Invalid value for ${key}: ${value || "(empty)"}`));
            console.log(chalk.dim(`  Valid values: ${allowed?.join(", ")}`));
            return true;
          }

          soulManager.setPreference(mappedKey as any, value as any);
          this.rebuildSystemMessage();
          console.log(chalk.green(`  Soul updated: ${key} = ${value}`));
          return true;
        }

        if (subCmd === "reset") {
          // Reset by re-creating soul (keeps UUID)
          const soul = soulManager.getSoul();
          console.log(chalk.yellow(`  This will reset all learned patterns and preferences.`));
          console.log(chalk.yellow(`  Soul ID: ${soul.metadata.id.slice(0, 8)}...`));
          // Actually reset preferences to defaults
          soulManager.setPreference("language", "espanol");
          soulManager.setPreference("technicalLevel", "senior");
          soulManager.setPreference("responseTone", "tecnico");
          soulManager.setPreference("responseLength", "medio");
          soulManager.setPreference("preferredFormat", "markdown");
          this.rebuildSystemMessage();
          console.log(chalk.green("  Soul preferences reset to defaults."));
          return true;
        }

        console.log(chalk.yellow(`  Unknown soul command: ${subCmd}. Use /soul for help.`));
        return true;
      }

      case "ram": {
        console.log(chalk.bold("\n  RAM (Working Memory)\n"));
        console.log(chalk.dim("  ──────────────────────────────────"));
        console.log(ramManager.getSummary());
        console.log(chalk.dim("  ──────────────────────────────────"));
        console.log();
        return true;
      }

      case "pin": {
        const text = parts.slice(1).join(" ");
        if (!text) {
          console.log(chalk.dim("  Usage: /pin <text to remember>"));
          return true;
        }
        const pin = ramManager.pin(text, "fact", "user", 0.8);
        this.rebuildSystemMessage();
        console.log(chalk.green(`  Pinned [${pin.id}]: ${text}`));
        return true;
      }

      case "pins": {
        const pins = ramManager.getPins();
        if (pins.length === 0) {
          console.log(chalk.dim("  No pinned items. Use /pin <text> to add."));
          return true;
        }
        console.log(chalk.bold("\n  Pinned Items\n"));
        for (const pin of pins) {
          const typeTag = chalk.cyan(pin.type.padEnd(12));
          const imp = chalk.dim(`(${Math.round(pin.importance * 100)}%)`);
          console.log(`  ${chalk.yellow(pin.id)} ${typeTag} ${pin.content} ${imp}`);
        }
        console.log();
        return true;
      }

      case "unpin": {
        const pinId = parts[1];
        if (!pinId) {
          console.log(chalk.dim("  Usage: /unpin <id>"));
          return true;
        }
        if (ramManager.unpin(pinId)) {
          this.rebuildSystemMessage();
          console.log(chalk.green(`  Unpinned: ${pinId}`));
        } else {
          console.log(chalk.yellow(`  Pin not found: ${pinId}`));
        }
        return true;
      }

      case "device": {
        const deviceType = parts[1];
        if (!deviceType) {
          const dp = ramManager.getDeviceProfile();
          console.log(chalk.bold("\n  Device Profile\n"));
          console.log(`  Type:      ${dp.type}`);
          console.log(`  Context:   ${dp.maxContextTokens} tokens`);
          console.log(`  Threshold: ${Math.round(dp.compactionThreshold * 100)}%`);
          console.log(`  Max items: ${dp.maxWorkingMemoryItems}`);
          console.log(chalk.dim("\n  Usage: /device <mobile|laptop|desktop|server>"));
          console.log();
          return true;
        }
        const validTypes = ["mobile", "laptop", "desktop", "server"];
        if (!validTypes.includes(deviceType)) {
          console.log(chalk.yellow(`  Unknown device type: ${deviceType}`));
          console.log(chalk.dim(`  Valid types: ${validTypes.join(", ")}`));
          return true;
        }
        const profile = ramManager.setDeviceProfile(deviceType);
        console.log(chalk.green(`  Device profile set: ${profile.type} (${profile.maxContextTokens} max tokens, ${Math.round(profile.compactionThreshold * 100)}% threshold)`));
        return true;
      }

      default:
        console.log(chalk.yellow(`  Unknown command: /${cmd}. Type /help for commands.`));
        return true;
    }
  }

  /**
   * Ask user for confirmation via readline.
   */
  private async confirm(message: string): Promise<boolean> {
    if (!this.rl) return true;
    return new Promise((resolve) => {
      this.rl!.question(
        `${chalk.yellow("?")} ${message} ${chalk.dim("[y/N]")} `,
        (answer) => {
          resolve(answer.trim().toLowerCase() === "y");
        },
      );
    });
  }

  /**
   * Execute one tool call and return the result.
   */
  private async executeToolCall(
    call: ToolCall,
  ): Promise<{ args: Record<string, unknown>; output: string; title: string }> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      args = {};
    }

    // Show tool name and args summary
    const argsPreview = Object.entries(args)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `${k}=${val.length > 40 ? val.slice(0, 40) + "..." : val}`;
      })
      .join(" ");

    // Confirmation for destructive tools
    if (!this.autoApprove && MUTATING_TOOLS.has(call.function.name)) {
      console.log(
        `\n  ${chalk.yellow("⚠")} ${chalk.bold(call.function.name)} ${chalk.dim(argsPreview)}`,
      );
      const confirmed = await this.confirm("Allow this tool call?");
      if (!confirmed) {
        console.log(chalk.dim("  Skipped."));
        return {
          args,
          output: "Tool call was rejected by the user.",
          title: "Rejected",
        };
      }
    }

    const spinner = createSpinner(
      `${call.function.name} ${chalk.dim(argsPreview)}`,
    );

    try {
      const result = await toolRegistry.execute(call.function.name, args, {
        projectRoot: projectContext.getProjectRoot(),
      });

      spinner.stop(
        `  ${chalk.green("✓")} ${chalk.bold(call.function.name)} ${chalk.dim(result.title)}`,
      );

      // Auto-log mutating tool calls to PLAN.md
      if (MUTATING_TOOLS.has(call.function.name) && !result.metadata?.error) {
        try {
          const planMd = new PlanMdManager(projectContext.getProjectRoot());
          if (planMd.exists()) {
            const summary = `${call.function.name}: ${result.title}`;
            planMd.addAction(summary);
          }
        } catch {
          // Don't fail on plan logging
        }
      }

      // Track tool usage in soul
      soulManager.trackToolUse(call.function.name);

      // Track file access in RAM
      const filePath = (args as any).filePath || (args as any).path;
      if (filePath && typeof filePath === "string") {
        ramManager.trackFileAccess(filePath, result.title);
      }

      return { args, output: result.output, title: result.title };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      spinner.stop(
        `  ${chalk.red("✗")} ${chalk.bold(call.function.name)} ${chalk.dim(errMsg)}`,
      );
      return { args, output: `Error: ${errMsg}`, title: "Error" };
    }
  }

  /**
   * Stream a response from the LLM, printing tokens as they arrive.
   * Returns the accumulated result (content + tool_calls).
   */
  private async streamResponse(): Promise<StreamResult> {
    const gen = this.client.chatWithToolsStream(
      this.conversationHistory,
      this.toolSpecs,
    );

    let hasContent = false;
    let result: StreamResult | undefined;

    try {
      while (true) {
        const { done, value } = await gen.next();
        if (done) {
          result = value as StreamResult;
          break;
        }
        // Print content tokens as they arrive
        if (value.content) {
          if (!hasContent) {
            process.stdout.write("\n");
            hasContent = true;
          }
          process.stdout.write(value.content);
        }
      }
    } catch (error) {
      // Fallback to non-streaming on error
      const response = await this.client.chatWithTools(
        this.conversationHistory,
        this.toolSpecs,
      );
      const msg = response.choices[0]?.message;
      if (!msg) {
        return { content: "", tool_calls: [], finish_reason: "error" };
      }
      if (msg.content) {
        process.stdout.write("\n" + msg.content);
      }
      return {
        content: msg.content || "",
        tool_calls: msg.tool_calls || [],
        finish_reason: response.choices[0]?.finish_reason || "stop",
      };
    }

    if (hasContent) process.stdout.write("\n");

    // Track token usage
    if (result?.usage) {
      this.totalTokens.prompt += result.usage.prompt_tokens;
      this.totalTokens.completion += result.usage.completion_tokens;
      this.totalTokens.total += result.usage.total_tokens;
      this.lastPromptTokens = result.usage.prompt_tokens;
    }

    return result!;
  }

  /**
   * Auto-compact conversation when approaching context limit.
   * Uses LLM to generate a concise summary, falling back to heuristic.
   */
  private async autoCompact(): Promise<void> {
    const deviceProfile = ramManager.getDeviceProfile();
    const effectiveLimit = ramManager.getEffectiveContextLimit(
      getModelContextLimit(this.client.model),
    );
    const threshold = deviceProfile.compactionThreshold;

    if (!shouldCompact(
      this.conversationHistory, this.client.model,
      this.lastPromptTokens, threshold, effectiveLimit,
    )) {
      return;
    }

    const limit = effectiveLimit;
    const currentTokens = this.lastPromptTokens || estimateConversationTokens(this.conversationHistory);

    console.log(
      chalk.yellow(
        `\n  Context approaching limit (${Math.round((currentTokens / limit) * 100)}% of ${limit} tokens). Auto-compacting...`,
      ),
    );

    // Try LLM-assisted summarization first
    const system = this.conversationHistory[0];
    const keep = 6;
    const oldMessages = this.conversationHistory.slice(1, -keep);
    const recent = this.conversationHistory.slice(-keep);

    if (oldMessages.length <= 2) return;

    let summaryContent: string;

    try {
      const compactionPrompt = buildCompactionPrompt(oldMessages);
      const summaryResponse = await this.client.chatWithTools(
        [
          { role: "system", content: "You are a conversation summarizer. Be concise and structured." },
          { role: "user", content: compactionPrompt },
        ],
        [], // No tools for summarization
      );
      const llmSummary = summaryResponse.choices[0]?.message?.content;

      if (llmSummary && llmSummary.length > 50) {
        summaryContent =
          `[Auto-compacted: ${oldMessages.length} messages summarized by LLM]\n\n${llmSummary}`;
      } else {
        throw new Error("LLM summary too short");
      }
    } catch {
      // Fallback to heuristic compaction
      const result = compactMessages(this.conversationHistory);
      if (!result.compacted || !result.summaryMessage) return;
      summaryContent = String(result.summaryMessage.content);
    }

    const summaryMsg: ChatMessage = {
      role: "user",
      content: summaryContent,
    };

    this.conversationHistory = [system, summaryMsg, ...recent];
    this.lastPromptTokens = 0; // Reset - will be updated on next API call

    const tokensAfter = estimateConversationTokens(this.conversationHistory);
    console.log(
      chalk.green(
        `  Compacted: ${oldMessages.length} messages -> summary + last ${keep}` +
          chalk.dim(` (~${currentTokens} -> ~${tokensAfter} tokens)`),
      ),
    );
  }

  async run(resumeSessionId?: string): Promise<void> {
    console.log(this.getHeader());

    // Detect provider
    const providerSpinner = createSpinner("Detecting providers...");
    const provider = await this.client.detectProvider();
    if (this.client.isProviderAvailable()) {
      providerSpinner.stop(
        chalk.green(`  ✓ Provider: ${provider}`) +
          chalk.dim(` (model: ${this.client.model})`),
      );
    } else {
      providerSpinner.stop(
        chalk.yellow(`  ⚠ No providers available`) +
          chalk.dim(` (will retry on each request)`),
      );
      console.log(
        chalk.dim(`    Start Substratum or Ollama, or set --substratum/--ollama URL`),
      );
    }

    // Initialize project context (creates AGENTS.md, PLAN.md, TODO.md if needed)
    const initSpinner = createSpinner("Initializing project context...");
    await projectContext.initialize();
    initSpinner.stop(
      chalk.green("  ✓ Project context loaded") +
        chalk.dim(` (${projectContext.getProjectRoot()})`),
    );

    // Load saved profile from config
    const savedProfile = configManager.getMerged().profile;
    if (savedProfile) {
      loadProfile(savedProfile as any);
    }

    // Load soul (personal memory)
    soulManager.load();
    soulManager.trackSession();

    // Load RAM (working memory)
    ramManager.load();

    // Track project context in soul
    const root = projectContext.getProjectRoot();
    if (root) {
      const stack = projectContext.getStack();
      const projectName = root.split("/").pop() || root;
      const techs = [
        ...(stack?.languages || []),
        ...(stack?.frameworks || []),
      ].filter(Boolean);
      soulManager.trackProjectContext(root, projectName, techs);
    }

    // Build system message with project context + active profile + soul + RAM
    const contextPrompt = projectContext.getSystemPrompt();
    const profilePrompt = buildProfilePrompt();
    const soulContext = soulManager.buildSoulContext();
    const ramContext = ramManager.buildRamContext("moderate");
    const systemMessage: ChatMessage = {
      role: "system",
      content: `${this.getSystemPrompt()}${profilePrompt}${soulContext}${ramContext}\n\n${contextPrompt}`,
    };

    // Show active profile if any
    const activeProfileSummary = getProfileSummary();
    if (activeProfileSummary !== "Default (no profile)") {
      console.log(chalk.cyan(`  Profile: ${activeProfileSummary}`));
    }

    this.toolSpecs = toolRegistry.toToolSpecs(this.getAvailableToolIds());

    // Resume existing session or create new one
    if (resumeSessionId) {
      const session = await sessionManager.resume(resumeSessionId);
      if (!session) {
        console.log(chalk.red(`  Session not found: ${resumeSessionId}`));
        return;
      }
      console.log(
        chalk.green(`  ✓ Resumed session: ${session.title}`) +
          chalk.dim(` (${session.messages.length} messages)`),
      );
      // Rebuild conversation history from session
      this.conversationHistory = [systemMessage];
      for (const msg of session.messages) {
        if (msg.role === "system") continue; // Skip stored system messages
        this.conversationHistory.push({
          role: msg.role,
          content: msg.content,
          ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
        });
      }
    } else {
      await sessionManager.create({
        projectRoot: projectContext.getProjectRoot(),
        model: this.opts.model,
        agent: this.constructor.name,
      });
      this.conversationHistory = [systemMessage];
    }

    // REPL loop with persistent history
    const readline = await import("readline");
    const history = loadHistory();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      history: history,
      historySize: MAX_HISTORY,
    });
    this.rl = rl;

    const askQuestion = (prompt: string): Promise<string> =>
      new Promise((resolve) => rl.question(prompt, resolve));

    const agentLabel = chalk.dim(`[${this.constructor.name}]`);

    /**
     * Read input with multiline support:
     * - Start with """ to enter multiline mode, end with """ on its own line
     * - End a line with \ for continuation
     */
    const readInput = async (): Promise<string> => {
      const firstLine = await askQuestion(`\n${agentLabel} ${chalk.green(">")} `);

      // Multiline block mode with """
      if (firstLine.trimStart().startsWith('"""')) {
        const rest = firstLine.trimStart().slice(3);
        const lines: string[] = rest ? [rest] : [];
        console.log(chalk.dim('  (multiline mode - end with """)'));
        while (true) {
          const line = await askQuestion(chalk.dim("... "));
          if (line.trim() === '"""') break;
          lines.push(line);
        }
        return lines.join("\n");
      }

      // Line continuation with backslash
      let result = firstLine;
      while (result.endsWith("\\")) {
        result = result.slice(0, -1);
        const nextLine = await askQuestion(chalk.dim("... "));
        result += "\n" + nextLine;
      }

      return result;
    };

    try {
      while (true) {
        const input = await readInput();
        const trimmed = input.trim();

        if (!trimmed) continue;
        if (trimmed === "exit" || trimmed === "quit") break;

        // Handle slash commands
        if (trimmed.startsWith("/")) {
          await this.handleSlashCommand(trimmed);
          continue;
        }

        // Save to persistent history
        history.push(trimmed);
        saveHistory(history);

        // Track interaction in soul
        soulManager.trackInteraction();

        // Add user message
        this.conversationHistory.push({ role: "user", content: trimmed });
        await sessionManager.addMessage({
          role: "user",
          content: trimmed,
          timestamp: Date.now(),
        });

        // Stream + tool-calling loop
        let result = await this.streamResponse();

        // Iterate while the model requests tool calls (with safety limit)
        let toolIterations = 0;
        while (result.tool_calls.length > 0 && toolIterations < MAX_TOOL_ITERATIONS) {
          toolIterations++;
          // Add assistant message with tool calls to history
          this.conversationHistory.push({
            role: "assistant",
            content: result.content || null,
            tool_calls: result.tool_calls,
          });

          // Execute each tool call
          for (const call of result.tool_calls) {
            const toolResult = await this.executeToolCall(call);

            // Add tool result to conversation
            this.conversationHistory.push({
              role: "tool",
              content: toolResult.output,
              tool_call_id: call.id,
            });

            // Record in session
            await sessionManager.addMessage({
              role: "tool",
              content: toolResult.output,
              timestamp: Date.now(),
              toolCalls: [
                {
                  toolId: call.function.name,
                  args: toolResult.args,
                  result: {
                    title: toolResult.title,
                    output: toolResult.output,
                  },
                  timestamp: Date.now(),
                },
              ],
              toolCallId: call.id,
            });
          }

          // Stream next response (after tool results)
          result = await this.streamResponse();
        }

        if (toolIterations >= MAX_TOOL_ITERATIONS) {
          console.log(
            chalk.yellow(`\n  Tool iteration limit reached (${MAX_TOOL_ITERATIONS}). Stopping tool loop.`),
          );
        }

        // Save final assistant response
        const answer = result.content || "(no response)";
        this.conversationHistory.push({
          role: "assistant",
          content: answer,
        });
        await sessionManager.addMessage({
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
        });

        // Track model usage in soul (success = got a non-error response)
        soulManager.trackModelUse(
          this.client.model,
          answer !== "(no response)" && !answer.startsWith("Error:"),
        );
        // Track response as accepted (implicit - user continues)
        soulManager.trackResponseAccepted();

        // Show token usage
        if (this.totalTokens.total > 0) {
          console.log(
            chalk.dim(
              `\n  tokens: ${this.totalTokens.total} (${this.totalTokens.prompt} in, ${this.totalTokens.completion} out)`,
            ),
          );
        }

        // Auto-compact if approaching context limit
        await this.autoCompact();
      }
    } finally {
      rl.close();
      this.rl = null;

      // Save session summary to RAM for cross-session continuity
      const recentMsgs = this.conversationHistory.slice(-6);
      const summaryParts: string[] = [];
      for (const msg of recentMsgs) {
        if (msg.role === "user" && msg.content) {
          summaryParts.push(`User: ${String(msg.content).slice(0, 100)}`);
        } else if (msg.role === "assistant" && msg.content) {
          summaryParts.push(`Agent: ${String(msg.content).slice(0, 100)}`);
        }
      }
      if (summaryParts.length > 0) {
        ramManager.setLastSessionSummary(summaryParts.join(" | "));
      }

      soulManager.flush();
      ramManager.flush();
      await sessionManager.save();
      console.log(chalk.dim("\nSession saved. Goodbye."));
    }
  }
}
